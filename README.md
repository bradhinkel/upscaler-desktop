# Enlarger

**Alpha.** A desktop image upscaler for photographers, built with Electron and [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN). Produces high-quality 4x/8x/16x upscales on any Vulkan-capable GPU (NVIDIA, AMD, Intel Arc). Entirely local — no account, no upload, no telemetry.

Built as a follow-on to a [50-hour capability study](https://github.com/bradhinkel/SD_image_upscaler) comparing diffusion-based and GAN-based super-resolution methods.

> **Alpha status.** Enlarger does one thing well — Real-ESRGAN upscaling with a side-by-side inspection view — and is published early to get it in front of real photographers. Expect rough edges in the interface, not in the output. [Issues](https://github.com/bradhinkel/upscaler-desktop/issues) welcome.
>
> The repository is still named `upscaler-desktop` (its working name); the product is Enlarger.

## Features

- **GPU-accelerated upscaling** via realesrgan-ncnn-vulkan (Vulkan API — works on any GPU vendor)
- **4x / 8x / 16x** scale factors (8x/16x via intelligent two-pass pipeline)
- **Before/after comparison slider** with 1:1 pixel zoom and synchronized pan
- **Perceptual quality scoring** (LPIPS) against a reference image, computed via ONNX Runtime on CPU
- **Batch mode** — process entire folders with per-image progress and failure isolation
- **Multiple output formats** — PNG, JPEG (with quality control), TIFF
- **Input validation** — graceful handling of corrupt, unsupported, or pathological images
- **Settings persistence** — remembers your preferences across sessions

## System Requirements

- **OS:** Windows 10/11 (64-bit)
- **GPU:** Any Vulkan-capable GPU (NVIDIA, AMD, Intel Arc) with 4+ GB VRAM
- **RAM:** 8 GB minimum, 16+ GB recommended for large images
- **Disk:** ~300 MB for installation

## Download

**The first signed build is not published yet.** Once it is, it will be on the
[landing page](https://bradhinkel.github.io/upscaler-desktop/) and under
[GitHub Releases](https://github.com/bradhinkel/upscaler-desktop/releases).

Releases are signed with Azure Artifact Signing so Windows shows a real publisher name rather than an "Unknown publisher" SmartScreen block. See [docs/signing.md](docs/signing.md).

## Build from Source

### Prerequisites

- [Node.js](https://nodejs.org/) 18.x or later
- Git

### Setup

```bash
git clone https://github.com/bradhinkel/upscaler-desktop.git
cd upscaler-desktop/app
npm install
npm run fetch-binaries   # downloads realesrgan-ncnn-vulkan + models (~50 MB, SHA256 verified)
```

### Development

```bash
npm run dev              # launch in dev mode with hot reload
```

### Quality Gates

```bash
npm run typecheck        # TypeScript strict mode check
npm run lint             # ESLint
npm test                 # Vitest unit tests (31 tests)
npx playwright test      # E2E integration tests (requires GPU)
```

### Build Installer

```bash
npm run dist             # builds electron-vite + NSIS installer
```

The installer is written to `release/`. It is unsigned unless Azure signing credentials are present in the environment — see [docs/signing.md](docs/signing.md). Build configuration lives in [`electron-builder.config.js`](electron-builder.config.js).

## Architecture

```
Electron main process (TypeScript)
+-- EngineManager
|   +-- NcnnEngine (realesrgan-ncnn-vulkan sidecar)
+-- JobOrchestrator (single/two-pass, batch queue)
+-- MetricsService (LPIPS via ONNX Runtime, CPU)
+-- IPC <-> Renderer (React + TypeScript)
    +-- Drop zone / file picker / batch folder picker
    +-- Before/after comparison slider
    +-- Settings panel
    +-- Progress + results + score display
```

The engine abstraction (`src/shared/types.ts`) is designed so a future diffusion-refinement engine can be added without touching the UI or orchestrator. See `docs/engine-contract.md`.

## Landing page

The public page lives in [`site/`](site/) and is deployed to GitHub Pages by
[`.github/workflows/pages.yml`](.github/workflows/pages.yml) on any push to `main` that touches it.

## License

MIT — see [LICENSE](LICENSE).

The bundled [realesrgan-ncnn-vulkan](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan) binary is MIT-licensed. Real-ESRGAN model weights are BSD-3-Clause.
