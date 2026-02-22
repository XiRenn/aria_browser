const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, Menu, WebContentsView, clipboard, ipcMain, screen, shell, session } = require("electron");

let MicaBrowserWindow = BrowserWindow;

try {
  ({ MicaBrowserWindow } = require("electron-mica-widget"));
} catch {
  MicaBrowserWindow = BrowserWindow;
}

const isMac = process.platform === "darwin";
const isWin = process.platform === "win32";
const WINDOW_RADIUS_MD = 2;
const WEBVIEW_RADIUS_MD = 8;
const WINDOW_MIN_WIDTH = 320;
const WINDOW_MIN_HEIGHT = 240;
const INACTIVE_TAB_DISCARD_DELAY_MS = 900000;
const MEDIA_TAB_RECHECK_DELAY_MS = 30000;

const UI_PADDING = { top: 60, left: 64, right: 8, bottom: 8 };
const WINDOW_SIZE_PRESETS = {
  1: { width: 1100, height: 750 },
  2: { width: 950, height: 650 },
  3: { width: 700, height: 450 },
};

const contexts = new Map();
const downloadsById = new Map();
let windowStatePath = "";

const DEFAULT_WINDOW_STATE = {
  width: 1440,
  height: 920,
  x: undefined,
  y: undefined,
  isMaximized: false,
};

function readWindowState() {
  if (!windowStatePath || !fs.existsSync(windowStatePath)) {
    return { ...DEFAULT_WINDOW_STATE };
  }

  try {
    const raw = fs.readFileSync(windowStatePath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      width: Number.isFinite(parsed?.width) ? parsed.width : DEFAULT_WINDOW_STATE.width,
      height: Number.isFinite(parsed?.height) ? parsed.height : DEFAULT_WINDOW_STATE.height,
      x: Number.isFinite(parsed?.x) ? parsed.x : undefined,
      y: Number.isFinite(parsed?.y) ? parsed.y : undefined,
      isMaximized: Boolean(parsed?.isMaximized),
    };
  } catch {
    return { ...DEFAULT_WINDOW_STATE };
  }
}

function getIntersectionArea(a, b) {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

function normalizeWindowState(state) {
  const MIN_VISIBLE = 120;
  const MIN_VISIBLE_AREA = MIN_VISIBLE * MIN_VISIBLE;
  const displays = screen.getAllDisplays();
  const primaryWorkArea = screen.getPrimaryDisplay().workArea;

  const width = Math.max(
    WINDOW_MIN_WIDTH,
    Math.min(Number.isFinite(state?.width) ? state.width : DEFAULT_WINDOW_STATE.width, primaryWorkArea.width)
  );
  const height = Math.max(
    WINDOW_MIN_HEIGHT,
    Math.min(Number.isFinite(state?.height) ? state.height : DEFAULT_WINDOW_STATE.height, primaryWorkArea.height)
  );

  if (!Number.isFinite(state?.x) || !Number.isFinite(state?.y) || displays.length === 0) {
    return {
      width,
      height,
      x: undefined,
      y: undefined,
      isMaximized: Boolean(state?.isMaximized),
    };
  }

  const targetRect = { x: state.x, y: state.y, width, height };
  let bestDisplay = null;
  let bestOverlap = 0;

  for (const display of displays) {
    const overlap = getIntersectionArea(targetRect, display.workArea);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestDisplay = display;
    }
  }

  if (!bestDisplay || bestOverlap < MIN_VISIBLE_AREA) {
    return {
      width,
      height,
      x: undefined,
      y: undefined,
      isMaximized: Boolean(state?.isMaximized),
    };
  }

  const wa = bestDisplay.workArea;
  const clampedX = Math.min(Math.max(state.x, wa.x - width + MIN_VISIBLE), wa.x + wa.width - MIN_VISIBLE);
  const clampedY = Math.min(Math.max(state.y, wa.y - height + MIN_VISIBLE), wa.y + wa.height - MIN_VISIBLE);

  return {
    width,
    height,
    x: clampedX,
    y: clampedY,
    isMaximized: Boolean(state?.isMaximized),
  };
}

function writeWindowState(ctx) {
  const win = ctx?.window;
  if (!win || win.isDestroyed() || !windowStatePath) {
    return;
  }

  const normalBounds = win.getNormalBounds();
  const snapshot = {
    x: normalBounds.x,
    y: normalBounds.y,
    width: normalBounds.width,
    height: normalBounds.height,
    isMaximized: win.isMaximized(),
  };

  try {
    fs.writeFileSync(windowStatePath, JSON.stringify(snapshot, null, 2), "utf-8");
  } catch {
    // Ignore persistence errors.
  }
}

