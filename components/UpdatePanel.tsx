"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, GitBranch, Loader2, RefreshCw, Settings2 } from "lucide-react";
import { useOnClickOutside } from "@/lib/hooks/useOnClickOutside";

interface Status {
  isGitCheckout: boolean;
  commit: string | null;
  branch: string | null;
  dirty: boolean;
  restartMode: "systemd" | "supervisor" | "manual";
  remoteCommit?: string | null;
  updateAvailable?: boolean;
}

interface UpdateResult {
  ok: boolean;
  message: string;
  log: string;
  restarting: boolean;
}

const TOKEN_STORAGE_KEY = "sop-writer-update-token";

function short(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : "—";
}

export default function UpdatePanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [open, setOpen] = useState(false);
  const [showTokenField, setShowTokenField] = useState(false);
  const [token, setToken] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(containerRef, () => setOpen(false), open);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_STORAGE_KEY) || "");
    void refreshLocalStatus();
  }, []);

  async function refreshLocalStatus() {
    try {
      const res = await fetch("/api/update", { cache: "no-store" });
      if (res.ok) setStatus(await res.json());
    } catch {
      // self-update endpoint may not exist in this deployment; fail quiet
    }
  }

  async function checkForUpdates() {
    setChecking(true);
    setResult(null);
    try {
      const res = await fetch("/api/update?remote=1", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setStatus(data);
      else setResult({ ok: false, message: data.error || "Check failed.", log: "", restarting: false });
    } catch (err) {
      setResult({ ok: false, message: describeErr(err), log: "", restarting: false });
    } finally {
      setChecking(false);
    }
  }

  async function runUpdate() {
    const confirmed = window.confirm(
      "This pulls the latest code, runs npm install and a production build, and restarts the server. Continue?"
    );
    if (!confirmed) return;

    setUpdating(true);
    setResult(null);
    try {
      const headers: Record<string, string> = {};
      if (token.trim()) headers["x-update-token"] = token.trim();

      const res = await fetch("/api/update", { method: "POST", headers });
      const data: UpdateResult = await res.json();
      setResult(data);
      if (data.restarting) {
        setRestarting(true);
        pollUntilBack();
      }
    } catch (err) {
      setResult({ ok: false, message: describeErr(err), log: "", restarting: false });
    } finally {
      setUpdating(false);
    }
  }

  function pollUntilBack() {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/", { method: "HEAD", cache: "no-store" });
        if (res.ok) {
          clearInterval(interval);
          window.location.reload();
        }
      } catch {
        // still restarting — keep polling
      }
    }, 1500);
    // Give up politely after 2 minutes rather than polling forever.
    setTimeout(() => clearInterval(interval), 120_000);
  }

  function saveToken(next: string) {
    setToken(next);
    window.localStorage.setItem(TOKEN_STORAGE_KEY, next);
  }

  if (status && !status.isGitCheckout) {
    return null; // not a git checkout — self-update genuinely doesn't apply
  }

  return (
    <div ref={containerRef} className="relative text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 px-2 py-1 rounded-md transition-colors"
      >
        <GitBranch className="size-3.5" />
        <span className="font-mono">{short(status?.commit)}</span>
        {status?.updateAvailable && <span className="size-1.5 rounded-full bg-amber-400" />}
        <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 bg-panel border border-border rounded-lg p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Application Update</h3>
            <button
              type="button"
              onClick={() => setShowTokenField((v) => !v)}
              className="text-slate-500 hover:text-slate-300"
              aria-label="Update token settings"
            >
              <Settings2 className="size-3.5" />
            </button>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-slate-400">
            <dt>Branch</dt>
            <dd className="text-slate-200 font-mono">{status?.branch ?? "—"}</dd>
            <dt>Current</dt>
            <dd className="text-slate-200 font-mono">{short(status?.commit)}</dd>
            {status?.remoteCommit !== undefined && (
              <>
                <dt>Latest</dt>
                <dd className="text-slate-200 font-mono">{short(status.remoteCommit)}</dd>
              </>
            )}
            <dt>Restart mode</dt>
            <dd className="text-slate-200">
              {status?.restartMode === "systemd"
                ? "automatic (systemd)"
                : status?.restartMode === "supervisor"
                  ? "automatic (supervisor)"
                  : "manual"}
            </dd>
          </dl>

          {status?.dirty && (
            <div className="flex items-start gap-1.5 text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
              <span>Local changes present — updates are blocked until the working tree is clean.</span>
            </div>
          )}

          {showTokenField && (
            <div>
              <label className="text-slate-400 block mb-1">Update token (if UPDATE_TOKEN is set)</label>
              <input
                type="password"
                value={token}
                onChange={(e) => saveToken(e.target.value)}
                className="w-full bg-canvas border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                placeholder="stored locally in this browser only"
              />
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={checkForUpdates}
              disabled={checking || updating}
              className="flex-1 flex items-center justify-center gap-1.5 border border-border rounded-md px-3 py-1.5 text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 transition-colors"
            >
              {checking ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Check for Updates
            </button>
            <button
              type="button"
              onClick={runUpdate}
              disabled={updating || !status?.updateAvailable || status?.dirty}
              className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/30 disabled:cursor-not-allowed text-white rounded-md px-3 py-1.5 font-medium transition-colors"
            >
              {updating ? <Loader2 className="size-3.5 animate-spin" /> : "Update Now"}
            </button>
          </div>

          {restarting && (
            <p className="flex items-center gap-1.5 text-indigo-300">
              <Loader2 className="size-3.5 animate-spin" />
              Restarting server — this page will reload automatically…
            </p>
          )}

          {result && !restarting && (
            <div className={result.ok ? "text-emerald-300" : "text-red-300"}>
              <p>{result.message}</p>
              {result.log && (
                <pre className="mt-1.5 max-h-40 overflow-y-auto bg-black/40 border border-border rounded p-2 text-[10px] font-mono text-slate-400 whitespace-pre-wrap">
                  {result.log}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function describeErr(err: unknown): string {
  return err instanceof Error ? err.message : "Request failed.";
}
