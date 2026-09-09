# Project plan — upscaler-desktop (Tier 1)

Companion to `PRD.md` in this folder. This plan is written for Claude Code to execute. It mirrors the working mode that succeeded on the capability study.

---

## Working mode — same rules as the study

**One phase at a time. Stop at phase boundaries.**

1. Read the phase section and its acceptance criteria in full.
2. Do the work; commit regularly with clear messages.
3. When acceptance criteria are met, **stop**. Produce a short completion summary: what was built, verification output, deviations and why, what to review first.
4. Wait for Brad's explicit approval before the next phase.
5. Wrong/ambiguous plan, or anything needing Brad's judgment or credentials → **stop and ask**.

**Phase 0 includes writing a `CLAUDE.md` for the new repo** that encodes these rules plus the repo conventions below, so future sessions inherit them.

## Two repos, two tracks

- **Track A (this plan, Phases 0–5):** new repo `upscaler-desktop`. Electron + TypeScript. Windows-only v1.
- **Track B (Phase R):** the existing `SD_image_upscaler` repo. Diffusion-refinement experiment. Independent of Track A; can run between Track A phases or in parallel sessions. Track B obeys the *existing* repo's CLAUDE.md (frozen test set, no committed outputs, etc.).

## Architecture summary (Track A)

```
Electron main process (TypeScript)
├── EngineManager — typed interface: submit(JobSpec) → progress events → result
│   └── NcnnEngine (v1's only engine)
│       └── spawns bundled realesrgan-ncnn-vulkan.exe; parses stderr progress
├── JobOrchestrator — single/two-pass (8×/16×) sequencing, batch queue, temp-file lifecycle
├── MetricsService — onnxruntime-node, LPIPS.onnx (CPU)
└── IPC ↔ Renderer (React + TypeScript)
    ├── Drop zone / file picker / batch folder picker
    ├── Before/after comparison slider, 1:1 zoom, synced pan
    ├── Job settings panel (scale, model, tile, output format)
    └── Progress + results + score display
```

Key boundary: `EngineManager`'s interface must not assume an engine is a one-shot binary. A future `PythonDiffusionEngine` (long-lived process, on-demand runtime download) must be addable without touching the renderer or orchestrator. Define `JobSpec`, `EngineCapabilities`, `ProgressEvent`, `EngineLifecycle` as the contract; document it in `docs/engine-contract.md`.

## Repo conventions

- TypeScript strict mode everywhere. React renderer. electron-builder for packaging. Vitest for unit tests; Playwright for the small E2E smoke set.
- `src/main/` (main process), `src/renderer/` (UI), `src/shared/` (types incl. engine contract), `resources/bin/` (sidecar binary), `resources/models/` (.param/.bin model files), `scripts/` (build/CI helpers).
- Binaries and models are fetched by a pinned-checksum `scripts/fetch-binaries.ts` at build time, **not committed** to git.
- Tests must pass on a CPU-only CI runner: engine tests mock the child process; one optional GPU-tagged test suite runs locally only.
- Never commit: signing credentials, `.env`, fetched binaries/models, generated images.
- License decision is made in Phase 1 before any fork code is vendored (PRD §7).

---

## Phase 0 — Scaffold and CI

Repo `upscaler-desktop` on GitHub. Electron + TS + React via current electron-builder tooling. Hello-window app launches. `CLAUDE.md` written (working mode + conventions + commands). GitHub Actions: lint (eslint) + typecheck + vitest on Windows runner, green on first push. `scripts/fetch-binaries.ts` downloads the ncnn binary + x4plus model with checksum verification.

**Acceptance criteria**
- [ ] `npm install && npm run dev` opens the app window.
- [ ] `npm test`, `npm run lint`, `npm run typecheck` all exit 0.
- [ ] CI green on Windows runner on at least one push.
- [ ] `fetch-binaries` produces a runnable `realesrgan-ncnn-vulkan.exe` + models; both gitignored.
- [ ] `CLAUDE.md` and `docs/engine-contract.md` (draft) committed.
- [ ] License decision recorded in `docs/decisions.md` (MIT original binary vs AGPL fork — stop and ask Brad with a recommendation).

## Phase 1 — Engine layer and parity

