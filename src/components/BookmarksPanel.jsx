import React, { memo, useEffect, useMemo, useState } from "react";
import {
  ChevronDownIcon,
  DownloadIcon,
  EditIcon,
  FolderIcon,
  FolderPlusIcon,
  StarIcon,
  TrashIcon,
  UploadIcon,
} from "./icons";

const BookmarkNodeRow = memo(function BookmarkNodeRow({
  node,
  depth,
  isSelectedFolder,
  isExpanded,
  isDropBefore,
  onToggleFolder,
  onOpen,
  onEdit,
  onDelete,
  onDragStartNode,
  onDragEndNode,
  onDropBeforeNode,
  onDropInsideFolderNode,
  setDropHint,
  buildFallbackFavicon,
}) {
  const isFolder = node.type === "folder";
  const rowIndent = depth * 12;

  return (
    <div
      draggable
      onDragStart={(event) => onDragStartNode(event, node.id)}
      onDragEnd={onDragEndNode}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropHint({ id: node.id, mode: "before" });
      }}
      onDrop={(event) => onDropBeforeNode(event, node)}
      className={`group relative flex items-center gap-1.5 rounded-none border px-1.5 py-1 ${
        isDropBefore ? "border-cyan-300/80 bg-cyan-300/20" : "border-white/15 bg-white/5"
      }`}
      style={{ paddingLeft: `${rowIndent + 6}px` }}
    >
      <button
        type="button"
        className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-none text-white/70 transition hover:bg-white/15"
        onClick={() => isFolder && onToggleFolder(node.id)}
        title={isFolder ? (isExpanded ? "Collapse folder" : "Expand folder") : ""}
        disabled={!isFolder}
      >
        {isFolder ? (
          <ChevronDownIcon className={`h-3.5 w-3.5 transition ${isExpanded ? "" : "-rotate-90"}`} />
        ) : (
          <span className="h-3.5 w-3.5" />
        )}
      </button>

      <button
        type="button"
        className={`flex min-h-7 min-w-0 flex-1 items-center gap-1.5 rounded-none pl-1 pr-1 text-left transition-[padding-right] duration-150 group-hover:pr-14 group-focus-within:pr-14 ${
          isSelectedFolder ? "bg-cyan-300/20 text-cyan-50" : "text-white/90"
        }`}
        onClick={() => onOpen(node)}
        onDragOver={(event) => {
          if (!isFolder) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          setDropHint({ id: node.id, mode: "inside" });
        }}
        onDrop={(event) => {
          if (!isFolder) {
            return;
          }
          onDropInsideFolderNode(event, node);
        }}
        title={isFolder ? node.name : node.url}
      >
        {isFolder ? (
          <FolderIcon className={`h-3.5 w-3.5 shrink-0 ${isSelectedFolder ? "text-cyan-100" : "text-white/80"}`} />
        ) : (
          <img
            src={buildFallbackFavicon(node.url)}
            alt=""
            className="h-3.5 w-3.5 shrink-0 rounded-none"
            draggable={false}
          />
        )}
        <span className="truncate text-[11px] leading-4">{isFolder ? node.name : node.title}</span>
      </button>

      <div className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
        <button
          type="button"
          className="h-6 w-6 rounded-none text-white/70 transition hover:bg-white/15 hover:text-white"
          onClick={() => onEdit(node)}
          title="Edit"
        >
          <EditIcon className="mx-auto h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="h-6 w-6 rounded-none text-white/70 transition hover:bg-rose-500/70 hover:text-white"
          onClick={() => onDelete(node)}
          title="Delete"
        >
          <TrashIcon className="mx-auto h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
});

