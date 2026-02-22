import { configureStore, createSlice, nanoid } from "@reduxjs/toolkit";

const STORAGE_KEY = "aria.session.v1";
const BOOKMARK_ROOT_ID = "bookmark-root";

const makeTab = (url = "about:blank") => ({
  id: nanoid(),
  title: "New Tab",
  url,
  favicon: "",
  canGoBack: false,
  canGoForward: false,
  isMuted: false,
  isDiscarded: false,
  createdAt: Date.now(),
});

const makeHistoryEntry = ({ tabId, url, title }) => ({
  id: nanoid(),
  tabId: typeof tabId === "string" ? tabId : "",
  url,
  title: title || "Untitled",
  at: Date.now(),
});

const makeFolder = ({ name, parentId }) => ({
  id: nanoid(),
  type: "folder",
  name: name || "New Folder",
  parentId,
  children: [],
  createdAt: Date.now(),
});

const makeBookmark = ({ title, url, parentId }) => ({
  id: nanoid(),
  type: "bookmark",
  title: title || "Untitled",
  url: url || "https://www.google.com",
  parentId,
  createdAt: Date.now(),
});

function sanitizeBookmarkUrl(input) {
  if (!input || typeof input !== "string") {
    return "https://www.google.com";
  }
  const raw = input.trim();
  if (!raw) {
    return "https://www.google.com";
  }

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
  }
}

function createDefaultBookmarks() {
  return {
    rootId: BOOKMARK_ROOT_ID,
    nodes: {
      [BOOKMARK_ROOT_ID]: {
        id: BOOKMARK_ROOT_ID,
        type: "folder",
        name: "Bookmarks",
        parentId: null,
        children: [],
      },
    },
  };
}

function normalizeBookmarks(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.rootId !== "string") {
    return createDefaultBookmarks();
  }

  const rootNode = raw.nodes?.[raw.rootId];
  if (!rootNode || rootNode.type !== "folder") {
    return createDefaultBookmarks();
  }

  const nodes = {};

  for (const [id, node] of Object.entries(raw.nodes || {})) {
    if (!node || typeof node !== "object") {
      continue;
    }

    if (node.type === "folder") {
      nodes[id] = {
        id,
        type: "folder",
        name: typeof node.name === "string" && node.name.trim() ? node.name.trim() : "Folder",
        parentId: typeof node.parentId === "string" ? node.parentId : null,
        children: Array.isArray(node.children) ? node.children.filter((childId) => typeof childId === "string") : [],
        createdAt: Number.isFinite(node.createdAt) ? node.createdAt : Date.now(),
      };
    }

    if (node.type === "bookmark") {
      nodes[id] = {
        id,
        type: "bookmark",
        title: typeof node.title === "string" && node.title.trim() ? node.title.trim() : "Untitled",
        url: sanitizeBookmarkUrl(node.url),
        parentId: typeof node.parentId === "string" ? node.parentId : raw.rootId,
        createdAt: Number.isFinite(node.createdAt) ? node.createdAt : Date.now(),
      };
    }
  }

  if (!nodes[raw.rootId] || nodes[raw.rootId].type !== "folder") {
    return createDefaultBookmarks();
  }

  // Clean parent/children references.
  for (const node of Object.values(nodes)) {
    if (node.type === "folder") {
      node.children = node.children.filter((childId) => nodes[childId]);
    }
  }

  for (const node of Object.values(nodes)) {
    if (node.id === raw.rootId) {
      continue;
    }

    const parent = nodes[node.parentId];
    if (!parent || parent.type !== "folder") {
      node.parentId = raw.rootId;
      nodes[raw.rootId].children.push(node.id);
      continue;
    }

    if (!parent.children.includes(node.id)) {
      parent.children.push(node.id);
    }
  }

  return {
    rootId: raw.rootId,
    nodes,
  };
}

function removeBookmarkNodeRecursively(bookmarks, nodeId) {
  const node = bookmarks.nodes[nodeId];
  if (!node || nodeId === bookmarks.rootId) {
    return;
  }

  const parent = bookmarks.nodes[node.parentId];
  if (parent?.type === "folder") {
    parent.children = parent.children.filter((childId) => childId !== nodeId);
  }

  if (node.type === "folder") {
    for (const childId of [...node.children]) {
      removeBookmarkNodeRecursively(bookmarks, childId);
    }
  }

  delete bookmarks.nodes[nodeId];
}

