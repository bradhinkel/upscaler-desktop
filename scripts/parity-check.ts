/**
 * Parity check: run all 60 frozen test images through ncnn engine at 4×,
 * then invoke the research repo's LPIPS evaluation via WSL/Python.
 *
 * Usage: npx tsx scripts/parity-check.ts
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { NcnnEngine } from '../src/main/engine/ncnn-engine';
import { EngineManager } from '../src/main/engine/engine-manager';
import { JobOrchestrator } from '../src/main/engine/job-orchestrator';
import type { JobSpec } from '../src/shared/types';

const APP_ROOT = path.resolve(__dirname, '..');
const TEST_IMAGES_DIR = path.resolve(APP_ROOT, '..', 'data', 'test_images');
const OUTPUT_DIR = path.join(APP_ROOT, 'outputs', 'parity');
const PARITY_CSV = path.join(APP_ROOT, 'docs', 'parity', 'parity_4x.csv');

// Reference LPIPS values from the research repo (leaderboard_phase3.csv, realesrgan at 4×)
const REFERENCE_LPIPS: Record<string, number> = {
  'Alhambra_fine-arch.jpg': 0.334987,
  'Athens_Street.jpg': 0.171127,
  'Bison.jpg': 0.364977,
  'California_Wildflowers.jpg': 0.339858,
  'Cat_Eyes-hf-texture.jpg': 0.279231,
  'Death_Valley.jpg': 0.254933,
  'Deer.jpg': 0.194582,
  'Dubai_fine-arch.jpg': 0.177603,
  'Duomo_fine-arch.jpg': 0.210753,
  'Dutch_Street.jpg': 0.211054,
  'Fatehpur_Sikri.jpg': 0.224450,
  'Ferret.jpg': 0.147731,
  'Florence.jpg': 0.143681,
  'Forest_hf-texture.jpg': 0.325679,
  'Grain_hf-texture.jpg': 0.218844,
  'Gramercy_Park_noise.jpg': 0.253911,
  'Greek_Island_Town.jpg': 0.262015,
  'Grey_Heron.jpg': 0.195456,
  'Grizzly_Bear.jpg': 0.281680,
  'Horses.jpg': 0.306495,
  'House_Finch.jpg': 0.107460,
  'Japan_Street_text.jpg': 0.193612,
  'Joshua_Tree.jpg': 0.343836,
  'Landscape_Grain.jpg': 0.702198,
  'Landscape_Reflection.jpg': 0.284492,
  'Lizard.jpg': 0.258320,
  'Mexico_Street.jpg': 0.226493,
  'Montain_Landscape3.jpg': 0.276642,
  'NewYork.jpg': 0.267766,
  'NewYork_Street_Text.jpg': 0.205370,
  'NewYork_night_noise.jpg': 0.419099,
  'Nice.jpg': 0.205325,
  'Notre_Dame_Fine-Arch.jpg': 0.221362,
  'Owl.jpg': 0.231457,
  'Paris_Street.jpg': 0.279575,
  'Parrot_hf-texture.jpg': 0.326913,
  'Provence_Street.jpg': 0.251747,
  'Red_Fox.jpg': 0.160821,
  'Sagrada_Familia.jpg': 0.222856,
  'SanFrancisco_Night.jpg': 0.189735,
  'Seattle2.jpg': 0.122137,
  'Seattle_Library.jpg': 0.230323,
  'Snake_hf-texture.jpg': 0.178876,
  'Street_Hindi_Text.jpg': 0.251551,
  'Street_noise_reflection.jpg': 0.207266,
  'Urban_Night_Text.jpg': 0.491435,
  'Urban_Seagull_noise.jpg': 0.427614,
  'Urban_Text.jpg': 0.153733,
  'Urban_night.jpg': 0.330073,
  'Water_reflection.jpg': 0.137764,
  'Wheat_Field_hf-texture.jpg': 0.160773,
  'Yellowstone_Canyon.jpg': 0.298988,
  'Yellowstone_Meadow.jpg': 0.209476,
  'Yosemite_Falls.jpg': 0.319058,
  'Yosemite_Valley.jpg': 0.221104,
  'hawamahal_fine-arch.jpg': 0.230925,
  'lake_reflection.jpg': 0.205029,
  'landscape_night.jpg': 0.285888,
  'landscape_sunrise.jpg': 0.336039,
  'mountain_reflection.jpg': 0.185797,
};

async function main(): Promise<void> {
  // Validate test images exist
  if (!fs.existsSync(TEST_IMAGES_DIR)) {
    throw new Error(`Test images not found at ${TEST_IMAGES_DIR}`);
  }

  // Find all _250.jpg images
  const lrImages = fs.readdirSync(TEST_IMAGES_DIR).filter((f) => f.endsWith('_250.jpg'));
  console.log(`Found ${lrImages.length} LR test images`);

  if (lrImages.length !== 60) {
    console.warn(`Expected 60 images, found ${lrImages.length}`);
  }

  // Set up engine
  const binaryPath = path.join(APP_ROOT, 'resources', 'bin', 'realesrgan-ncnn-vulkan.exe');
  const modelsPath = path.join(APP_ROOT, 'resources', 'models');
  const engine = new NcnnEngine(binaryPath, modelsPath);
  const manager = new EngineManager();
  manager.register(engine);
  await manager.initialize();
  const orchestrator = new JobOrchestrator(manager);

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Upscale all images
  console.log('\n--- Upscaling 60 images at 4× ---\n');
  const upscaleResults: { image: string; outputPath: string; elapsedMs: number }[] = [];

  for (let i = 0; i < lrImages.length; i++) {
    const lrFile = lrImages[i];
    const stem = lrFile.replace('_250.jpg', '');
    const hrName = `${stem}.jpg`;
    const outputFile = `${stem}_ncnn_4x.png`;
    const outputPath = path.join(OUTPUT_DIR, outputFile);

    // Skip if already upscaled
    if (fs.existsSync(outputPath)) {
      upscaleResults.push({ image: hrName, outputPath, elapsedMs: 0 });
      process.stdout.write(`  [${i + 1}/60] ${stem} — cached\n`);
      continue;
    }

    const spec: JobSpec = {
      inputPath: path.join(TEST_IMAGES_DIR, lrFile),
      outputPath,
      scale: 4,
      model: 'realesrgan-x4plus',
      tileSize: 0,
      outputFormat: 'png',
    };

    const result = await orchestrator.submit(spec, (e) => {
      process.stdout.write(`\r  [${i + 1}/60] ${stem} — ${e.percent.toFixed(0)}%`);
    });

    process.stdout.write(`\r  [${i + 1}/60] ${stem} — done (${(result.elapsedMs / 1000).toFixed(1)}s)\n`);
    upscaleResults.push({ image: hrName, outputPath: result.outputPath!, elapsedMs: result.elapsedMs });
  }

  await manager.shutdown();

  // Compute LPIPS using the research repo's Python environment via WSL
  console.log('\n--- Computing LPIPS ---\n');

  // Build pairs data
  const pairs = upscaleResults.map((r) => {
    const hrPath = path.join(TEST_IMAGES_DIR, r.image);
    const hrWsl = hrPath.replace(/\\/g, '/').replace(/^([A-Z]):/, (_, drive: string) => `/mnt/${drive.toLowerCase()}`);
    const outWsl = r.outputPath.replace(/\\/g, '/').replace(/^([A-Z]):/, (_, drive: string) => `/mnt/${drive.toLowerCase()}`);
    return { image: r.image, hr: hrWsl, out: outWsl };
  });

  // Write pairs JSON and Python script to Windows temp, accessible from WSL
  const pairsJsonPath = path.join(OUTPUT_DIR, 'parity_pairs.json');
  fs.writeFileSync(pairsJsonPath, JSON.stringify(pairs, null, 2));

  const pyScriptContent = `
import torch, lpips, json
from PIL import Image
import torchvision.transforms as T

loss_fn = lpips.LPIPS(net='alex')
transform = T.Compose([T.ToTensor(), T.Normalize([0.5]*3, [0.5]*3)])

with open('/mnt/c/Users/bradh/src/upscaler-desktop/app/outputs/parity/parity_pairs.json') as f:
    pairs = json.load(f)

results = []
for p in pairs:
    hr = Image.open(p['hr']).convert('RGB')
    out = Image.open(p['out']).convert('RGB').resize(hr.size, Image.LANCZOS)
    hr_t = transform(hr).unsqueeze(0)
    out_t = transform(out).unsqueeze(0)
    with torch.no_grad():
        score = loss_fn(hr_t, out_t).item()
    results.append({'image': p['image'], 'lpips': score})
    print(f"  {p['image']}: {score:.6f}")

out_path = '/mnt/c/Users/bradh/src/upscaler-desktop/app/outputs/parity/parity_lpips.json'
with open(out_path, 'w') as f:
    json.dump(results, f)
print(f"\\nDone. Results written to {out_path}")
`;

  const pyScriptPath = path.join(OUTPUT_DIR, 'compute_lpips.py');
  fs.writeFileSync(pyScriptPath, pyScriptContent);

  const pyScriptWsl = pyScriptPath.replace(/\\/g, '/').replace(/^([A-Z]):/, (_, drive: string) => `/mnt/${drive.toLowerCase()}`);

  console.log('Running LPIPS computation in WSL...\n');
  execSync(
    `wsl bash -c "cd /mnt/c/Users/bradh/src/upscaler-desktop && source .venv/bin/activate && python3 '${pyScriptWsl}'"`,
    { stdio: 'inherit', timeout: 600000 },
  );

  // Read results
  const lpipsResultsPath = path.join(OUTPUT_DIR, 'parity_lpips.json');
  const lpipsResults: { image: string; lpips: number }[] = JSON.parse(
    fs.readFileSync(lpipsResultsPath, 'utf-8'),
  );

  // Build parity CSV
  fs.mkdirSync(path.dirname(PARITY_CSV), { recursive: true });

  const csvLines = ['image,ncnn_lpips,pytorch_lpips,delta'];
  let totalDelta = 0;
  let maxDelta = 0;
  let maxDeltaImage = '';

  for (const r of lpipsResults) {
    const ref = REFERENCE_LPIPS[r.image];
    if (ref === undefined) {
      console.warn(`No reference LPIPS for ${r.image}`);
      continue;
    }
    const delta = Math.abs(r.lpips - ref);
    totalDelta += delta;
    if (delta > maxDelta) {
      maxDelta = delta;
      maxDeltaImage = r.image;
    }
    csvLines.push(`${r.image},${r.lpips.toFixed(6)},${ref.toFixed(6)},${delta.toFixed(6)}`);
  }

  const meanDelta = totalDelta / lpipsResults.length;
  csvLines.push('');
  csvLines.push(`# Mean delta: ${meanDelta.toFixed(6)}`);
  csvLines.push(`# Max delta: ${maxDelta.toFixed(6)} (${maxDeltaImage})`);
  csvLines.push(`# PASS: ${meanDelta < 0.01 ? 'YES' : 'NO'} (threshold: 0.01)`);

  fs.writeFileSync(PARITY_CSV, csvLines.join('\n'));

  console.log('\n--- Parity Results ---');
  console.log(`Mean LPIPS delta: ${meanDelta.toFixed(6)}`);
  console.log(`Max LPIPS delta:  ${maxDelta.toFixed(6)} (${maxDeltaImage})`);
  console.log(`Parity check:    ${meanDelta < 0.01 ? 'PASS' : 'FAIL'} (threshold: 0.01)`);
  console.log(`\nCSV written to: ${PARITY_CSV}`);
}

main().catch((err) => {
  console.error('Parity check failed:', err.message || err);
  process.exit(1);
});
