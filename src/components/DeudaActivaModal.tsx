"use client";

import Link from "next/link";
import Modal from "@/components/Modal";
import type { Cliente } from "@/lib/supabase";

export default function DeudaActivaModal({
  cliente,
  onClose,
}: {
  cliente: Cliente | null;
  onClose: () => void;
}) {
  return (
    <Modal open={cliente !== null} onClose={onClose} role="alertdialog">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-lg font-bold text-red-600 dark:bg-red-900 dark:text-red-300">
          ⚠️
        </span>
        <div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Cliente con Préstamo Vigente
          </h3>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            El cliente{" "}
            <strong>
              {cliente?.nombres} {cliente?.apellidos}
            </strong>{" "}
            cuenta con un préstamo activo con un saldo pendiente por cobrar.
            Debe liquidar las cuotas pendientes del préstamo actual antes de
            otorgar un nuevo crédito.
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Entendido
        </button>
        <Link
          href="/cobros"
          onClick={onClose}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700"
        >
          Ir a Cobros / Registrar Pago
        </Link>
      </div>
    </Modal>
  );
}