function isFolderDescendant(bookmarks, possibleChildId, folderId) {
  if (possibleChildId === folderId) {
    return true;
  }

  const folder = bookmarks.nodes[folderId];
  if (!folder || folder.type !== "folder") {
    return false;
  }

  for (const childId of folder.children) {
    if (childId === possibleChildId) {
      return true;
    }
    const child = bookmarks.nodes[childId];
    if (child?.type === "folder" && isFolderDescendant(bookmarks, possibleChildId, child.id)) {
      return true;
    }
  }

  return false;
}

function loadSession() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    const hydratedTabs = [];

    const activeTabId = null;

    const navigationHistory = Array.isArray(parsed.navigationHistory)
      ? parsed.navigationHistory.slice(-1000)
      : [];

    const recentlyClosed = Array.isArray(parsed.recentlyClosed)
      ? parsed.recentlyClosed.slice(0, 20)
      : [];
    const history = Array.isArray(parsed.history)
      ? parsed.history
          .map((entry) => ({
            id: typeof entry?.id === "string" ? entry.id : nanoid(),
            tabId: typeof entry?.tabId === "string" ? entry.tabId : "",
            url: typeof entry?.url === "string" ? entry.url : "",
            title: typeof entry?.title === "string" ? entry.title : "Untitled",
            at: Number.isFinite(entry?.at) ? entry.at : Date.now(),
          }))
          .filter((entry) => entry.url)
          .slice(-2000)
      : [];
    const downloads = Array.isArray(parsed.downloads)
      ? parsed.downloads
          .map((item) => ({
            id: typeof item?.id === "string" ? item.id : nanoid(),
            filename: typeof item?.filename === "string" ? item.filename : "download",
            url: typeof item?.url === "string" ? item.url : "",
            savePath: typeof item?.savePath === "string" ? item.savePath : "",
            status: typeof item?.status === "string" ? item.status : "progressing",
            receivedBytes: Number.isFinite(item?.receivedBytes) ? item.receivedBytes : 0,
            totalBytes: Number.isFinite(item?.totalBytes) ? item.totalBytes : 0,
            startedAt: Number.isFinite(item?.startedAt) ? item.startedAt : Date.now(),
            updatedAt: Number.isFinite(item?.updatedAt) ? item.updatedAt : Date.now(),
          }))
          .slice(0, 200)
      : [];

    return {
      tabs: hydratedTabs,
      activeTabId,
      navigationHistory,
      recentlyClosed,
      history,
      downloads,
      bookmarks: normalizeBookmarks(parsed.bookmarks),
      showBookmarksPanel: Boolean(parsed.showBookmarksPanel),
    };
  } catch {
    return null;
  }
}

const initialState =
  loadSession() ?? {
    tabs: [],
    activeTabId: null,
    recentlyClosed: [],
    history: [],
    downloads: [],
    navigationHistory: [],
    bookmarks: createDefaultBookmarks(),
    showBookmarksPanel: false,
  };

