import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type {
  ElectronAPI,
  UpscaleRequest,
  SaveRequest,
  BatchRequest,
  AppSettings,
  BatchProgressEvent,
} from '../shared/ipc';
import type { ProgressEvent } from '../shared/types';

const api: ElectronAPI = {
  upscale: (request: UpscaleRequest) => ipcRenderer.invoke(IPC.UPSCALE, request),
  batchUpscale: (request: BatchRequest) => ipcRenderer.invoke(IPC.BATCH_UPSCALE, request),
  cancel: () => ipcRenderer.send(IPC.CANCEL),
  save: (request: SaveRequest) => ipcRenderer.invoke(IPC.SAVE, request),
  openFile: () => ipcRenderer.invoke(IPC.OPEN_FILE),
  openFolder: () => ipcRenderer.invoke(IPC.OPEN_FOLDER),
  readImage: (filePath: string) => ipcRenderer.invoke(IPC.READ_IMAGE, filePath),
  computeLpips: (referencePath: string, distortedPath: string) =>
    ipcRenderer.invoke(IPC.COMPUTE_LPIPS, referencePath, distortedPath),
  getSettings: () => ipcRenderer.invoke(IPC.GET_SETTINGS),
  setSettings: (settings: Partial<AppSettings>) => ipcRenderer.invoke(IPC.SET_SETTINGS, settings),
  onProgress: (callback: (event: ProgressEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ProgressEvent) => callback(data);
    ipcRenderer.on(IPC.PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC.PROGRESS, handler);
  },
  onBatchProgress: (callback: (event: BatchProgressEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: BatchProgressEvent) => callback(data);
    ipcRenderer.on(IPC.BATCH_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC.BATCH_PROGRESS, handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
