import type { ScaleFactor, OutputFormat, ProgressEvent } from './types';

/** Settings persisted across sessions. */
export interface AppSettings {
  scale: ScaleFactor;
  model: string;
  tileSize: number;
  outputFormat: OutputFormat;
  jpegQuality: number;
  lastOutputDir: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  scale: 4,
  model: 'realesrgan-x4plus',
  tileSize: 0,
  outputFormat: 'png',
  jpegQuality: 95,
  lastOutputDir: '',
};

/** Request to start an upscale job. */
export interface UpscaleRequest {
  inputPath: string;
  scale: ScaleFactor;
  model: string;
  tileSize: number;
}

/** Result sent back after upscale completes. */
export interface UpscaleResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  elapsedMs: number;
}

/** Save request from renderer. */
export interface SaveRequest {
  /** Path to the upscaled image (temp or final). */
  sourcePath: string;
  format: OutputFormat;
  jpegQuality: number;
}

/** IPC channel names. */
export const IPC = {
  // Renderer → Main (invoke)
  UPSCALE: 'upscale',
  CANCEL: 'cancel',
  SAVE: 'save',
  OPEN_FILE: 'open-file',
  GET_SETTINGS: 'get-settings',
  SET_SETTINGS: 'set-settings',

  READ_IMAGE: 'read-image',

  // Main → Renderer (send)
  PROGRESS: 'progress',
} as const;

/** Type-safe API exposed to renderer via contextBridge. */
export interface ElectronAPI {
  upscale(request: UpscaleRequest): Promise<UpscaleResult>;
  cancel(): void;
  save(request: SaveRequest): Promise<{ success: boolean; path?: string; error?: string }>;
  openFile(): Promise<string | null>;
  readImage(filePath: string): Promise<string>;
  getSettings(): Promise<AppSettings>;
  setSettings(settings: Partial<AppSettings>): Promise<void>;
  onProgress(callback: (event: ProgressEvent) => void): () => void;
}
