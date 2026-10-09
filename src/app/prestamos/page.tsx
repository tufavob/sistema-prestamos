"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient, hasAuthConfig } from "@/lib/supabase";
import { formatearMoneda, FRECUENCIAS, type Frecuencia } from "@/lib/prestamos";
import BadgeCalificacion from "@/components/BadgeCalificacion";

const supabase = hasAuthConfig ? createClient() : null;

type TipoFiltro = "activos" | "finalizados" | "todos";

type ClientePrestamo = {
  id: string;
  nombres: string;
  apellidos: string;
  calificacion?: string | null;
};

type CuotaPrestamo = {
  estado: string | null;
  monto: number;
  saldo_pendiente?: number | null;
};

type Prestamo = {
  id: string;
  monto_prestado: number;
  monto_total: number;
  porcentaje_interes?: number | null;
  frecuencia: Frecuencia;
  numero_cuotas: number;
  saldo_pendiente: number;
  estado?: string | null;
  fecha_inicio: string;
  clientes: ClientePrestamo | ClientePrestamo[] | null;
  cuotas?: CuotaPrestamo[] | null;
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

const TITULOS_FILTRO: Record<TipoFiltro, string> = {
  activos: "Activos",
  finalizados: "Finalizados",
  todos: "Todos",
};

const esFinalizado = (p: Prestamo): boolean => {
  const est = String(p.estado ?? "").toLowerCase();
  return (
    est === "finalizado" ||
    est === "liquidado" ||
    est === "cancelado" ||
    Number(p.saldo_pendiente) <= 0
  );
};

const redondear2 = (n: number) => Math.round(n * 100) / 100;

const computarSaldo = (p: Prestamo): { saldo: number } => {
  const saldo = redondear2(
    (Array.isArray(p.cuotas) ? p.cuotas : [])
      .filter((c) => String(c.estado ?? "").toLowerCase() !== "pagado")
      .reduce(
        (acc, c) => acc + Number(c.saldo_pendiente ?? c.monto ?? 0),
        0,
      ),
  );
  return { saldo: Math.max(0, saldo) };
};

export default function Prestamos() {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [filtro, setFiltro] = useState<TipoFiltro>("activos");

  const conteos = useMemo(
    () => ({
      activos: prestamos.filter((p) => !esFinalizado(p)).length,
      finalizados: prestamos.filter(esFinalizado).length,
      todos: prestamos.length,
    }),
    [prestamos],
  );

  const visibles = useMemo(() => {
    if (filtro === "activos") return prestamos.filter((p) => !esFinalizado(p));
    if (filtro === "finalizados") return prestamos.filter(esFinalizado);
    return prestamos;
  }, [filtro, prestamos]);

  const obtenerPrestamos = useCallback(async (): Promise<ResultadoPrestamos | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("prestamos")
      .select(
        "*, clientes(calificacion, nombres, apellidos), cuotas(estado, monto, saldo_pendiente)",
      )
      .order("created_at", { ascending: false });

    const crudos = (data ?? []) as unknown as Prestamo[];

    const prestamos = crudos.map((p) => {
      const { saldo } = computarSaldo(p);
      return {
        ...p,
        saldo_pendiente: saldo,
        estado: saldo <= 0 ? "finalizado" : p.estado,
        cuotas: undefined,
      };
    });

    return {
      error: error ? `No se pudieron cargar los préstamos: ${error.message}` : null,
      prestamos,
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
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 bg-slate-950 px-4 py-8 text-slate-100 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
            Lista de préstamos
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Todos los préstamos registrados en el sistema.
          </p>
        </div>
        <Link
          href="/prestamos/nuevo"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-950/50 transition hover:from-emerald-500"
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
        <div className="rounded-lg border border-amber-800 bg-amber-950/60 p-4 text-sm text-amber-300">
          Configura las variables{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> en{" "}
          <code className="font-mono">.env.local</code>.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/60 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl text-slate-100">
        {!cargando && prestamos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950 p-4">
            {(["activos", "finalizados", "todos"] as TipoFiltro[]).map((t) => {
              const activoTab = filtro === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFiltro(t)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    activoTab
                      ? "border border-emerald-500 bg-emerald-600 font-bold text-slate-950 shadow-lg shadow-emerald-950/50"
                      : "border border-slate-800 bg-slate-950/80 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {TITULOS_FILTRO[t]}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      activoTab
                        ? "bg-slate-950/25 text-slate-950"
                        : "bg-slate-800/70 text-slate-400"
                    }`}
                  >
                    {conteos[t]}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {cargando ? (
          <div className="flex flex-col gap-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-xl bg-slate-800/60"
              />
            ))}
          </div>
        ) : prestamos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <p className="text-sm text-slate-400">
              No hay préstamos registrados todavía.
            </p>
            <Link
              href="/prestamos/nuevo"
className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-950/50 transition hover:from-emerald-500"
            >
              Registrar el primero
            </Link>
          </div>
        ) : visibles.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400">
            No hay préstamos {filtro === "finalizados" ? "finalizados" : "activos"}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950">
                <tr className="text-xs uppercase tracking-wider text-slate-400">
                  <th className="border-b border-slate-800 px-5 py-3 font-semibold">Cliente</th>
                  <th className="border-b border-slate-800 px-5 py-3 font-semibold">Calificación</th>
                  <th className="border-b border-slate-800 px-5 py-3 text-right font-semibold">
                    Monto prestado
                  </th>
                  <th className="border-b border-slate-800 px-5 py-3 text-right font-semibold">
                    Total a devolver
                  </th>
                  <th className="border-b border-slate-800 px-5 py-3 text-right font-semibold">
                    Saldo Pendiente
                  </th>
                  <th className="border-b border-slate-800 px-5 py-3 font-semibold">Frecuencia</th>
                  <th className="border-b border-slate-800 px-5 py-3 text-center font-semibold">
                    N° Cuotas
                  </th>
                  <th className="border-b border-slate-800 px-5 py-3 font-semibold">Estado</th>
                  <th className="border-b border-slate-800 px-5 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const cliente = primero(p.clientes);
                  const finalizado = esFinalizado(p);
                  return (
                    <tr key={p.id} className="border-b border-slate-800/80 text-slate-200 transition-colors hover:bg-slate-800/50">
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-slate-100">
                          {cliente ? nombreCompleto(cliente) : "Cliente eliminado"}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        {cliente ? (
                          <BadgeCalificacion calificacion={cliente.calificacion} />
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                       <td className="px-5 py-3.5 text-right font-bold text-slate-100">
                         {formatearMoneda(Number(p.monto_prestado || 0))}
                       </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-sky-300">
                        {formatearMoneda(Number(p.monto_total || 0))}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span
                          className={`font-bold ${
                            finalizado ? "text-emerald-400" : "text-slate-300"
                          }`}
                        >
                          {formatearMoneda(Number(p.saldo_pendiente))}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-300">
                        {labelFrecuencia(p.frecuencia)}
                      </td>
                      <td className="px-5 py-3.5 text-center text-slate-300">
                        {p.numero_cuotas}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            finalizado
                              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : "border border-amber-500/30 bg-amber-500/10 text-amber-400"
                          }`}
                        >
                           {String(finalizado ? "finalizado" : (p.estado || "activo")).toLowerCase()}
                         </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {finalizado ? (
                            <>
                              {cliente && (
                                <Link
                                  href={`/prestamos/nuevo?cliente_id=${cliente.id}`}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-500"
                                >
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
                                    <path d="M12 5v14M5 12h14" />
                                  </svg>
                                  Renovar Préstamo
                                </Link>
                              )}
                              <Link
                                href={`/prestamos/${p.id}`}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-700"
                              >
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
                                Ver Cronograma
                              </Link>
                            </>
                          ) : (
                            <Link
                              href={`/prestamos/${p.id}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700"
                            >
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
                              Ver Detalle / Cronograma
                            </Link>
                          )}
                        </div>
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