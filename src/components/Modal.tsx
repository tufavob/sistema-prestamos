"use client";

import { type ReactNode } from "react";

export default function Modal({
  open,
  onClose,
  children,
  role = "dialog",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  role?: "dialog" | "alertdialog";
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role={role}
        aria-modal="true"
        className="relative z-10 max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900/95 p-6 text-slate-100 shadow-2xl backdrop-blur"
      >
        {children}
      </div>
    </div>
  );
}