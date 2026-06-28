"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { X, CheckCircle2, AlertTriangle, Info, XCircle, Loader2 } from "lucide-react";

interface ToastOptions {
  description?: React.ReactNode;
  duration?: number;
  id?: string | number;
}

interface ActiveToast {
  id: string | number;
  message: React.ReactNode;
  description?: React.ReactNode;
  type: "success" | "error" | "warning" | "info" | "loading";
  visible: boolean;
  isFadingOut?: boolean;
}

interface ToastContextType {
  success: (message: React.ReactNode, options?: ToastOptions) => string | number;
  error: (message: React.ReactNode, options?: ToastOptions) => string | number;
  warning: (message: React.ReactNode, options?: ToastOptions) => string | number;
  info: (message: React.ReactNode, options?: ToastOptions) => string | number;
  loading: (message: React.ReactNode, options?: ToastOptions) => string | number;
  dismiss: (id?: string | number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

type ToastListener = (event: {
  id: string | number;
  message: React.ReactNode;
  type: "success" | "error" | "warning" | "info" | "loading";
  options?: ToastOptions;
}) => void;

type DismissListener = (id?: string | number) => void;

let lastToastId = 0;
const generateId = () => {
  lastToastId += 1;
  return lastToastId.toString();
};

// ToastEmitter manages global static toast events using a simple pub/sub pattern.
class ToastEmitter {
  private listeners = new Set<ToastListener>();
  private dismissListeners = new Set<DismissListener>();

  subscribe(onToast: ToastListener, onDismiss: DismissListener) {
    this.listeners.add(onToast);
    this.dismissListeners.add(onDismiss);
    return () => {
      this.listeners.delete(onToast);
      this.dismissListeners.delete(onDismiss);
    };
  }

  emit(message: React.ReactNode, type: "success" | "error" | "warning" | "info" | "loading", options?: ToastOptions) {
    const id = options?.id || generateId();
    this.listeners.forEach(listener => listener({ id, message, type, options }));
    return id;
  }

  emitDismiss(id?: string | number) {
    this.dismissListeners.forEach(listener => listener(id));
  }
}

const toastEmitter = new ToastEmitter();

// toast is a statically importable object that mimics sonner's API to trigger universal toasts globally.
export const toast = {
  success: (message: React.ReactNode, options?: ToastOptions) => toastEmitter.emit(message, "success", options),
  error: (message: React.ReactNode, options?: ToastOptions) => toastEmitter.emit(message, "error", options),
  warning: (message: React.ReactNode, options?: ToastOptions) => toastEmitter.emit(message, "warning", options),
  info: (message: React.ReactNode, options?: ToastOptions) => toastEmitter.emit(message, "info", options),
  loading: (message: React.ReactNode, options?: ToastOptions) => toastEmitter.emit(message, "loading", options),
  dismiss: (id?: string | number) => toastEmitter.emitDismiss(id),
};

// Toaster is a dummy component to prevent import errors
export function Toaster(props: any) {
  return null;
}

// useToast is the custom hook to consume the universal draggable toast context.
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

// ToastProvider wraps the application and renders the high-performance draggable toast overlay.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [activeToast, setActiveToast] = useState<ActiveToast | null>(null);

  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isRendered, setIsRendered] = useState(false);

  const dragStart = useRef({ x: 0, y: 0 });
  const currentOffset = useRef({ x: 0, y: 0 });
  const toastRef = useRef<HTMLDivElement | null>(null);
  const dismissTimer = useRef<NodeJS.Timeout | null>(null);
  const isHovered = useRef(false);

  useEffect(() => {
    if (activeToast && activeToast.visible && !activeToast.isFadingOut) {
      const raft = requestAnimationFrame(() => {
        setIsRendered(true);
      });
      return () => cancelAnimationFrame(raft);
    } else {
      setIsRendered(false);
    }
  }, [activeToast]);

  const dismiss = useCallback((id?: string | number) => {
    isHovered.current = false;
    setActiveToast((prev: ActiveToast | null) => {
      if (!prev) return null;
      if (id && prev.id !== id) return prev;
      
      const targetId = id || prev.id;
      setTimeout(() => {
        setActiveToast((curr: ActiveToast | null) => {
          if (!curr) return null;
          if (curr.id !== targetId) return curr;
          return { ...curr, visible: false };
        });
      }, 300);

      return { ...prev, isFadingOut: true };
    });
  }, []);

