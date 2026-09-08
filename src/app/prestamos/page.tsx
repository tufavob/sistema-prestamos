"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient, hasAuthConfig } from "@/lib/supabase";
import { formatearMoneda, FRECUENCIAS, type Frecuencia } from "@/lib/prestamos";

const supabase = hasAuthConfig ? createClient() : null;

type ClientePrestamo = { nombres: string; apellidos: string };

type Prestamo = {
  id: string;
  monto: number;
  monto_total: number;
  frecuencia: Frecuencia;
  numero_cuotas: number;
  saldo_pendiente: number;
  fecha_inicio: string;
  clientes: ClientePrestamo | ClientePrestamo[] | null;
};

type ResultadoPrestamos = {
  error: string | null;
  prestamos: Prestamo[];
};

const primero = <T,>(x: T | T[] | null | undefined): T | null =>
  Array.isArray(x) ? (x[0] ?? null) : (x ?? null);

const nombreCompleto = (c: ClientePrestamo) => `${c.nombres} ${c.apellidos}`;

const labelFrecuencia = (f: string) =>
  FRECUENCIAS.find((x) => x.value === f)?.label ?? f;

export default function Prestamos() {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);

  const obtenerPrestamos = useCallback(async (): Promise<ResultadoPrestamos | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("prestamos")
      .select(
        "id, monto, monto_total, frecuencia, numero_cuotas, saldo_pendiente, fecha_inicio, clientes(nombres, apellidos)",
      )
      .order("created_at", { ascending: false });

    return {
      error: error ? `No se pudieron cargar los préstamos: ${error.message}` : null,
      prestamos: (data ?? []) as unknown as Prestamo[],
    };
  }, []);

  useEffect(() => {
    let activo = true;
    const iniciar = async () => {
      const res = await obtenerPrestamos();
      if (!activo || !res) return;
      if (res.error) {
        setError(res.error);
      } else {
        setPrestamos(res.prestamos);
      }
      if (activo) setCargando(false);
    };
    iniciar();
    return () => {
      activo = false;
    };
  }, [obtenerPrestamos]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
            Lista de préstamos
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Todos los préstamos registrados en el sistema.
          </p>
        </div>
        <Link
          href="/prestamos/nuevo"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nuevo Préstamo
        </Link>
      </header>

      {!supabase && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Configura las variables{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> en{" "}
          <code className="font-mono">.env.local</code>.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {cargando ? (
          <div className="flex flex-col gap-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/60"
              />
            ))}
          </div>
        ) : prestamos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No hay préstamos registrados todavía.
            </p>
            <Link
              href="/prestamos/nuevo"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Registrar el primero
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60">
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  <th className="px-5 py-3 font-semibold">Cliente</th>
                  <th className="px-5 py-3 text-right font-semibold">
                    Monto prestado
                  </th>
                  <th className="px-5 py-3 font-semibold">Frecuencia</th>
                  <th className="px-5 py-3 text-center font-semibold">
                    N° Cuotas
                  </th>
                  <th className="px-5 py-3 font-semibold">Estado</th>
                  <th className="px-5 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {prestamos.map((p) => {
                  const cliente = primero(p.clientes);
                  const activo = Number(p.saldo_pendiente) > 0;
                  return (
                    <tr key={p.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-zinc-900 dark:text-zinc-50">
                          {cliente ? nombreCompleto(cliente) : "Cliente eliminado"}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-zinc-900 dark:text-zinc-50">
                        {formatearMoneda(Number(p.monto))}
                      </td>
                      <td className="px-5 py-3.5 text-zinc-600 dark:text-zinc-300">
                        {labelFrecuencia(p.frecuencia)}
                      </td>
                      <td className="px-5 py-3.5 text-center text-zinc-600 dark:text-zinc-300">
                        {p.numero_cuotas}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            activo
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                          }`}
                        >
                          {activo ? "Activo" : "Pagado"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href={`/prestamos/${p.id}`}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          Ver Detalle / Cronograma
                          <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}