"use client";

import { type ReactNode } from "react";

export default function Modal({
  open,
  onClose,
  children,
  role = "dialog",
  header,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  role?: "dialog" | "alertdialog";
  header?: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role={role}
        aria-modal="true"
        className="relative z-10 flex max-h-[90dvh] w-[95vw] max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/95 text-slate-100 shadow-2xl backdrop-blur"
      >
        {header && (
          <div className="shrink-0 border-b border-slate-800 px-5 pb-3 pt-5 sm:px-6">
            {header}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-slate-800 px-5 pb-5 pt-3 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