function buildRoundedWindowShape(width, height, radius) {
  const r = Math.max(0, Math.min(radius, Math.floor(Math.min(width, height) / 2)));
  if (r <= 0) {
    return [{ x: 0, y: 0, width, height }];
  }

  const rects = [];
  for (let y = 0; y < height; y += 1) {
    let inset = 0;
    if (y < r) {
      const dy = r - y - 1;
      inset = Math.ceil(r - Math.sqrt(Math.max(0, r * r - dy * dy)));
    } else if (y >= height - r) {
      const dy = y - (height - r);
      inset = Math.ceil(r - Math.sqrt(Math.max(0, r * r - dy * dy)));
    }

    const rowWidth = width - inset * 2;
    if (rowWidth > 0) {
      rects.push({ x: inset, y, width: rowWidth, height: 1 });
    }
  }

  return rects;
}

function applyWindowRoundedShape(win) {
  if (!win || win.isDestroyed()) {
    return;
  }

  if (typeof win.setShape !== "function" || isMac) {
    return;
  }

  if (win.isMaximized() || win.isFullScreen()) {
    win.setShape([]);
    return;
  }

  const [width, height] = win.getContentSize();
  if (width < 2 || height < 2) {
    return;
  }

  win.setShape(buildRoundedWindowShape(width, height, WINDOW_RADIUS_MD));
}

function getWindowSizePresetFromInput(input) {
  if (
    !input ||
    input.type !== "keyDown" ||
    !input.alt ||
    input.control ||
    input.meta ||
    input.shift
  ) {
    return null;
  }

  const key = typeof input.key === "string" ? input.key : "";
  const code = typeof input.code === "string" ? input.code : "";
  const keyId = code.startsWith("Digit") ? code.slice(5) : key;

  return WINDOW_SIZE_PRESETS[keyId] ?? null;
}

function applyWindowSizePreset(ctx, preset) {
  const win = ctx?.window;
  if (!win || win.isDestroyed() || !preset) {
    return;
  }

  if (win.isFullScreen()) {
    win.setFullScreen(false);
  }
  if (win.isMaximized()) {
    win.unmaximize();
  }

  const display = screen.getDisplayMatching(win.getBounds());
  const workArea = display?.workArea ?? screen.getPrimaryDisplay().workArea;
  const width = Math.min(Math.max(WINDOW_MIN_WIDTH, preset.width), workArea.width);
  const height = Math.min(Math.max(WINDOW_MIN_HEIGHT, preset.height), workArea.height);
  const bounds = win.getBounds();
  const x = Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - width);
  const y = Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - height);

  win.setBounds({ x, y, width, height });
}

function bindWindowSizeShortcuts(ctx, webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return;
  }

  webContents.on("before-input-event", (event, input) => {
    const preset = getWindowSizePresetFromInput(input);
    if (!preset) {
      return;
    }

    event.preventDefault();
    applyWindowSizePreset(ctx, preset);
  });
}

