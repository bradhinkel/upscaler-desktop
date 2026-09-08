import path from 'path';
import { EngineManager } from './engine-manager';
import { JobSpec, JobResult, ProgressCallback } from '../../shared/types';

/**
 * Orchestrates upscale jobs. In Phase 1, this is single-pass only (4×).
 * Phase 2 adds two-pass logic for 8×/16× with temp intermediates.
 */
export class JobOrchestrator {
  private manager: EngineManager;
  private activeController: AbortController | null = null;

  constructor(manager: EngineManager) {
    this.manager = manager;
  }

  /**
   * Submit a single upscale job.
   * For Phase 1, only scale=4 is supported (single pass).
   */
  async submit(spec: JobSpec, onProgress?: ProgressCallback): Promise<JobResult> {
    if (spec.scale !== 4) {
      throw new Error(`Scale ${spec.scale}× requires two-pass orchestration (Phase 2). Only 4× is supported.`);
    }

    // Ensure output directory exists
    const outDir = path.dirname(spec.outputPath);
    const fs = await import('fs');
    fs.mkdirSync(outDir, { recursive: true });

    this.activeController = new AbortController();

    try {
      const engine = this.manager.getActive();
      return await engine.run(spec, onProgress, this.activeController.signal);
    } finally {
      this.activeController = null;
    }
  }

  /** Cancel the currently running job. */
  cancel(): void {
    this.activeController?.abort();
  }
}
