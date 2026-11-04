import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { GripVertical, ListMusic, Play, Trash2, X } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { cn, formatDuration } from "@/lib/utils";

export function QueuePanel() {
  const {
    queue,
    index,
    queueOpen,
    context,
    jumpTo,
    reorderQueue,
    removeFromQueue,
    clearQueue,
    setQueueOpen,
  } = usePlayerStore();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const draggedIndexRef = useRef<number | null>(null);

  if (!queueOpen) return null;

  const upNext = queue.length - index - 1;
  const canReorder = upNext > 1;

  const endDrag = () => {
    draggedIndexRef.current = null;
    setDraggedIndex(null);
    setDropTarget(null);
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>, itemIndex: number) => {
    draggedIndexRef.current = itemIndex;
    setDraggedIndex(itemIndex);
    setDropTarget(itemIndex);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(itemIndex));
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>, itemIndex: number) => {
    if (draggedIndexRef.current === null || itemIndex <= index) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget((current) => (current === itemIndex ? current : itemIndex));
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, itemIndex: number) => {
    event.preventDefault();
    const fromIndex = draggedIndexRef.current;
    if (fromIndex !== null) reorderQueue(fromIndex, itemIndex);
    endDrag();
  };

  const handleReorderKey = (event: KeyboardEvent<HTMLButtonElement>, itemIndex: number) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const target = event.key === "ArrowUp" ? itemIndex - 1 : itemIndex + 1;
    if (target <= index || target >= queue.length) return;
    event.preventDefault();
    reorderQueue(itemIndex, target);
  };

  return (
    <aside className="fixed bottom-[104px] right-3 top-3 z-40 hidden w-[350px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-800/95 shadow-2xl backdrop-blur-2xl md:flex">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold">Queue</h2>
          <p className="text-[11px] text-white/45">
            {context ? `From ${context}` : "Now playing"} · {upNext} up next
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearQueue}
            className="rounded-full p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
            aria-label="Clear queue"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setQueueOpen(false)}
            className="rounded-full p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
            aria-label="Close queue"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="thin-scrollbar flex-1 overflow-y-auto p-2">
        <p className="px-2 py-2 text-[11px] font-bold uppercase tracking-wider text-white/40">Now playing</p>
        {queue[index] && (
          <div className="flex items-center gap-3 rounded-lg bg-white/[0.06] p-2">
            <img src={queue[index].album.cover_small || queue[index].album.cover} alt="" className="h-10 w-10 rounded" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-primary">{queue[index].title}</p>
              <p className="truncate text-xs text-white/55">{queue[index].artist.name}</p>
            </div>
            <span className="text-[11px] tabular-nums text-white/40">{formatDuration(queue[index].duration)}</span>
          </div>
        )}

        {upNext > 0 && (
          <div className="flex items-center justify-between px-2 pb-1 pt-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">Next up</p>
            {canReorder && <p className="text-[10px] text-white/30">Drag to reorder</p>}
          </div>
        )}
        {queue.map((track, i) => {
          if (i <= index) return null;
          const isDragging = draggedIndex === i;
          const isDropTarget = dropTarget === i && draggedIndex !== null && draggedIndex !== i;
          const imported = track.source === "imported";
          return (
            <div
              key={`${track.id}-${i}`}
              draggable
              onDragStart={(event) => handleDragStart(event, i)}
              onDragOver={(event) => handleDragOver(event, i)}
              onDrop={(event) => handleDrop(event, i)}
              onDragEnd={endDrag}
              className={cn(
                "group flex items-center gap-2 rounded-lg p-2 transition-colors hover:bg-white/[0.06]",
                isDragging && "opacity-40",
                isDropTarget && "bg-white/[0.1] ring-1 ring-inset ring-spotify/40",
              )}
            >
              <button
                type="button"
                aria-label={`Reorder ${track.title}. Use arrow up or down.`}
                title="Drag to reorder"
                onKeyDown={(event) => handleReorderKey(event, i)}
                className="-ml-1 shrink-0 cursor-grab rounded p-1 text-white/25 transition hover:bg-white/10 hover:text-white group-hover:text-white/50 active:cursor-grabbing"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => jumpTo(i)} className="relative shrink-0" aria-label={`Play ${track.title}`}>
                <img src={track.album.cover_small || track.album.cover} alt="" className="h-10 w-10 rounded object-cover" />
                <span className="absolute inset-0 flex items-center justify-center rounded bg-black/50 opacity-0 transition group-hover:opacity-100">
                  <Play className="h-3.5 w-3.5 fill-current" />
                </span>
              </button>
              {imported ? (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{track.title}</p>
                  <p className="truncate text-xs text-white/50">{track.artist.name}</p>
                </div>
              ) : (
                <Link to={`/track/${track.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm">{track.title}</p>
                  <p className="truncate text-xs text-white/50">{track.artist.name}</p>
                </Link>
              )}
              <button
                onClick={() => removeFromQueue(i)}
                className="rounded p-1 text-white/40 opacity-0 transition hover:text-white group-hover:opacity-100"
                aria-label="Remove from queue"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}

        {queue.length <= index + 1 && (
          <div className="mt-8 flex flex-col items-center gap-2 px-6 text-center text-white/40">
            <ListMusic className="h-8 w-8" />
            <p className="text-sm">Nothing else queued</p>
            <p className="text-xs">Pick an album or playlist to keep the music going.</p>
          </div>
        )}
      </div>
    </aside>
  );
}
