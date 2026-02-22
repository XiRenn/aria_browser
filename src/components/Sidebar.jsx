import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import toast from "react-hot-toast";
import {
  addBookmarkFolder,
  addBookmarkItem,
  clearDownloads,
  clearHistory,
  closeTab,
  deleteBookmarkNode,
  editBookmarkNode,
  importBookmarks,
  moveBookmarkNode,
  moveBookmarkNodeToFolderEnd,
  navigateTo,
  newTab,
  newTabInBackground,
  reopenLastClosedTab,
  selectActiveTab,
  selectActiveTabId,
  selectBookmarks,
  selectDownloads,
  selectHistoryEntries,
  selectRecentlyClosedCount,
  selectShowBookmarksPanel,
  selectTabs,
  setTabDiscarded,
  setTabMuted,
  setActiveTab,
  setBookmarksPanelVisible,
  syncTabFromWeb,
  upsertDownload,
} from "../store";
import {
  AlwaysOnTopOffIcon,
  AlwaysOnTopOnIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  DownloadIcon,
  HistoryIcon,
  MaximizeIcon,
  MinusIcon,
  PopoutPlayerIcon,
  PlusIcon,
  ReloadIcon,
  SearchIcon,
  SidebarToggleIcon,
  StarIcon,
  VolumeIcon,
  VolumeOffIcon,
} from "./icons";

const BookmarksPanel = lazy(() => import("./BookmarksPanel"));
const CommandPalette = lazy(() => import("./CommandPalette"));
const HistoryPanel = lazy(() => import("./HistoryPanel"));
const DownloadsPanel = lazy(() => import("./DownloadsPanel"));

function sanitizeAddress(value) {
  const raw = (value ?? "").trim();
  if (!raw) {
    return { ok: false, url: "", message: "Enter a URL or search term" };
  }

  if (raw.toLowerCase() === "about:blank") {
    return { ok: true, url: "about:blank" };
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
    const asUrl = hasScheme ? raw : `https://${raw}`;
    try {
      const parsed = new URL(asUrl);
      return { ok: true, url: parsed.toString() };
    } catch {
      // Fall through to search URL.
    }
  }

  return {
    ok: true,
    url: `https://www.google.com/search?q=${encodeURIComponent(raw)}`,
  };
}

function buildFallbackFavicon(url) {
  const safeUrl = typeof url === "string" && url ? url : "https://www.google.com";
  return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(safeUrl)}`;
}

function normalizePaletteSeed(url) {
  if (typeof url !== "string") {
    return "";
  }
  return url.toLowerCase() === "about:blank" ? "" : url;
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable ||
    target.closest("[contenteditable='true']")
  );
}

function makeBookmarkNodeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseBookmarksHtml(rawHtml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, "text/html");
  const rootId = "bookmark-root";
  const nodes = {
    [rootId]: {
      id: rootId,
      type: "folder",
      name: "Bookmarks",
      parentId: null,
      children: [],
    },
  };

  const walkDl = (dlNode, parentId) => {
    if (!dlNode) {
      return;
    }

    const children = Array.from(dlNode.children ?? []);
    for (const child of children) {
      if (child.tagName?.toLowerCase() !== "dt") {
        continue;
      }

      const folderTitle = child.querySelector(":scope > h3");
      const link = child.querySelector(":scope > a");

      if (folderTitle) {
        const folderId = makeBookmarkNodeId();
        nodes[folderId] = {
          id: folderId,
          type: "folder",
          name: folderTitle.textContent?.trim() || "Folder",
          parentId,
          children: [],
        };
        nodes[parentId].children.push(folderId);
        const nestedDl = child.querySelector(":scope > dl");
        walkDl(nestedDl, folderId);
        continue;
      }

      if (link?.getAttribute("href")) {
        const bookmarkId = makeBookmarkNodeId();
        nodes[bookmarkId] = {
          id: bookmarkId,
          type: "bookmark",
          title: link.textContent?.trim() || "Untitled",
          url: link.getAttribute("href") || "https://www.google.com",
          parentId,
        };
        nodes[parentId].children.push(bookmarkId);
      }
    }
  };

  const topDl = doc.querySelector("dl");
  walkDl(topDl, rootId);
  return { rootId, nodes };
}

function exportBookmarksAsHtml(bookmarks) {
  const root = bookmarks?.nodes?.[bookmarks?.rootId];
  if (!root || root.type !== "folder") {
    return "";
  }

  const renderFolder = (folderId, depth = 1) => {
    const folder = bookmarks.nodes[folderId];
    if (!folder || folder.type !== "folder") {
      return "";
    }

    const indent = "  ".repeat(depth);
    const lines = [];
    for (const childId of folder.children ?? []) {
      const node = bookmarks.nodes[childId];
      if (!node) {
        continue;
      }

      if (node.type === "folder") {
        lines.push(`${indent}<DT><H3>${escapeHtml(node.name)}</H3>`);
        lines.push(`${indent}<DL><p>`);
        lines.push(renderFolder(node.id, depth + 1));
        lines.push(`${indent}</DL><p>`);
      } else {
        lines.push(`${indent}<DT><A HREF="${escapeHtml(node.url)}">${escapeHtml(node.title)}</A>`);
      }
    }
    return lines.filter(Boolean).join("\n");
  };

  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${renderFolder(bookmarks.rootId)}
</DL><p>
`;
}

