import { describe, it, expect } from 'vitest';
import type { JobSpec, ProgressEvent, JobResult, EngineCapabilities } from '../src/shared/types';

describe('shared types', () => {
  it('JobSpec accepts valid input', () => {
    const spec: JobSpec = {
      inputPath: 'C:\\test\\input.jpg',
      scale: 4,
      model: 'realesrgan-x4plus',
      tileSize: 0,
      outputPath: 'C:\\test\\output.png',
      outputFormat: 'png',
    };
    expect(spec.scale).toBe(4);
    expect(spec.tileSize).toBe(0);
  });

  it('ProgressEvent represents completion', () => {
    const event: ProgressEvent = { percent: 100, message: 'Done' };
    expect(event.percent).toBe(100);
  });

  it('JobResult represents success', () => {
    const result: JobResult = {
      success: true,
      outputPath: 'C:\\test\\output.png',
      elapsedMs: 1234,
    };
    expect(result.success).toBe(true);
    expect(result.elapsedMs).toBeGreaterThan(0);
  });

  it('JobResult represents failure', () => {
    const result: JobResult = {
      success: false,
      error: 'No Vulkan-capable GPU detected',
      elapsedMs: 50,
    };
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('EngineCapabilities describes ncnn engine', () => {
    const caps: EngineCapabilities = {
      id: 'ncnn',
      name: 'Real-ESRGAN ncnn Vulkan',
      supportedScales: [4],
      availableModels: ['realesrgan-x4plus'],
      requiresGpu: true,
    };
    expect(caps.supportedScales).toContain(4);
    expect(caps.requiresGpu).toBe(true);
  });
});