export default function BookmarksPanel({
  density,
  bookmarks,
  selectedFolderId,
  dropHint,
  draggingBookmarkId,
  importInputRef,
  onCreateFolder,
  onCreateBookmark,
  onExport,
  onDropFolderEnd,
  onSetDropHint,
  onStartDragNode,
  onClearDragState,
  onDropBeforeNode,
  onDropInsideFolderNode,
  onOpenNode,
  onEditNode,
  onDeleteNode,
  buildFallbackFavicon,
}) {
  const rootId = bookmarks?.rootId;
  const nodes = bookmarks?.nodes ?? {};
  const selectedFolder = nodes[selectedFolderId];
  const rootFolder = nodes[rootId];

  const folderIds = useMemo(
    () => Object.values(nodes).filter((node) => node?.type === "folder").map((node) => node.id),
    [nodes]
  );
  const [expandedFolders, setExpandedFolders] = useState(() => (rootId ? { [rootId]: true } : {}));

  useEffect(() => {
    setExpandedFolders((prev) => {
      const next = {};
      for (const id of folderIds) {
        if (prev[id] || id === rootId || id === selectedFolderId) {
          next[id] = true;
        }
      }
      return next;
    });
  }, [folderIds, rootId, selectedFolderId]);

  const isExpanded = (folderId) => Boolean(expandedFolders[folderId]);
  const toggleFolder = (folderId) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const treeRows = useMemo(() => {
    if (!rootFolder || rootFolder.type !== "folder") {
      return [];
    }

    const rows = [];
    const walk = (folder, depth) => {
      for (const childId of folder.children ?? []) {
        const node = nodes[childId];
        if (!node) {
          continue;
        }
        rows.push({ node, depth });
        if (node.type === "folder" && isExpanded(node.id)) {
          walk(node, depth + 1);
        }
      }
    };
    walk(rootFolder, 0);
    return rows;
  }, [nodes, rootFolder, expandedFolders]);

  return (
    <>
      <div className="drag-region no-drag-children flex items-center justify-between border-b border-white/15 px-1.5 py-1.5">
        <div className="flex items-center gap-1 no-drag">
          <span className="max-w-[140px] ml-2 truncate text-[12px] font-medium text-white/90">
            {selectedFolder?.type === "folder" ? selectedFolder.name : "Bookmarks"}
          </span>
        </div>
        <div className="flex items-center gap-1 no-drag">
          <button
            type="button"
            className={`${density.actionBtn} rounded-none text-white/80 transition hover:bg-white/15`}
            onClick={onCreateFolder}
            title="New Folder"
          >
            <FolderPlusIcon className="mx-auto h-4 w-4" />
          </button>
          <button
            type="button"
            className={`${density.actionBtn} rounded-none text-white/80 transition hover:bg-white/15`}
            onClick={onCreateBookmark}
            title="New Bookmark"
          >
            <StarIcon className="mx-auto h-4 w-4" />
          </button>
          <button
            type="button"
            className={`${density.actionBtn} rounded-none text-white/80 transition hover:bg-white/15`}
            onClick={() => importInputRef.current?.click()}
            title="Import"
          >
            <UploadIcon className="mx-auto h-4 w-4" />
          </button>
          <button
            type="button"
            className={`${density.actionBtn} rounded-none text-white/80 transition hover:bg-white/15`}
            onClick={onExport}
            title="Export"
          >
            <DownloadIcon className="mx-auto h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        className="no-drag flex-1 space-y-0.5 overflow-y-auto p-1.5"
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          onSetDropHint({ id: selectedFolderId, mode: "end" });
        }}
        onDrop={(event) => {
          const movingId = event.dataTransfer.getData("text/plain") || draggingBookmarkId;
          onDropFolderEnd(movingId, selectedFolderId);
        }}
        onDragLeave={() => {
          if (dropHint.mode === "end") {
            onSetDropHint({ id: null, mode: null });
          }
        }}
      >
        {treeRows.length === 0 && (
          <div className="rounded-none border border-white/10 bg-white/5 px-2 py-3 text-xs text-white/70">
            Drag bookmarks here to move into this folder.
          </div>
        )}

        {treeRows.map(({ node, depth }) => (
          <BookmarkNodeRow
            key={node.id}
            node={node}
            depth={depth}
            isSelectedFolder={node.type === "folder" && node.id === selectedFolderId}
            isExpanded={node.type === "folder" ? isExpanded(node.id) : false}
            isDropBefore={dropHint.id === node.id && dropHint.mode === "before"}
            onToggleFolder={toggleFolder}
            onOpen={(targetNode) => {
              if (targetNode?.type === "folder") {
                setExpandedFolders((prev) => ({ ...prev, [targetNode.id]: true }));
              }
              onOpenNode(targetNode);
            }}
            onEdit={onEditNode}
            onDelete={onDeleteNode}
            onDragStartNode={onStartDragNode}
            onDragEndNode={onClearDragState}
            onDropBeforeNode={onDropBeforeNode}
            onDropInsideFolderNode={onDropInsideFolderNode}
            setDropHint={onSetDropHint}
            buildFallbackFavicon={buildFallbackFavicon}
          />
        ))}
        {dropHint.mode === "end" && (
          <div className="rounded-none border border-cyan-300/80 bg-cyan-300/15 px-2 py-1 text-[11px] text-cyan-100">
            Drop here to move at end of this folder
          </div>
        )}
      </div>
    </>
  );
}
