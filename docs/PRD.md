# PRD — Desktop AI Upscaler (Tier 1)

Repository name: `upscaler-desktop` (working name, retained to avoid breaking URLs). **Product name: Enlarger** — decided 2026-09-09; see `decisions.md` D2.

**Status:** Approved direction (June 2026). Decisions locked: ncnn-vulkan sidecar engine with engine abstraction, Electron shell, Windows-only v1, Azure Artifact Signing, diffusion-refinement gate = metrics + Brad's perceptual judgment.

---

## 1. Context and strategic framing

This is the Tier 1 follow-on from the 50-hour SD image upscaler capability study (`Case Study/follow_on_project.md`). The study established that Real-ESRGAN at 4× sits within ~6% of SUPIR's LPIPS quality at a fraction of the cost, with no API dependency. The shippable product from that finding is a polished, installable desktop upscaler.

**Honest differentiation assessment.** Upscayl (open-source, Electron + realesrgan-ncnn-vulkan) already exists and is free. A Real-ESRGAN-only app is therefore a portfolio artifact first and a product second. What makes this app *not* an Upscayl clone:

1. **Built-in perceptual quality scoring** (LPIPS, optionally DISTS) against a user-supplied reference — no consumer upscaler ships this. It lets users benchmark their own workflow the way the capability study benchmarked methods.
2. **Print-focused workflow** — the target user is making large-format fine-art prints, not avatar thumbnails: 100% zoom inspection, before/after comparison slider, TIFF output, 8×/16× via clean two-pass logic.
3. **The strategic payload is the future diffusion-refinement engine.** v1 ships without it, but the architecture reserves the slot (see §6). If the refinement experiment plus a 100K-image LoRA retrain produces something worth shipping, this app is its distribution vehicle.

## 2. Target user

Primary: photographers (fine-art landscape / architecture, large-format print output) with a Windows machine and a discrete GPU (any vendor — NVIDIA, AMD, Intel Arc; ≥4 GB VRAM comfortable). Technically capable of downloading and installing an app; not capable of (or interested in) Python environments, Docker, or WSL.

Secondary: the case-study audience — engineers and hiring managers evaluating the project as a demonstration of taking a research prototype to a shipped product.

## 3. Goals and non-goals

**Goals**

- A signed Windows installer downloadable from a website that installs and produces a first upscale in under 5 minutes on a clean machine, with no SmartScreen warning and no dependency installation.
- Deterministic, high-quality 4× upscaling on any consumer GPU via Vulkan; 8×/16× via iterative two-pass 4×.
- Quality parity with the research repo's Real-ESRGAN baseline (LPIPS delta < 0.01 on the frozen 60-image test set; ncnn fp16 vs PyTorch fp32 will not be byte-identical).
- Perceptual-metric scoring in-app without shipping Python or PyTorch.
- An engine abstraction that allows a future Python/diffusion engine to be added as an on-demand download without re-architecting the shell.

**Non-goals (v1)**

- Diffusion refinement available to end users (experiment only — see §6).
- macOS / Linux builds (fast-follow candidates; the engine binary is already cross-platform).
- Video upscaling, face restoration, cloud/API anything, telemetry.
- 16-bit color pipeline (Real-ESRGAN models are 8-bit-trained; ncnn binary outputs 8-bit).

## 4. Requirements

### P0 — must ship

- **R1. Core upscale.** Single image in (PNG/JPEG/WebP/TIFF, any dimensions), 4× out, via bundled `realesrgan-ncnn-vulkan` sidecar binary with `realesrgan-x4plus` as default model. fp16, tile size auto-selected from detected VRAM with manual override in settings.
- **R2. 8× / 16× two-pass.** Implemented as sequential 4× passes with intermediate written to temp storage (never held fully in RAM alongside final). The single-pass x8 model is excluded — the study showed two-pass x4 is visibly better.
- **R3. Arbitrary-size robustness.** Inputs up to 4K-per-side producing up to 16K-per-side outputs must complete without VRAM exhaustion. Graceful, actionable error states for: no Vulkan-capable GPU, GPU OOM (auto-retry with smaller tile), unsupported/corrupt input.
- **R4. Comparison UI.** Before/after slider with synchronized pan, 100% (1:1 pixel) zoom mode, fit-to-window mode. This is the core inspection loop for print users.
- **R5. Output control.** Save as PNG / JPEG (quality slider) / TIFF (8-bit, via sharp). Default output naming `{name}_x{scale}.{ext}`; remember last output directory.
- **R6. Engine abstraction.** Shell ↔ engine boundary is a typed job spec (input path, scale, model, tile size, output path) + process lifecycle + structured progress events parsed from the sidecar's stderr. Exactly one engine in v1. The interface must not assume the engine is a single binary invocation (a future Python engine is a long-lived process).
- **R7. Signed installer.** NSIS installer built by electron-builder, signed via Azure Artifact Signing. Verified on a clean Windows 11 VM: download from the web → install → first upscale, with no SmartScreen interstitial.

