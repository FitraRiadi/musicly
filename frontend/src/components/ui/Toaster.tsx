import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { useUiStore } from "@/store/ui";
import { cn } from "@/lib/utils";

export function Toaster() {
  const toasts = useUiStore((state) => state.toasts);
  const dismiss = useUiStore((state) => state.dismissToast);

  return (
    <div className="pointer-events-none fixed bottom-[150px] right-3 z-[95] flex w-[calc(100%-1.5rem)] max-w-sm flex-col gap-2 md:bottom-28 md:right-4">
      {toasts.map((toast) => {
        const Icon = toast.tone === "success" ? CheckCircle2 : toast.tone === "error" ? AlertCircle : Info;
        return (
          <button
            key={toast.id}
            onClick={() => dismiss(toast.id)}
            className={cn(
              "pointer-events-auto flex animate-fade-up items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-sm shadow-2xl backdrop-blur-xl",
              toast.tone === "success" && "border-primary/30 bg-[#0f2418]/95 text-white",
              toast.tone === "error" && "border-red-400/30 bg-[#2a1214]/95 text-white",
              toast.tone === "default" && "border-white/10 bg-ink-700/95 text-white",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                toast.tone === "success" && "text-primary",
                toast.tone === "error" && "text-red-400",
                toast.tone === "default" && "text-white/60",
              )}
            />
            <span className="flex-1">{toast.message}</span>
          </button>
        );
      })}
    </div>
  );
}