const tabsSlice = createSlice({
  name: "tabs",
  initialState,
  reducers: {
    newTab: {
      reducer(state, action) {
        state.tabs.push(action.payload);
        state.activeTabId = action.payload.id;
        action.payload.isDiscarded = false;
        state.navigationHistory.push({
          tabId: action.payload.id,
          url: action.payload.url,
          at: Date.now(),
        });
        if (action.payload.url && action.payload.url !== "about:blank") {
          state.history.push(
            makeHistoryEntry({
              tabId: action.payload.id,
              url: action.payload.url,
              title: action.payload.title,
            })
          );
        }
      },
      prepare(url) {
        return { payload: makeTab(url) };
      },
    },
    newTabInBackground: {
      reducer(state, action) {
        state.tabs.push(action.payload);
        action.payload.isDiscarded = false;
        state.navigationHistory.push({
          tabId: action.payload.id,
          url: action.payload.url,
          at: Date.now(),
        });
        if (action.payload.url && action.payload.url !== "about:blank") {
          state.history.push(
            makeHistoryEntry({
              tabId: action.payload.id,
              url: action.payload.url,
              title: action.payload.title,
            })
          );
        }
      },
      prepare(url) {
        return { payload: makeTab(url) };
      },
    },
    closeTab(state, action) {
      const tabId = action.payload;
      const closingIndex = state.tabs.findIndex((t) => t.id === tabId);
      if (closingIndex === -1) {
        return;
      }

      const closingTab = state.tabs[closingIndex];
      state.recentlyClosed = [
        {
          ...closingTab,
          closedAt: Date.now(),
          closedFromIndex: closingIndex,
        },
        ...(state.recentlyClosed ?? []),
      ].slice(0, 20);

      state.tabs.splice(closingIndex, 1);

      if (state.tabs.length === 0) {
        state.activeTabId = null;
        return;
      }

      if (state.activeTabId === tabId) {
        const nextIndex = Math.max(0, closingIndex - 1);
        state.activeTabId = state.tabs[nextIndex].id;
      }
    },
    reopenLastClosedTab(state) {
      const [lastClosed, ...rest] = state.recentlyClosed ?? [];
      if (!lastClosed) {
        return;
      }

      state.recentlyClosed = rest;
      const reopenTab = {
        id: nanoid(),
        title: lastClosed.title || "New Tab",
        url: lastClosed.url || "about:blank",
        favicon: lastClosed.favicon || "",
        canGoBack: false,
        canGoForward: false,
        isMuted: Boolean(lastClosed.isMuted),
        isDiscarded: false,
        createdAt: Date.now(),
      };

      const insertIndex = Number.isFinite(lastClosed.closedFromIndex)
        ? Math.max(0, Math.min(lastClosed.closedFromIndex, state.tabs.length))
        : state.tabs.length;

      state.tabs.splice(insertIndex, 0, reopenTab);
      state.activeTabId = reopenTab.id;

      state.navigationHistory.push({
        tabId: reopenTab.id,
        url: reopenTab.url,
        at: Date.now(),
      });
      if (reopenTab.url && reopenTab.url !== "about:blank") {
        state.history.push(
          makeHistoryEntry({
            tabId: reopenTab.id,
            url: reopenTab.url,
            title: reopenTab.title,
          })
        );
      }
    },
    setActiveTab(state, action) {
      const tabId = action.payload;
      if (state.tabs.some((t) => t.id === tabId)) {
        state.activeTabId = tabId;
      }
    },
    setTabTitle(state, action) {
      const { tabId, title } = action.payload;
      const tab = state.tabs.find((t) => t.id === tabId);
      if (tab && typeof title === "string") {
        tab.title = title;
      }
    },
    navigateTo(state, action) {
      const { tabId, url } = action.payload;
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab || typeof url !== "string") {
        return;
      }

      if (tab.url === url) {
        return;
      }

      tab.url = url;
      tab.isDiscarded = false;
      const last = state.navigationHistory[state.navigationHistory.length - 1];
      if (!last || last.tabId !== tabId || last.url !== url) {
        state.navigationHistory.push({
          tabId,
          url,
          at: Date.now(),
        });
      }
      if (url && url !== "about:blank") {
        state.history.push(
          makeHistoryEntry({
            tabId,
            url,
            title: tab.title,
          })
        );
      }
    },
    patchNavigationState(state, action) {
      const { tabId, canGoBack, canGoForward } = action.payload;
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) {
        return;
      }

      if (typeof canGoBack === "boolean") {
        tab.canGoBack = canGoBack;
      }
      if (typeof canGoForward === "boolean") {
        tab.canGoForward = canGoForward;
      }
    },
    syncTabFromWeb(state, action) {
      const { tabId, url, title, favicon, canGoBack, canGoForward, isMuted } = action.payload;
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) {
        return;
      }

      if (typeof title === "string" && title.trim()) {
        tab.title = title.trim();
      }

      if (typeof url === "string" && url && tab.url !== url) {
        tab.url = url;
        tab.isDiscarded = false;
        const last = state.navigationHistory[state.navigationHistory.length - 1];
        if (!last || last.tabId !== tabId || last.url !== url) {
          state.navigationHistory.push({
            tabId,
            url,
            at: Date.now(),
          });
        }
        if (url !== "about:blank") {
          state.history.push(
            makeHistoryEntry({
              tabId,
              url,
              title: typeof title === "string" && title.trim() ? title.trim() : tab.title,
            })
          );
        }
      }

      if (typeof canGoBack === "boolean") {
        tab.canGoBack = canGoBack;
      }
      if (typeof canGoForward === "boolean") {
        tab.canGoForward = canGoForward;
      }
      if (typeof favicon === "string") {
        tab.favicon = favicon;
      }
      if (typeof isMuted === "boolean") {
        tab.isMuted = isMuted;
      }
    },
    setTabMuted(state, action) {
      const { tabId, muted } = action.payload ?? {};
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab || typeof muted !== "boolean") {
        return;
      }
      tab.isMuted = muted;
    },
    setTabDiscarded(state, action) {
      const { tabId, discarded } = action.payload ?? {};
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab || typeof discarded !== "boolean") {
        return;
      }
      tab.isDiscarded = discarded;
    },
    upsertDownload(state, action) {
      const item = action.payload ?? {};
      if (typeof item.id !== "string" || !item.id) {
        return;
      }

      const idx = state.downloads.findIndex((d) => d.id === item.id);
      const next = {
        id: item.id,
        filename: typeof item.filename === "string" ? item.filename : "download",
        url: typeof item.url === "string" ? item.url : "",
        savePath: typeof item.savePath === "string" ? item.savePath : "",
        status: typeof item.status === "string" ? item.status : "progressing",
        receivedBytes: Number.isFinite(item.receivedBytes) ? item.receivedBytes : 0,
        totalBytes: Number.isFinite(item.totalBytes) ? item.totalBytes : 0,
        startedAt: Number.isFinite(item.startedAt) ? item.startedAt : Date.now(),
        updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
      };

      if (idx >= 0) {
        state.downloads[idx] = { ...state.downloads[idx], ...next };
      } else {
        state.downloads.unshift(next);
      }

      if (state.downloads.length > 200) {
        state.downloads = state.downloads.slice(0, 200);
      }
    },
    clearDownloads(state) {
      state.downloads = [];
    },
    clearHistory(state) {
      state.history = [];
    },

    setBookmarksPanelVisible(state, action) {
      state.showBookmarksPanel = Boolean(action.payload);
    },
    toggleBookmarksPanel(state) {
      state.showBookmarksPanel = !state.showBookmarksPanel;
    },
    addBookmarkFolder(state, action) {
      const parentId =
        typeof action.payload?.parentId === "string" ? action.payload.parentId : state.bookmarks.rootId;
      const parent = state.bookmarks.nodes[parentId];
      if (!parent || parent.type !== "folder") {
        return;
      }

      const folder = makeFolder({
        name: typeof action.payload?.name === "string" ? action.payload.name.trim() : "New Folder",
        parentId,
      });

      state.bookmarks.nodes[folder.id] = folder;
      parent.children.push(folder.id);
    },
    addBookmarkItem(state, action) {
      const parentId =
        typeof action.payload?.parentId === "string" ? action.payload.parentId : state.bookmarks.rootId;
      const parent = state.bookmarks.nodes[parentId];
      if (!parent || parent.type !== "folder") {
        return;
      }

      const item = makeBookmark({
        title: typeof action.payload?.title === "string" ? action.payload.title.trim() : "Untitled",
        url: sanitizeBookmarkUrl(action.payload?.url),
        parentId,
      });

      state.bookmarks.nodes[item.id] = item;
      parent.children.push(item.id);
    },
    editBookmarkNode(state, action) {
      const { id } = action.payload ?? {};
      const node = state.bookmarks.nodes[id];
      if (!node) {
        return;
      }

      if (node.type === "folder") {
        const name = typeof action.payload?.name === "string" ? action.payload.name.trim() : "";
        if (name) {
          node.name = name;
        }
        return;
      }

      if (node.type === "bookmark") {
        const title = typeof action.payload?.title === "string" ? action.payload.title.trim() : "";
        const url = typeof action.payload?.url === "string" ? action.payload.url : "";

        if (title) {
          node.title = title;
        }
        if (url) {
          node.url = sanitizeBookmarkUrl(url);
        }
      }
    },
    deleteBookmarkNode(state, action) {
      const id = action.payload;
      if (typeof id !== "string") {
        return;
      }
      removeBookmarkNodeRecursively(state.bookmarks, id);
    },
    importBookmarks(state, action) {
      const normalized = normalizeBookmarks(action.payload);
      state.bookmarks = normalized;
    },
    moveBookmarkNode(state, action) {
      const movingId = action.payload?.movingId;
      const targetId = action.payload?.targetId;
      const position = action.payload?.position === "inside" ? "inside" : "before";
      const moving = state.bookmarks.nodes[movingId];
      const target = state.bookmarks.nodes[targetId];

      if (!moving || !target || movingId === state.bookmarks.rootId || movingId === targetId) {
        return;
      }

      const sourceParent = state.bookmarks.nodes[moving.parentId];
      if (!sourceParent || sourceParent.type !== "folder") {
        return;
      }

      let nextParent = null;
      let insertIndex = 0;

      if (position === "inside") {
        if (target.type !== "folder") {
          return;
        }
        nextParent = target;
        insertIndex = nextParent.children.length;
      } else {
        const targetParent = state.bookmarks.nodes[target.parentId];
        if (!targetParent || targetParent.type !== "folder") {
          return;
        }
        nextParent = targetParent;
        insertIndex = targetParent.children.indexOf(target.id);
        if (insertIndex < 0) {
          insertIndex = targetParent.children.length;
        }
      }

      if (moving.type === "folder") {
        if (nextParent.id === moving.id) {
          return;
        }
        if (isFolderDescendant(state.bookmarks, nextParent.id, moving.id)) {
          return;
        }
      }

      sourceParent.children = sourceParent.children.filter((id) => id !== moving.id);
      moving.parentId = nextParent.id;

      const sanitizedChildren = nextParent.children.filter((id) => id !== moving.id);
      const boundedIndex = Math.max(0, Math.min(insertIndex, sanitizedChildren.length));
      sanitizedChildren.splice(boundedIndex, 0, moving.id);
      nextParent.children = sanitizedChildren;
    },
    moveBookmarkNodeToFolderEnd(state, action) {
      const movingId = action.payload?.movingId;
      const folderId = action.payload?.folderId;
      const moving = state.bookmarks.nodes[movingId];
      const folder = state.bookmarks.nodes[folderId];

      if (!moving || !folder || folder.type !== "folder" || movingId === state.bookmarks.rootId) {
        return;
      }

      if (moving.type === "folder" && isFolderDescendant(state.bookmarks, folder.id, moving.id)) {
        return;
      }

      const sourceParent = state.bookmarks.nodes[moving.parentId];
      if (!sourceParent || sourceParent.type !== "folder") {
        return;
      }

      sourceParent.children = sourceParent.children.filter((id) => id !== moving.id);
      moving.parentId = folder.id;
      folder.children = [...folder.children.filter((id) => id !== moving.id), moving.id];
    },
  },
});

