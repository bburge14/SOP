"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Download, Loader2, RefreshCw, Tag } from "lucide-react";
import type { DesktopUpdateStatus } from "@/types/electron";

export default function DesktopUpdatePanel() {
  const [hasElectronAPI, setHasElectronAPI] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    setHasElectronAPI(true);
    void api.getAppVersion().then(setVersion);
    return api.onUpdateStatus(setStatus);
  }, []);

  if (!hasElectronAPI) return null;

  const api = window.electronAPI!;
  const state = status?.state;

  return (
    <div className="relative text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 px-2 py-1 rounded-md transition-colors"
      >
        <Tag className="size-3.5" />
        <span className="font-mono">v{version ?? "…"}</span>
        {(state === "available" || state === "downloaded") && <span className="size-1.5 rounded-full bg-amber-400" />}
        <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 bg-panel border border-border rounded-lg p-4 shadow-xl space-y-3">
          <h3 className="text-sm font-semibold text-white">Application Update</h3>
          <p className="text-slate-400">
            Installed version: <span className="font-mono text-slate-200">v{version ?? "—"}</span>
          </p>

          {!state && <p className="text-slate-500">No check run yet this session.</p>}
          {state === "checking" && (
            <p className="flex items-center gap-1.5 text-slate-300">
              <Loader2 className="size-3.5 animate-spin" /> Checking for updates…
            </p>
          )}
          {state === "not-available" && <p className="text-emerald-300">You're up to date.</p>}
          {state === "available" && (
            <p className="text-amber-300">Version {status?.version} is available.</p>
          )}
          {state === "downloading" && (
            <p className="flex items-center gap-1.5 text-slate-300">
              <Loader2 className="size-3.5 animate-spin" />
              Downloading… {status?.percent ? `${Math.round(status.percent)}%` : ""}
            </p>
          )}
          {state === "downloaded" && (
            <p className="text-emerald-300">Version {status?.version} downloaded — ready to install.</p>
          )}
          {state === "error" && <p className="text-red-300">{status?.message || "Update check failed."}</p>}

          <div className="flex gap-2">
            {state !== "downloaded" && (
              <button
                type="button"
                onClick={() => void api.checkForUpdates()}
                disabled={state === "checking" || state === "downloading"}
                className="flex-1 flex items-center justify-center gap-1.5 border border-border rounded-md px-3 py-1.5 text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 transition-colors"
              >
                <RefreshCw className="size-3.5" />
                Check for Updates
              </button>
            )}
            {state === "available" && (
              <button
                type="button"
                onClick={() => void api.downloadUpdate()}
                className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md px-3 py-1.5 font-medium transition-colors"
              >
                <Download className="size-3.5" />
                Download
              </button>
            )}
            {state === "downloaded" && (
              <button
                type="button"
                onClick={() => void api.quitAndInstall()}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md px-3 py-1.5 font-medium transition-colors"
              >
                Restart &amp; Install
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
