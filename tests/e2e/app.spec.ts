/**
 * E2E integration test for the upscale pipeline.
 *
 * Verifies the full path: load image → engine → upscale → save → verify dimensions.
 * Tests 4×, 8×, and 16× scale factors.
 *
 * This test exercises the real engine (requires GPU + models).
 * It is NOT run in CI. Run locally: npx playwright test
 *
 * NOTE: Playwright's Electron CDP integration does not work reliably on
 * Windows with Electron 41+. This test exercises the engine + save pipeline
 * directly. The UI is verified manually via `npm run dev`.
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const APP_ROOT = path.resolve(__dirname, '../..');
// Test images are in the parent research repo's data directory
const TEST_IMAGE = path.resolve(APP_ROOT, '../data/test_images/House_Finch_250.jpg');
const OUTPUT_DIR = path.join(APP_ROOT, 'outputs', 'e2e');

test.describe('Upscaler Pipeline E2E', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  test('4x upscale produces correct dimensions', async () => {
    const output = path.join(OUTPUT_DIR, 'test_4x.png');
    if (fs.existsSync(output)) fs.unlinkSync(output);

    execSync(
      `npx tsx scripts/upscale.ts -i "${TEST_IMAGE}" -o "${output}" -s 4`,
      { cwd: APP_ROOT, stdio: 'pipe', timeout: 60000 },
    );

    expect(fs.existsSync(output)).toBe(true);
    const sharp = (await import('sharp')).default;
    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(1000);
    expect(meta.height).toBe(1000);
  });

  test('8x upscale produces correct dimensions', async () => {
    const output = path.join(OUTPUT_DIR, 'test_8x.png');
    if (fs.existsSync(output)) fs.unlinkSync(output);

    execSync(
      `npx tsx scripts/upscale.ts -i "${TEST_IMAGE}" -o "${output}" -s 8`,
      { cwd: APP_ROOT, stdio: 'pipe', timeout: 120000 },
    );

    expect(fs.existsSync(output)).toBe(true);
    const sharp = (await import('sharp')).default;
    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(2000);
    expect(meta.height).toBe(2000);
  });

  test('16x upscale produces correct dimensions', async () => {
    const output = path.join(OUTPUT_DIR, 'test_16x.png');
    if (fs.existsSync(output)) fs.unlinkSync(output);

    execSync(
      `npx tsx scripts/upscale.ts -i "${TEST_IMAGE}" -o "${output}" -s 16`,
      { cwd: APP_ROOT, stdio: 'pipe', timeout: 120000 },
    );

    expect(fs.existsSync(output)).toBe(true);
    const sharp = (await import('sharp')).default;
    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(4000);
    expect(meta.height).toBe(4000);
  });

  test('JPEG output is valid and openable', async () => {
    const output = path.join(OUTPUT_DIR, 'test_4x.jpg');
    if (fs.existsSync(output)) fs.unlinkSync(output);

    execSync(
      `npx tsx scripts/upscale.ts -i "${TEST_IMAGE}" -o "${output}" -s 4`,
      { cwd: APP_ROOT, stdio: 'pipe', timeout: 60000 },
    );

    expect(fs.existsSync(output)).toBe(true);
    const sharp = (await import('sharp')).default;
    const meta = await sharp(output).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(1000);
  });

  test.afterAll(() => {
    // Clean up E2E outputs
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });
});