function sanitizeUrl(input) {
  if (!input || typeof input !== "string") {
    return "https://www.google.com";
  }

  const raw = input.trim();
  if (!raw) {
    return "https://www.google.com";
  }

  if (raw.toLowerCase() === "about:blank") {
    return "about:blank";
  }

  const hasWhitespace = /\s/.test(raw);
  const hasScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(raw);
  const hostCandidate = raw.split("/")[0];
  const isLocalhost = /^localhost(?::\d+)?$/i.test(hostCandidate);
  const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/.test(hostCandidate);
  const isIpv6 = /^\[[0-9a-f:]+\](?::\d+)?$/i.test(hostCandidate);
  const hasDotHost = hostCandidate.includes(".");
  const looksLikeUrl = hasScheme || (!hasWhitespace && (isLocalhost || isIpv4 || isIpv6 || hasDotHost));

  if (looksLikeUrl) {
    const withScheme = hasScheme ? raw : `https://${raw}`;
    try {
      return new URL(withScheme).toString();
    } catch {
      // Fall through to search URL.
    }
  }

  return `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
}

function sendToRenderer(ctx, channel, payload) {
  const win = ctx?.window;
  if (!win || win.isDestroyed()) {
    return;
  }
  win.webContents.send(channel, payload);
}

function broadcastToRenderers(channel, payload) {
  for (const ctx of contexts.values()) {
    sendToRenderer(ctx, channel, payload);
  }
}

function openUrlInNewTab(ctx, rawUrl, options = {}) {
  sendToRenderer(ctx, "browser:open-url-in-new-tab", {
    url: sanitizeUrl(rawUrl),
    background: Boolean(options?.background),
  });
}

function openUrlInNewWindow(ctx, rawUrl) {
  const targetUrl = sanitizeUrl(rawUrl);
  const nextCtx = createMainWindow();
  if (!nextCtx?.window || nextCtx.window.isDestroyed()) {
    return;
  }

  const dispatchOpen = () => {
    sendToRenderer(nextCtx, "browser:open-url-in-new-tab", {
      url: targetUrl,
    });
  };

  if (nextCtx.window.webContents.isLoadingMainFrame()) {
    nextCtx.window.webContents.once("did-finish-load", () => {
      dispatchOpen();
      setTimeout(dispatchOpen, 250);
    });
    return;
  }

  dispatchOpen();
  setTimeout(dispatchOpen, 250);
}

function setupDownloadTracking() {
  session.defaultSession.on("will-download", (event, item, webContents) => {
    const sourceCtx = findContextBySender(webContents);
    const savePath = item.getSavePath();
    const startedAt = Date.now();
    const downloadId = `${startedAt}-${Math.random().toString(36).slice(2, 10)}`;
    const basePayload = {
      id: downloadId,
      filename: item.getFilename(),
      url: item.getURL(),
      savePath,
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      startedAt,
      updatedAt: startedAt,
    };

    downloadsById.set(downloadId, {
      id: downloadId,
      savePath,
      filename: item.getFilename(),
      item,
      done: false,
    });

    const emit = (payload) => {
      if (sourceCtx) {
        sendToRenderer(sourceCtx, "downloads:update", payload);
      } else {
        broadcastToRenderers("downloads:update", payload);
      }
    };

    emit({
      ...basePayload,
      status: "progressing",
    });

    item.on("updated", (_evt, state) => {
      const status = item.isPaused()
        ? "paused"
        : state === "interrupted"
          ? "interrupted"
          : "progressing";
      emit({
        ...basePayload,
        status,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        updatedAt: Date.now(),
      });
    });

    item.once("done", (_evt, state) => {
      const status =
        state === "completed" ? "completed" : state === "cancelled" ? "cancelled" : "interrupted";
      const meta = downloadsById.get(downloadId);
      if (meta) {
        meta.done = true;
        meta.item = null;
      }

      emit({
        ...basePayload,
        status,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        updatedAt: Date.now(),
      });
    });
  });
}

function createTabView(ctx, tabId) {
  if (!ctx?.window || ctx.window.isDestroyed() || ctx.tabViews.has(tabId)) {
    return ctx?.tabViews?.get(tabId) ?? null;
  }

  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (typeof view.setBorderRadius === "function") {
    view.setBorderRadius(WEBVIEW_RADIUS_MD);
  }

  const entry = {
    tabId,
    view,
    currentFaviconUrl: "",
    pendingUrl: "",
  };

  ctx.tabViews.set(tabId, entry);
  ctx.window.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  bindWindowSizeShortcuts(ctx, view.webContents);

  view.webContents.on("page-favicon-updated", (_event, favicons) => {
    entry.currentFaviconUrl = Array.isArray(favicons) && favicons.length > 0 ? favicons[0] : "";
    emitTabWebState(ctx, tabId);
  });
  view.webContents.on("page-title-updated", () => emitTabWebState(ctx, tabId));
  view.webContents.on("did-navigate", () => {
    entry.currentFaviconUrl = "";
    emitTabWebState(ctx, tabId);
  });
  view.webContents.on("did-navigate-in-page", () => emitTabWebState(ctx, tabId));
  view.webContents.on("did-finish-load", () => emitTabWebState(ctx, tabId));
  view.webContents.on("found-in-page", (_event, result) => {
    if (!result || tabId !== ctx.activeTabId) {
      return;
    }

    ctx.findState = {
      ...ctx.findState,
      matches: Number.isFinite(result.matches) ? result.matches : 0,
      activeMatchOrdinal: Number.isFinite(result.activeMatchOrdinal) ? result.activeMatchOrdinal : 0,
      finalUpdate: Boolean(result.finalUpdate),
    };

    sendToRenderer(ctx, "find:result", {
      tabId,
      query: ctx.findState.query,
      matches: ctx.findState.matches,
      activeMatchOrdinal: ctx.findState.activeMatchOrdinal,
      finalUpdate: ctx.findState.finalUpdate,
    });
  });
  view.webContents.on("context-menu", (_event, params) => {
    const linkUrl = typeof params?.linkURL === "string" ? params.linkURL.trim() : "";
    const selectionText = typeof params?.selectionText === "string" ? params.selectionText.trim() : "";
    const hasLink = Boolean(linkUrl);
    const hasSelection = Boolean(selectionText);
    const isEditable = Boolean(params?.isEditable);
    const menuTemplate = [];

    if (hasLink) {
      menuTemplate.push(
        {
          label: "Open Link in New Tab",
          click: () => openUrlInNewTab(ctx, linkUrl, { background: true }),
        },
        {
          label: "Open Link in New Window",
          click: () => openUrlInNewWindow(ctx, linkUrl),
        },
        {
          label: "Copy Link Address",
          click: () => clipboard.writeText(linkUrl),
        },
        { type: "separator" }
      );
    }

    if (hasSelection) {
      const preview = selectionText.length > 36 ? `${selectionText.slice(0, 36)}...` : selectionText;
      menuTemplate.push({
        label: `Search selected text: "${preview}"`,
        click: () => openUrlInNewTab(ctx, `https://www.google.com/search?q=${encodeURIComponent(selectionText)}`),
      });
      menuTemplate.push({ type: "separator" });
    }

    if (hasSelection || isEditable) {
      menuTemplate.push(
        { label: "Copy", role: "copy", enabled: hasSelection },
        { label: "Paste", role: "paste", enabled: isEditable },
        { type: "separator" }
      );
    }

    menuTemplate.push(
      {
        label: "Back",
        enabled: view.webContents.navigationHistory.canGoBack(),
        click: () => view.webContents.navigationHistory.goBack(),
      },
      {
        label: "Forward",
        enabled: view.webContents.navigationHistory.canGoForward(),
        click: () => view.webContents.navigationHistory.goForward(),
      },
      {
        label: "Reload",
        click: () => view.webContents.reload(),
      },
      { type: "separator" },
      {
        label: "Inspect Element",
        click: () => {
          const x = Number.isFinite(params?.x) ? params.x : 0;
          const y = Number.isFinite(params?.y) ? params.y : 0;
          if (!view.webContents.isDevToolsOpened()) {
            view.webContents.openDevTools({ mode: "detach", activate: true });
          }
          view.webContents.inspectElement(x, y);
        },
      }
    );

    // Avoid trailing separators for cleaner native menu rendering.
    while (menuTemplate.length > 0 && menuTemplate[menuTemplate.length - 1].type === "separator") {
      menuTemplate.pop();
    }
    const menu = Menu.buildFromTemplate(menuTemplate);

    menu.popup({
      window: ctx.window,
    });
  });

  return entry;
}

