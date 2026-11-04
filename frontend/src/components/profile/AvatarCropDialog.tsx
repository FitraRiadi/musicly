import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ImageUp, Move, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const VIEWPORT = 288;
const OUTPUT = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

interface AvatarCropDialogProps {
  file: File | null;
  onCancel: () => void;
  onConfirm: (file: File, previewUrl: string) => void;
}

interface Offset {
  x: number;
  y: number;
}

export function AvatarCropDialog({ file, onCancel, onConfirm }: AvatarCropDialogProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [viewportSize, setViewportSize] = useState(VIEWPORT);
  const circleRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    if (!file) {
      setImage(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.src = url;
    return () => {
      img.onload = null;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    if (!file) return;
    const node = circleRef.current;
    if (!node) return;
    const update = () => setViewportSize(Math.max(1, Math.round(node.clientWidth) || VIEWPORT));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [file]);

  const baseScale = image ? Math.max(viewportSize / image.naturalWidth, viewportSize / image.naturalHeight) : 1;
  const renderedWidth = image ? image.naturalWidth * baseScale * zoom : 0;
  const renderedHeight = image ? image.naturalHeight * baseScale * zoom : 0;

  const clampOffset = useCallback(
    (next: Offset, currentZoom = zoom): Offset => {
      if (!image) return { x: 0, y: 0 };
      const scale = baseScale * currentZoom;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const limitX = Math.max(0, (width - viewportSize) / 2);
      const limitY = Math.max(0, (height - viewportSize) / 2);
      return {
        x: Math.min(Math.max(next.x, -limitX), limitX),
        y: Math.min(Math.max(next.y, -limitY), limitY),
      };
    },
    [baseScale, image, viewportSize, zoom],
  );

  useEffect(() => {
    setOffset((current) => clampOffset(current, zoom));
  }, [clampOffset, zoom]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!image || event.button !== 0) return;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset(
      clampOffset({
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      }),
    );
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const confirm = () => {
    if (!image) return;
    setSaving(true);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const context = canvas.getContext("2d");
    if (!context) {
      setSaving(false);
      return;
    }
    const outputScale = baseScale * zoom * (OUTPUT / viewportSize);
    const drawWidth = image.naturalWidth * outputScale;
    const drawHeight = image.naturalHeight * outputScale;
    const centerX = OUTPUT / 2 + offset.x * (OUTPUT / viewportSize);
    const centerY = OUTPUT / 2 + offset.y * (OUTPUT / viewportSize);
    context.imageSmoothingQuality = "high";
    context.drawImage(image, centerX - drawWidth / 2, centerY - drawHeight / 2, drawWidth, drawHeight);
    canvas.toBlob(
      (blob) => {
        setSaving(false);
        if (!blob) return;
        const cropped = new File([blob], "avatar.png", { type: "image/png" });
        onConfirm(cropped, URL.createObjectURL(blob));
      },
      "image/png",
    );
  };

  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md border-white/10 bg-ink-800 p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageUp className="h-5 w-5 text-primary" /> Crop your photo
          </DialogTitle>
          <DialogDescription>Drag the image to reposition it, then zoom until the face fits the circle.</DialogDescription>
        </DialogHeader>

        <div className="mx-auto mt-1 w-full max-w-[288px]">
          <div
            ref={circleRef}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className={cn(
              "relative aspect-square w-full touch-none overflow-hidden rounded-full border border-white/20 bg-black shadow-[0_0_0_8px_rgba(255,255,255,0.04),0_24px_60px_rgba(0,0,0,0.45)]",
              image ? "cursor-grab active:cursor-grabbing" : "cursor-wait",
            )}
          >
            {image ? (
              <img
                src={image.src}
                alt="Crop preview"
                draggable={false}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                style={{
                  width: renderedWidth,
                  height: renderedHeight,
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-white/40">Loading photo…</div>
            )}
            <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/20" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_58%,rgba(0,0,0,0.28)_100%)]" />
          </div>
          <div className="mt-5 flex items-center gap-3 text-white/45">
            <ZoomOut className="h-4 w-4 shrink-0" />
            <Slider
              value={[zoom]}
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              onValueChange={([value]) => setZoom(value)}
              aria-label="Zoom profile photo"
              className="[&_[role=slider]]:opacity-100"
            />
            <ZoomIn className="h-4 w-4 shrink-0" />
          </div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-white/35">
            <Move className="h-3 w-3" /> Drag to reposition · slide to zoom
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={confirm} disabled={!image || saving}>
            {saving ? "Preparing…" : "Use photo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
