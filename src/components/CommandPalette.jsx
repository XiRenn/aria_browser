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
  const items = Array.isArray(suggestions) ? suggestions : [];

  React.useEffect(() => {
    if (!open) {
      return;
    }
    setActiveIndex(0);
    
    // Focus when the component mounts or opens
    const id = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50); // Give a small delay for the DOM to be ready

    return () => clearTimeout(id);
  }, [open, mode, inputRef]);

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
      setActiveIndex((prev) => (prev + 1) % items.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
      return;
    }

    if (event.key === "Enter" && normalizedActiveIndex >= 0) {
      event.preventDefault();
      onPickSuggestion?.(items[normalizedActiveIndex]);
    }
  };

  return (
    <div
      className={`no-drag pointer-events-auto fixed inset-0 z-50 flex items-start justify-center bg-slate-950/20 backdrop-blur-sm ${density.modalPadTop}`}
      onMouseDown={onClose}
    >
      <div
        className={`rounded-none border border-white/20 bg-slate-900/65 shadow-2xl backdrop-blur-2xl ${density.modalCard} relative overflow-hidden`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* Aesthetic Background Gradients */}
        <div className="pointer-events-none absolute -left-20 -top-20 h-40 w-40 rounded-none bg-cyan-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 -bottom-20 h-40 w-40 rounded-none bg-blue-500/10 blur-3xl" />

        <div className="relative z-10">
          <div className="mb-3 flex items-center justify-between px-1 text-[10px] uppercase tracking-[0.2em] text-white/50 font-bold">
            <span>{mode === "new-tab" ? "New Tab" : "Navigate"}</span>
            <span>{mode === "new-tab" ? "Ctrl+T" : "Ctrl+L"}</span>
          </div>
          <form onSubmit={onSubmit}>
            <label className={`flex items-center gap-2 rounded-none border border-white/25 bg-white/5 text-white shadow-inner ${density.modalInput} focus-within:border-cyan-400/40 transition-colors`}>
              <SearchIcon className="h-4 w-4 text-cyan-400/60" />
              <input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleInputKeyDown}
                className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
                placeholder={mode === "new-tab" ? "Search or enter address for new tab" : "Search or enter address"}
                spellCheck={false}
              />
            </label>
            {items.length > 0 && (
              <div className="mt-3 max-h-64 overflow-y-auto rounded-none border border-white/10 bg-black/20 p-1 custom-scrollbar">
                {items.map((item, index) => {
                  const isActive = index === normalizedActiveIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`flex w-full items-start justify-between gap-3 rounded-none px-2 py-2 text-left transition ${
                        isActive 
                          ? "bg-cyan-400/20 text-cyan-50 border-l-2 border-cyan-400 shadow-sm" 
                          : "text-white/70 hover:bg-white/5"
                      }`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => onPickSuggestion?.(item)}
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-medium">{item.title}</span>
                          <span className={`shrink-0 rounded-none px-1 text-[8px] font-bold tracking-tighter ${
                            item.type === "tab" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          }`}>
                            {item.type === "tab" ? "TAB" : "BKM"}
                          </span>
                        </div>
                        <span className="truncate text-[10px] text-white/40">{item.url}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between px-1 text-[10px] text-white/40 font-medium">
              <span>{items.length > 0 ? "Use arrows to select • Enter to open" : "Enter to search or go to URL"}</span>
              <div className="flex items-center gap-2">
                <span className="border border-white/10 px-1 rounded-none text-[9px]">ESC to close</span>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