function removeTabView(ctx, tabId) {
  if (!ctx?.window || !ctx.tabViews.has(tabId)) {
    return;
  }
  clearDiscardTimer(ctx, tabId);

  const entry = ctx.tabViews.get(tabId);
  ctx.tabViews.delete(tabId);

  try {
    ctx.window.contentView.removeChildView(entry.view);
  } catch {
    // Ignore if the view was already detached.
  }

  if (!entry.view.webContents.isDestroyed()) {
    entry.view.webContents.close();
  }
}

function clearDiscardTimer(ctx, tabId) {
  if (!ctx?.discardTimers?.has(tabId)) {
    return;
  }
  clearTimeout(ctx.discardTimers.get(tabId));
  ctx.discardTimers.delete(tabId);
}

async function shouldKeepTabLoadedForMedia(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return false;
  }

  if (webContents.isCurrentlyAudible()) {
    return true;
  }

  const script = `
    (() => {
      const videos = Array.from(document.querySelectorAll("video"));
      const hasPiP =
        Boolean(document.pictureInPictureElement) ||
        videos.some((video) => typeof video.webkitPresentationMode === "string" && video.webkitPresentationMode === "picture-in-picture");
      const hasPlayingVideo = videos.some((video) => !video.paused && !video.ended && video.readyState > 1);
      return { keep: hasPiP || hasPlayingVideo };
    })();
  `;

  try {
    const result = await webContents.executeJavaScript(script, true);
    return Boolean(result?.keep);
  } catch {
    return false;
  }
}

function scheduleDiscardTimer(ctx, tabId, delayMs = INACTIVE_TAB_DISCARD_DELAY_MS) {
  if (!ctx || !tabId || ctx.discardTimers.has(tabId)) {
    return;
  }

  const timer = setTimeout(async () => {
    ctx.discardTimers.delete(tabId);
    if (!ctx.tabViews.has(tabId) || tabId === ctx.activeTabId) {
      return;
    }

    const entry = ctx.tabViews.get(tabId);
    const keepLoaded = await shouldKeepTabLoadedForMedia(entry?.view?.webContents);
    if (keepLoaded) {
      scheduleDiscardTimer(ctx, tabId, MEDIA_TAB_RECHECK_DELAY_MS);
      return;
    }

    removeTabView(ctx, tabId);
    sendToRenderer(ctx, "tabs:discarded", { tabId, discarded: true });
  }, delayMs);

  ctx.discardTimers.set(tabId, timer);
}

