import {
  fetchRemote,
  getLocalStatus,
  getRemoteCommit,
  isGitCheckout,
  npmBuild,
  npmInstall,
  pullFastForward,
} from "@/lib/update/git";

// Must match RESTART_EXIT_CODE in scripts/supervisor.mjs — this is the exit
// code the supervisor watches for to know "relaunch me, don't treat this as
// a crash."
export const RESTART_EXIT_CODE = 75;

/**
 * True only when this process was launched by scripts/supervisor.mjs.
 * `npm run dev` / a bare `next start` won't have this set, so the update
 * endpoint still pulls + rebuilds but reports that a manual restart is
 * needed instead of silently killing a process nothing will bring back.
 */
export function isSupervised(): boolean {
  return process.env.SOP_WRITER_SUPERVISED === "1";
}

let updateInProgress = false;

export interface UpdateStatus {
  isGitCheckout: boolean;
  commit: string | null;
  branch: string | null;
  dirty: boolean;
  supervised: boolean;
  remoteCommit?: string | null;
  updateAvailable?: boolean;
}

export async function getStatus(checkRemote: boolean): Promise<UpdateStatus> {
  if (!isGitCheckout()) {
    return { isGitCheckout: false, commit: null, branch: null, dirty: false, supervised: isSupervised() };
  }

  const local = await getLocalStatus();
  const base: UpdateStatus = {
    isGitCheckout: true,
    commit: local.commit,
    branch: local.branch,
    dirty: local.dirty,
    supervised: isSupervised(),
  };

  if (!checkRemote) return base;

  await fetchRemote();
  const remoteCommit = await getRemoteCommit(local.branch);
  return {
    ...base,
    remoteCommit,
    updateAvailable: remoteCommit !== null && remoteCommit !== local.commit,
  };
}

export interface UpdateResult {
  ok: boolean;
  message: string;
  log: string;
  restarting: boolean;
}

export async function performUpdate(): Promise<UpdateResult> {
  if (updateInProgress) {
    return { ok: false, message: "An update is already in progress.", log: "", restarting: false };
  }
  if (!isGitCheckout()) {
    return { ok: false, message: "Not a git checkout — self-update is unavailable.", log: "", restarting: false };
  }

  updateInProgress = true;
  const log: string[] = [];

  try {
    const local = await getLocalStatus();
    if (local.dirty) {
      return {
        ok: false,
        message:
          "Local changes are present in the working tree. Refusing to auto-update to avoid discarding them — commit, stash, or discard them first.",
        log: "",
        restarting: false,
      };
    }

    log.push("$ git fetch --quiet origin");
    log.push(await fetchRemote());

    const remoteCommit = await getRemoteCommit(local.branch);
    if (remoteCommit === null) {
      return {
        ok: false,
        message: `Branch "${local.branch}" has no upstream (origin/${local.branch}) to update from.`,
        log: log.join("\n"),
        restarting: false,
      };
    }
    if (remoteCommit === local.commit) {
      return { ok: true, message: "Already up to date.", log: log.join("\n"), restarting: false };
    }

    log.push("\n$ git pull --ff-only");
    log.push(await pullFastForward());

    log.push("\n$ npm install");
    log.push(await npmInstall());

    log.push("\n$ npm run build");
    log.push(await npmBuild());

    const supervised = isSupervised();
    if (supervised) {
      log.push("\nUpdate complete. Restarting server…");
      // Give the HTTP response time to flush to the client before this
      // process exits — the supervisor relaunches `next start` on seeing
      // RESTART_EXIT_CODE, which is what actually serves the new build.
      setTimeout(() => process.exit(RESTART_EXIT_CODE), 750);
    }

    return {
      ok: true,
      message: supervised
        ? "Update applied. Restarting server now…"
        : "Update pulled and built. Restart the server process manually to apply it (not running under the supervisor).",
      log: log.join("\n"),
      restarting: supervised,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Update failed: ${detail}`, log: log.join("\n"), restarting: false };
  } finally {
    updateInProgress = false;
  }
}
