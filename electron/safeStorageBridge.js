// safeStorage's calls are synchronous and run on the main process's only
// thread — on some Linux setups (a locked or misconfigured keyring/secret
// service) isEncryptionAvailable() simply never returns, which would
// freeze the *entire app* since nothing else can run on that thread while
// it's blocked. Reproduced live in testing against this exact failure
// mode. The fix: never call safeStorage in the main process directly —
// always do it in a disposable child process (this same app re-invoked
// with --safestorage-helper) with a hard timeout, so a hang there costs
// at most TIMEOUT_MS instead of the whole app.
const path = require("node:path");
const { spawn } = require("node:child_process");

const HELPER_FLAG = "--safestorage-helper";
const TIMEOUT_MS = 4000;

function isHelperInvocation() {
  return process.argv.includes(HELPER_FLAG);
}

/** Entry point when this app is re-invoked as the helper — see callHelper(). Must run instead of, not alongside, the normal app startup in electron/main.js. */
function runHelper() {
  const { app, safeStorage } = require("electron");

  // If even app.whenReady() doesn't resolve, don't sit there forever as
  // an invisible orphan — callHelper()'s own timeout will already have
  // given up on us by the time this fires.
  const hardExit = setTimeout(() => process.exit(1), TIMEOUT_MS + 3000);

  app.whenReady().then(() => {
    let input = "";
    process.stdin.on("data", (chunk) => (input += chunk));
    process.stdin.on("end", () => {
      let response;
      try {
        const req = JSON.parse(input || "{}");
        if (req.op === "encrypt") {
          if (!safeStorage.isEncryptionAvailable()) throw new Error("Encryption not available");
          response = { ok: true, value: safeStorage.encryptString(req.value).toString("base64") };
        } else if (req.op === "decrypt") {
          response = { ok: true, value: safeStorage.decryptString(Buffer.from(req.value, "base64")) };
        } else {
          response = { ok: false, error: `unknown op "${req.op}"` };
        }
      } catch (err) {
        response = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      process.stdout.write(JSON.stringify(response));
      clearTimeout(hardExit);
      app.exit(0);
    });
  });
}

function callHelper(request) {
  return new Promise((resolve) => {
    const { app } = require("electron");
    const args = app.isPackaged ? [HELPER_FLAG] : [path.join(__dirname, ".."), HELPER_FLAG];

    const child = spawn(process.execPath, args, {
      env: process.env,
      stdio: ["pipe", "pipe", "ignore"],
    });

    let out = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: false, error: "safeStorage helper timed out — the OS keychain may be locked or unavailable" });
    }, TIMEOUT_MS);

    child.stdout.on("data", (d) => (out += d));
    child.on("error", (err) => finish({ ok: false, error: err.message }));
    child.on("exit", () => {
      try {
        finish(JSON.parse(out));
      } catch {
        finish({ ok: false, error: "invalid response from safeStorage helper" });
      }
    });

    child.stdin.write(JSON.stringify(request));
    child.stdin.end();
  });
}

module.exports = {
  isHelperInvocation,
  runHelper,
  encrypt: (value) => callHelper({ op: "encrypt", value }),
  decrypt: (value) => callHelper({ op: "decrypt", value }),
};