function refreshDiscardTimers(ctx) {
  if (!ctx) {
    return;
  }

  for (const tabId of [...ctx.discardTimers.keys()]) {
    if (tabId === ctx.activeTabId || !ctx.tabViews.has(tabId)) {
      clearDiscardTimer(ctx, tabId);
    }
  }

  for (const [tabId] of ctx.tabViews.entries()) {
    if (tabId === ctx.activeTabId) {
      continue;
    }
    scheduleDiscardTimer(ctx, tabId);
  }
}

function getActiveTabEntry(ctx) {
  if (!ctx?.activeTabId) {
    return null;
  }
  return ctx.tabViews.get(ctx.activeTabId) ?? null;
}

async function togglePictureInPicture(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return { ok: false, active: false, message: "No active webview" };
  }

  const script = `
    (async () => {
      if (!document.pictureInPictureEnabled) {
        return { ok: false, active: false, message: "Picture-in-Picture is not supported on this page" };
      }

      if (document.pictureInPictureElement) {
        try {
          await document.exitPictureInPicture();
          return { ok: true, active: false, message: "Pop up player closed" };
        } catch (error) {
          return { ok: false, active: true, message: error?.message || "Cannot close pop up player" };
        }
      }

      const videos = Array.from(document.querySelectorAll("video"));
      const scoreVideo = (video) => {
        const rect = video.getBoundingClientRect();
        const area = Math.max(0, rect.width * rect.height);
        const visible = rect.width > 0 && rect.height > 0;
        const readyBoost = video.readyState > 0 ? 1_000_000 : 0;
        const playingBoost = !video.paused && !video.ended ? 500_000 : 0;
        return (visible ? area : 0) + readyBoost + playingBoost;
      };
      const candidate = videos
        .filter((video) => video && video instanceof HTMLVideoElement)
        .sort((a, b) => scoreVideo(b) - scoreVideo(a))[0] || null;

      if (!candidate) {
        return { ok: false, active: false, message: "No video found on this page" };
      }

      try {
        if (candidate.disablePictureInPicture) {
          try {
            candidate.disablePictureInPicture = false;
            candidate.removeAttribute("disablePictureInPicture");
          } catch {
            // Ignore and still try requestPictureInPicture.
          }
        }

        if (candidate.readyState === 0) {
          try {
            candidate.load();
          } catch {
            // Ignore loading error and still try.
          }
        }

        await candidate.requestPictureInPicture();
        return { ok: true, active: true, message: "Pop up player started" };
      } catch (error) {
        if (typeof candidate.webkitSetPresentationMode === "function") {
          try {
            candidate.webkitSetPresentationMode("picture-in-picture");
            return { ok: true, active: true, message: "Pop up player started" };
          } catch {
            // Fall through to detailed error.
          }
        }
        return { ok: false, active: false, message: error?.message || "Cannot start pop up player" };
      }
    })();
  `;

  try {
    const result = await webContents.executeJavaScript(script, true);
    if (result && typeof result === "object") {
      return {
        ok: Boolean(result.ok),
        active: Boolean(result.active),
        message: typeof result.message === "string" ? result.message : "",
      };
    }
  } catch {
    // Fall through to generic message.
  }

  return { ok: false, active: false, message: "Cannot control pop up player on this page" };
}

function updateWebLayerBounds(ctx) {
  if (!ctx?.window || ctx.window.isDestroyed()) {
    return;
  }

  const padding = UI_PADDING;
  const [width, height] = ctx.window.getContentSize();
  const bounds = ctx.lastContentBounds ?? {
    x: padding.left,
    y: padding.top,
    width: Math.max(320, width - padding.left - padding.right),
    height: Math.max(200, height - padding.top - padding.bottom),
  };

  for (const [tabId, entry] of ctx.tabViews.entries()) {
    const shouldShow = !ctx.isWebLayerHidden && tabId === ctx.activeTabId;
    entry.view.setBounds(shouldShow ? bounds : { x: 0, y: 0, width: 0, height: 0 });
  }
}

function syncActiveTabToWebLayer(ctx) {
  if (!ctx?.activeTabId || !ctx.tabsById.has(ctx.activeTabId)) {
    return;
  }

  const activeTab = ctx.tabsById.get(ctx.activeTabId);
  const entry = createTabView(ctx, activeTab.id);
  if (!entry) {
    return;
  }

  if (entry.view.webContents.isAudioMuted() !== Boolean(activeTab.isMuted)) {
    entry.view.webContents.setAudioMuted(Boolean(activeTab.isMuted));
  }
  sendToRenderer(ctx, "tabs:discarded", { tabId: activeTab.id, discarded: false });
  clearDiscardTimer(ctx, activeTab.id);

  const targetUrl = sanitizeUrl(activeTab.url);
  const currentUrl = entry.view.webContents.getURL();
  if (currentUrl !== targetUrl && entry.pendingUrl !== targetUrl) {
    entry.pendingUrl = targetUrl;
    entry.view.webContents
      .loadURL(targetUrl)
      .catch(() => {})
      .finally(() => {
        if (entry.pendingUrl === targetUrl) {
          entry.pendingUrl = "";
        }
      });
  }

  if (ctx.findState?.query) {
    entry.view.webContents.findInPage(ctx.findState.query, { findNext: false, forward: true });
  }
}

