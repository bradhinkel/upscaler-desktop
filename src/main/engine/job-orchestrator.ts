import fs from 'fs';
import os from 'os';
import path from 'path';
import { EngineManager } from './engine-manager';
import { JobSpec, JobResult, ProgressCallback, EngineError } from '../../shared/types';
import type { BatchItemResult, BatchSummary } from '../../shared/ipc';
import { validateInput, listImageFiles } from './input-validator';

/**
 * Orchestrates upscale jobs. Supports single-pass (4×) and two-pass (8×/16×).
 * Two-pass writes intermediate to temp storage, never holding both in RAM.
 */
export class JobOrchestrator {
  private manager: EngineManager;
  private activeController: AbortController | null = null;
  private tempFiles: string[] = [];

  constructor(manager: EngineManager) {
    this.manager = manager;
  }

  /**
   * Submit an upscale job. Automatically routes to single-pass or two-pass.
   */
  async submit(spec: JobSpec, onProgress?: ProgressCallback): Promise<JobResult> {
    const outDir = path.dirname(spec.outputPath);
    fs.mkdirSync(outDir, { recursive: true });

    this.activeController = new AbortController();
    this.tempFiles = [];

    try {
      return await this.runSpec(spec, onProgress);
    } finally {
      this.cleanupTempFiles();
      this.activeController = null;
    }
  }

  /**
   * Submit a batch of images from a directory.
   * Processes sequentially; failures are isolated per-image.
   */
  async submitBatch(
    inputDir: string,
    outputDir: string,
    scale: JobSpec['scale'],
    model: string,
    tileSize: number,
    outputFormat: JobSpec['outputFormat'],
    jpegQuality: number,
    onBatchProgress?: (current: number, total: number, file: string, filePercent: number, message?: string) => void,
  ): Promise<BatchSummary> {
    const startTime = Date.now();
    const files = listImageFiles(inputDir);

    if (files.length === 0) {
      return { total: 0, succeeded: 0, failed: 0, skipped: 0, items: [], totalElapsedMs: 0 };
    }

    fs.mkdirSync(outputDir, { recursive: true });
    this.activeController = new AbortController();

    const items: BatchItemResult[] = [];
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      const filename = path.basename(filePath);

      // Check cancellation
      if (this.activeController.signal.aborted) {
        items.push({ filename, status: 'skipped', reason: 'Cancelled' });
        skipped++;
        continue;
      }

      onBatchProgress?.(i + 1, files.length, filename, 0, 'Validating...');

      // Validate input
      const validation = await validateInput(filePath);
      if (!validation.valid) {
        items.push({ filename, status: 'skipped', reason: validation.reason });
        skipped++;
        continue;
      }

      // Build output path
      const stem = path.basename(filePath, path.extname(filePath));
      const ext = outputFormat === 'jpeg' ? '.jpg' : outputFormat === 'tiff' ? '.tif' : '.png';
      const outputPath = path.join(outputDir, `${stem}_x${scale}${ext}`);

      const spec: JobSpec = {
        inputPath: filePath,
        outputPath,
        scale,
        model,
        tileSize,
        outputFormat,
      };

      try {
        this.tempFiles = [];
        const result = await this.runSpec(spec, (e) => {
          onBatchProgress?.(i + 1, files.length, filename, e.percent, e.message);
        });

        if (result.success) {
          // For JPEG, apply quality setting
          if (outputFormat === 'jpeg' && jpegQuality !== 95) {
            const sharp = (await import('sharp')).default;
            const tempJpeg = result.outputPath! + '.tmp';
            await sharp(result.outputPath!).jpeg({ quality: jpegQuality }).toFile(tempJpeg);
            fs.renameSync(tempJpeg, result.outputPath!);
          }
          items.push({ filename, status: 'succeeded', elapsedMs: result.elapsedMs });
          succeeded++;
        } else {
          items.push({ filename, status: 'failed', reason: result.error });
          failed++;
        }
      } catch (err) {
        if (err instanceof EngineError && err.type === 'cancelled') {
          items.push({ filename, status: 'skipped', reason: 'Cancelled' });
          skipped++;
        } else {
          const msg = err instanceof Error ? (err as EngineError).userMessage || err.message : String(err);
          items.push({ filename, status: 'failed', reason: msg });
          failed++;
        }
      } finally {
        this.cleanupTempFiles();
      }
    }

    this.activeController = null;

