import fs from 'fs';
import path from 'path';

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tiff', '.tif']);

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate an image file before processing.
 * Returns { valid: true } or { valid: false, reason: "..." }.
 */
export async function validateInput(filePath: string): Promise<ValidationResult> {
  // Check file exists
  if (!fs.existsSync(filePath)) {
    return { valid: false, reason: `File not found: ${path.basename(filePath)}` };
  }

  // Check extension
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    return { valid: false, reason: `Unsupported format: ${ext}` };
  }

  // Check file is not empty
  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    return { valid: false, reason: 'File is empty (0 bytes)' };
  }

  // Check file is readable and valid image via sharp
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(filePath).metadata();

    if (!meta.width || !meta.height) {
      return { valid: false, reason: 'Could not read image dimensions' };
    }

    // Reject animated images (e.g. animated WebP/GIF)
    if (meta.pages && meta.pages > 1) {
      return { valid: false, reason: 'Animated images are not supported' };
    }

    // Reject CMYK images
    if (meta.space === 'cmyk') {
      return { valid: false, reason: 'CMYK color space is not supported. Convert to RGB first.' };
    }

    // Warn about extreme aspect ratios (e.g. 1×10000 strips)
    const ratio = Math.max(meta.width, meta.height) / Math.min(meta.width, meta.height);
    if (ratio > 20) {
      return {
        valid: false,
        reason: `Extreme aspect ratio (${meta.width}x${meta.height}). Max ratio is 20:1.`,
      };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Corrupt or unreadable image file' };
  }
}

/**
 * List image files in a directory (non-recursive).
 */
export function listImageFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return [];
  }

  return fs
    .readdirSync(dirPath)
    .filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return SUPPORTED_EXTENSIONS.has(ext);
    })
    .map((f) => path.join(dirPath, f))
    .sort();
}
