import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const EDGE = 12;
const PLAYER_CLEARANCE = 104;
const DESKTOP_QUERY = "(min-width: 768px)";

interface PanelPosition {
  x: number;
  y: number;
}

interface DragState {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  baseLeft: number;
  baseTop: number;
  width: number;
  height: number;
}

function readStoredPosition(key: string): PanelPosition {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { x: 0, y: 0 };
    const parsed = JSON.parse(raw) as Partial<PanelPosition>;
    return {
      x: Number.isFinite(parsed.x) ? Number(parsed.x) : 0,
      y: Number.isFinite(parsed.y) ? Number(parsed.y) : 0,
    };
  } catch {
    return { x: 0, y: 0 };
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isDesktop() {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches;
}

/**
 * Makes a fixed panel draggable by its header while keeping it inside the
 * viewport and clear of the player bar. The position is stored as a translation
 * from the panel's CSS anchor, so responsive right/top positioning still works.
 */
export function useDraggablePanel(storageKey: string, active = true) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<PanelPosition>(() => readStoredPosition(storageKey));
  const positionRef = useRef(position);
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  const applyPosition = useCallback((next: PanelPosition) => {
    positionRef.current = next;
    setPosition(next);
  }, []);

  const constrained = useCallback((next: PanelPosition) => {
    const panel = panelRef.current;
    if (!panel || !isDesktop()) return next;
    const rect = panel.getBoundingClientRect();
    const baseLeft = rect.left - positionRef.current.x;
    const baseTop = rect.top - positionRef.current.y;
    return {
      x: clamp(next.x, EDGE - baseLeft, window.innerWidth - EDGE - rect.width - baseLeft),
      y: clamp(next.y, EDGE - baseTop, window.innerHeight - PLAYER_CLEARANCE - rect.height - baseTop),
    };
  }, []);

  // Keep a stored position valid after viewport changes or when the panel opens.
  useEffect(() => {
    if (!active) return;
    const sync = () => {
      if (!isDesktop()) return;
      applyPosition(constrained(positionRef.current));
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [active, applyPosition, constrained]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(position));
    } catch {
      // A disabled storage API should not break dragging.
    }
  }, [position, storageKey]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDesktop() || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, [role='slider']")) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: positionRef.current.x,
      originY: positionRef.current.y,
      baseLeft: rect.left - positionRef.current.x,
      baseTop: rect.top - positionRef.current.y,
      width: rect.width,
      height: rect.height,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const minX = EDGE - drag.baseLeft;
    const maxX = window.innerWidth - EDGE - drag.width - drag.baseLeft;
    const minY = EDGE - drag.baseTop;
    const maxY = window.innerHeight - PLAYER_CLEARANCE - drag.height - drag.baseTop;
    applyPosition({
      x: clamp(drag.originX + event.clientX - drag.startX, minX, maxX),
      y: clamp(drag.originY + event.clientY - drag.startY, minY, maxY),
    });
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return {
    panelRef,
    position,
    dragging,
    dragHandleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}
