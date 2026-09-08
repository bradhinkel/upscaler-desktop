import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { parseProgress, classifyError } from '../src/main/engine/ncnn-engine';

// --- Pure function tests (no mocking needed) ---

describe('parseProgress', () => {
  it('parses integer percentage', () => {
    expect(parseProgress('50%')).toBe(50);
  });

  it('parses decimal percentage', () => {
    expect(parseProgress('12.50%')).toBe(12.5);
  });

  it('parses percentage embedded in text', () => {
    expect(parseProgress('processing... 75.00% done')).toBe(75);
  });

  it('returns null for non-progress lines', () => {
    expect(parseProgress('loading model...')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseProgress('')).toBeNull();
  });
});

describe('classifyError', () => {
  it('detects no-vulkan error', () => {
    const result = classifyError('vkCreateInstance failed', 1);
    expect(result.type).toBe('no-vulkan');
  });

  it('detects GPU OOM error', () => {
    const result = classifyError('vk_error_out_of_device_memory', 1);
    expect(result.type).toBe('gpu-oom');
  });

  it('detects bad input error', () => {
    const result = classifyError('failed to decode image', 1);
    expect(result.type).toBe('bad-input');
  });

  it('detects disk full error', () => {
    const result = classifyError('no space left on device', 1);
    expect(result.type).toBe('disk-full');
  });

  it('returns unknown for unrecognized errors', () => {
    const result = classifyError('something weird happened', 42);
    expect(result.type).toBe('unknown');
    expect(result.userMessage).toContain('42');
  });
});

// --- Engine tests with mocked child_process ---

// We need to mock child_process.spawn to test the engine without actually running the binary.
// The mock creates a fake ChildProcess that we can control.

import type { ChildProcess } from 'child_process';

function createMockProcess(): {
  process: ChildProcess;
  stderr: EventEmitter;
  stdout: EventEmitter;
  emitClose: (code: number | null) => void;
  emitError: (err: Error) => void;
} {
  const stderr = new EventEmitter();
  const stdout = new EventEmitter();
  const proc = new EventEmitter() as unknown as ChildProcess;
  (proc as { stderr: EventEmitter }).stderr = stderr;
  (proc as { stdout: EventEmitter }).stdout = stdout;
  (proc as { kill: (signal?: string) => boolean }).kill = vi.fn().mockReturnValue(true);

  return {
    process: proc,
    stderr,
    stdout,
    emitClose: (code) => proc.emit('close', code),
    emitError: (err) => proc.emit('error', err),
  };
}

// Mock child_process and fs before importing the engine
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(true),
      mkdirSync: vi.fn(),
    },
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
  };
});

import { spawn } from 'child_process';
import { NcnnEngine } from '../src/main/engine/ncnn-engine';
import { EngineError } from '../src/shared/types';

const mockSpawn = vi.mocked(spawn);

describe('NcnnEngine', () => {
  let engine: NcnnEngine;

  beforeEach(async () => {
    engine = new NcnnEngine('C:\\fake\\realesrgan.exe', 'C:\\fake\\models');
    await engine.initialize();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await engine.shutdown();
  });

  const baseSpec = {
    inputPath: 'C:\\test\\input.jpg',
    outputPath: 'C:\\test\\output.png',
    scale: 4 as const,
    model: 'realesrgan-x4plus',
    tileSize: 0,
    outputFormat: 'png' as const,
  };

  it('reports progress from stderr', async () => {
    const mock = createMockProcess();
    mockSpawn.mockReturnValue(mock.process);

    const progress: number[] = [];
    const promise = engine.run(baseSpec, (e) => progress.push(e.percent));

    mock.stderr.emit('data', Buffer.from('25.00%\n'));
    mock.stderr.emit('data', Buffer.from('50.00%\n'));
    mock.stderr.emit('data', Buffer.from('100.00%\n'));
    mock.emitClose(0);

    const result = await promise;
    expect(result.success).toBe(true);
    expect(progress).toEqual([25, 50, 100, 100]); // last 100 from the close handler
  });

  it('returns success with output path and elapsed time', async () => {
    const mock = createMockProcess();
    mockSpawn.mockReturnValue(mock.process);

    const promise = engine.run(baseSpec);
    mock.emitClose(0);

    const result = await promise;
    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(baseSpec.outputPath);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('throws EngineError on no-vulkan failure', async () => {
    const mock = createMockProcess();
    mockSpawn.mockReturnValue(mock.process);

    const promise = engine.run(baseSpec);
    mock.stderr.emit('data', Buffer.from('vkCreateInstance failed\n'));
    mock.emitClose(1);

    await expect(promise).rejects.toThrow(EngineError);
    await expect(promise).rejects.toMatchObject({ type: 'no-vulkan' });
  });

  it('retries with smaller tile on OOM', async () => {
    // First call: OOM
    const mock1 = createMockProcess();
    mockSpawn.mockReturnValueOnce(mock1.process);

    // Second call: success
    const mock2 = createMockProcess();
    mockSpawn.mockReturnValueOnce(mock2.process);

    const progressMsgs: string[] = [];
    const promise = engine.run(baseSpec, (e) => {
      if (e.message) progressMsgs.push(e.message);
    });

    // First attempt fails with OOM
    mock1.stderr.emit('data', Buffer.from('vk_error_out_of_device_memory\n'));
    mock1.emitClose(1);

    // Allow microtask queue to process the retry
    await new Promise((r) => setTimeout(r, 10));

    // Second attempt succeeds
    mock2.emitClose(0);

    const result = await promise;
    expect(result.success).toBe(true);
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    expect(progressMsgs.some((m) => m.includes('Retrying'))).toBe(true);
  });

  it('cancels via AbortSignal', async () => {
    const mock = createMockProcess();
    mockSpawn.mockReturnValue(mock.process);

    const controller = new AbortController();
    const promise = engine.run(baseSpec, undefined, controller.signal);

    controller.abort();

    await expect(promise).rejects.toThrow(EngineError);
    await expect(promise).rejects.toMatchObject({ type: 'cancelled' });
    expect(mock.process.kill).toHaveBeenCalled();
  });

  it('rejects with binary-missing on spawn error', async () => {
    const mock = createMockProcess();
    mockSpawn.mockReturnValue(mock.process);

    const promise = engine.run(baseSpec);
    mock.emitError(new Error('ENOENT'));

    await expect(promise).rejects.toThrow(EngineError);
    await expect(promise).rejects.toMatchObject({ type: 'binary-missing' });
  });

  it('rejects with bad-input on decode failure', async () => {
    const mock = createMockProcess();
    mockSpawn.mockReturnValue(mock.process);

    const promise = engine.run(baseSpec);
    mock.stderr.emit('data', Buffer.from('failed to decode image\n'));
    mock.emitClose(1);

    await expect(promise).rejects.toThrow(EngineError);
    await expect(promise).rejects.toMatchObject({ type: 'bad-input' });
  });

  it('passes tile size argument when specified', async () => {
    const mock = createMockProcess();
    mockSpawn.mockReturnValue(mock.process);

    const promise = engine.run({ ...baseSpec, tileSize: 128 });
    mock.emitClose(0);
    await promise;

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['-t', '128']),
    );
  });

  it('does not pass tile size when set to 0 (auto)', async () => {
    const mock = createMockProcess();
    mockSpawn.mockReturnValue(mock.process);

    const promise = engine.run({ ...baseSpec, tileSize: 0 });
    mock.emitClose(0);
    await promise;

    const args = mockSpawn.mock.calls[0][1] as string[];
    expect(args).not.toContain('-t');
  });
});
