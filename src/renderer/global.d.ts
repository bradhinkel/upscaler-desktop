import type { ElectronAPI } from '../shared/ipc';

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
