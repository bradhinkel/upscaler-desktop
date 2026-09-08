import { describe, it, expect } from 'vitest';
import { validateInput, listImageFiles } from '../src/main/engine/input-validator';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Tests use real filesystem but don't need GPU — they test validation and listing logic.

const TEMP_DIR = path.join(os.tmpdir(), 'upscaler-test-batch');

function createTempFile(name: string, content: Buffer | string = 'test'): string {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const filePath = path.join(TEMP_DIR, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe('input-validator', () => {
  it('rejects non-existent file', async () => {
    const result = await validateInput('/nonexistent/file.jpg');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not found');
  });

  it('rejects unsupported extension', async () => {
    const filePath = createTempFile('test.bmp', 'fake');
    const result = await validateInput(filePath);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Unsupported format');
  });

  it('rejects empty file', async () => {
    const filePath = createTempFile('empty.jpg', Buffer.alloc(0));
    const result = await validateInput(filePath);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('empty');
  });

  it('rejects corrupt file with image extension', async () => {
    const filePath = createTempFile('corrupt.jpg', 'not an image');
    const result = await validateInput(filePath);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Corrupt');
  });
});

describe('listImageFiles', () => {
  it('returns empty for non-existent directory', () => {
    const result = listImageFiles('/nonexistent/dir');
    expect(result).toEqual([]);
  });

  it('lists only image files', () => {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    createTempFile('a.jpg', 'test');
    createTempFile('b.png', 'test');
    createTempFile('c.txt', 'test');
    createTempFile('d.webp', 'test');

    const result = listImageFiles(TEMP_DIR);
    const names = result.map((f) => path.basename(f));
    expect(names).toContain('a.jpg');
    expect(names).toContain('b.png');
    expect(names).toContain('d.webp');
    expect(names).not.toContain('c.txt');
  });

  it('returns sorted list', () => {
    const result = listImageFiles(TEMP_DIR);
    const names = result.map((f) => path.basename(f));
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });
});

// Cleanup
import { afterAll } from 'vitest';
afterAll(() => {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
});
