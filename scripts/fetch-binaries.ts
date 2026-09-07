/**
 * Downloads realesrgan-ncnn-vulkan binary + models with checksum verification.
 * Run: npm run fetch-binaries
 *
 * Source: https://github.com/xinntao/Real-ESRGAN (MIT license)
 * Binary: realesrgan-ncnn-vulkan v0.2.0 (2022-04-24)
 * Models: realesrgan-x4plus (.param + .bin, ncnn format)
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

const DOWNLOAD_URL =
  'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip';
const EXPECTED_SHA256 = 'abc02804e17982a3be33675e4d471e91ea374e65b70167abc09e31acb412802d';

const ROOT = path.resolve(__dirname, '..');
const BIN_DIR = path.join(ROOT, 'resources', 'bin');
const MODELS_DIR = path.join(ROOT, 'resources', 'models');
const TEMP_ZIP = path.join(ROOT, 'resources', 'realesrgan-download.zip');

function followRedirects(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const request = (currentUrl: string, redirectCount = 0) => {
      if (redirectCount > 10) {
        reject(new Error('Too many redirects'));
        return;
      }
      https
        .get(currentUrl, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            request(res.headers.location, redirectCount + 1);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        })
        .on('error', reject);
    };
    request(url);
  });
}

function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function main(): Promise<void> {
  // Check if already fetched
  const exePath = path.join(BIN_DIR, 'realesrgan-ncnn-vulkan.exe');
  const modelBin = path.join(MODELS_DIR, 'realesrgan-x4plus.bin');
  const modelParam = path.join(MODELS_DIR, 'realesrgan-x4plus.param');

  if (fs.existsSync(exePath) && fs.existsSync(modelBin) && fs.existsSync(modelParam)) {
    console.log('Binaries and models already present. Delete resources/bin/ and resources/models/ to re-fetch.');
    return;
  }

  console.log(`Downloading realesrgan-ncnn-vulkan from:\n  ${DOWNLOAD_URL}`);
  const data = await followRedirects(DOWNLOAD_URL);

  // Verify checksum
  const hash = sha256(data);
  if (hash !== EXPECTED_SHA256) {
    throw new Error(`Checksum mismatch!\n  Expected: ${EXPECTED_SHA256}\n  Got:      ${hash}`);
  }
  console.log('Checksum verified.');

  // Write zip to temp file
  fs.writeFileSync(TEMP_ZIP, data);

  // Extract using tar (available in Git Bash / WSL / Windows)
  fs.mkdirSync(BIN_DIR, { recursive: true });
  fs.mkdirSync(MODELS_DIR, { recursive: true });

  const tempExtract = path.join(ROOT, 'resources', 'realesrgan-extract');
  fs.mkdirSync(tempExtract, { recursive: true });

  try {
    // Extract using PowerShell (works on Windows and CI runners)
    const psCmd = `Expand-Archive -Path '${TEMP_ZIP}' -DestinationPath '${tempExtract}' -Force`;
    execSync(`powershell.exe -NoProfile -Command "${psCmd}"`, { stdio: 'inherit' });

    // The zip may have a top-level folder or files at root — find the exe
    function findFile(dir: string, name: string): string | null {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && entry.name === name) return full;
        if (entry.isDirectory()) {
          const found = findFile(full, name);
          if (found) return found;
        }
      }
      return null;
    }

    const exeFound = findFile(tempExtract, 'realesrgan-ncnn-vulkan.exe');
    if (!exeFound) throw new Error('realesrgan-ncnn-vulkan.exe not found in archive');
    const extractedRoot = path.dirname(exeFound);

    // Copy binary and DLLs to resources/bin/
    for (const file of ['realesrgan-ncnn-vulkan.exe', 'vcomp140.dll', 'vcomp140d.dll']) {
      const src = path.join(extractedRoot, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(BIN_DIR, file));
        console.log(`  -> resources/bin/${file}`);
      }
    }

    // Copy model files to resources/models/
    const modelsExtracted = path.join(extractedRoot, 'models');
    if (fs.existsSync(modelsExtracted)) {
      for (const file of fs.readdirSync(modelsExtracted)) {
        fs.copyFileSync(path.join(modelsExtracted, file), path.join(MODELS_DIR, file));
        console.log(`  -> resources/models/${file}`);
      }
    }
  } finally {
    // Cleanup
    fs.rmSync(tempExtract, { recursive: true, force: true });
    fs.rmSync(TEMP_ZIP, { force: true });
  }

  console.log('\nDone. Binary and models ready in resources/.');
}

main().catch((err) => {
  console.error('fetch-binaries failed:', err);
  process.exit(1);
});