### P1 — should ship

- **R8. Perceptual scoring.** If the user provides a reference HR image, compute LPIPS between output and reference. Implementation: LPIPS (AlexNet variant) exported to ONNX in the research repo, executed in-app via `onnxruntime-node` on CPU. No Python in the shipped app. Scores must match the research repo's `eval_metrics.lpips` within 0.005. DISTS is a stretch (export feasibility to be confirmed in research repo first).
- **R9. Batch mode.** Folder in → folder out with the same settings, sequential processing, per-image progress, summary on completion.
- **R10. Settings persistence.** Model, tile size, output format/directory, last-used scale persist across sessions.

### P2 — nice to have

- **R11. Auto-update** via electron-updater against GitHub Releases (releases are already signed; verify updater honors signature).
- **R12. Additional models.** Model dropdown with 1–2 alternates (e.g. realesr-general-x4v3 for noisier inputs). Adding a converted custom model = dropping `.param`/`.bin` files into the models directory.

## 5. Success metrics

- Clean-machine install → first completed upscale: < 5 minutes, zero dependency installs, zero security warnings.
- 4× on a 2000×1333 input: < 30 s on an 8 GB consumer GPU.
- Parity: LPIPS delta < 0.01 vs research-repo Real-ESRGAN on the frozen 60-image set at 4×.
- 16K-per-side output completes on a 8 GB GPU / 32 GB RAM machine.
- Installer size ≤ 400 MB.

## 6. Diffusion-refinement experiment (separate track — research repo, not the app)

Runs in the existing `SD_image_upscaler` repo, in parallel with app development. The app's only obligation to this track is the engine abstraction (R6).

**Protocol.** Apply the study's stage-B refinement (SD 1.5 img2img + ControlNet Tile, denoise ≈ 0.2, with and without the published stage-B LoRA) *on top of* Real-ESRGAN 4× output. Evaluate against Real-ESRGAN-alone on (a) the frozen 60-image test set and (b) a new ~30-image wild-LR set (real phone photos, JPEG-recompressed, low-light — Brad curates; this is cross-tier task #2 from the follow-on doc, and it matters because bicubic-LR is exactly the regime where Real-ESRGAN dominates and diffusion adds least).

**Gate (decided):** LPIPS/DISTS deltas + side-by-side grids, with Brad's perceptual judgment as final arbiter. Metrics inform, eyes decide — consistent with the Phase 3 finding that PSNR-style metrics anti-correlate with human ranking.

**Outcomes.**
- *Adds value* → do **not** ship current refinement to users. Instead, invest in expanding the LoRA pipeline: broader image-type coverage, ~100K-image training set (Tier 3-shaped work). The app's second engine slot is the eventual delivery vehicle if that retrain succeeds.
- *No value* → document the negative result in the case study; app remains Real-ESRGAN-only; Tier 2–4 research track is reframed accordingly.

## 7. Distribution and licensing

- Hosting: GitHub Releases for binaries; a simple landing page (GitHub Pages or existing site) with download link, sample before/afters, and system requirements.
- Signing: Azure Artifact Signing ($9.99/mo, individual identity validation — Brad provisions; see project plan "What Brad owns").
- **Licensing constraint:** the maintained upscayl-ncnn fork is AGPL-3.0; the original nihui/xinntao realesrgan-ncnn-vulkan is MIT/BSD. Decision needed at Phase 1: use the original MIT binary (simplest), or use the Upscayl fork and open-source the app (acceptable — this is a portfolio project and open-sourcing strengthens it). Real-ESRGAN model weights are BSD-3 — fine either way.

## 8. Risks

- **ncnn output ≠ PyTorch output.** fp16 + different tiling means small numeric drift vs the study's baseline. Mitigated by the parity criterion (LPIPS delta < 0.01), but if drift is visible at 100% zoom, escalate to Brad before proceeding past Phase 1.
- **LPIPS-to-ONNX export** is the one piece of novel engineering. De-risk it first in the research repo (it's a small AlexNet-based network; export should be clean) before building UI around it. Fallback: drop R8 to v1.1.
- **SmartScreen reputation** is expected to be clean with Artifact Signing, but verify on a genuinely clean VM — not a dev machine with the cert already trusted.
- **Upscayl ships first-mover quality.** If side-by-side output is indistinguishable from Upscayl's, differentiation rests entirely on R4 + R8 + the print workflow. Acceptable for a portfolio artifact; be honest about it in the case study.
