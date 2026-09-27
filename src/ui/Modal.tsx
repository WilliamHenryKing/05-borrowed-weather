// A native <dialog> wrapper: focus is trapped, Escape closes, focus returns afterwards.

import { type ReactNode, useEffect, useRef } from "react";

interface ModalProps {
  open: boolean;
  label: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}

export function Modal({ open, label, onClose, className = "", children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl p-0 shadow-2xl backdrop:bg-moss-950/55 backdrop:backdrop-blur-[2px] ${className}`}
    >
      {open && children}
    </dialog>
  );
}
