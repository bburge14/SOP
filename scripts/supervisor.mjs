#!/usr/bin/env node
// Production entrypoint for self-update support (`npm run serve`).
//
// A plain `next start` process can't restart itself after a rebuild —
// once it exec's a new process image or exits, nothing brings it back.
// This wraps `next start` as a child process and relaunches it whenever
// the child exits with RESTART_EXIT_CODE, which app/api/update/route.ts
// triggers (via lib/update/runner.ts) after a successful git pull + build.
//
// Must match RESTART_EXIT_CODE in lib/update/runner.ts.
import { spawn } from "node:child_process";

const RESTART_EXIT_CODE = 75;
const port = process.env.PORT || "3000";

let currentChild = null;

function start() {
  console.log(`[supervisor] starting: next start -p ${port}`);
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", port], {
    stdio: "inherit",
    env: { ...process.env, SOP_WRITER_SUPERVISED: "1" },
  });
  currentChild = child;

  child.on("exit", (code, signal) => {
    currentChild = null;
    if (code === RESTART_EXIT_CODE) {
      console.log("[supervisor] restart requested, relaunching…");
      start();
      return;
    }
    if (signal) {
      console.log(`[supervisor] child killed by signal ${signal}, exiting`);
      process.exit(1);
    }
    console.log(`[supervisor] child exited with code ${code}, exiting`);
    process.exit(code ?? 0);
  });
}

// Without this, killing the supervisor (e.g. a plain `kill <pid>`, not
// SIGKILL) leaves `next start` running as an orphan holding the port —
// reproduced this during testing. A parent SIGKILL still can't be caught
// here, but that's an OS-level limit; systemd's cgroup-based stop (the
// preferred restart path) doesn't have this gap at all.
function shutdown(signal) {
  currentChild?.kill(signal);
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start();
