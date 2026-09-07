# CLAUDE.md — upscaler-desktop

Operator manual for Claude Code on this project. Read in full before making changes.

The authoritative project plan is `docs/project_plan.md` with the PRD at `docs/PRD.md`. This file is the compact, action-oriented companion.

---

## Working mode

**One phase at a time. Stop at phase boundaries.**

1. Read the phase section in `docs/project_plan.md` in full.
2. Read the acceptance criteria below.
3. Do the work. Commit regularly with clear messages.
4. When acceptance criteria are met, **stop**. Produce a short completion summary.
5. Wait for Brad's explicit approval before starting the next phase.
6. If something is wrong, ambiguous, or needs a meaningful deviation — **stop and ask**.

Do not modify `docs/project_plan.md` or `docs/PRD.md` without being asked.

---

## Project overview

A signed Windows desktop app that wraps `realesrgan-ncnn-vulkan` for GPU-accelerated image upscaling. Electron + TypeScript + React. Target: photographers making large-format prints.

Key decisions (see `docs/decisions.md`):
- Engine binary: original xinntao `realesrgan-ncnn-vulkan` (MIT license)
- App license: MIT
- Packaging: electron-builder, NSIS installer, Azure Artifact Signing (Phase 5)
- Node: 18.20.8 (Windows)

---

## Repo conventions

- **TypeScript strict mode** everywhere.
- `src/main/` — Electron main process
- `src/preload/` — context bridge
- `src/renderer/` — React UI
- `src/shared/` — types and engine contract (shared between main + renderer)
- `resources/bin/` — sidecar binary (gitignored, fetched at build time)
- `resources/models/` — ncnn model files (gitignored, fetched at build time)
- `scripts/` — build/CI helpers
- `docs/` — PRD, project plan, engine contract, decisions
- `tests/` — Vitest unit tests (must pass on CPU-only CI)

---

## Commands

### Setup
```bash
npm install
npm run fetch-binaries   # download realesrgan-ncnn-vulkan + models (checksum verified)
```

### Development
```bash
npm run dev              # launch app in dev mode
npm run build            # production build
```

### Quality gates (run before every commit)
```bash
npm run typecheck        # tsc --noEmit on both tsconfigs
npm run lint             # eslint
npm run format           # prettier --write
npm test                 # vitest run
```

### Packaging
```bash
npm run dist             # electron-builder → installer
```

---

## Acceptance criteria per phase

### Phase 0 — Scaffold and CI
- [ ] `npm install && npm run dev` opens the app window.
- [ ] `npm test`, `npm run lint`, `npm run typecheck` all exit 0.
- [ ] CI green on Windows runner on at least one push.
- [ ] `fetch-binaries` produces a runnable `realesrgan-ncnn-vulkan.exe` + models; both gitignored.
- [ ] `CLAUDE.md` and `docs/engine-contract.md` (draft) committed.
- [ ] License decision recorded in `docs/decisions.md`.

### Phase 1 — Engine layer and parity
- [ ] Engine contract types finalized in `src/shared/`.
- [ ] `docs/engine-contract.md` updated to match.
- [ ] CLI harness: image in → 4× out on local GPU.
- [ ] ≥8 unit tests with mocked child process.
- [ ] Parity CSV in `docs/parity/` (mean LPIPS delta < 0.01 vs study baseline).
- [ ] All quality gates green.

### Phase 2 — Core UI
- [ ] 4×, 8×, 16× produce correct dimensions.
- [ ] Before/after comparison slider with 1:1 zoom + synced pan.
- [ ] All three output formats verified.
- [ ] Cancellation leaves no orphan process or temp files.
- [ ] Settings survive app restart.
- [ ] Playwright E2E smoke test.

### Phase 3 — LPIPS scoring
- [ ] LPIPS ONNX export validated (delta < 0.005 on 20 pairs).
- [ ] In-app scoring matches research repo within 0.005.
- [ ] Scoring is non-blocking.

### Phase 4 — Batch mode and robustness
- [ ] Batch of ≥20 images completes with accurate summary.
- [ ] 16K output completes; peak RAM < 75% system RAM.
- [ ] Pathological inputs produce clean errors.
- [ ] Queue behavior unit tests.

### Phase 5 — Packaging, signing, distribution
- [ ] Signed installer; `signtool verify /pa` passes.
- [ ] Clean Windows 11 VM test passes (no SmartScreen warning).
- [ ] Installer ≤ 400 MB.
- [ ] Landing page live.

---

## Hard rules

- **Never commit** signing credentials, `.env`, fetched binaries/models, or generated images.
- **Never skip** `npm test` + `npm run lint` + `npm run typecheck` before declaring a phase complete.
- **Never amend or force-push** a commit already pushed, unless Brad explicitly asks.
- **Never mark** the clean-VM SmartScreen test passed without it actually being run.
- **Never invent** an acceptance-criteria result.
- Stop-and-ask beats guessing, every time.

---

## Environment variables

Secrets in `.env` (never committed). Copy `.env.example` → `.env`.

| Phase | Vars needed |
|---|---|
| 0–4 | None |
| 5 | Azure signing credentials (in GitHub Actions secrets only) |

---

## What Brad owns

- **Phase 0:** License decision sign-off (done: MIT).
- **Phase 1:** Review parity results at 100% zoom.
- **Phase 5:** Azure Artifact Signing setup, clean-VM verification, product name.
- **Every phase:** Review and explicit approval.
