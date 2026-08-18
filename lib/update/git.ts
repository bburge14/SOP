import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();

async function run(args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd: REPO_ROOT,
    maxBuffer: 1024 * 1024 * 20,
  });
  return `${stdout}${stderr}`.trim();
}

export function isGitCheckout(): boolean {
  return fs.existsSync(path.join(REPO_ROOT, ".git"));
}

export interface LocalStatus {
  commit: string;
  branch: string;
  dirty: boolean;
}

export async function getLocalStatus(): Promise<LocalStatus> {
  const [commit, branch, statusOutput] = await Promise.all([
    run(["rev-parse", "HEAD"]),
    run(["rev-parse", "--abbrev-ref", "HEAD"]),
    run(["status", "--porcelain"]),
  ]);
  return { commit, branch, dirty: statusOutput.length > 0 };
}

export async function fetchRemote(): Promise<string> {
  return run(["fetch", "--quiet", "origin"]);
}

/** Returns null if there's no upstream configured for the current branch. */
export async function getRemoteCommit(branch: string): Promise<string | null> {
  try {
    return await run(["rev-parse", `origin/${branch}`]);
  } catch {
    return null;
  }
}

export async function pullFastForward(): Promise<string> {
  return run(["pull", "--ff-only"]);
}

export async function npmInstall(): Promise<string> {
  const { stdout, stderr } = await execFileAsync("npm", ["install"], {
    cwd: REPO_ROOT,
    maxBuffer: 1024 * 1024 * 20,
  });
  return `${stdout}${stderr}`.trim();
}

export async function npmBuild(): Promise<string> {
  const { stdout, stderr } = await execFileAsync("npm", ["run", "build"], {
    cwd: REPO_ROOT,
    maxBuffer: 1024 * 1024 * 20,
  });
  return `${stdout}${stderr}`.trim();
}
