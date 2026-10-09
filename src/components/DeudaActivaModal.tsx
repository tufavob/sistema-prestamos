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
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-950 text-lg font-bold text-red-300">
          ⚠️
        </span>
        <div>
          <h3 className="text-base font-bold text-slate-100">
            Cliente con Préstamo Vigente
          </h3>
          <p className="mt-2 text-sm font-medium text-slate-400">
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
          className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-700 px-4 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
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