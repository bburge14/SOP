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

function start() {
  console.log(`[supervisor] starting: next start -p ${port}`);
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", port], {
    stdio: "inherit",
    env: { ...process.env, SOP_WRITER_SUPERVISED: "1" },
  });

  child.on("exit", (code, signal) => {
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

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

start();
