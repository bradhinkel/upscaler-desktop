# Upscaler Desktop

Real-ESRGAN desktop image upscaler for photographers. Built with Electron, TypeScript, and React.

Uses [realesrgan-ncnn-vulkan](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan) for GPU-accelerated upscaling on any Vulkan-capable GPU (NVIDIA, AMD, Intel Arc).

## Development

```bash
npm install
npm run fetch-binaries   # download realesrgan-ncnn-vulkan + models
npm run dev              # launch in dev mode
```

## Quality gates

```bash
npm run typecheck
npm run lint
npm test
```

## Build

```bash
npm run build
npm run dist    # create installer
```

## License

MIT — see [LICENSE](LICENSE).
