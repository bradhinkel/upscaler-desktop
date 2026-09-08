/**
 * CLI harness for the upscale engine.
 * Usage: npm run upscale -- -i input.jpg -o output.png [-m model] [-t tileSize]
 */

import path from 'path';
import { NcnnEngine } from '../src/main/engine/ncnn-engine';
import { EngineManager } from '../src/main/engine/engine-manager';
import { JobOrchestrator } from '../src/main/engine/job-orchestrator';
import type { OutputFormat } from '../src/shared/types';

function parseArgs(argv: string[]): {
  input: string;
  output: string;
  model: string;
  tileSize: number;
} {
  const args = { input: '', output: '', model: 'realesrgan-x4plus', tileSize: 0 };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '-i':
      case '--input':
        args.input = argv[++i];
        break;
      case '-o':
      case '--output':
        args.output = argv[++i];
        break;
      case '-m':
      case '--model':
        args.model = argv[++i];
        break;
      case '-t':
      case '--tile':
        args.tileSize = parseInt(argv[++i], 10);
        break;
    }
  }

  if (!args.input || !args.output) {
    console.error('Usage: npm run upscale -- -i <input> -o <output> [-m model] [-t tileSize]');
    process.exit(1);
  }

  return args;
}

function inferFormat(outputPath: string): OutputFormat {
  const ext = path.extname(outputPath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'jpeg';
  if (ext === '.tiff' || ext === '.tif') return 'tiff';
  return 'png';
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const appRoot = path.resolve(__dirname, '..');

  const binaryPath = path.join(appRoot, 'resources', 'bin', 'realesrgan-ncnn-vulkan.exe');
  const modelsPath = path.join(appRoot, 'resources', 'models');

  const engine = new NcnnEngine(binaryPath, modelsPath);
  const manager = new EngineManager();
  manager.register(engine);
  await manager.initialize();

  const orchestrator = new JobOrchestrator(manager);

  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(args.output);

  console.log(`Upscaling: ${inputPath}`);
  console.log(`Output:    ${outputPath}`);
  console.log(`Model:     ${args.model}`);
  console.log(`Tile size: ${args.tileSize || 'auto'}`);
  console.log();

  const result = await orchestrator.submit(
    {
      inputPath,
      outputPath,
      scale: 4,
      model: args.model,
      tileSize: args.tileSize,
      outputFormat: inferFormat(outputPath),
    },
    (event) => {
      process.stdout.write(`\r  Progress: ${event.percent.toFixed(1)}%${event.message ? ' — ' + event.message : ''}`);
    },
  );

  console.log();
  if (result.success) {
    console.log(`Done in ${(result.elapsedMs / 1000).toFixed(1)}s → ${result.outputPath}`);
  } else {
    console.error(`Failed: ${result.error}`);
    process.exit(1);
  }

  await manager.shutdown();
}

main().catch((err) => {
  console.error('Upscale failed:', err.userMessage || err.message);
  process.exit(1);
});
