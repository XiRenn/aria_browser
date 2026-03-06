import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";

export default function App() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [htmlFullscreen, setHtmlFullscreen] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const offWindowState = api.onWindowState((payload) => {
      setIsMaximized(Boolean(payload?.isMaximized));
    });

    const offHtmlFullscreenChanged = api.onHtmlFullscreenChanged?.((payload) => {
      setHtmlFullscreen(Boolean(payload?.active));
    });

    api.getWindowState().then((payload) => {
      setIsMaximized(Boolean(payload?.isMaximized));
    }).catch(() => {});

    return () => {
      offWindowState?.();
      offHtmlFullscreenChanged?.();
    };
  }, []);

  const showRounding = !isMaximized && !htmlFullscreen;

  return (
    <div className={`pointer-events-none relative min-h-screen w-full overflow-hidden bg-slate-950/20 text-white transition-all duration-300 ${showRounding ? "rounded-none border-[1.5px] border-white/25 shadow-2xl" : "rounded-none border-none shadow-none"}`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.25),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(34,197,94,0.2),transparent_35%)]" />
      <Sidebar />
    </div>
  );
}
