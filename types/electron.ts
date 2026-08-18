export type DesktopProvider = "openai" | "gemini" | "ollama";

export interface DesktopSettings {
  provider: DesktopProvider;
  model: string;
  hasApiKey: boolean;
  isConfigured: boolean;
}

export interface DesktopUpdateStatus {
  state: "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";
  version?: string;
  percent?: number;
  message?: string;
}

export interface ElectronAPI {
  isElectron: true;
  getSettings: () => Promise<DesktopSettings>;
  saveSettings: (settings: { provider: DesktopProvider; model?: string; apiKey?: string }) => Promise<DesktopSettings>;
  checkForUpdates: () => Promise<unknown>;
  downloadUpdate: () => Promise<unknown>;
  quitAndInstall: () => Promise<void>;
  onUpdateStatus: (callback: (status: DesktopUpdateStatus) => void) => () => void;
  getAppVersion: () => Promise<string>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
