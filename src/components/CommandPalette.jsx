import React from "react";
import { SearchIcon } from "./icons";

export default function CommandPalette({
  open,
  density,
  mode,
  inputValue,
  suggestions,
  inputRef,
  onChange,
  onPickSuggestion,
  onClose,
  onSubmit,
}) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [pickArmed, setPickArmed] = React.useState(false);
  const items = Array.isArray(suggestions) ? suggestions : [];

  React.useEffect(() => {
    if (!open) {
      return;
    }
    setActiveIndex(0);
    setPickArmed(false);
  }, [open, inputValue, mode]);

  if (!open) {
    return null;
  }

  const canPick = items.length > 0;
  const normalizedActiveIndex = canPick ? Math.max(0, Math.min(activeIndex, items.length - 1)) : -1;

  const handleInputKeyDown = (event) => {
    if (!canPick) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setPickArmed(true);
      setActiveIndex((prev) => (prev + 1) % items.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setPickArmed(true);
      setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
      return;
    }

    if (event.key === "Enter" && pickArmed && normalizedActiveIndex >= 0) {
      event.preventDefault();
      onPickSuggestion?.(items[normalizedActiveIndex]);
    }
  };

  return (
    <div
      className={`no-drag fixed inset-0 z-50 flex items-start justify-center bg-slate-950/35 backdrop-blur-sm ${density.modalPadTop}`}
      onMouseDown={onClose}
    >
      <div
        className={`rounded border border-white/20 bg-slate-900/65 shadow-2xl backdrop-blur-2xl ${density.modalCard}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between px-1 text-xs uppercase tracking-[0.2em] text-white/65">
          <span>{mode === "new-tab" ? "New Tab" : "Open Location"}</span>
          <span>{mode === "new-tab" ? "Ctrl+T" : "Ctrl+L"}</span>
        </div>
        <form onSubmit={onSubmit}>
          <label className={`flex items-center gap-2 rounded border border-white/25 bg-white/10 text-white ${density.modalInput}`}>
            <SearchIcon className="h-4 w-4 text-white/75" />
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleInputKeyDown}
              className="w-full bg-transparent text-base text-white placeholder:text-white/55 focus:outline-none"
              placeholder={mode === "new-tab" ? "Type URL or search for new tab" : "Type URL or search"}
              spellCheck={false}
            />
          </label>
          {items.length > 0 && (
            <div className="mt-3 max-h-56 overflow-y-auto rounded border border-white/15 bg-slate-950/35 p-1">
              {items.map((item, index) => {
                const isActive = index === normalizedActiveIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`flex w-full items-start justify-between gap-3 rounded px-2 py-1.5 text-left text-xs transition ${
                      isActive ? "bg-cyan-400/25 text-cyan-50" : "text-white/80 hover:bg-white/10"
                    }`}
                    onMouseEnter={() => {
                      setActiveIndex(index);
                      setPickArmed(true);
                    }}
                    onClick={() => onPickSuggestion?.(item)}
                  >
                    <span className="min-w-0 truncate">{item.title}</span>
                    <span className="max-w-[55%] truncate text-[11px] text-white/55">{item.url}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between px-1 text-xs text-white/70">
            <span>{items.length > 0 ? "Arrow + Enter to open bookmark, Enter to open typed input" : "Enter to open"}</span>
            <button
              type="button"
              className="rounded border border-white/20 px-2 py-1 transition hover:bg-white/10"
              onClick={onClose}
            >
              Esc to close
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
