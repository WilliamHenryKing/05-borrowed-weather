// A native <dialog> wrapper: focus is trapped, Escape closes, focus returns afterwards.

import { type ReactNode, useLayoutEffect, useRef } from "react";

interface ModalProps {
  open: boolean;
  label: string;
  onClose: () => void;
  className?: string;
  sound?: ReactNode;
  onRestoreFocus?: () => void;
  children: ReactNode;
}

export function Modal({
  open,
  label,
  onClose,
  className = "",
  children,
  sound,
  onRestoreFocus,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const fallback = useRef(onRestoreFocus);
  fallback.current = onRestoreFocus;
  // Capture before React commits any background inert attributes.
  if (open && !wasOpen.current && typeof document !== "undefined")
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  wasOpen.current = open;
  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!open) {
      if (d.open) d.close();
      return;
    }
    if (!d.open) d.showModal();
    d.focus({ preventScroll: true });
    d.scrollTop = 0;
    return () => {
      if (d.open) d.close();
      if (document.querySelector("dialog[open]")) return;
      const target = opener.current;
      if (target?.isConnected && !target.closest("[inert],dialog:not([open])")) {
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
      } else fallback.current?.();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      aria-modal="true"
      tabIndex={-1}
      onClose={(event) => {
        if (open && !event.currentTarget.open) onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={`trail-dialog keyboard-scroll m-auto max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl p-0 shadow-2xl backdrop:bg-moss-950/55 backdrop:backdrop-blur-[2px] ${className}`}
    >
      {open && sound && <div className="modal-tools paper">{sound}</div>}
      {open && children}
    </dialog>
  );
}