const DENSITY_PRESET = {
  sidebarTab: "w-[64px] p-1.5",
  sidebarBookmark: "w-[240px] p-1.5",
  shellPadding: "p-1.5",
  iconBtn: "h-9 w-9",
  stack: "space-y-1 px-1.5 pb-1.5",
  topWrapTab: "left-[70px] top-2 right-2 gap-2",
  topWrapBookmark: "left-[248px] top-2 right-2 gap-2",
  group: "h-9 px-1",
  quickActions: "h-9 px-2",
  actionBtn: "h-7 w-7",
  address: "h-9 px-2.5",
  modalPadTop: "pt-16",
  modalCard: "w-[min(640px,calc(100vw-48px))] p-2.5",
  modalInput: "h-10 px-2.5",
  web: { tabLeft: 70, bookmarkLeft: 248, top: 60, right: 8, bottom: 8 },
};

export default function Sidebar() {
  const dispatch = useDispatch();
  const tabs = useSelector(selectTabs);
  const activeTabId = useSelector(selectActiveTabId);
  const activeTab = useSelector(selectActiveTab);
  const recentlyClosedCount = useSelector(selectRecentlyClosedCount);
  const bookmarks = useSelector(selectBookmarks);
  const showBookmarksPanel = useSelector(selectShowBookmarksPanel);
  const historyEntries = useSelector(selectHistoryEntries);
  const downloads = useSelector(selectDownloads);

  const [addressInput, setAddressInput] = useState(activeTab?.url ?? "");
  const [windowState, setWindowState] = useState({
    isMaximized: false,
    isAlwaysOnTop: false,
  });
  const [paletteOpen, setPaletteOpen] = useState(() => tabs.length === 0);
  const [paletteMode, setPaletteMode] = useState(() => (tabs.length === 0 ? "new-tab" : "navigate"));
  const [paletteInput, setPaletteInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findStats, setFindStats] = useState({ matches: 0, activeMatchOrdinal: 0 });
  const [activeFolderId, setActiveFolderId] = useState(bookmarks.rootId);
  const [draggingBookmarkId, setDraggingBookmarkId] = useState(null);
  const [dropHint, setDropHint] = useState({ id: null, mode: null });

  const paletteInputRef = useRef(null);
  const findInputRef = useRef(null);
  const importInputRef = useRef(null);
  const boundsRafRef = useRef(0);
  const lastBoundsRef = useRef({ x: -1, y: -1, width: -1, height: -1 });

  const density = DENSITY_PRESET;
  const currentFolder =
    bookmarks.nodes[activeFolderId]?.type === "folder"
      ? bookmarks.nodes[activeFolderId]
      : bookmarks.nodes[bookmarks.rootId];
  const bookmarkChildren = useMemo(() => {
    if (!currentFolder || currentFolder.type !== "folder") {
      return [];
    }
    return currentFolder.children.map((id) => bookmarks.nodes[id]).filter(Boolean);
  }, [bookmarks.nodes, currentFolder]);
  const allBookmarkItems = useMemo(
    () =>
      Object.values(bookmarks.nodes)
        .filter((node) => node?.type === "bookmark")
        .map((node) => ({
          id: node.id,
          title: node.title || "Untitled",
          url: node.url || "about:blank",
        })),
    [bookmarks.nodes]
  );
  const paletteBookmarks = useMemo(() => {
    const needle = (paletteInput ?? "").trim().toLowerCase();
    const ranked = allBookmarkItems
      .map((item) => {
        const title = item.title.toLowerCase();
        const url = item.url.toLowerCase();

        if (!needle) {
          return { item, score: 0 };
        }
        if (title === needle || url === needle) {
          return { item, score: 1000 };
        }
        if (title.startsWith(needle) || url.startsWith(needle)) {
          return { item, score: 700 };
        }
        if (title.includes(needle)) {
          return { item, score: 500 };
        }
        if (url.includes(needle)) {
          return { item, score: 400 };
        }
        return { item, score: -1 };
      })
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score || a.item.title.length - b.item.title.length)
      .map((entry) => entry.item);

    return ranked.slice(0, 10);
  }, [allBookmarkItems, paletteInput]);
  const parentFolder = currentFolder?.parentId ? bookmarks.nodes[currentFolder.parentId] : null;
  const anyOverlayOpen = paletteOpen || historyOpen || downloadsOpen;

  useEffect(() => {
    setAddressInput(activeTab?.url ?? "");
  }, [activeTab?.url]);

  useEffect(() => {
    if (tabs.length === 0) {
      setPaletteMode("new-tab");
      setPaletteInput("");
      setPaletteOpen(true);
    }
  }, [tabs.length]);

  useEffect(() => {
    if (!bookmarks.nodes[activeFolderId] || bookmarks.nodes[activeFolderId].type !== "folder") {
      setActiveFolderId(bookmarks.rootId);
    }
  }, [activeFolderId, bookmarks.nodes, bookmarks.rootId]);

  useEffect(() => {
    if (!paletteOpen) {
      return;
    }

    const id = setTimeout(() => {
      paletteInputRef.current?.focus();
      paletteInputRef.current?.select();
    }, 0);

    return () => clearTimeout(id);
  }, [paletteOpen]);

  useEffect(() => {
    if (!findOpen) {
      return;
    }
    const id = setTimeout(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    }, 0);
    return () => clearTimeout(id);
  }, [findOpen]);

  useEffect(() => {
    if (!findOpen) {
      window.electronAPI?.stopFindInPage?.("clear");
      setFindStats({ matches: 0, activeMatchOrdinal: 0 });
      return;
    }

    const query = (findQuery ?? "").trim();
    if (!query) {
      window.electronAPI?.stopFindInPage?.("clear");
      setFindStats({ matches: 0, activeMatchOrdinal: 0 });
      return;
    }

    const id = setTimeout(() => {
      window.electronAPI?.findInPage?.(query, { findNext: false, forward: true });
    }, 80);

    return () => clearTimeout(id);
  }, [findOpen, findQuery, activeTabId]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) {
      return undefined;
    }

    const offWebState = api.onWebState((payload) => {
      dispatch(syncTabFromWeb(payload));
    });

    const offWindowState = api.onWindowState((payload) => {
      setWindowState({
        isMaximized: Boolean(payload?.isMaximized),
        isAlwaysOnTop: Boolean(payload?.isAlwaysOnTop),
      });
    });
    const offOpenUrlInNewTab = api.onOpenUrlInNewTab((payload) => {
      if (typeof payload?.url === "string" && payload.url.trim()) {
        if (payload?.background) {
          dispatch(newTabInBackground(payload.url));
        } else {
          dispatch(newTab(payload.url));
        }
      }
    });
    const offDownloadUpdate = api.onDownloadUpdate?.((payload) => {
      dispatch(upsertDownload(payload));
    });
    const offTabDiscarded = api.onTabDiscarded?.((payload) => {
      dispatch(setTabDiscarded(payload));
    });
    const offFindResult = api.onFindResult?.((payload) => {
      setFindStats({
        matches: Number.isFinite(payload?.matches) ? payload.matches : 0,
        activeMatchOrdinal: Number.isFinite(payload?.activeMatchOrdinal) ? payload.activeMatchOrdinal : 0,
      });
    });

    api
      .getWindowState()
      .then((payload) => {
        setWindowState({
          isMaximized: Boolean(payload?.isMaximized),
          isAlwaysOnTop: Boolean(payload?.isAlwaysOnTop),
        });
      })
      .catch(() => {});

    return () => {
      offWebState?.();
      offWindowState?.();
      offOpenUrlInNewTab?.();
      offDownloadUpdate?.();
      offTabDiscarded?.();
      offFindResult?.();
    };
  }, [dispatch]);

  useEffect(() => {
    window.electronAPI?.setWebLayerHidden?.(anyOverlayOpen);
    return () => window.electronAPI?.setWebLayerHidden?.(false);
  }, [anyOverlayOpen]);

  useEffect(() => {
    const syncBounds = () => {
      const web = density.web;
      const x = showBookmarksPanel ? web.bookmarkLeft : web.tabLeft;
      const y = web.top;
      const width = Math.max(320, window.innerWidth - x - web.right);
      const height = Math.max(200, window.innerHeight - y - web.bottom);

      const last = lastBoundsRef.current;
      if (last.x === x && last.y === y && last.width === width && last.height === height) {
        return;
      }

      lastBoundsRef.current = { x, y, width, height };
      window.electronAPI?.setContentBounds?.({ x, y, width, height });
    };

    const scheduleSync = () => {
      if (boundsRafRef.current) {
        return;
      }
      boundsRafRef.current = window.requestAnimationFrame(() => {
        boundsRafRef.current = 0;
        syncBounds();
      });
    };

    scheduleSync();
    window.addEventListener("resize", scheduleSync);
    return () => {
      window.removeEventListener("resize", scheduleSync);
      if (boundsRafRef.current) {
        window.cancelAnimationFrame(boundsRafRef.current);
        boundsRafRef.current = 0;
      }
    };
  }, [density.web, showBookmarksPanel]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (paletteOpen || historyOpen || downloadsOpen) {
          event.preventDefault();
          setPaletteOpen(false);
          setHistoryOpen(false);
          setDownloadsOpen(false);
          setFindOpen(false);
          window.electronAPI?.focusActiveWebview?.();
          return;
        }
      }

      const primaryMod = event.ctrlKey || event.metaKey;
      if (!primaryMod) {
        return;
      }

      const key = event.key.toLowerCase();
      const editing = isEditableTarget(event.target);
      if (editing && key !== "f" && key !== "l") {
        return;
      }

      if (event.ctrlKey && !event.metaKey && event.code === "Space" && !event.shiftKey) {
        event.preventDefault();
        togglePopoutPlayer();
        return;
      }

      if (key === "l" && !event.shiftKey) {
        event.preventDefault();
        setPaletteMode("navigate");
        setPaletteInput(normalizePaletteSeed(activeTab?.url));
        setPaletteOpen(true);
        return;
      }

      if (key === "t" && !event.shiftKey) {
        event.preventDefault();
        setPaletteMode("new-tab");
        setPaletteInput("");
        setPaletteOpen(true);
        return;
      }

      if (key === "w" && !event.shiftKey) {
        event.preventDefault();
        if (activeTabId) {
          const isClosingLastTab = tabs.length === 1;
          dispatch(closeTab(activeTabId));
          if (isClosingLastTab) {
            setPaletteMode("new-tab");
            setPaletteInput("");
            setPaletteOpen(true);
          }
        }
        return;
      }

      if (key === "n" && !event.shiftKey) {
        event.preventDefault();
        window.electronAPI?.newWindow?.();
        return;
      }

      if (key === "t" && event.shiftKey) {
        event.preventDefault();
        if (recentlyClosedCount > 0) {
          dispatch(reopenLastClosedTab());
        } else {
          toast("No recently closed tabs");
        }
        return;
      }

      if (key === "f" && !event.shiftKey) {
        event.preventDefault();
        setFindOpen(true);
        const query = (findQuery ?? "").trim();
        if (query) {
          window.electronAPI?.findInPage?.(query, { findNext: true, forward: true });
        }
        return;
      }

      if (key === "f" && event.shiftKey) {
        event.preventDefault();
        setFindOpen(true);
        const query = (findQuery ?? "").trim();
        if (query) {
          window.electronAPI?.findInPage?.(query, { findNext: true, forward: false });
        }
        return;
      }

      if (key === "h" && !event.shiftKey) {
        event.preventDefault();
        setHistoryOpen(true);
        setDownloadsOpen(false);
        setPaletteOpen(false);
        return;
      }

      if (key === "j" && !event.shiftKey) {
        event.preventDefault();
        setDownloadsOpen(true);
        setHistoryOpen(false);
        setPaletteOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab?.url, activeTabId, dispatch, downloadsOpen, findQuery, historyOpen, paletteOpen, recentlyClosedCount, tabs.length]);

  const tabCountLabel = useMemo(() => `${tabs.length}`, [tabs.length]);

  const triggerFindNext = useCallback(
    (forward = true) => {
      const query = (findQuery ?? "").trim();
      if (!query) {
        return;
      }
      window.electronAPI?.findInPage?.(query, { findNext: true, forward });
    },
    [findQuery]
  );

  const closeFindPanel = useCallback(() => {
    setFindOpen(false);
    window.electronAPI?.stopFindInPage?.("clear");
  }, []);

  const togglePopoutPlayer = async () => {
    const result = await window.electronAPI?.togglePictureInPicture?.();
    if (!result?.ok) {
      toast.error(result?.message || "Cannot open pop up player");
    }
  };

  const toggleActiveTabMute = () => {
    if (!activeTabId) {
      return;
    }
    const nextMuted = !Boolean(activeTab?.isMuted);
    dispatch(setTabMuted({ tabId: activeTabId, muted: nextMuted }));
    window.electronAPI?.setTabMuted?.(activeTabId, nextMuted);
  };

  const openHistoryEntry = (entry) => {
    if (!entry?.url) {
      return;
    }
    if (activeTabId) {
      dispatch(navigateTo({ tabId: activeTabId, url: entry.url }));
    } else {
      dispatch(newTab(entry.url));
    }
    setHistoryOpen(false);
  };

  const openDownloadFile = async (item) => {
    if (!item?.id) {
      return;
    }
    const ok = await window.electronAPI?.openDownload?.(item.id, "file", item.savePath, item.filename);
    if (!ok) {
      toast.error("Cannot open this download");
    }
  };

  const showDownloadInFolder = async (item) => {
    if (!item?.id) {
      return;
    }
    const ok = await window.electronAPI?.openDownload?.(item.id, "folder", item.savePath, item.filename);
    if (!ok) {
      toast.error("Cannot open download folder");
    }
  };

  const pauseDownload = async (item) => {
    if (!item?.id) {
      return;
    }
    const ok = await window.electronAPI?.controlDownload?.(item.id, "pause");
    if (!ok) {
      toast.error("Cannot pause download");
      return;
    }
    dispatch(upsertDownload({ ...item, status: "paused", updatedAt: Date.now() }));
  };

  const resumeDownload = async (item) => {
    if (!item?.id) {
      return;
    }
    const ok = await window.electronAPI?.controlDownload?.(item.id, "resume");
    if (!ok) {
      toast.error("Cannot resume download");
      return;
    }
    dispatch(upsertDownload({ ...item, status: "progressing", updatedAt: Date.now() }));
  };

  const cancelDownload = async (item) => {
    if (!item?.id) {
      return;
    }
    const ok = await window.electronAPI?.controlDownload?.(item.id, "cancel");
    if (!ok) {
      toast.error("Cannot cancel download");
      return;
    }
    dispatch(upsertDownload({ ...item, status: "cancelled", updatedAt: Date.now() }));
  };

  const handleNewTab = () => {
    setPaletteMode("new-tab");
    setPaletteInput("");
    setPaletteOpen(true);
    setHistoryOpen(false);
    setDownloadsOpen(false);
  };

  const handleAddressSubmit = (event) => {
    event.preventDefault();

    const result = sanitizeAddress(addressInput);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    if (!activeTabId) {
      dispatch(newTab(result.url));
      setTimeout(() => window.electronAPI?.focusActiveWebview?.(), 0);
      return;
    }

    dispatch(navigateTo({ tabId: activeTabId, url: result.url }));
    setTimeout(() => window.electronAPI?.focusActiveWebview?.(), 0);
  };

  const handlePaletteSubmit = (event) => {
    event.preventDefault();

    const result = sanitizeAddress(paletteInput);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    if (paletteMode === "new-tab") {
      dispatch(newTab(result.url));
    } else if (activeTabId) {
      dispatch(navigateTo({ tabId: activeTabId, url: result.url }));
    } else {
      dispatch(newTab(result.url));
    }

    setPaletteOpen(false);
    setTimeout(() => window.electronAPI?.focusActiveWebview?.(), 0);
  };

  const handlePalettePickBookmark = useCallback(
    (bookmark) => {
      if (!bookmark?.url) {
        return;
      }

      if (paletteMode === "new-tab") {
        dispatch(newTab(bookmark.url));
      } else if (activeTabId) {
        dispatch(navigateTo({ tabId: activeTabId, url: bookmark.url }));
      } else {
        dispatch(newTab(bookmark.url));
      }

      setPaletteOpen(false);
    },
    [activeTabId, dispatch, paletteMode]
  );

  const openBookmark = useCallback(
    (bookmark) => {
      if (!bookmark || bookmark.type !== "bookmark") {
        return;
      }

      if (activeTabId) {
        dispatch(navigateTo({ tabId: activeTabId, url: bookmark.url }));
        return;
      }

      dispatch(newTab(bookmark.url));
    },
    [activeTabId, dispatch]
  );

  const createFolder = () => {
    const name = window.prompt("Folder name", "New Folder");
    if (!name || !name.trim()) {
      return;
    }
    dispatch(addBookmarkFolder({ parentId: currentFolder.id, name: name.trim() }));
  };

  const createBookmark = () => {
    const title = window.prompt("Bookmark title", activeTab?.title || "New Bookmark");
    if (!title || !title.trim()) {
      return;
    }

    const url = window.prompt("Bookmark URL", activeTab?.url || "https://");
    if (!url || !url.trim()) {
      return;
    }

    dispatch(addBookmarkItem({ parentId: currentFolder.id, title: title.trim(), url: url.trim() }));
  };

  const bookmarkCurrentTab = () => {
    if (!activeTab?.url || activeTab.url === "about:blank") {
      toast("No page to bookmark");
      return;
    }

    dispatch(
      addBookmarkItem({
        parentId: currentFolder.id,
        title: activeTab.title || "New Bookmark",
        url: activeTab.url,
      })
    );
  };

  const editNode = useCallback(
    (node) => {
      if (!node) {
        return;
      }

      if (node.type === "folder") {
        const name = window.prompt("Rename folder", node.name);
        if (!name || !name.trim()) {
          return;
        }
        dispatch(editBookmarkNode({ id: node.id, name: name.trim() }));
        return;
      }

      const title = window.prompt("Edit title", node.title);
      if (!title || !title.trim()) {
        return;
      }
      const url = window.prompt("Edit URL", node.url);
      if (!url || !url.trim()) {
        return;
      }
      dispatch(editBookmarkNode({ id: node.id, title: title.trim(), url: url.trim() }));
    },
    [dispatch]
  );

  const deleteNode = useCallback(
    (node) => {
      if (!node) {
        return;
      }
      if (!window.confirm(`Delete ${node.type === "folder" ? "folder" : "bookmark"}?`)) {
        return;
      }
      dispatch(deleteBookmarkNode(node.id));
    },
    [dispatch]
  );

  const startDragNode = useCallback((event, nodeId) => {
    setDraggingBookmarkId(nodeId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId);
  }, []);

  const clearDragState = useCallback(() => {
    setDraggingBookmarkId(null);
    setDropHint({ id: null, mode: null });
  }, []);

  const dropBeforeNode = useCallback(
    (event, targetNode) => {
      event.preventDefault();
      event.stopPropagation();
      const movingId = event.dataTransfer.getData("text/plain") || draggingBookmarkId;
      if (!movingId || !targetNode?.id) {
        clearDragState();
        return;
      }
      dispatch(moveBookmarkNode({ movingId, targetId: targetNode.id, position: "before" }));
      clearDragState();
    },
    [clearDragState, dispatch, draggingBookmarkId]
  );

  const dropInsideFolder = useCallback(
    (event, folderNode) => {
      event.preventDefault();
      event.stopPropagation();
      const movingId = event.dataTransfer.getData("text/plain") || draggingBookmarkId;
      if (!movingId || folderNode?.type !== "folder") {
        clearDragState();
        return;
      }
      dispatch(moveBookmarkNode({ movingId, targetId: folderNode.id, position: "inside" }));
      clearDragState();
    },
    [clearDragState, dispatch, draggingBookmarkId]
  );

  const openBookmarkNode = useCallback(
    (targetNode) => {
      if (!targetNode) {
        return;
      }
      if (targetNode.type === "folder") {
        setActiveFolderId(targetNode.id);
        return;
      }
      openBookmark(targetNode);
    },
    [openBookmark]
  );

  const exportBookmarks = () => {
    const format = (window.prompt("Export bookmarks format: html or json", "html") || "html").trim().toLowerCase();
    try {
      const isJson = format === "json";
      const content = isJson ? JSON.stringify(bookmarks, null, 2) : exportBookmarksAsHtml(bookmarks);
      const blob = new Blob([content], { type: isJson ? "application/json" : "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aria-bookmarks-${Date.now()}.${isJson ? "json" : "html"}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to export bookmarks");
    }
  };

  const importBookmarksFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const lowerName = file.name.toLowerCase();
      const isHtml = lowerName.endsWith(".html") || lowerName.endsWith(".htm") || /<!doctype html|<dl/i.test(text);
      let payload = null;
      if (isHtml) {
        payload = parseBookmarksHtml(text);
      } else {
        const parsed = JSON.parse(text);
        payload = parsed?.bookmarks ?? parsed;
      }
      dispatch(importBookmarks(payload));
      const nextRootId = typeof payload?.rootId === "string" ? payload.rootId : bookmarks.rootId;
      setActiveFolderId(nextRootId);
    } catch {
      toast.error("Invalid bookmarks file");
    }
  };

  const renderTabsPanel = () => (
    <>
      <div className={`drag-region ${density.shellPadding}`}>
        <button
          type="button"
          onClick={handleNewTab}
          className={`no-drag group flex ${density.iconBtn} items-center justify-center rounded border border-white/20 bg-white/10 text-white transition hover:bg-white/20`}
          title="New Tab"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>

      <div className={`drag-region scrollbar-thin flex-1 overflow-y-auto ${density.stack}`}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                dispatch(setActiveTab(tab.id));
                setAddressInput(tab.url);
              }}
              className={`no-drag group relative flex ${density.iconBtn} items-center justify-center rounded border transition ${
                isActive
                  ? "border-cyan-300/80 bg-cyan-300/25 text-cyan-50"
                  : "border-white/15 bg-white/5 text-white/70 hover:bg-white/15 hover:text-white"
              }`}
              title={tab.title || tab.url}
            >
              <img
                src={tab.favicon || buildFallbackFavicon(tab.url)}
                alt=""
                className="h-4 w-4 rounded-sm"
                draggable={false}
                onError={(event) => {
                  const fallback = buildFallbackFavicon(tab.url);
                  if (event.currentTarget.src !== fallback) {
                    event.currentTarget.src = fallback;
                  }
                }}
              />
              {(tab.isMuted || tab.isDiscarded) && (
                <span className="pointer-events-none absolute bottom-0 left-0 rounded-tr bg-black/55 px-1 text-[9px] text-white/85">
                  {tab.isMuted ? "M" : ""}
                  {tab.isDiscarded ? "D" : ""}
                </span>
              )}
              {tabs.length > 1 && (
                <span
                  role="button"
                  tabIndex={0}
                  className="no-drag absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded bg-black/55 text-[10px] text-white/90 group-hover:flex"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch(closeTab(tab.id));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      dispatch(closeTab(tab.id));
                    }
                  }}
                >
                  <CloseIcon className="h-3 w-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="border-t border-white/15 p-2 text-[10px] uppercase tracking-[0.2em] text-center text-white/70">
        {tabCountLabel}
      </div>
    </>
  );

  return (
    <aside className={`drag-region h-screen ${showBookmarksPanel ? density.sidebarBookmark : density.sidebarTab}`}>
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json,text/html,.html,.htm"
        className="hidden"
        onChange={importBookmarksFile}
      />

      <div
        className="flex flex-col rounded border border-white/25 bg-slate-900/30 backdrop-blur-md"
        style={{ marginTop: "52px", height: "calc(100% - 52px)" }}
      >
        {showBookmarksPanel ? (
          <Suspense fallback={<div className="p-2 text-xs text-white/70">Loading bookmarks...</div>}>
            <BookmarksPanel
              density={density}
              currentFolder={currentFolder}
              parentFolder={parentFolder}
              bookmarkChildren={bookmarkChildren}
              dropHint={dropHint}
              draggingBookmarkId={draggingBookmarkId}
              importInputRef={importInputRef}
              onBackFolder={() => parentFolder && setActiveFolderId(parentFolder.id)}
              onCreateFolder={createFolder}
              onCreateBookmark={createBookmark}
              onExport={exportBookmarks}
              onDropFolderEnd={(movingId, folderId) => {
                if (movingId && folderId) {
                  dispatch(moveBookmarkNodeToFolderEnd({ movingId, folderId }));
                }
                clearDragState();
              }}
              onDragLeaveFolder={() => {
                setDropHint((prev) => (prev.mode === "end" ? { id: null, mode: null } : prev));
              }}
              onSetDropHint={setDropHint}
              onStartDragNode={startDragNode}
              onClearDragState={clearDragState}
              onDropBeforeNode={dropBeforeNode}
              onDropInsideFolderNode={dropInsideFolder}
              onOpenNode={openBookmarkNode}
              onEditNode={editNode}
              onDeleteNode={deleteNode}
              buildFallbackFavicon={buildFallbackFavicon}
            />
          </Suspense>
        ) : (
          renderTabsPanel()
        )}
      </div>

      <div className="drag-region pointer-events-auto absolute left-0 right-0 top-0 z-20 h-6" />

      <button
        type="button"
        onClick={() => dispatch(setBookmarksPanelVisible(!showBookmarksPanel))}
        className="no-drag absolute z-40 flex items-center justify-center gap-2 rounded border border-white/25 bg-slate-900/45 px-4 text-white/85 shadow-lg backdrop-blur-md transition hover:bg-white/15 hover:text-white"
        style={{
          left: "8px",
          top: "8px",
          height: showBookmarksPanel ? "44px" : "36px",
        }}
        title={showBookmarksPanel ? "Hide Bookmarks" : "Show Bookmarks"}
      >
        {/* <StarIcon className="h-4 w-4" /> */}
        <SidebarToggleIcon className="h-4 w-4" open={showBookmarksPanel} />
      </button>

      <div
        className={`drag-region pointer-events-auto absolute flex items-center ${
          showBookmarksPanel ? density.topWrapBookmark : density.topWrapTab
        } z-30`}
      >
        <div className={`no-drag flex items-center gap-1 rounded border border-white/25 bg-slate-900/35 backdrop-blur-md ${density.group}`}>
          <button
            type="button"
            className={`${density.actionBtn} rounded text-white/80 transition hover:bg-white/15 disabled:opacity-40`}
            title="Back"
            disabled={!activeTab?.canGoBack}
            onClick={() => window.electronAPI?.browserBack?.()}
          >
            <ArrowLeftIcon className="mx-auto h-4 w-4" />
          </button>
          <button
            type="button"
            className={`${density.actionBtn} rounded text-white/80 transition hover:bg-white/15 disabled:opacity-40`}
            title="Forward"
            disabled={!activeTab?.canGoForward}
            onClick={() => window.electronAPI?.browserForward?.()}
          >
            <ArrowRightIcon className="mx-auto h-4 w-4" />
          </button>
          <button
            type="button"
            className={`${density.actionBtn} rounded text-white/80 transition hover:bg-white/15 disabled:opacity-40`}
            title="Reload"
            disabled={!activeTabId}
            onClick={() => window.electronAPI?.browserReload?.()}
          >
            <ReloadIcon className="mx-auto h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleAddressSubmit} className="no-drag flex-1">
          <label className={`flex items-center gap-2 rounded border border-white/25 bg-slate-900/35 text-white shadow-lg backdrop-blur-md ${density.address}`}>
            <SearchIcon className="h-4 w-4 text-white/75" />
            <input
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              className="w-full bg-transparent text-sm text-white placeholder:text-white/55 focus:outline-none"
              placeholder="Search or enter address"
              spellCheck={false}
            />
          </label>
        </form>

        {findOpen && (
          <div className="no-drag flex h-9 min-w-[280px] items-center gap-1 rounded border border-white/25 bg-slate-900/45 px-1.5 backdrop-blur-md">
            <input
              ref={findInputRef}
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  triggerFindNext(!event.shiftKey);
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeFindPanel();
                }
              }}
              className="w-[150px] bg-transparent text-xs text-white placeholder:text-white/55 focus:outline-none"
              placeholder="Find in page"
              spellCheck={false}
            />
            <span className="min-w-[52px] text-center text-[11px] text-white/65">
              {findStats.matches > 0 ? `${findStats.activeMatchOrdinal}/${findStats.matches}` : "0/0"}
            </span>
            <button
              type="button"
              onClick={() => triggerFindNext(false)}
              className="flex h-6 w-6 items-center justify-center rounded text-white/80 transition hover:bg-white/15"
              title="Previous (Ctrl+Shift+F)"
            >
              <ChevronUpIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => triggerFindNext(true)}
              className="flex h-6 w-6 items-center justify-center rounded text-white/80 transition hover:bg-white/15"
              title="Next (Ctrl+F)"
            >
              <ChevronDownIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={closeFindPanel}
              className="rounded px-1.5 py-1 text-[11px] text-white/80 transition hover:bg-white/15"
              title="Close Find"
            >
              X
            </button>
          </div>
        )}

        <div className={`no-drag flex items-center gap-1 rounded border border-white/25 bg-slate-900/35 backdrop-blur-md ${density.quickActions}`}>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setHistoryOpen(true);
                setDownloadsOpen(false);
                setPaletteOpen(false);
              }}
              className={`${density.actionBtn} rounded text-white/80 transition hover:bg-white/15`}
              title="History (Ctrl+H)"
            >
              <HistoryIcon className="mx-auto h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setDownloadsOpen(true);
                setHistoryOpen(false);
                setPaletteOpen(false);
              }}
              className={`${density.actionBtn} rounded text-white/80 transition hover:bg-white/15`}
              title="Downloads (Ctrl+J)"
            >
              <DownloadIcon className="mx-auto h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={bookmarkCurrentTab}
              className={`${density.actionBtn} rounded text-white/80 transition hover:bg-white/15`}
              title="Bookmark Current Tab"
              disabled={!activeTab?.url || activeTab.url === "about:blank"}
            >
              <StarIcon className="mx-auto h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={toggleActiveTabMute}
              className={`${density.actionBtn} rounded transition ${
                activeTab?.isMuted ? "bg-amber-300/20 text-amber-50" : "text-white/80 hover:bg-white/15"
              }`}
              title={activeTab?.isMuted ? "Unmute Tab" : "Mute Tab"}
              disabled={!activeTabId}
            >
              {activeTab?.isMuted ? <VolumeOffIcon className="mx-auto h-4 w-4" /> : <VolumeIcon className="mx-auto h-4 w-4" />}
            </button>
          <button
            type="button"
            onClick={togglePopoutPlayer}
            className={`${density.actionBtn} rounded text-white/80 transition hover:bg-white/15 disabled:opacity-40`}
            title="Pop up player (Ctrl+Space)"
            disabled={!activeTabId}
          >
            <PopoutPlayerIcon className="mx-auto h-4 w-4" />
          </button>
          </div>
        </div>

        <div className={`no-drag flex items-center gap-1 rounded border border-white/25 bg-slate-900/35 backdrop-blur-md ${density.group}`}>
          <button
            type="button"
            onClick={() => window.electronAPI?.toggleAlwaysOnTop?.()}
            className={`${density.actionBtn} rounded transition ${
              windowState.isAlwaysOnTop
                ? "bg-cyan-400/25 text-cyan-100"
                : "text-white/80 hover:bg-white/15"
            }`}
            title="Always On Top"
          >
            {windowState.isAlwaysOnTop ? (
              <AlwaysOnTopOnIcon className="mx-auto h-4 w-4" />
            ) : (
              <AlwaysOnTopOffIcon className="mx-auto h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => window.electronAPI?.minimizeWindow?.()}
            className={`${density.actionBtn} rounded text-white/80 transition hover:bg-white/15`}
            title="Minimize"
          >
            <MinusIcon className="mx-auto h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => window.electronAPI?.toggleMaximizeWindow?.()}
            className={`${density.actionBtn} rounded text-white/80 transition hover:bg-white/15`}
            title={windowState.isMaximized ? "Restore" : "Maximize"}
          >
            <MaximizeIcon className="mx-auto h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => window.electronAPI?.closeWindow?.()}
            className={`${density.actionBtn} rounded text-white/80 transition hover:bg-rose-500/70`}
            title="Close"
          >
            <CloseIcon className="mx-auto h-4 w-4" />
          </button>
        </div>
      </div>

      <Suspense fallback={null}>
        <CommandPalette
          open={paletteOpen}
          density={density}
          mode={paletteMode}
          inputValue={paletteInput}
          suggestions={paletteBookmarks}
          inputRef={paletteInputRef}
          onChange={setPaletteInput}
          onPickSuggestion={handlePalettePickBookmark}
          onClose={() => setPaletteOpen(false)}
          onSubmit={handlePaletteSubmit}
        />
      </Suspense>

      <Suspense fallback={null}>
        <HistoryPanel
          open={historyOpen}
          entries={historyEntries}
          onOpenEntry={openHistoryEntry}
          onClear={() => dispatch(clearHistory())}
          onClose={() => setHistoryOpen(false)}
        />
      </Suspense>

      <Suspense fallback={null}>
        <DownloadsPanel
          open={downloadsOpen}
          items={downloads}
          onOpenFile={openDownloadFile}
          onShowInFolder={showDownloadInFolder}
          onPause={pauseDownload}
          onResume={resumeDownload}
          onCancel={cancelDownload}
          onClear={() => dispatch(clearDownloads())}
          onClose={() => setDownloadsOpen(false)}
        />
      </Suspense>
    </aside>
  );
}