    return {
      total: files.length,
      succeeded,
      failed,
      skipped,
      items,
      totalElapsedMs: Date.now() - startTime,
    };
  }

  /** Cancel the currently running job or batch. */
  cancel(): void {
    this.activeController?.abort();
  }

  /** Run a job spec (single or two-pass) without managing the controller. */
  private async runSpec(spec: JobSpec, onProgress?: ProgressCallback): Promise<JobResult> {
    if (spec.scale === 4) {
      return this.singlePass(spec, onProgress);
    } else {
      return this.twoPass(spec, onProgress);
    }
  }

  private async singlePass(spec: JobSpec, onProgress?: ProgressCallback): Promise<JobResult> {
    const engine = this.manager.getActive();
    return engine.run(spec, onProgress, this.activeController!.signal);
  }

  /**
   * Two-pass upscale: 4× → 4× = 16×, or 4× → crop-to-target for 8×.
   * The intermediate is written to a temp file and deleted after the second pass.
   */
  private async twoPass(spec: JobSpec, onProgress?: ProgressCallback): Promise<JobResult> {
    const engine = this.manager.getActive();
    const signal = this.activeController!.signal;
    const startTime = Date.now();

    // Pass 1: 4× to temp file
    const tempPath = this.createTempPath('pass1.png');

    const pass1Spec: JobSpec = {
      ...spec,
      scale: 4,
      outputPath: tempPath,
      outputFormat: 'png',
    };

    onProgress?.({ percent: 0, message: 'Pass 1 of 2...' });

    const pass1Result = await engine.run(
      pass1Spec,
      (e) => {
        // Pass 1 = 0–50% of total
        onProgress?.({ percent: e.percent * 0.5, message: `Pass 1: ${e.percent.toFixed(0)}%` });
      },
      signal,
    );

    if (!pass1Result.success) {
      return { ...pass1Result, elapsedMs: Date.now() - startTime };
    }

    // Pass 2: 4× the intermediate
    onProgress?.({ percent: 50, message: 'Pass 2 of 2...' });

    // For 8×, pass2 goes to a temp so we can resize to final dimensions
    const pass2Output = spec.scale === 8 ? this.createTempPath('pass2.png') : spec.outputPath;

    const pass2Spec: JobSpec = {
      ...spec,
      scale: 4,
      inputPath: tempPath,
      outputPath: pass2Output,
      outputFormat: spec.scale === 8 ? 'png' : spec.outputFormat,
    };

    const pass2Result = await engine.run(
      pass2Spec,
      (e) => {
        // Pass 2 = 50–95% of total (leave 5% for resize if 8×)
        const weight = spec.scale === 8 ? 0.45 : 0.5;
        onProgress?.({ percent: 50 + e.percent * weight, message: `Pass 2: ${e.percent.toFixed(0)}%` });
      },
      signal,
    );

    const elapsedMs = Date.now() - startTime;

    if (!pass2Result.success) {
      return { ...pass2Result, elapsedMs };
    }

    if (spec.scale === 8) {
      // Two 4× passes = 16×. Resize down to 8×.
      onProgress?.({ percent: 95, message: 'Resizing to 8×...' });
      await this.resizeTo8x(spec.inputPath, pass2Output, spec.outputPath, spec.outputFormat);
      onProgress?.({ percent: 100, message: 'Complete' });
    }

    return { success: true, outputPath: spec.outputPath, elapsedMs };
  }

  /**
   * For 8× mode: two 4× passes produce 16×. Resize down to the correct 8× dimensions.
   * Uses sharp to resize, writing directly to the final output path.
   */
  private async resizeTo8x(
    inputPath: string,
    sixteenXPath: string,
    outputPath: string,
    outputFormat: JobSpec['outputFormat'],
  ): Promise<void> {
    const sharp = (await import('sharp')).default;

    const inputMeta = await sharp(inputPath).metadata();
    if (!inputMeta.width || !inputMeta.height) {
      throw new Error('Could not read input image dimensions');
    }

    const targetWidth = inputMeta.width * 8;
    const targetHeight = inputMeta.height * 8;

    let pipeline = sharp(sixteenXPath).resize(targetWidth, targetHeight, { fit: 'fill' });

    if (outputFormat === 'jpeg') {
      pipeline = pipeline.jpeg({ quality: 95 });
    } else if (outputFormat === 'tiff') {
      pipeline = pipeline.tiff();
    } else {
      pipeline = pipeline.png();
    }

    await pipeline.toFile(outputPath);
  }

  private createTempPath(suffix: string): string {
    const tempDir = path.join(os.tmpdir(), 'upscaler-desktop');
    fs.mkdirSync(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, `${Date.now()}-${suffix}`);
    this.tempFiles.push(tempPath);
    return tempPath;
  }

  private cleanupTempFiles(): void {
    for (const f of this.tempFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        // Best effort cleanup
      }
    }
    this.tempFiles = [];
  }
}
