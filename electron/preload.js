// Exposes a narrow, explicit API to the renderer (the same React app used
// by the self-hosted deployment) via contextBridge, rather than turning on
// nodeIntegration. components/*.tsx feature-detect `window.electronAPI` to
// switch between this IPC-based path and the git-based self-hosted path.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,

  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),

  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  quitAndInstall: () => ipcRenderer.invoke("update:install"),
  onUpdateStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on("update:status", handler);
    return () => ipcRenderer.removeListener("update:status", handler);
  },

  getAppVersion: () => ipcRenderer.invoke("app:version"),

  exportPdf: (suggestedName) => ipcRenderer.invoke("export:pdf", suggestedName),
});
