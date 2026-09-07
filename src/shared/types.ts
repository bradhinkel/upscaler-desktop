/** Scale factors supported by the app. */
export type ScaleFactor = 4 | 8 | 16;

/** Output image format. */
export type OutputFormat = 'png' | 'jpeg' | 'tiff';

/**
 * Job specification passed from the shell to an engine.
 * This is the engine-contract boundary — see docs/engine-contract.md.
 */
export interface JobSpec {
  /** Absolute path to the input image. */
  inputPath: string;
  /** Desired scale factor (4 for single-pass, 8/16 for two-pass). */
  scale: ScaleFactor;
  /** Model identifier (e.g. 'realesrgan-x4plus'). */
  model: string;
  /** Tile size in pixels. 0 = auto. */
  tileSize: number;
  /** Absolute path for the output image. */
  outputPath: string;
  /** Output format. */
  outputFormat: OutputFormat;
}

/** Progress event emitted by an engine during processing. */
export interface ProgressEvent {
  /** Percentage complete (0–100). */
  percent: number;
  /** Optional status message. */
  message?: string;
}

/** Result of a completed engine job. */
export interface JobResult {
  /** Whether the job succeeded. */
  success: boolean;
  /** Absolute path to the output image (if success). */
  outputPath?: string;
  /** Error message (if failed). */
  error?: string;
  /** Processing time in milliseconds. */
  elapsedMs: number;
}

/** Capabilities declared by an engine implementation. */
export interface EngineCapabilities {
  /** Engine identifier. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Supported scale factors. */
  supportedScales: ScaleFactor[];
  /** Available model identifiers. */
  availableModels: string[];
  /** Whether the engine requires a GPU. */
  requiresGpu: boolean;
}

/** Lifecycle interface that all engines must implement. */
export interface EngineLifecycle {
  /** Initialize the engine (download models, verify GPU, etc.). */
  initialize(): Promise<void>;
  /** Check if the engine is ready to accept jobs. */
  isReady(): boolean;
  /** Shut down the engine and clean up resources. */
  shutdown(): Promise<void>;
}