export const {
  newTab,
  newTabInBackground,
  closeTab,
  reopenLastClosedTab,
  setActiveTab,
  setTabTitle,
  navigateTo,
  patchNavigationState,
  syncTabFromWeb,
  setTabMuted,
  setTabDiscarded,
  upsertDownload,
  clearDownloads,
  clearHistory,
  setBookmarksPanelVisible,
  toggleBookmarksPanel,
  addBookmarkFolder,
  addBookmarkItem,
  editBookmarkNode,
  deleteBookmarkNode,
  importBookmarks,
  moveBookmarkNode,
  moveBookmarkNodeToFolderEnd,
} = tabsSlice.actions;

export const store = configureStore({
  reducer: {
    tabs: tabsSlice.reducer,
  },
});

let lastSynced = "";
let lastPersisted = "";
let persistTimer = null;

function persistNow(state) {
  if (typeof window === "undefined") {
    return;
  }

  const serializedState = JSON.stringify(state);
  if (serializedState === lastPersisted) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, serializedState);
  lastPersisted = serializedState;
}

function schedulePersist(state) {
  if (typeof window === "undefined") {
    return;
  }

  const serializedState = JSON.stringify(state);
  if (serializedState === lastPersisted) {
    return;
  }

  if (persistTimer) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    persistNow(state);
    persistTimer = null;
  }, 250);
}

