// Owns the desktop app's provider/API-key config. Lives in the Electron
// main process specifically so it can use `safeStorage` (OS keychain on
// macOS, DPAPI on Windows, libsecret on Linux) — there's no terminal in a
// packaged app to hand-edit a .env.local like the self-hosted deployment
// uses, and plaintext-on-disk would be a real downgrade for something
// that's effectively a password. All safeStorage calls go through
// safeStorageBridge (a timed-out helper subprocess), never called
// directly here — see that file for why.
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const safeStorageBridge = require("./safeStorageBridge");

const DEFAULTS = { provider: "gemini", model: "", encryptedApiKey: null };

// Ollama runs locally with no credential.
const PROVIDER_NEEDS_KEY = { openai: true, gemini: true, ollama: false };
const KEY_ENV_VAR = { openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY" };
const MODEL_ENV_VAR = {
  openai: "OPENAI_MODEL",
  gemini: "GEMINI_MODEL",
  ollama: "OLLAMA_MODEL",
};

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function readRaw() {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeRaw(data) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(data, null, 2), "utf8");
}

async function getSettings() {
  const raw = readRaw();
  const needsKey = PROVIDER_NEEDS_KEY[raw.provider] ?? true;
  return {
    provider: raw.provider,
    model: raw.model || "",
    hasApiKey: Boolean(raw.encryptedApiKey),
    isConfigured: needsKey ? Boolean(raw.encryptedApiKey) : true,
  };
}

async function saveSettings({ provider, model, apiKey }) {
  const raw = readRaw();
  if (provider) raw.provider = provider;
  if (model !== undefined) raw.model = model;

  if (typeof apiKey === "string" && apiKey.length > 0) {
    const result = await safeStorageBridge.encrypt(apiKey);
    if (result.ok) {
      raw.encryptedApiKey = result.value;
      raw.encryptionUnavailable = false;
    } else {
      // Keychain unavailable, locked, or the helper timed out — still not
      // plaintext-in-logs, but not OS-keychain-backed either. Logged so
      // it's at least visible why (e.g. in `npm run electron:start`'s
      // console, or a packaged app's log file).
      console.warn("[settingsStore] safeStorage encrypt failed, falling back to plain storage:", result.error);
      raw.encryptedApiKey = Buffer.from(apiKey, "utf8").toString("base64");
      raw.encryptionUnavailable = true;
    }
  }

  writeRaw(raw);
  return getSettings();
}

async function getDecryptedApiKey(raw) {
  if (!raw.encryptedApiKey) return null;
  if (raw.encryptionUnavailable) {
    return Buffer.from(raw.encryptedApiKey, "base64").toString("utf8");
  }
  const result = await safeStorageBridge.decrypt(raw.encryptedApiKey);
  if (!result.ok) {
    console.warn("[settingsStore] safeStorage decrypt failed:", result.error);
    return null;
  }
  return result.value;
}

/** Env vars to inject into the spawned Next standalone server (electron/main.js). */
async function getProviderEnv() {
  const raw = readRaw();
  const env = { LLM_PROVIDER: raw.provider };

  const keyVar = KEY_ENV_VAR[raw.provider];
  if (keyVar) {
    const apiKey = await getDecryptedApiKey(raw);
    if (apiKey) env[keyVar] = apiKey;
  }

  const modelVar = MODEL_ENV_VAR[raw.provider];
  if (modelVar && raw.model) env[modelVar] = raw.model;

  return env;
}

module.exports = { getSettings, saveSettings, getProviderEnv };
