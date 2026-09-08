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

/** Batch upscale request. */
export interface BatchRequest {
  inputDir: string;
  outputDir: string;
  scale: ScaleFactor;
  model: string;
  tileSize: number;
  outputFormat: OutputFormat;
  jpegQuality: number;
}

/** Per-image result in a batch. */
export interface BatchItemResult {
  filename: string;
  status: 'succeeded' | 'failed' | 'skipped';
  reason?: string;
  elapsedMs?: number;
}

/** Batch completion summary. */
export interface BatchSummary {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  items: BatchItemResult[];
  totalElapsedMs: number;
}

/** Batch progress event. */
export interface BatchProgressEvent {
  current: number;
  total: number;
  currentFile: string;
  filePercent: number;
  message?: string;
}

/** IPC channel names. */
export const IPC = {
  // Renderer → Main (invoke)
  UPSCALE: 'upscale',
  BATCH_UPSCALE: 'batch-upscale',
  CANCEL: 'cancel',
  SAVE: 'save',
  OPEN_FILE: 'open-file',
  OPEN_FOLDER: 'open-folder',
  GET_SETTINGS: 'get-settings',
  SET_SETTINGS: 'set-settings',

  READ_IMAGE: 'read-image',
  COMPUTE_LPIPS: 'compute-lpips',

  // Main → Renderer (send)
  PROGRESS: 'progress',
  BATCH_PROGRESS: 'batch-progress',
} as const;

/** Type-safe API exposed to renderer via contextBridge. */
export interface ElectronAPI {
  upscale(request: UpscaleRequest): Promise<UpscaleResult>;
  batchUpscale(request: BatchRequest): Promise<BatchSummary>;
  cancel(): void;
  save(request: SaveRequest): Promise<{ success: boolean; path?: string; error?: string }>;
  openFile(): Promise<string | null>;
  openFolder(): Promise<string | null>;
  readImage(filePath: string): Promise<string>;
  computeLpips(referencePath: string, distortedPath: string): Promise<number | null>;
  getSettings(): Promise<AppSettings>;
  setSettings(settings: Partial<AppSettings>): Promise<void>;
  onProgress(callback: (event: ProgressEvent) => void): () => void;
  onBatchProgress(callback: (event: BatchProgressEvent) => void): () => void;
}