`NcnnEngine` + `EngineManager` + `JobOrchestrator` (single-pass only). CLI harness (`npm run upscale -- <args>`) exercising the engine without UI. Progress parsing from sidecar stderr. Tile-size auto-selection from VRAM query (`vulkaninfo` or the binary's own enumeration) with override. Error taxonomy: no-Vulkan, OOM (auto-retry smaller tile), bad input.

**Parity check (the phase's point):** run the engine over the frozen 60-image test set's `_250.jpg` inputs at 4×; compute LPIPS vs ground truth using the *research repo's* `eval_metrics` (Track B side, or Brad provides the reference CSV). Delta vs the study's Real-ESRGAN leaderboard row must be < 0.01 mean LPIPS.

**Acceptance criteria**
- [ ] Engine contract types finalized in `src/shared/`; `docs/engine-contract.md` updated to match.
- [ ] CLI harness: image in → 4× out on local GPU.
- [ ] ≥8 unit tests with mocked child process: progress parsing, error taxonomy, retry-on-OOM, cancellation, temp-file cleanup.
- [ ] Parity CSV committed to `docs/parity/` (CSV of numbers, not images): mean LPIPS delta < 0.01 vs study baseline. If visible drift at 100% zoom → stop and show Brad.
- [ ] All quality gates green.

## Phase 2 — Core UI

Drag-drop + file picker. Scale selection 4×/8×/16× (orchestrator two-pass logic with temp intermediates). Before/after slider with synced pan + 1:1 zoom + fit mode. Save dialog: PNG / JPEG(quality) / TIFF via sharp. Settings persistence (electron-store). Cancel button that actually kills the sidecar.

**Acceptance criteria**
- [ ] 4×, 8×, 16× all produce correct dimensions; 16× of a 1000² input completes without holding intermediate + final simultaneously in RAM (verify via process memory logging).
- [ ] Comparison slider verified at 1:1 zoom with synced pan on a 4× result.
- [ ] All three output formats verified re-openable in an external viewer; JPEG quality slider works.
- [ ] Cancellation mid-job leaves no orphan process and no temp files.
- [ ] Settings survive app restart.
- [ ] Playwright E2E: launch → load sample → 4× → save PNG → assert output exists and dimensions are 4×.

## Phase 3 — LPIPS scoring (de-risk first)

**Step 1 happens in the research repo (Track B side):** export LPIPS-AlexNet to ONNX; validate ONNX output vs `eval_metrics.lpips` on 20 image pairs (delta < 0.005). If export is problematic after ~3 hours of effort, stop — R8 moves to v1.1 and this phase collapses to a stub.
**Step 2 in-app:** `MetricsService` with onnxruntime-node (CPU); reference-image upload UI; score display with a one-line "lower is better" explainer and a link to the case study.

**Acceptance criteria**
- [ ] `lpips.onnx` validation table (20 pairs, delta < 0.005) committed to research repo outputs and referenced here.
- [ ] In-app score matches research-repo value within 0.005 on 5 spot-check pairs.
- [ ] Scoring is non-blocking (upscale usable while metric computes) and absent when no reference is provided.
- [ ] DISTS attempted only if LPIPS lands cleanly; otherwise noted as future work.

## Phase 4 — Batch mode and robustness

Folder in → folder out, sequential queue, per-image + overall progress, end-of-run summary (n succeeded / failed / skipped with reasons). Hardening: 4K input → 16K output on 8 GB GPU; pathological inputs (1×10000 strip, grayscale, CMYK JPEG, animated WebP → reject cleanly); disk-full and permission-denied on output path.

**Acceptance criteria**
- [ ] Batch of ≥20 mixed-format images completes with accurate summary; one intentionally corrupt file is skipped with a reason, not a crash.
- [ ] 16K-per-side output completes on the dev machine; peak RAM logged and < 75% of system RAM.
- [ ] Each pathological input above produces a clean, user-readable error.
- [ ] Unit tests for queue behavior (ordering, failure isolation, cancellation mid-batch).

## Phase 5 — Packaging, signing, distribution (alpha release)

**Scope framing (2026-09-09).** The artifact this phase ships is an **alpha — `v0.1.0`, not `v1.0.0`.** The goal is deliberately narrow: *a signed installer, hosted on the web, that a stranger can download and run without a scary warning and without installing anything else.* Proving that distribution path end-to-end is the deliverable. Feature richness is explicitly **not** in scope here — see "After the alpha" below. The earlier "GitHub Release v1.0.0" wording is superseded.

electron-builder NSIS installer. Azure Artifact Signing wired into the GitHub Actions release workflow (Brad provisions the account and identity validation — see "What Brad owns"; credentials live in GitHub Actions secrets, never in the repo). Landing page (GitHub Pages: download button, 2–3 before/after pairs, system requirements, link to case study).

**Product name decided 2026-09-09: Enlarger.** Repository stays `upscaler-desktop`; see `decisions.md` D2.

### Status as of 2026-09-09

| Item | State |
|---|---|
| Product renamed to Enlarger | Done — config, titles, README, PRD, landing page |
| `npm run dist` produces installer | Done — 227 MB, under the 400 MB budget |
| Signing **framework** wired | Done — `electron-builder.config.js` + `docs/signing.md` + release workflow |
| Installer actually signed | **Blocked on Azure provisioning** (Brad, in progress) |
| Landing page built | Done — `site/`, deployed by `.github/workflows/pages.yml` |
| Landing page live | Pending first workflow run |
| Clean Win11 VM test | Not run (Brad) |
| README screenshots | Not done — needs app screenshots, distinct from the landing page's before/afters |

No git tag and no GitHub Release exist yet; `release.yml` triggers on `v*` tags, so nothing has fired. The old `CSC_LINK` / `CSC_KEY_PASSWORD` PFX placeholders are gone, replaced by the Azure wiring below.

### Azure Artifact Signing — provisioning (Brad, in progress)

1. Azure subscription → create a **Trusted Signing / Artifact Signing account** (Basic, ~$9.99/mo). Note the **region**: the signing endpoint is region-scoped, e.g. `https://eus.codesigning.azure.net`.
2. **Identity validation** (individual, government-ID based). Long-pole step; start it first.
3. Create a **Certificate Profile** (Public Trust) under the account. Its subject CN is the publisher name shown in the UAC prompt — this is where the product-name decision lands.
4. Register an **Entra ID app** (service principal) + client secret; assign it the **Trusted Signing Certificate Profile Signer** role scoped to that certificate profile.
5. GitHub repo → Settings → Secrets → Actions: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.

**Nothing to hand back as code.** The framework is already wired — `docs/signing.md` is the operator doc. Brad pastes six values into GitHub (three non-secret identifiers as Actions *variables*, three Entra credentials as *secrets*) and signing switches itself on. `electron-builder.config.js` enables `win.azureSignOptions` only when all six are present, so `npm run dist` keeps working unsigned on a dev box; `ENLARGER_REQUIRE_SIGNING` makes a misconfigured release build fail loudly instead of silently shipping unsigned.

Verified against the installed tree: electron-builder 25.1.8 supports `azureSignOptions` natively and authenticates through Entra `EnvironmentCredential`. A `--dir` build confirmed the config loads, the enable/disable branch reports correctly, and the require-signing guard aborts the build as intended.

**SmartScreen caveat — criterion revised.** Signing removes the "Unknown Publisher" block, but SmartScreen reputation is also download-volume-based, so a newly signed installer from a brand-new publisher identity can still show a milder interstitial at first. The criterion below is therefore written as *no Unknown-Publisher block + correct publisher name*; reputation is tracked separately rather than treated as a gate.

### Landing page

**Built.** Lives in `site/` (a static `index.html` plus three before/after pairs in `site/img/`), deployed to GitHub Pages by `.github/workflows/pages.yml` on any push to `main` touching `site/`. The workflow uses `actions/configure-pages` with `enablement: true`, so the first run turns Pages on without a manual settings change; the site lands at `https://bradhinkel.github.io/upscaler-desktop/`.

Deploying from an Actions workflow rather than a branch folder is what allowed `site/` as the source — branch-based Pages only offers `/` or `/docs`, and `docs/` already holds the PRD / plan / parity material.

The comparison images are genuine engine output, not mock-ups: `{stem}_250.jpg` from the frozen test set run through the shipping `realesrgan-ncnn-vulkan` binary at 4×, center-cropped to 700² at 1:1, against a bicubic resize of the same source. Sources are Pixabay, attributed in the footer.

The download button is driven by a `RELEASE_PUBLISHED` constant at the top of the page script. It currently renders disabled with an honest "not published yet" note; flipping it to `true` points at `/releases/latest`, which then resolves for every subsequent release with no further edit.

**Sequencing.** Signing gates the tagged release; the release URL gates both the landing page's download button and the clean-VM test. Work that can proceed while identity validation is pending: `azureSignOptions` + workflow env wiring, landing-page scaffold with a placeholder download link, README screenshots.

**Acceptance criteria**
- [ ] `npm run dist` produces a signed installer; `signtool verify /pa` passes.
- [ ] **Clean Windows 11 VM test:** download installer from the release URL in a browser → install → first upscale. No Unknown-Publisher SmartScreen block, correct publisher name shown, no missing-DLL errors. (Brad or a fresh VM — Claude Code can't fake this; never invent the result.)
- [ ] Installer ≤ 400 MB.
- [ ] Install → first completed upscale timed at < 5 minutes on the clean VM.
- [ ] `v0.1.0` tag pushed; GitHub Release published with the signed installer attached, **marked pre-release** and described as an alpha.
- [ ] Landing page live; download link resolves to the signed release asset; the page states plainly that this is an alpha.
- [ ] README: screenshots, system requirements, build-from-source instructions, license, alpha status.

### After the alpha — what a richer v1.0 still needs

**Not yet scoped. To be planned with Brad once the alpha is live.** Recorded here so the alpha's deliberate narrowness is on the record — this is a candidate list, not committed work.

- **Distribution maturity:** auto-update (electron-updater — `latest.yml` is already emitted by the build but nothing consumes it), crash/error reporting, versioned release notes.
- **Product polish:** app icon and installer branding, first-run onboarding, model selection UI beyond the default, presets for common print sizes.
- **Platform reach:** macOS / Linux builds — PRD §3 lists these as fast-follow candidates and the engine binary is already cross-platform.
- **Metrics depth:** DISTS alongside LPIPS (Phase 3 left it as future work).
- **The strategic payload (PRD §1.3):** the diffusion-refinement engine, gated on Phase R's outcome and the 100K-image retrain go/no-go.
- **Standing non-goals** unless Brad revisits them: video upscaling, face restoration, cloud/API anything, telemetry, 16-bit color (the Real-ESRGAN models are 8-bit-trained).

## Phase R — Diffusion-refinement experiment (Track B, research repo)

Runs under the existing repo's CLAUDE.md rules. Can start any time after Track A Phase 1 (it shares nothing with the app except the eventual gate decision).

**R.1 — Wild test set (Brad curates, Claude Code tools it).** ~30 real-world LR images: phone photos, JPEG-recompressed, low-light. Stored as `data/wild_images/` with `metadata.json` (same schema spirit as the frozen set; this is a *new* set — the frozen 60 stays frozen). No ground-truth HR exists for wild images, so wild-set evaluation is no-reference: side-by-side grids + Brad ranking; metrics only on the frozen set.

**R.2 — Refinement runs.** Script `scripts/refine_pass.py`: Real-ESRGAN 4× → SD 1.5 img2img + ControlNet Tile (denoise 0.15 / 0.2 / 0.3) × (LoRA on / off). Frozen set: full LPIPS/DISTS leaderboard rows appended to a new `outputs/eval/leaderboard_tier1_refine.csv`. Wild set: contact-sheet grids per condition.

**R.3 — Decision memo.** Notebook with: metric deltas table, ≥6 side-by-side hero comparisons (frozen + wild), and a written recommendation. Brad applies the gate (metrics inform, eyes decide) and records the outcome:
- *Adds value* → scope the 100K-image LoRA retrain as its own follow-on plan (Tier-3-shaped: LSDIR-scale data, larger VLM captions, broader image types). Refinement does **not** ship in the app until that retrain produces a clearly better artifact.
- *No value* → negative result documented in the case study; app stays Real-ESRGAN-only.

**Acceptance criteria**
- [ ] `data/wild_images/` + metadata exists (≥25 images, Brad-approved).
- [ ] `leaderboard_tier1_refine.csv` covers Real-ESRGAN-alone + 6 refinement conditions on the frozen set at 4×.
- [ ] Grids rendered for both sets; decision memo written; Brad's gate decision recorded in the memo.

---

## Effort estimate (honest revision of the follow-on doc's 25 hrs)

| Phase | Hours |
|---|---|
| 0 — Scaffold + CI | 3 |
| 1 — Engine + parity | 6 |
| 2 — Core UI | 9 |
| 3 — LPIPS/ONNX | 4 (or 1 if deferred) |
| 4 — Batch + robustness | 5 |
| 5 — Packaging + signing + page (alpha) | 6 |
| **Track A total** | **~33** |
| R — Refinement experiment | 8 (+ Brad's curation/judging time) |

The original 25 hr estimate assumed a Gradio wrapper. A signed Electron app with parity testing and the ONNX metric path is ~33 hrs; the difference buys an actually installable product.

## What Brad owns

- **Phase 0:** license decision sign-off (MIT binary vs AGPL fork + open-sourcing).
- **Phase 1:** review parity results at 100% zoom; judgment call if drift is visible.
- **Phase 5:** Azure account + Artifact Signing identity validation (~$9.99/mo, US individual validation, GA since April 2026) — *in progress as of 2026-09-09*; creating the Entra service principal and loading the three `AZURE_*` GitHub Actions secrets; handing back the account name / certificate-profile name / endpoint region URI; clean-VM SmartScreen verification; optional custom domain; product name (it becomes the certificate profile's subject CN).
- **After Phase 5:** deciding what "richer than the alpha" means — scoping v1.0 from the candidate list at the end of Phase 5.
- **Phase R:** wild-image curation (his photos / phone shots); perceptual judging; the gate decision; the 100K-retrain go/no-go.
- **Every phase:** review and explicit approval before the next phase starts.

## Hard rules

- Never commit signing credentials, tokens, fetched binaries/models, or generated images.
- Never mark the clean-VM SmartScreen test passed without it actually being run on a clean VM.
- Never modify the research repo's frozen test set; the wild set is additive and separate.
- Never invent an acceptance-criteria result. If it can't be verified, say so and ask.
- Stop-and-ask beats guessing, every time.
