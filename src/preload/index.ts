import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { ElectronAPI, UpscaleRequest, SaveRequest, AppSettings } from '../shared/ipc';
import type { ProgressEvent } from '../shared/types';

const api: ElectronAPI = {
  upscale: (request: UpscaleRequest) => ipcRenderer.invoke(IPC.UPSCALE, request),
  cancel: () => ipcRenderer.send(IPC.CANCEL),
  save: (request: SaveRequest) => ipcRenderer.invoke(IPC.SAVE, request),
  openFile: () => ipcRenderer.invoke(IPC.OPEN_FILE),
  getSettings: () => ipcRenderer.invoke(IPC.GET_SETTINGS),
  setSettings: (settings: Partial<AppSettings>) => ipcRenderer.invoke(IPC.SET_SETTINGS, settings),
  onProgress: (callback: (event: ProgressEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ProgressEvent) => callback(data);
    ipcRenderer.on(IPC.PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC.PROGRESS, handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
