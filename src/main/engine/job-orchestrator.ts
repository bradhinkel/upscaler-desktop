import fs from 'fs';
import os from 'os';
import path from 'path';
import { EngineManager } from './engine-manager';
import { JobSpec, JobResult, ProgressCallback } from '../../shared/types';

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
      if (spec.scale === 4) {
        return await this.singlePass(spec, onProgress);
      } else {
        return await this.twoPass(spec, onProgress);
      }
    } finally {
      this.cleanupTempFiles();
      this.activeController = null;
    }
  }

  /** Cancel the currently running job. */
  cancel(): void {
    this.activeController?.abort();
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
