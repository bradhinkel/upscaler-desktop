import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  Engine,
  EngineCapabilities,
  EngineError,
  JobResult,
  JobSpec,
  ProgressCallback,
} from '../../shared/types';

/** Default tile size. 0 = auto (let the binary decide based on available VRAM). */
const DEFAULT_TILE_SIZE = 0;

/** Minimum tile size before giving up on OOM retries. */
const MIN_TILE_SIZE = 32;

/** Maximum OOM retries with progressively smaller tiles. */
const MAX_OOM_RETRIES = 3;

/**
 * Resolves the path to the sidecar binary.
 * In development: resources/bin/ relative to project root.
 * In production: extraResources/bin/ relative to app.getPath('exe').
 */
export function resolveBinaryPath(isDev: boolean, appRoot: string): string {
  if (isDev) {
    return path.join(appRoot, 'resources', 'bin', 'realesrgan-ncnn-vulkan.exe');
  }
  // In packaged app, electron-builder copies extraResources next to the exe
  return path.join(path.dirname(appRoot), 'resources', 'bin', 'realesrgan-ncnn-vulkan.exe');
}

/**
 * Resolves the path to the models directory.
 */
export function resolveModelsPath(isDev: boolean, appRoot: string): string {
  if (isDev) {
    return path.join(appRoot, 'resources', 'models');
  }
  return path.join(path.dirname(appRoot), 'resources', 'models');
}

/**
 * Parse a progress percentage from a line of realesrgan-ncnn-vulkan stderr output.
 * The binary outputs lines like "12.50%" during processing.
 * Returns the percentage (0–100) or null if the line doesn't contain progress.
 */
export function parseProgress(line: string): number | null {
  const match = line.match(/(\d+(?:\.\d+)?)%/);
  if (match) {
    return parseFloat(match[1]);
  }
  return null;
}

/**
 * Classify a sidecar error from its stderr output and exit code.
 */
export function classifyError(
  stderr: string,
  exitCode: number | null,
): { type: EngineError['type']; userMessage: string } {
  const lower = stderr.toLowerCase();

  if (lower.includes('vkcreateinstance') || (lower.includes('vulkan') && lower.includes('failed'))) {
    return {
      type: 'no-vulkan',
      userMessage: 'No compatible GPU found. This app requires a Vulkan-capable GPU.',
    };
  }

  if (lower.includes('out of memory') || lower.includes('vk_error_out_of_device_memory')) {
    return {
      type: 'gpu-oom',
      userMessage: 'GPU ran out of memory. Retrying with smaller tiles...',
    };
  }

  if (
    lower.includes('decode image') ||
    lower.includes('open image') ||
    lower.includes('invalid') ||
    lower.includes('not a valid')
  ) {
    return {
      type: 'bad-input',
      userMessage: 'Unsupported or corrupt image file.',
    };
  }

  if (lower.includes('no space') || lower.includes('disk full')) {
    return {
      type: 'disk-full',
      userMessage: 'Not enough disk space to save the output.',
    };
  }

  return {
    type: 'unknown',
    userMessage: `Upscale failed (exit code ${exitCode}). ${stderr.slice(0, 200)}`,
  };
}

export class NcnnEngine implements Engine {
  private binaryPath: string;
  private modelsPath: string;
  private ready = false;

  constructor(binaryPath: string, modelsPath: string) {
    this.binaryPath = binaryPath;
    this.modelsPath = modelsPath;
  }

