const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  syncTabsState: (payload) => ipcRenderer.send("tabs:state-changed", payload),
  setContentBounds: (bounds) => ipcRenderer.send("browser:set-content-bounds", bounds),
  setWebLayerHidden: (hidden) => ipcRenderer.send("browser:set-hidden", Boolean(hidden)),
  browserBack: () => ipcRenderer.send("browser:back"),
  browserForward: () => ipcRenderer.send("browser:forward"),
  browserReload: () => ipcRenderer.send("browser:reload"),
  focusActiveWebview: () => ipcRenderer.send("browser:focus-active-webview"),
  findInPage: (query, options) => ipcRenderer.send("browser:find-in-page", { query, ...options }),
  stopFindInPage: (action) => ipcRenderer.send("browser:stop-find", { action }),
  togglePictureInPicture: () => ipcRenderer.invoke("browser:toggle-pip"),
  setTabMuted: (tabId, muted) => ipcRenderer.send("browser:set-tab-muted", { tabId, muted: Boolean(muted) }),
  newWindow: () => ipcRenderer.send("window:new"),
  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.send("window:maximize-toggle"),
  closeWindow: () => ipcRenderer.send("window:close"),
  toggleAlwaysOnTop: () => ipcRenderer.invoke("window:always-on-top-toggle"),
  getWindowState: () => ipcRenderer.invoke("window:get-state"),
  openDownload: (id, mode, savePath, filename) =>
    ipcRenderer.invoke("downloads:open", { id, mode, savePath, filename }),
  controlDownload: (id, action) => ipcRenderer.invoke("downloads:control", { id, action }),
  onWebState: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("tabs:web-state", handler);
    return () => ipcRenderer.removeListener("tabs:web-state", handler);
  },
  onWindowState: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("window:state", handler);
    return () => ipcRenderer.removeListener("window:state", handler);
  },
  onOpenUrlInNewTab: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("browser:open-url-in-new-tab", handler);
    return () => ipcRenderer.removeListener("browser:open-url-in-new-tab", handler);
  },
  onDownloadUpdate: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("downloads:update", handler);
    return () => ipcRenderer.removeListener("downloads:update", handler);
  },
  onTabDiscarded: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("tabs:discarded", handler);
    return () => ipcRenderer.removeListener("tabs:discarded", handler);
  },
  onFindResult: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("find:result", handler);
    return () => ipcRenderer.removeListener("find:result", handler);
  },
});
