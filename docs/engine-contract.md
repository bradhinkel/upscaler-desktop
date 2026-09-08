# Engine Contract — upscaler-desktop

This document defines the typed boundary between the Electron shell and any engine implementation. Finalized in Phase 1.

## Design intent

The shell (main process + renderer) knows **nothing** about how upscaling works. It submits a `JobSpec`, receives `ProgressEvent`s, and gets back a `JobResult`. This lets us:

1. Ship v1 with a single `NcnnEngine` (realesrgan-ncnn-vulkan sidecar binary).
2. Add a future `PythonDiffusionEngine` (long-lived process, on-demand runtime download) without touching the renderer or orchestrator.

## Architecture

```
EngineManager
├── register(engine) — add an engine implementation
├── initialize()     — start the active engine
├── getActive()      — get the current engine
└── shutdown()       — stop all engines

JobOrchestrator
├── submit(spec, onProgress) — run a job (single-pass in v1, two-pass for 8×/16× in v2)
└── cancel()                 — abort the current job

Engine (interface)
├── capabilities()           — what this engine supports
├── initialize() / isReady() / shutdown()  — lifecycle
└── run(spec, onProgress?, signal?)        — execute a single-pass upscale
```

## Core types

All types defined in `src/shared/types.ts`.

### JobSpec

```typescript
interface JobSpec {
  inputPath: string;           // Absolute path to input image
  scale: 4 | 8 | 16;          // Desired scale factor
  model: string;               // Model identifier (e.g. 'realesrgan-x4plus')
  tileSize: number;            // Tile size in pixels (0 = auto)
  outputPath: string;          // Absolute path for output
  outputFormat: 'png' | 'jpeg' | 'tiff';
}
```

### ProgressEvent

```typescript
interface ProgressEvent {
  percent: number;             // 0–100
  message?: string;            // Optional status text (e.g. "Retrying with smaller tiles...")
}
```

### JobResult

```typescript
interface JobResult {
  success: boolean;
  outputPath?: string;         // Set on success
  error?: string;              // Set on failure
  elapsedMs: number;
}
```

### EngineCapabilities

```typescript
interface EngineCapabilities {
  id: string;                  // 'ncnn'
  name: string;                // 'Real-ESRGAN ncnn Vulkan'
  supportedScales: ScaleFactor[];  // [4] for ncnn (8×/16× via orchestrator)
  availableModels: string[];
  requiresGpu: boolean;
}
```

### Engine (interface)

```typescript
interface Engine extends EngineLifecycle {
  capabilities(): EngineCapabilities;
  run(spec: JobSpec, onProgress?: ProgressCallback, signal?: AbortSignal): Promise<JobResult>;
}
```

### EngineError

```typescript
type EngineErrorType = 'no-vulkan' | 'gpu-oom' | 'bad-input' | 'binary-missing' | 'disk-full' | 'cancelled' | 'unknown';

class EngineError extends Error {
  type: EngineErrorType;
  userMessage: string;  // Safe to show to the user
}
```

## NcnnEngine behavior

- Spawns `realesrgan-ncnn-vulkan.exe` as a child process per job.
- Parses stderr for progress percentage (regex: `/(\d+(?:\.\d+)?)%/`).
- Supports only `scale: 4` natively; 8× and 16× are orchestrated as sequential 4× passes by `JobOrchestrator` (Phase 2).
- Tile size: 0 = auto (binary decides based on VRAM). Manual override via `tileSize`.
- On OOM: auto-retries up to 3 times, halving tile size each time (first retry: 256, then 128, then 64). Gives up below tile size 32.
- Cancellation: `AbortSignal` triggers `SIGTERM` on the child process.

## Error taxonomy

| Error | Detection | User message |
|---|---|---|
| No Vulkan GPU | stderr contains `vkcreateinstance` or `vulkan` + `failed` | "No compatible GPU found. This app requires a Vulkan-capable GPU." |
| GPU OOM | stderr contains `out of memory` or `vk_error_out_of_device_memory` | "GPU ran out of memory. Retrying with smaller tiles..." |
| Bad input | stderr contains `decode image`, `open image`, `invalid` | "Unsupported or corrupt image file." |
| Binary missing | File not found or spawn `ENOENT` | "Engine binary not found. Please reinstall the application." |
| Disk full | stderr contains `no space` or `disk full` | "Not enough disk space to save the output." |
| Cancelled | `AbortSignal` triggered | "Upscale cancelled." |

## Parity verification (Phase 1)

ncnn (fp16 Vulkan) vs PyTorch (fp32 CUDA) on the frozen 60-image test set at 4×:
- **Mean LPIPS delta: 0.0075** (threshold: < 0.01) — **PASS**
- Max delta: 0.031 (Landscape_Grain.jpg — a high-noise image where fp16 quantization has the most effect)
- Full results: `docs/parity/parity_4x.csv`
