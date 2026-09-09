# Architecture Decisions

## D1. License: MIT app + MIT original binary

**Date:** 2026-09-07
**Status:** Decided

**Context:** The PRD (§7) identified two options:
1. Use the original [xinntao/Real-ESRGAN-ncnn-vulkan](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan) binary (MIT license).
2. Use the [Upscayl ncnn fork](https://github.com/upscayl/upscayl-ncnn) (AGPL-3.0), which would require open-sourcing the app.

**Decision:** Use the original MIT-licensed binary. The app is licensed MIT.

**Rationale:**
- The app is already open-source as a portfolio project, so AGPL's copyleft isn't a practical concern — but MIT is simpler and more permissive for anyone who wants to build on it.
- The original binary (v0.2.0, 2022-04-24) includes all needed models (realesrgan-x4plus, anime variants) and is actively referenced by the upstream Real-ESRGAN project.
- Real-ESRGAN model weights are BSD-3-Clause, compatible with MIT.

**Source:** Binary + models downloaded from [Real-ESRGAN releases v0.2.5.0](https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0). SHA256: `abc02804e17982a3be33675e4d471e91ea374e65b70167abc09e31acb412802d`.

## D2. Product name: Enlarger

**Date:** 2026-09-09
**Status:** Decided

**Context:** The PRD carried `upscaler-desktop` as a working name with the real
name TBD. Phase 5 forced the decision: the certificate profile's subject CN
becomes the publisher string in the UAC prompt, and the landing page needs a
name to lead with.

**Decision:** The product is **Enlarger**. The GitHub repository stays
`upscaler-desktop`.

**Rationale:**
- The audience is photographers, and "enlarger" is their word — the darkroom
  device that projects a negative up to print size. It names the job in the
  user's vocabulary rather than the implementation's ("upscaler", "super
  resolution").
- Short, one word, pronounceable, no vendor or model name baked in — it stays
  accurate if the engine is ever swapped for the diffusion-refinement path.
- Renaming the repo would break the case-study cross-links, the clone URL, and
  the GitHub Pages URL for no product benefit. The npm package name
  (`upscaler-desktop`) is internal and also stays.

**Applied to:** `productName` and `appId` (`com.bradhinkel.enlarger`) in
`electron-builder.config.js`, the window and document titles, the sidebar
heading, the README, and the landing page.

**Note:** changing `appId` and `productName` moves the app's `userData`
directory, so any settings from a pre-rename dev build are not carried over.
No released build existed at the time of the change, so no user is affected.
