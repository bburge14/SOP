#!/usr/bin/env node
// Next's `output: "standalone"` build (see next.config.js) produces a
// pruned .next/standalone/server.js, but deliberately leaves out static
// assets and the public/ dir — Next expects you to copy those in as a
// separate deploy step. This is that step, run before `electron-builder`
// packages .next/standalone as the app's embedded server (see
// electron/main.js).
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standaloneDir = path.join(root, ".next", "standalone");

if (!existsSync(standaloneDir)) {
  console.error("[prepare-standalone] .next/standalone not found — run `npm run build` first.");
  process.exit(1);
}

const staticSrc = path.join(root, ".next", "static");
const staticDest = path.join(standaloneDir, ".next", "static");
rmSync(staticDest, { recursive: true, force: true });
cpSync(staticSrc, staticDest, { recursive: true });
console.log("[prepare-standalone] copied .next/static");

const publicSrc = path.join(root, "public");
if (existsSync(publicSrc)) {
  const publicDest = path.join(standaloneDir, "public");
  rmSync(publicDest, { recursive: true, force: true });
  cpSync(publicSrc, publicDest, { recursive: true });
  console.log("[prepare-standalone] copied public/");
}

// electron-builder's file-copy filter has a hardcoded rule (builder-util's
// createFilter: `if (relative === "node_modules") return false`) that
// silently drops any directory whose path *relative to the extraResources
// "from" root* is exactly the literal string "node_modules" — meant to
// avoid double-copying the main app's own node_modules, but it doesn't
// know this is an unrelated, pre-pruned bundle. Since .next/standalone's
// immediate child is literally named "node_modules", pointing `from`
// straight at it always lost the entire folder, no glob pattern can
// override this (reproduced and root-caused during packaging testing).
// Fix: wrap it one directory level deeper so the relative path is never
// exactly "node_modules" — package.json's extraResources.from points here.
const pkgSrcDir = path.join(root, ".next", "pkg-src");
const wrappedDest = path.join(pkgSrcDir, "app-server");
rmSync(pkgSrcDir, { recursive: true, force: true });
cpSync(standaloneDir, wrappedDest, { recursive: true });
console.log("[prepare-standalone] wrapped standalone build at", wrappedDest);

console.log("[prepare-standalone] done:", standaloneDir);