function emitTabWebState(ctx, tabId) {
  if (!ctx?.tabsById.has(tabId)) {
    return;
  }

  const entry = ctx.tabViews.get(tabId);
  if (!entry || entry.view.webContents.isDestroyed()) {
    return;
  }

  const fallbackUrl = sanitizeUrl(ctx.tabsById.get(tabId).url);
  const url = entry.view.webContents.getURL() || fallbackUrl;

  sendToRenderer(ctx, "tabs:web-state", {
    tabId,
    url,
    title: entry.view.webContents.getTitle() || "New Tab",
    favicon: entry.currentFaviconUrl || "",
    canGoBack: entry.view.webContents.navigationHistory.canGoBack(),
    canGoForward: entry.view.webContents.navigationHistory.canGoForward(),
    isMuted: entry.view.webContents.isAudioMuted(),
  });
}

function emitWebState(ctx) {
  if (!ctx?.activeTabId) {
    return;
  }
  emitTabWebState(ctx, ctx.activeTabId);
}

function emitWindowState(ctx) {
  if (!ctx?.window || ctx.window.isDestroyed()) {
    return;
  }

  sendToRenderer(ctx, "window:state", {
    isMaximized: ctx.window.isMaximized(),
    isAlwaysOnTop: ctx.window.isAlwaysOnTop(),
  });
}

function findContextBySender(webContents) {
  for (const ctx of contexts.values()) {
    if (ctx.window?.webContents?.id === webContents?.id) {
      return ctx;
    }
    for (const entry of ctx.tabViews.values()) {
      if (entry.view?.webContents?.id === webContents?.id) {
        return ctx;
      }
    }
  }
  return null;
}

function createMainWindow() {
  const restoredState = normalizeWindowState(readWindowState());
  const appIconPath =
    isWin
      ? path.join(__dirname, "assets", "icons", "app.ico")
      : path.join(__dirname, "assets", "icons", "app.png");

  const windowOptions = {
    width: restoredState.width,
    height: restoredState.height,
    x: restoredState.x,
    y: restoredState.y,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    frame: false,
    transparent: true,
    titleBarStyle: "hidden",
    backgroundColor: "#00000000",
    vibrancy: isMac ? "under-window" : undefined,
    visualEffectState: isMac ? "active" : undefined,
    icon: fs.existsSync(appIconPath) ? appIconPath : undefined,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  };

  const win = new MicaBrowserWindow(windowOptions);

  if (isWin && typeof win.setMicaEffect === "function") {
    win.setMicaEffect();
  }
  if (isWin && typeof win.setAcrylic === "function") {
    win.setAcrylic();
  }

  const ctx = {
    window: win,
    tabViews: new Map(),
    discardTimers: new Map(),
    findState: { query: "", matches: 0, activeMatchOrdinal: 0, finalUpdate: true },
    activeTabId: null,
    tabsById: new Map(),
    isWebLayerHidden: false,
    lastContentBounds: null,
  };
  bindWindowSizeShortcuts(ctx, win.webContents);

  contexts.set(win.id, ctx);

  updateWebLayerBounds(ctx);
  applyWindowRoundedShape(win);

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, "dist", "index.html"));
  }

  win.on("resize", () => {
    updateWebLayerBounds(ctx);
    applyWindowRoundedShape(win);
    writeWindowState(ctx);
  });
  win.on("maximize", () => {
    updateWebLayerBounds(ctx);
    applyWindowRoundedShape(win);
    emitWindowState(ctx);
    writeWindowState(ctx);
  });
  win.on("unmaximize", () => {
    updateWebLayerBounds(ctx);
    applyWindowRoundedShape(win);
    emitWindowState(ctx);
    writeWindowState(ctx);
  });
  win.on("move", () => writeWindowState(ctx));
  win.on("always-on-top-changed", () => emitWindowState(ctx));
  win.on("close", () => writeWindowState(ctx));

  if (restoredState.isMaximized) {
    win.maximize();
  }

  win.on("closed", () => {
    for (const timer of ctx.discardTimers.values()) {
      clearTimeout(timer);
    }
    ctx.discardTimers.clear();
    for (const tabId of [...ctx.tabViews.keys()]) {
      removeTabView(ctx, tabId);
    }
    contexts.delete(win.id);
  });

  return ctx;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on("second-instance", () => {
  createMainWindow();
});

