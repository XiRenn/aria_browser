import React, { memo } from "react";
import {
  ChevronLeftIcon,
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
  isDropBefore,
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
      className={`group flex items-center gap-1 rounded border px-1.5 py-1 ${
        isDropBefore ? "border-cyan-300/80 bg-cyan-300/20" : "border-white/15 bg-white/5"
      }`}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left text-white/90"
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
          <FolderIcon className="h-4 w-4 shrink-0 text-white/80" />
        ) : (
          <img
            src={buildFallbackFavicon(node.url)}
            alt=""
            className="h-4 w-4 shrink-0 rounded-sm"
            draggable={false}
          />
        )}
        <span className="truncate text-xs">{isFolder ? node.name : node.title}</span>
      </button>

      <button
        type="button"
        className="hidden h-6 w-6 rounded text-white/70 transition hover:bg-white/15 hover:text-white group-hover:block"
        onClick={() => onEdit(node)}
        title="Edit"
      >
        <EditIcon className="mx-auto h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="hidden h-6 w-6 rounded text-white/70 transition hover:bg-rose-500/70 hover:text-white group-hover:block"
        onClick={() => onDelete(node)}
        title="Delete"
      >
        <TrashIcon className="mx-auto h-3.5 w-3.5" />
      </button>
    </div>
  );
});

export default function BookmarksPanel({
  density,
  currentFolder,
  parentFolder,
  bookmarkChildren,
  dropHint,
  draggingBookmarkId,
  importInputRef,
  onBackFolder,
  onCreateFolder,
  onCreateBookmark,
  onExport,
  onDropFolderEnd,
  onDragLeaveFolder,
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
  return (
    <>
      <div className="no-drag flex items-center justify-between border-b border-white/15 p-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`${density.actionBtn} rounded text-white/80 transition hover:bg-white/15 disabled:opacity-35`}
            disabled={!parentFolder}
            onClick={onBackFolder}
            title="Back"
          >
            <ChevronLeftIcon className="mx-auto h-4 w-4" />
          </button>
          <span className="max-w-[120px] truncate text-xs font-medium text-white/90">{currentFolder?.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`${density.actionBtn} rounded text-white/80 transition hover:bg-white/15`}
            onClick={onCreateFolder}
            title="Create Folder"
          >
            <FolderPlusIcon className="mx-auto h-4 w-4" />
          </button>
          <button
            type="button"
            className={`${density.actionBtn} rounded text-white/80 transition hover:bg-white/15`}
            onClick={onCreateBookmark}
            title="Create Bookmark"
          >
            <StarIcon className="mx-auto h-4 w-4" />
          </button>
          <button
            type="button"
            className={`${density.actionBtn} rounded text-white/80 transition hover:bg-white/15`}
            onClick={() => importInputRef.current?.click()}
            title="Import"
          >
            <UploadIcon className="mx-auto h-4 w-4" />
          </button>
          <button
            type="button"
            className={`${density.actionBtn} rounded text-white/80 transition hover:bg-white/15`}
            onClick={onExport}
            title="Export"
          >
            <DownloadIcon className="mx-auto h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        className="no-drag flex-1 space-y-1 overflow-y-auto p-2"
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          onSetDropHint({ id: currentFolder.id, mode: "end" });
        }}
        onDrop={(event) => {
          const movingId = event.dataTransfer.getData("text/plain") || draggingBookmarkId;
          onDropFolderEnd(movingId, currentFolder?.id);
        }}
        onDragLeave={onDragLeaveFolder}
      >
        {bookmarkChildren.length === 0 && (
          <div className="rounded border border-white/10 bg-white/5 px-2 py-3 text-xs text-white/70">
            Drag bookmarks here to move into this folder.
          </div>
        )}

        {bookmarkChildren.map((node) => (
          <BookmarkNodeRow
            key={node.id}
            node={node}
            isDropBefore={dropHint.id === node.id && dropHint.mode === "before"}
            onOpen={onOpenNode}
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
          <div className="rounded border border-cyan-300/80 bg-cyan-300/15 px-2 py-1 text-[11px] text-cyan-100">
            Drop here to move at end of this folder
          </div>
        )}
      </div>
    </>
  );
}
