// Electron shell for SOP Writer. Hosts the same Next.js app used by the
// self-hosted deployment (app/, components/, lib/) — this file's only job
// is to spawn its production "standalone" build as a child process, put a
// window in front of it, and replace the git/npm/systemd self-update path
// (see lib/update/) with electron-updater against GitHub Releases, since a
// packaged desktop app has no terminal and no .git checkout to update from.
const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("node:path");
const fs = require("node:fs/promises");
const { spawn } = require("node:child_process");
const http = require("node:http");
const settingsStore = require("./settingsStore");
const safeStorageBridge = require("./safeStorageBridge");

// This same executable gets re-invoked as a disposable safeStorage helper
// (see safeStorageBridge.js) — when that's what this process is, run only
// that and nothing else of the app.
if (safeStorageBridge.isHelperInvocation()) {
  safeStorageBridge.runHelper();
  return;
}

const isDev = !app.isPackaged;
const BASE_PORT = 47821;
const MAX_PORT_ATTEMPTS = 8;

let mainWindow = null;
let serverProcess = null;
let serverPort = null;

function log(...args) {
  console.log("[electron-main]", ...args);
}

function standaloneServerPath() {
  // Dev: run straight from the repo's own build output
  // (`npm run build && npm run prepare:standalone` first).
  // Packaged: electron-builder's extraResources config (package.json)
  // copies .next/standalone/** to resources/app-server/.
  return isDev
    ? path.join(__dirname, "..", ".next", "standalone", "server.js")
    : path.join(process.resourcesPath, "app-server", "server.js");
}

function pingServer(port) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: 1000 }, (res) => {
      res.resume();
      resolve();
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
  });
}

async function waitForServer(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await pingServer(port);
      return;
    } catch {
      if (Date.now() > deadline) throw new Error(`Server did not become ready on port ${port} in time`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

async function spawnServerOnce(port) {
  const env = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    // Without this, process.execPath (the Electron binary itself) tries to
    // launch a nested Electron/Chromium instance instead of running
    // server.js as plain Node — it crashes immediately on Chromium's
    // sandbox init. Reproduced live: the child died with SIGTRAP until
    // this was added.
    ELECTRON_RUN_AS_NODE: "1",
    ...(await settingsStore.getProviderEnv()),
  };

  const child = spawn(process.execPath, [standaloneServerPath()], {
    env,
    stdio: isDev ? "inherit" : "ignore",
    windowsHide: true,
  });

  child.on("exit", (code, signal) => {
    log(`server exited (code=${code} signal=${signal})`);
    if (serverProcess === child) serverProcess = null;
  });

  return child;
}

/** Tries BASE_PORT, then a few more in case something else on the machine holds it. */
async function startServer() {
  let lastErr;
  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    const port = BASE_PORT + i;
    log(`starting embedded server on port ${port}`);
    const child = await spawnServerOnce(port);
    try {
      await waitForServer(port);
      serverProcess = child;
      serverPort = port;
      log(`embedded server ready on port ${port}`);
      return port;
    } catch (err) {
      log(`server failed to come up on port ${port}:`, err instanceof Error ? err.message : err);
      lastErr = err;
      child.kill();
    }
  }
  throw lastErr || new Error("Could not start the embedded server.");
}

function stopServer() {
  if (serverProcess) {
    log("stopping embedded server");
    serverProcess.kill();
    serverProcess = null;
  }
}

async function restartServer() {
  stopServer();
  const port = await startServer();
  if (mainWindow) mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "SOP Writer",
    // Only needed in dev — a packaged build already shows the right icon
    // from the installer/app bundle (electron-builder's `icon` config),
    // and build/icon.png isn't shipped inside the packaged app anyway.
    ...(isDev ? { icon: path.join(__dirname, "..", "build", "icon.png") } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Anything trying to open a new window (target=_blank, window.open)
  // opens in the OS browser instead of a second Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function sendUpdateStatus(status) {
  if (mainWindow) mainWindow.webContents.send("update:status", status);
}

function wireAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.on("checking-for-update", () => sendUpdateStatus({ state: "checking" }));
  autoUpdater.on("update-available", (info) => sendUpdateStatus({ state: "available", version: info.version }));
  autoUpdater.on("update-not-available", () => sendUpdateStatus({ state: "not-available" }));
  autoUpdater.on("download-progress", (progress) =>
    sendUpdateStatus({ state: "downloading", percent: progress.percent })
  );
  autoUpdater.on("update-downloaded", (info) => sendUpdateStatus({ state: "downloaded", version: info.version }));
  autoUpdater.on("error", (err) => sendUpdateStatus({ state: "error", message: err?.message || String(err) }));
}

function registerIpcHandlers() {
  ipcMain.handle("settings:get", () => settingsStore.getSettings());

  ipcMain.handle("settings:save", async (_event, settings) => {
    log("settings:save received", { provider: settings?.provider, hasKey: Boolean(settings?.apiKey) });
    const result = await settingsStore.saveSettings(settings);
    log("settings written, restarting server");
    await restartServer();
    log("server restarted after settings save");
    return result;
  });

  ipcMain.handle("update:check", () => {
    if (isDev) return { state: "not-available" };
    return autoUpdater.checkForUpdates();
  });
  ipcMain.handle("update:download", () => {
    if (isDev) return null;
    return autoUpdater.downloadUpdate();
  });
  ipcMain.handle("update:install", () => {
    if (!isDev) autoUpdater.quitAndInstall();
  });

  ipcMain.handle("app:version", () => app.getVersion());

  ipcMain.handle("export:pdf", async (_event, suggestedName) => {
    if (!mainWindow) return { ok: false, error: "No window available" };
    const defaultName = typeof suggestedName === "string" && suggestedName.trim() ? suggestedName.trim() : "sop.pdf";

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "Export SOP as PDF",
      defaultPath: defaultName,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };

    try {
      // Chromium's print pipeline (same one window.print() would use) —
      // respects the app's @media print CSS, so the light/print-specific
      // styling in app/globals.css applies here too. printBackground:true
      // is required or the code-block/table shading is silently dropped.
      const pdfBuffer = await mainWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: "Letter",
      });
      await fs.writeFile(filePath, pdfBuffer);
      log(`exported PDF to ${filePath}`);
      return { ok: true, path: filePath };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log("PDF export failed:", message);
      return { ok: false, error: message };
    }
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    registerIpcHandlers();
    wireAutoUpdater();
    try {
      await startServer();
    } catch (err) {
      dialog.showErrorBox("SOP Writer failed to start", err instanceof Error ? err.message : String(err));
      app.quit();
      return;
    }
    createWindow();
    if (!isDev) {
      autoUpdater.checkForUpdates().catch((err) => log("update check failed:", err));
    }
  });

  app.on("window-all-closed", () => {
    stopServer();
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", stopServer);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