app.whenReady().then(() => {
  windowStatePath = path.join(app.getPath("userData"), "window-state.json");
  setupDownloadTracking();
  createMainWindow();

  ipcMain.on("tabs:state-changed", (event, payload) => {
    const ctx = findContextBySender(event.sender);
    if (!ctx) {
      return;
    }

    const tabs = Array.isArray(payload?.tabs) ? payload.tabs : [];
    const nextTabsById = new Map(tabs.map((tab) => [tab.id, tab]));
    const nextTabIds = new Set(nextTabsById.keys());

    for (const tabId of [...ctx.tabViews.keys()]) {
      if (!nextTabIds.has(tabId)) {
        removeTabView(ctx, tabId);
      }
    }

    ctx.tabsById = new Map(tabs.map((tab) => [tab.id, tab]));
    ctx.activeTabId = nextTabIds.has(payload?.activeTabId) ? payload.activeTabId : tabs[0]?.id ?? null;

    for (const tab of tabs) {
      const entry = ctx.tabViews.get(tab.id);
      if (entry?.view?.webContents && !entry.view.webContents.isDestroyed()) {
        entry.view.webContents.setAudioMuted(Boolean(tab.isMuted));
      }
    }

    syncActiveTabToWebLayer(ctx);
    updateWebLayerBounds(ctx);
    refreshDiscardTimers(ctx);
    emitWebState(ctx);
  });

  ipcMain.on("browser:set-content-bounds", (event, bounds) => {
    const ctx = findContextBySender(event.sender);
    if (!ctx || !bounds) {
      return;
    }

    const padding = UI_PADDING;
    const nextBounds = {
      x: Number.isFinite(bounds.x) ? bounds.x : padding.left,
      y: Number.isFinite(bounds.y) ? bounds.y : padding.top,
      width: Number.isFinite(bounds.width) ? Math.max(320, bounds.width) : 320,
      height: Number.isFinite(bounds.height) ? Math.max(200, bounds.height) : 200,
    };

    if (
      ctx.lastContentBounds &&
      ctx.lastContentBounds.x === nextBounds.x &&
      ctx.lastContentBounds.y === nextBounds.y &&
      ctx.lastContentBounds.width === nextBounds.width &&
      ctx.lastContentBounds.height === nextBounds.height
    ) {
      return;
    }

    ctx.lastContentBounds = nextBounds;
    updateWebLayerBounds(ctx);
  });

  ipcMain.on("browser:set-hidden", (event, hidden) => {
    const ctx = findContextBySender(event.sender);
    if (!ctx) {
      return;
    }
    ctx.isWebLayerHidden = Boolean(hidden);
    updateWebLayerBounds(ctx);
  });

  ipcMain.on("browser:back", (event) => {
    const ctx = findContextBySender(event.sender);
    const active = getActiveTabEntry(ctx);
    if (active?.view?.webContents?.navigationHistory.canGoBack()) {
      active.view.webContents.navigationHistory.goBack();
    }
  });

  ipcMain.on("browser:forward", (event) => {
    const ctx = findContextBySender(event.sender);
    const active = getActiveTabEntry(ctx);
    if (active?.view?.webContents?.navigationHistory.canGoForward()) {
      active.view.webContents.navigationHistory.goForward();
    }
  });

  ipcMain.on("browser:reload", (event) => {
    const ctx = findContextBySender(event.sender);
    const active = getActiveTabEntry(ctx);
    if (active?.view?.webContents) {
      active.view.webContents.reload();
    }
  });

  ipcMain.on("browser:focus-active-webview", (event) => {
    const ctx = findContextBySender(event.sender);
    const active = getActiveTabEntry(ctx);
    if (active?.view?.webContents && !active.view.webContents.isDestroyed()) {
      active.view.webContents.focus();
    }
  });

  ipcMain.on("browser:find-in-page", (event, payload) => {
    const ctx = findContextBySender(event.sender);
    const active = getActiveTabEntry(ctx);
    if (!ctx || !active?.view?.webContents) {
      return;
    }

    const query = typeof payload?.query === "string" ? payload.query.trim() : "";
    if (!query) {
      return;
    }

    const forward = payload?.forward !== false;
    const findNext = Boolean(payload?.findNext);
    ctx.findState.query = query;
    active.view.webContents.findInPage(query, { findNext, forward });
  });

  ipcMain.on("browser:stop-find", (event, payload) => {
    const ctx = findContextBySender(event.sender);
    const active = getActiveTabEntry(ctx);
    if (!ctx || !active?.view?.webContents) {
      return;
    }

    const action = payload?.action === "activate" ? "activateSelection" : "clearSelection";
    active.view.webContents.stopFindInPage(action);
    ctx.findState = { query: "", matches: 0, activeMatchOrdinal: 0, finalUpdate: true };
    sendToRenderer(ctx, "find:result", {
      tabId: ctx.activeTabId,
      query: "",
      matches: 0,
      activeMatchOrdinal: 0,
      finalUpdate: true,
    });
  });

  ipcMain.handle("browser:toggle-pip", async (event) => {
    const ctx = findContextBySender(event.sender);
    const active = getActiveTabEntry(ctx);
    if (!active?.view?.webContents) {
      return { ok: false, active: false, message: "No active tab" };
    }
    return togglePictureInPicture(active.view.webContents);
  });

  ipcMain.on("browser:set-tab-muted", (event, payload) => {
    const ctx = findContextBySender(event.sender);
    if (!ctx) {
      return;
    }

    const tabId = typeof payload?.tabId === "string" ? payload.tabId : "";
    const muted = Boolean(payload?.muted);
    if (!tabId) {
      return;
    }

    const entry = ctx.tabViews.get(tabId);
    if (!entry?.view?.webContents || entry.view.webContents.isDestroyed()) {
      return;
    }
    entry.view.webContents.setAudioMuted(muted);
    emitTabWebState(ctx, tabId);
  });

  ipcMain.handle("downloads:open", (_event, payload) => {
    const id = typeof payload?.id === "string" ? payload.id : "";
    const mode = payload?.mode === "folder" ? "folder" : "file";
    const payloadSavePath = typeof payload?.savePath === "string" ? payload.savePath : "";
    const payloadFilename = typeof payload?.filename === "string" ? payload.filename : "";
    const meta = downloadsById.get(id);
    const fallbackFromFilename = payloadFilename
      ? path.join(app.getPath("downloads"), payloadFilename)
      : "";
    const targetPath = meta?.savePath || payloadSavePath || fallbackFromFilename;
    if (!targetPath) {
      return false;
    }

    if (mode === "folder") {
      const folderTarget = fs.existsSync(targetPath)
        ? targetPath
        : path.join(path.dirname(targetPath), path.basename(targetPath));
      shell.showItemInFolder(folderTarget);
      return true;
    }

    return shell.openPath(targetPath).then((errorMessage) => errorMessage === "");
  });

  ipcMain.handle("downloads:control", (_event, payload) => {
    const id = typeof payload?.id === "string" ? payload.id : "";
    const action = typeof payload?.action === "string" ? payload.action : "";
    const meta = downloadsById.get(id);
    const item = meta?.item;
    if (!id || !meta || !item || meta.done) {
      return false;
    }

    if (action === "pause") {
      if (!item.isPaused()) {
        item.pause();
      }
      return true;
    }

    if (action === "resume") {
      if (item.isPaused()) {
        item.resume();
      }
      return true;
    }

    if (action === "cancel") {
      item.cancel();
      return true;
    }

    return false;
  });

  ipcMain.on("window:new", (event) => {
    createMainWindow();
  });

  ipcMain.on("window:minimize", (event) => {
    const ctx = findContextBySender(event.sender);
    if (ctx?.window && !ctx.window.isDestroyed()) {
      ctx.window.minimize();
    }
  });

  ipcMain.on("window:maximize-toggle", (event) => {
    const ctx = findContextBySender(event.sender);
    if (!ctx?.window || ctx.window.isDestroyed()) {
      return;
    }

    if (ctx.window.isMaximized()) {
      ctx.window.unmaximize();
      return;
    }
    ctx.window.maximize();
  });

  ipcMain.on("window:close", (event) => {
    const ctx = findContextBySender(event.sender);
    if (ctx?.window && !ctx.window.isDestroyed()) {
      ctx.window.close();
    }
  });

  ipcMain.handle("window:always-on-top-toggle", (event) => {
    const ctx = findContextBySender(event.sender);
    if (!ctx?.window || ctx.window.isDestroyed()) {
      return false;
    }

    const next = !ctx.window.isAlwaysOnTop();
    ctx.window.setAlwaysOnTop(next, "normal");
    emitWindowState(ctx);
    return next;
  });

  ipcMain.handle("window:get-state", (event) => {
    const ctx = findContextBySender(event.sender);
    if (!ctx?.window || ctx.window.isDestroyed()) {
      return { isMaximized: false, isAlwaysOnTop: false };
    }

    return {
      isMaximized: ctx.window.isMaximized(),
      isAlwaysOnTop: ctx.window.isAlwaysOnTop(),
    };
  });

  app.on("activate", () => {
    if (contexts.size === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (!isMac) {
    app.quit();
  }
});