store.subscribe(() => {
  const state = store.getState().tabs;
  const payload = {
    tabs: state.tabs.map((t) => ({ id: t.id, url: t.url, title: t.title, isMuted: Boolean(t.isMuted) })),
    activeTabId: state.activeTabId,
  };

  const serialized = JSON.stringify(payload);
  if (serialized !== lastSynced) {
    lastSynced = serialized;
    if (typeof window !== "undefined" && window.electronAPI?.syncTabsState) {
      window.electronAPI.syncTabsState(payload);
    }
  }

  schedulePersist(state);
});

if (typeof window !== "undefined") {
  const flushPersist = () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    persistNow(store.getState().tabs);
  };

  window.addEventListener("beforeunload", flushPersist);
  window.addEventListener("pagehide", flushPersist);
}

export const selectTabsState = (state) => state.tabs;
export const selectTabs = (state) => state.tabs.tabs;
export const selectActiveTabId = (state) => state.tabs.activeTabId;
export const selectRecentlyClosedCount = (state) => (state.tabs.recentlyClosed ?? []).length;
export const selectActiveTab = (state) =>
  state.tabs.tabs.find((t) => t.id === state.tabs.activeTabId) ?? null;
export const selectBookmarks = (state) => state.tabs.bookmarks;
export const selectShowBookmarksPanel = (state) => Boolean(state.tabs.showBookmarksPanel);
export const selectHistoryEntries = (state) => (state.tabs.history ?? []).slice().reverse();
export const selectDownloads = (state) => state.tabs.downloads ?? [];
