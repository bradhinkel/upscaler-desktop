/**
 * Validate in-app ONNX LPIPS against research repo Python LPIPS.
 * Spot-checks 5 image pairs. Delta must be < 0.005.
 *
 * Usage: npx tsx scripts/validate-lpips.ts
 */

import path from 'path';
import { MetricsService } from '../src/main/metrics-service';

const APP_ROOT = path.resolve(__dirname, '..');
const TEST_DIR = path.resolve(APP_ROOT, '..', 'data', 'test_images');
const PARITY_DIR = path.join(APP_ROOT, 'outputs', 'parity');

// Reference LPIPS values computed via Python ONNX at 256x256 (from validation)
const REFERENCE: { image: string; python_onnx_lpips: number }[] = [
  { image: 'Alhambra_fine-arch', python_onnx_lpips: 0.059024 },
  { image: 'Bison', python_onnx_lpips: 0.102029 },
  { image: 'Florence', python_onnx_lpips: 0.024663 },
  { image: 'Grizzly_Bear', python_onnx_lpips: 0.048484 },
  { image: 'Horses', python_onnx_lpips: 0.039749 },
];

async function main(): Promise<void> {
  const service = new MetricsService(true, APP_ROOT);
  const ok = await service.initialize();
  if (!ok) {
    console.error('Failed to initialize MetricsService. Is lpips.onnx present?');
    process.exit(1);
  }

  console.log('Validating in-app ONNX LPIPS (Node.js) vs Python ONNX LPIPS\n');

  let maxDelta = 0;
  for (const ref of REFERENCE) {
    const hrPath = path.join(TEST_DIR, `${ref.image}.jpg`);
    const outPath = path.join(PARITY_DIR, `${ref.image}_ncnn_4x.png`);

    const score = await service.computeLpips(hrPath, outPath);
    if (score === null) {
      console.error(`  ${ref.image}: FAILED (null score)`);
      continue;
    }

    const delta = Math.abs(score - ref.python_onnx_lpips);
    maxDelta = Math.max(maxDelta, delta);
    const pass = delta < 0.005 ? 'OK' : 'FAIL';
    console.log(
      `  ${ref.image}: node=${score.toFixed(6)} python=${ref.python_onnx_lpips.toFixed(6)} delta=${delta.toFixed(6)} ${pass}`,
    );
  }

  console.log(`\nMax delta: ${maxDelta.toFixed(6)}`);
  console.log(`PASS: ${maxDelta < 0.005 ? 'YES' : 'NO'} (threshold: 0.005)`);
}

main().catch((err) => {
  console.error('Validation failed:', err);
  process.exit(1);
});