  async initialize(): Promise<void> {
    if (!fs.existsSync(this.binaryPath)) {
      throw new EngineError(
        'binary-missing',
        `Binary not found at ${this.binaryPath}`,
        'Engine binary not found. Please reinstall the application or run npm run fetch-binaries.',
      );
    }
    if (!fs.existsSync(this.modelsPath)) {
      throw new EngineError(
        'binary-missing',
        `Models not found at ${this.modelsPath}`,
        'Model files not found. Please reinstall the application or run npm run fetch-binaries.',
      );
    }
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  async shutdown(): Promise<void> {
    this.ready = false;
  }

  capabilities(): EngineCapabilities {
    return {
      id: 'ncnn',
      name: 'Real-ESRGAN ncnn Vulkan',
      supportedScales: [4],
      availableModels: ['realesrgan-x4plus', 'realesrgan-x4plus-anime', 'realesr-animevideov3'],
      requiresGpu: true,
    };
  }

  async run(
    spec: JobSpec,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<JobResult> {
    if (!this.ready) {
      throw new EngineError('unknown', 'Engine not initialized', 'Engine not ready. Call initialize() first.');
    }

    // Try with progressively smaller tiles on OOM
    let tileSize = spec.tileSize || DEFAULT_TILE_SIZE;
    let lastError: EngineError | null = null;

    for (let attempt = 0; attempt <= MAX_OOM_RETRIES; attempt++) {
      if (attempt > 0) {
        // Halve tile size for retry, but not below minimum
        tileSize = tileSize === 0 ? 256 : Math.floor(tileSize / 2);
        if (tileSize < MIN_TILE_SIZE) {
          throw lastError!;
        }
        onProgress?.({ percent: 0, message: `Retrying with tile size ${tileSize}...` });
      }

      try {
        return await this.runOnce(spec, tileSize, onProgress, signal);
      } catch (err) {
        if (err instanceof EngineError && err.type === 'gpu-oom') {
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    throw lastError!;
  }

  private runOnce(
    spec: JobSpec,
    tileSize: number,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<JobResult> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      // Determine output format flag
      const formatFlag = spec.outputFormat === 'tiff' ? 'png' : spec.outputFormat;

      const args = [
        '-i', spec.inputPath,
        '-o', spec.outputPath,
        '-s', '4',
        '-n', spec.model,
        '-m', this.modelsPath,
        '-f', formatFlag,
      ];

      if (tileSize > 0) {
        args.push('-t', String(tileSize));
      }

      let child: ChildProcess;
      try {
        child = spawn(this.binaryPath, args);
      } catch (err) {
        reject(
          new EngineError(
            'binary-missing',
            `Failed to spawn: ${err}`,
            'Engine binary not found. Please reinstall the application.',
          ),
        );
        return;
      }

      let stderrData = '';

      // Handle cancellation
      const onAbort = () => {
        child.kill('SIGTERM');
        reject(
          new EngineError('cancelled', 'Job cancelled by user', 'Upscale cancelled.'),
        );
      };

      if (signal) {
        if (signal.aborted) {
          child.kill('SIGTERM');
          reject(
            new EngineError('cancelled', 'Job cancelled by user', 'Upscale cancelled.'),
          );
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        stderrData += text;

        // Parse progress lines
        for (const line of text.split(/\r?\n/)) {
          const percent = parseProgress(line.trim());
          if (percent !== null) {
            onProgress?.({ percent });
          }
        }
      });

      child.stdout?.on('data', (data: Buffer) => {
        // The binary doesn't output to stdout normally, but capture just in case
        stderrData += data.toString();
      });

      child.on('error', (err) => {
        signal?.removeEventListener('abort', onAbort);
        reject(
          new EngineError(
            'binary-missing',
            `Process error: ${err.message}`,
            'Engine binary not found. Please reinstall the application.',
          ),
        );
      });

      child.on('close', (exitCode) => {
        signal?.removeEventListener('abort', onAbort);
        const elapsedMs = Date.now() - startTime;

        if (exitCode === 0) {
          onProgress?.({ percent: 100, message: 'Complete' });
          resolve({
            success: true,
            outputPath: spec.outputPath,
            elapsedMs,
          });
        } else {
          const classified = classifyError(stderrData, exitCode);
          reject(
            new EngineError(classified.type, stderrData, classified.userMessage),
          );
        }
      });
    });
  }
}
