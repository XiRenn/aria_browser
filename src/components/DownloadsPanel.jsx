import React from "react";
import { DownloadIcon } from "./icons";

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let idx = 0;
  while (amount >= 1024 && idx < units.length - 1) {
    amount /= 1024;
    idx += 1;
  }
  return `${amount.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatStatus(item) {
  if (!item) {
    return "";
  }
  if (item.status === "completed") {
    return "Completed";
  }
  if (item.status === "cancelled") {
    return "Cancelled";
  }
  if (item.status === "interrupted") {
    return "Interrupted";
  }
  if (item.status === "paused") {
    return "Paused";
  }
  return "Downloading";
}

export default function DownloadsPanel({
  open,
  items,
  onOpenFile,
  onShowInFolder,
  onPause,
  onResume,
  onCancel,
  onClear,
  onClose,
}) {
  if (!open) {
    return null;
  }

  const list = Array.isArray(items) ? items : [];

  return (
    <div className="no-drag fixed inset-0 z-50 flex items-start justify-center bg-slate-950/35 backdrop-blur-sm pt-16" onMouseDown={onClose}>
      <div
        className="w-[min(860px,calc(100vw-48px))] rounded border border-white/20 bg-slate-900/65 p-2.5 shadow-2xl backdrop-blur-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between border-b border-white/15 pb-2">
          <div className="flex items-center gap-2 text-sm text-white/90">
            <DownloadIcon className="h-4 w-4" />
            <span>Downloads</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="rounded border border-white/20 px-2 py-1 text-xs text-white/80 transition hover:bg-white/10" onClick={onClear}>
              Clear
            </button>
            <button type="button" className="rounded border border-white/20 px-2 py-1 text-xs text-white/80 transition hover:bg-white/10" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="max-h-[62vh] overflow-y-auto space-y-1">
          {list.length === 0 && (
            <div className="rounded border border-white/10 bg-white/5 p-3 text-xs text-white/70">No downloads yet.</div>
          )}
          {list.map((item) => {
            const total = item.totalBytes > 0 ? item.totalBytes : 0;
            const progress = total > 0 ? Math.min(100, Math.round((item.receivedBytes / total) * 100)) : 0;
            return (
              <div key={item.id} className="rounded border border-white/10 bg-white/5 p-2">
                <div className="truncate text-sm text-white/90">{item.filename}</div>
                <div className="truncate text-xs text-white/60">{item.url}</div>
                <div className="mt-1 text-[11px] text-white/55">
                  {formatStatus(item)} - {formatBytes(item.receivedBytes)} / {formatBytes(item.totalBytes)}
                  {total > 0 ? ` (${progress}%)` : ""}
                </div>
                {item.status === "progressing" && total > 0 && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-white/15">
                    <div className="h-full bg-cyan-300/80 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded border border-white/20 px-2 py-1 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-40"
                    onClick={() => onPause?.(item)}
                    disabled={item.status !== "progressing"}
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    className="rounded border border-white/20 px-2 py-1 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-40"
                    onClick={() => onResume?.(item)}
                    disabled={item.status !== "paused"}
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    className="rounded border border-white/20 px-2 py-1 text-xs text-white/80 transition hover:bg-rose-500/60 disabled:opacity-40"
                    onClick={() => onCancel?.(item)}
                    disabled={item.status === "completed" || item.status === "cancelled"}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded border border-white/20 px-2 py-1 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-40"
                    onClick={() => onOpenFile?.(item)}
                    disabled={item.status !== "completed"}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="rounded border border-white/20 px-2 py-1 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-40"
                    onClick={() => onShowInFolder?.(item)}
                    disabled={!item.savePath}
                  >
                    Show in folder
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
