import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { NcnnEngine } from './engine/ncnn-engine';
import { EngineManager } from './engine/engine-manager';
import { JobOrchestrator } from './engine/job-orchestrator';
import { MetricsService } from './metrics-service';
import { IPC, DEFAULT_SETTINGS } from '../shared/ipc';
import type { AppSettings, UpscaleRequest, SaveRequest, UpscaleResult } from '../shared/ipc';

let mainWindow: BrowserWindow | null = null;
let orchestrator: JobOrchestrator;
let metricsService: MetricsService;
let settings: AppSettings = { ...DEFAULT_SETTINGS };

// Settings persistence
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings(): void {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      settings = { ...DEFAULT_SETTINGS, ...data };
    }
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(): void {
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch {
    // Best effort
  }
}

function isDev(): boolean {
  return !!process.env.ELECTRON_RENDERER_URL;
}

function getAppRoot(): string {
  if (isDev()) {
    return path.resolve(__dirname, '../..');
  }
  return path.dirname(app.getPath('exe'));
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Upscaler Desktop',
    backgroundColor: '#1a1a2e',
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function setupEngine(): void {
  const appRoot = getAppRoot();
  const binaryPath = isDev()
    ? path.join(appRoot, 'resources', 'bin', 'realesrgan-ncnn-vulkan.exe')
    : path.join(process.resourcesPath, 'bin', 'realesrgan-ncnn-vulkan.exe');
  const modelsPath = isDev()
    ? path.join(appRoot, 'resources', 'models')
    : path.join(process.resourcesPath, 'models');

  const engine = new NcnnEngine(binaryPath, modelsPath);
  const manager = new EngineManager();
  manager.register(engine);
  manager.initialize().catch((err) => {
    dialog.showErrorBox('Engine Error', err.userMessage || err.message);
  });

  orchestrator = new JobOrchestrator(manager);

  // Initialize LPIPS metrics (non-blocking — app works without it)
  metricsService = new MetricsService(isDev(), appRoot);
  metricsService.initialize().then((ok) => {
    if (!ok) console.warn('LPIPS metrics unavailable — lpips.onnx not found or failed to load');
  });
}

function setupIPC(): void {
  // Upscale
  ipcMain.handle(IPC.UPSCALE, async (_event, request: UpscaleRequest): Promise<UpscaleResult> => {
    const tempDir = path.join(os.tmpdir(), 'upscaler-desktop');
    fs.mkdirSync(tempDir, { recursive: true });
    const tempOutput = path.join(tempDir, `upscale-${Date.now()}.png`);

    try {
      const result = await orchestrator.submit(
        {
          inputPath: request.inputPath,
          outputPath: tempOutput,
          scale: request.scale,
          model: request.model,
          tileSize: request.tileSize,
          outputFormat: 'png',
        },
        (progress) => {
          mainWindow?.webContents.send(IPC.PROGRESS, progress);
        },
      );

      return {
        success: result.success,
        outputPath: result.outputPath,
        error: result.error,
        elapsedMs: result.elapsedMs,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? (err as { userMessage?: string }).userMessage || err.message : String(err);
      return { success: false, error: message, elapsedMs: 0 };
    }
  });

  // Cancel
  ipcMain.on(IPC.CANCEL, () => {
    orchestrator.cancel();
  });

  // Save
  ipcMain.handle(IPC.SAVE, async (_event, request: SaveRequest) => {
    const ext = request.format === 'jpeg' ? 'jpg' : request.format === 'tiff' ? 'tif' : 'png';
    const defaultName = path.basename(request.sourcePath, path.extname(request.sourcePath)) + '.' + ext;

    const filters: Electron.FileFilter[] = [];
    if (request.format === 'png') filters.push({ name: 'PNG', extensions: ['png'] });
    if (request.format === 'jpeg') filters.push({ name: 'JPEG', extensions: ['jpg', 'jpeg'] });
    if (request.format === 'tiff') filters.push({ name: 'TIFF', extensions: ['tif', 'tiff'] });

    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: settings.lastOutputDir
        ? path.join(settings.lastOutputDir, defaultName)
        : defaultName,
      filters,
    });

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Cancelled' };
    }

    try {
      const sharp = (await import('sharp')).default;
      let pipeline = sharp(request.sourcePath);

      if (request.format === 'jpeg') {
        pipeline = pipeline.jpeg({ quality: request.jpegQuality });
      } else if (request.format === 'tiff') {
        pipeline = pipeline.tiff();
      } else {
        pipeline = pipeline.png();
      }

      await pipeline.toFile(result.filePath);

      // Remember output directory
      settings.lastOutputDir = path.dirname(result.filePath);
      saveSettings();

      return { success: true, path: result.filePath };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Open file
  ipcMain.handle(IPC.OPEN_FILE, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'tiff', 'tif'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Read image as base64 data URL (renderer can't access file:// directly)
  ipcMain.handle(IPC.READ_IMAGE, async (_event, filePath: string): Promise<string> => {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.tiff': 'image/tiff',
      '.tif': 'image/tiff',
    };
    const mime = mimeTypes[ext] || 'image/png';
    return `data:${mime};base64,${data.toString('base64')}`;
  });

  // LPIPS scoring (non-blocking, returns null if unavailable)
  ipcMain.handle(
    IPC.COMPUTE_LPIPS,
    async (_event, referencePath: string, distortedPath: string): Promise<number | null> => {
      return metricsService.computeLpips(referencePath, distortedPath);
    },
  );

  // Settings
  ipcMain.handle(IPC.GET_SETTINGS, () => settings);
  ipcMain.handle(IPC.SET_SETTINGS, (_event, partial: Partial<AppSettings>) => {
    settings = { ...settings, ...partial };
    saveSettings();
  });
}

app.whenReady().then(() => {
  loadSettings();
  setupEngine();
  setupIPC();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
