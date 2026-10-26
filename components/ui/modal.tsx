"use client";
import { useEffect, useRef } from "react";
export function Modal({
  children,
  onClose,
  labelledBy,
}: {
  children: React.ReactNode;
  onClose: () => void;
  labelledBy: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Capture before React commits an autofocus child.
  const trigger = useRef<HTMLElement | null>(
    typeof document === "undefined"
      ? null
      : (document.activeElement as HTMLElement),
  );
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger.current?.isConnected) trigger.current.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="native-modal"
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const nodes = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(
            'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.getClientRects().length > 0 && el.tabIndex >= 0);
        const first = nodes[0],
          last = nodes.at(-1),
          active = document.activeElement;
        if (!first) {
          e.preventDefault();
          e.currentTarget.focus();
          return;
        }
        if (
          e.shiftKey &&
          (active === first || !nodes.includes(active as HTMLElement))
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (active === last || !nodes.includes(active as HTMLElement))
        ) {
          e.preventDefault();
          first.focus();
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
