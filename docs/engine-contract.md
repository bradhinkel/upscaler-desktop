# Engine Contract — upscaler-desktop

This document defines the typed boundary between the Electron shell and any engine implementation. Phase 0 draft; finalized in Phase 1.

## Design intent

The shell (main process + renderer) knows **nothing** about how upscaling works. It submits a `JobSpec`, receives `ProgressEvent`s, and gets back a `JobResult`. This lets us:

1. Ship v1 with a single `NcnnEngine` (realesrgan-ncnn-vulkan sidecar binary).
2. Add a future `PythonDiffusionEngine` (long-lived process, on-demand runtime download) without touching the renderer or orchestrator.

## Core types

All types are defined in `src/shared/types.ts`. Summary:

### JobSpec

```typescript
interface JobSpec {
  inputPath: string;      // Absolute path to input image
  scale: 4 | 8 | 16;     // Desired scale factor
  model: string;          // Model identifier (e.g. 'realesrgan-x4plus')
  tileSize: number;       // Tile size in pixels (0 = auto)
  outputPath: string;     // Absolute path for output
  outputFormat: 'png' | 'jpeg' | 'tiff';
}
```

### ProgressEvent

```typescript
interface ProgressEvent {
  percent: number;        // 0–100
  message?: string;       // Optional status text
}
```

### JobResult

```typescript
interface JobResult {
  success: boolean;
  outputPath?: string;    // Set on success
  error?: string;         // Set on failure
  elapsedMs: number;
}
```

### EngineCapabilities

```typescript
interface EngineCapabilities {
  id: string;
  name: string;
  supportedScales: ScaleFactor[];
  availableModels: string[];
  requiresGpu: boolean;
}
```

### EngineLifecycle

```typescript
interface EngineLifecycle {
  initialize(): Promise<void>;
  isReady(): boolean;
  shutdown(): Promise<void>;
}
```

## Engine implementation requirements

An engine must:

1. Implement `EngineLifecycle` for startup/shutdown.
2. Expose `EngineCapabilities` so the shell knows what scales and models are available.
3. Accept `JobSpec` and emit `ProgressEvent`s during processing.
4. Return `JobResult` on completion.
5. Support cancellation (kill the underlying process / abort the operation).
6. Clean up temp files on cancellation or failure.
7. **Not** assume it is a one-shot binary invocation — a future engine may be a long-lived process.

## NcnnEngine specifics (v1)

- Spawns `realesrgan-ncnn-vulkan.exe` as a child process per job.
- Parses stderr for progress percentage (format: `XX.XX%`).
- Supports only `scale: 4` natively; 8× and 16× are orchestrated as sequential 4× passes by `JobOrchestrator`.
- Tile size auto-selected from available VRAM; manual override via settings.
- On OOM (detected via exit code or stderr pattern), auto-retries with halved tile size.

## Error taxonomy

| Error | Detection | User message |
|---|---|---|
| No Vulkan GPU | Binary exits with specific error | "No compatible GPU found. This app requires a Vulkan-capable GPU." |
| GPU OOM | Exit code or stderr pattern | "GPU ran out of memory. Retrying with smaller tiles..." (auto-retry) |
| Bad input | Binary rejects file | "Unsupported or corrupt image file." |
| Binary missing | File not found at expected path | "Engine binary not found. Please reinstall the application." |
| Disk full | Write fails | "Not enough disk space to save the output." |