  // startTimer initializes or resets the auto-dismiss timer for the active toast.
  const startTimer = useCallback((duration: number = 4000) => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
    }
    dismissTimer.current = setTimeout(() => {
      if (!isHovered.current && !isDragging) {
        dismiss();
      }
    }, duration);
  }, [isDragging, dismiss]);

  // showToast is a helper to set toast state and start the auto-dismiss countdown.
  const showToast = useCallback((
    id: string | number,
    message: React.ReactNode,
    type: "success" | "error" | "warning" | "info" | "loading",
    options?: ToastOptions
  ) => {
    setActiveToast({
      id,
      message,
      description: options?.description,
      type,
      visible: true,
      isFadingOut: false,
    });
    
    if (type !== "loading") {
      startTimer(options?.duration || 4000);
    } else if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    return id;
  }, [startTimer]);

  const success = useCallback((message: React.ReactNode, options?: ToastOptions) => {
    return showToast(options?.id || generateId(), message, "success", options);
  }, [showToast]);

  const error = useCallback((message: React.ReactNode, options?: ToastOptions) => {
    return showToast(options?.id || generateId(), message, "error", options);
  }, [showToast]);

  const warning = useCallback((message: React.ReactNode, options?: ToastOptions) => {
    return showToast(options?.id || generateId(), message, "warning", options);
  }, [showToast]);

  const info = useCallback((message: React.ReactNode, options?: ToastOptions) => {
    return showToast(options?.id || generateId(), message, "info", options);
  }, [showToast]);

  const loading = useCallback((message: React.ReactNode, options?: ToastOptions) => {
    return showToast(options?.id || generateId(), message, "loading", options);
  }, [showToast]);

  useEffect(() => {
    const unsubscribe = toastEmitter.subscribe(
      ({ id, message, type, options }) => {
        showToast(id, message, type, options);
      },
      (id) => {
        dismiss(id);
      }
    );
    return unsubscribe;
  }, [showToast, dismiss]);

  const handleMouseEnter = () => {
    isHovered.current = true;
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  };

  const handleMouseLeave = () => {
    isHovered.current = false;
    if (!isDragging && activeToast && activeToast.type !== "loading") {
      startTimer(2000);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.nativeEvent && e.nativeEvent.stopPropagation) {
      e.nativeEvent.stopPropagation();
    }
    if ((e.target as HTMLElement).closest(".close-btn")) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    currentOffset.current = { x: position.x, y: position.y };
    
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.nativeEvent && e.nativeEvent.stopPropagation) {
      e.nativeEvent.stopPropagation();
    }
    if ((e.target as HTMLElement).closest(".close-btn")) return;
    const touch = e.touches[0];
    setIsDragging(true);
    dragStart.current = { x: touch.clientX, y: touch.clientY };
    currentOffset.current = { x: position.x, y: position.y };
    
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    let localX = currentOffset.current.x;
    let localY = currentOffset.current.y;
    let animationFrameId: number | null = null;

    const updatePosition = () => {
      if (toastRef.current) {
        toastRef.current.style.transform = `translate(${localX}px, ${localY}px)`;
      }
      animationFrameId = null;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      localX = currentOffset.current.x + dx;
      localY = currentOffset.current.y + dy;

      if (animationFrameId === null) {
        animationFrameId = requestAnimationFrame(updatePosition);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      setPosition({ x: localX, y: localY });
      currentOffset.current = { x: localX, y: localY };
      
      if (!isHovered.current && activeToast && activeToast.type !== "loading") {
        startTimer(2000);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isDragging, startTimer, activeToast]);

  useEffect(() => {
    if (!isDragging) return;

    let localX = currentOffset.current.x;
    let localY = currentOffset.current.y;
    let animationFrameId: number | null = null;

    const updatePosition = () => {
      if (toastRef.current) {
        toastRef.current.style.transform = `translate(${localX}px, ${localY}px)`;
      }
      animationFrameId = null;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const dx = touch.clientX - dragStart.current.x;
      const dy = touch.clientY - dragStart.current.y;
      localX = currentOffset.current.x + dx;
      localY = currentOffset.current.y + dy;

      if (animationFrameId === null) {
        animationFrameId = requestAnimationFrame(updatePosition);
      }
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      setPosition({ x: localX, y: localY });
      currentOffset.current = { x: localX, y: localY };
      
      if (!isHovered.current && activeToast && activeToast.type !== "loading") {
        startTimer(2000);
      }
    };

    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isDragging, startTimer, activeToast]);

  useEffect(() => {
    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
      }
    };
  }, []);

  const getStyleConfig = () => {
    if (!activeToast) return null;
    switch (activeToast.type) {
      case "success":
        return {
          indicatorBg: "bg-emerald-500",
          bgGradient: "from-emerald-500/10",
          glow: "shadow-emerald-500/10",
          icon: <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />,
        };
      case "error":
        return {
          indicatorBg: "bg-rose-500",
          bgGradient: "from-rose-500/10",
          glow: "shadow-rose-500/10",
          icon: <XCircle className="h-5 w-5 text-rose-400 shrink-0" />,
        };
      case "warning":
        return {
          indicatorBg: "bg-amber-500",
          bgGradient: "from-amber-500/10",
          glow: "shadow-amber-500/10",
          icon: <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 animate-pulse" />,
        };
      case "loading":
        return {
          indicatorBg: "bg-indigo-500",
          bgGradient: "from-indigo-500/10",
          glow: "shadow-indigo-500/10",
          icon: <Loader2 className="h-5 w-5 text-indigo-400 shrink-0 animate-spin" />,
        };
      case "info":
      default:
        return {
          indicatorBg: "bg-indigo-500",
          bgGradient: "from-indigo-500/10",
          glow: "shadow-indigo-500/10",
          icon: <Info className="h-5 w-5 text-indigo-400 shrink-0" />,
        };
    }
  };

  const style = getStyleConfig();

  return (
    <ToastContext.Provider value={{ success, error, warning, info, loading, dismiss }}>
      {children}
      {activeToast && activeToast.visible && style && (
        <div
          ref={toastRef}
          data-dismissable-layer-ignore="true"
          onPointerDown={(e) => {
            e.stopPropagation();
            if (e.nativeEvent && e.nativeEvent.stopPropagation) e.nativeEvent.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (e.nativeEvent && e.nativeEvent.stopPropagation) e.nativeEvent.stopPropagation();
          }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{
            transform: `translate(${position.x}px, ${position.y}px)`,
            cursor: isDragging ? "move" : "pointer",
            transition: isDragging ? "none" : "transform 150ms ease-out, opacity 300ms ease-in-out, scale 300ms ease-in-out",
            willChange: "transform",
            backdropFilter: isDragging ? "none" : "blur(16px)",
          }}
          className={`fixed top-6 right-6 z-[9999] bg-neutral-950/90 bg-gradient-to-r ${style.bgGradient} to-transparent border border-white/5 text-white pl-6 pr-4 py-3.5 rounded-xl flex flex-col gap-1.5 shadow-xl ${style.glow} min-w-[320px] max-w-sm select-none overflow-hidden transition-all duration-300 ease-in-out ${
            activeToast.isFadingOut || !isRendered
              ? "opacity-0 scale-95 pointer-events-none"
              : "opacity-100 scale-100 pointer-events-auto"
          }`}
        >
          {/* Thin curved color indicator along the left edge */}
          <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${style.indicatorBg}`} />
          <div className={`flex ${activeToast.description ? "items-start" : "items-center"} gap-3 justify-between w-full`}>
            <div className="flex items-center gap-3">
              {style.icon}
              <div className="text-sm font-semibold pr-4">{activeToast.message}</div>
            </div>
            <button
              onClick={() => dismiss()}
              className="close-btn p-1.5 rounded-lg transition-all cursor-pointer outline-none shrink-0 hover:bg-white/10 text-white/50 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {activeToast.description && (
            <div className="pl-8 text-xs text-white/60 leading-relaxed pr-6">
              {activeToast.description}
            </div>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}
