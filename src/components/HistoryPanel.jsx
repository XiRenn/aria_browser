import React from "react";
import { HistoryIcon } from "./icons";

function formatWhen(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  return new Date(timestamp).toLocaleString();
}

export default function HistoryPanel({ open, entries, onOpenEntry, onClear, onClose }) {
  if (!open) {
    return null;
  }

  const list = Array.isArray(entries) ? entries : [];

  return (
    <div className="no-drag fixed inset-0 z-50 flex items-start justify-center bg-slate-950/35 backdrop-blur-sm pt-16" onMouseDown={onClose}>
      <div
        className="w-[min(860px,calc(100vw-48px))] rounded border border-white/20 bg-slate-900/65 p-2.5 shadow-2xl backdrop-blur-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between border-b border-white/15 pb-2">
          <div className="flex items-center gap-2 text-sm text-white/90">
            <HistoryIcon className="h-4 w-4" />
            <span>History</span>
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
            <div className="rounded border border-white/10 bg-white/5 p-3 text-xs text-white/70">No history yet.</div>
          )}
          {list.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="w-full rounded border border-white/10 bg-white/5 p-2 text-left transition hover:bg-white/10"
              onClick={() => onOpenEntry?.(entry)}
              title={entry.url}
            >
              <div className="truncate text-sm text-white/90">{entry.title || "Untitled"}</div>
              <div className="truncate text-xs text-white/60">{entry.url}</div>
              <div className="mt-1 text-[11px] text-white/45">{formatWhen(entry.at)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
