"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient, hasAuthConfig } from "@/lib/supabase";
import { aYMD, formatearMoneda, hoyLocal } from "@/lib/prestamos";
import {
  exportarPagosCSV,
  SELECT_PAGOS_REPORTE,
  type PagoExportable,
} from "@/lib/exportar";

const supabase = hasAuthConfig ? createClient() : null;

type MoraCliente = {
  id: string;
  nombres: string;
  apellidos: string;
  montoVencido: number;
  diasMora: number;
  cuotasVencidas: number;
};

type ResultadoDashboard = {
  error: string | null;
  hoy: string;
  totalPrestamos: number;
  capitalEnCalle: number;
  totalPorCobrar: number;
  recaudoHoy: number;
  gananciaProyectada: number;
  gananciaRealCobrada: number;
  mora: MoraCliente[];
};

type RawCliente = { id: string; nombres: string; apellidos: string };
type RawCuotaMora = {
  numero: number;
  saldo_pendiente: number;
  estado: string;
  fecha_vencimiento: string;
  prestamos:
    | { clientes: RawCliente | RawCliente[] | null }
    | { clientes: RawCliente | RawCliente[] | null }[]
    | null;
};

const ESTADOS_POR_COBRAR = ["pendiente", "parcial", "vencido"];

const numero = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

type MetricasLeidas = {
  recaudoDia: number;
  capitalCalle: number;
  totalPorCobrar: number;
  gananciaProyectada: number;
  gananciaReal: number;
  clientesMora: number;
  montoMora: number;
  prestamosActivos: number;
  hoyVal: string | null;
};

const leerMetricas = (data: unknown): MetricasLeidas => {
  const fila = Array.isArray(data) ? (data as unknown[])[0] : data;
  const m = (fila ?? {}) as Record<string, unknown>;
  const primeroDe = (...claves: string[]): unknown => {
    for (const clave of claves) {
      if (Object.prototype.hasOwnProperty.call(m, clave)) return m[clave];
    }
    return undefined;
  };
  return {
    recaudoDia: numero(
      primeroDe(
        "recaudo_dia",
        "recaudado_hoy",
        "recaudoDia",
        "recaudadoHoy",
      ),
    ),
    capitalCalle: numero(
      primeroDe("capital_en_calle", "capital_calle", "capitalEnCalle"),
    ),
    totalPorCobrar: numero(primeroDe("total_por_cobrar", "totalPorCobrar")),
    gananciaProyectada: numero(
      primeroDe("ganancia_proyectada", "gananciaProyectada"),
      20,
    ),
    gananciaReal: numero(
      primeroDe(
        "ganancia_real_cobrada",
        "ganancia_real",
        "gananciaRealCobrada",
        "gananciaReal",
      ),
    ),
    clientesMora: numero(primeroDe("clientes_mora", "clientesMora")),
    montoMora: numero(primeroDe("monto_mora", "montoMora")),
    prestamosActivos: numero(primeroDe("prestamos_activos", "prestamosActivos")),
    hoyVal:
      primeroDe("hoy") !== undefined && primeroDe("hoy") !== null
        ? String(primeroDe("hoy"))
        : null,
  };
};

const primero = <T,>(x: T | T[] | null | undefined): T | null =>
  Array.isArray(x) ? (x[0] ?? null) : (x ?? null);

const aDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const diasMora = (hoy: string, fecha: string) =>
  Math.max(1, Math.round((aDate(hoy).getTime() - aDate(fecha).getTime()) / 86400000));

const iniciales = (n: string, a: string) => `${n.charAt(0)}${a.charAt(0)}`.toUpperCase() || "?";

export default function Dashboard() {
  const [cargando, setCargando] = useState(true);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [datos, setDatos] = useState<ResultadoDashboard | null>(null);
  const [exportando, setExportando] = useState(false);

  const obtenerDashboard = useCallback(async (): Promise<ResultadoDashboard | null> => {
    if (!supabase) return null;
    const hoy = aYMD(hoyLocal());

    const fallback = (): ResultadoDashboard => ({
      error: null,
      hoy,
      totalPrestamos: 0,
      capitalEnCalle: 0,
      totalPorCobrar: 0,
      recaudoHoy: 0,
      gananciaProyectada: 20,
      gananciaRealCobrada: 0,
      mora: [],
    });

    try {
      const [metricasRes, moraRes] = await Promise.all([
        supabase.rpc("metricas_dashboard"),
        supabase
          .from("cuotas")
          .select(
            "numero, saldo_pendiente, estado, fecha_vencimiento, prestamos!inner(clientes!inner(id, nombres, apellidos))",
          )
          .lt("fecha_vencimiento", hoy)
          .in("estado", ESTADOS_POR_COBRAR),
      ]);

      console.log("Metricas desde Supabase:", metricasRes.data);

      if (metricasRes.error) {
        console.error("Error desde Supabase RPC:", metricasRes.error);
        return fallback();
      }

      let metricasRaw: unknown = metricasRes.data;
      if (typeof metricasRaw === "string") {
        metricasRaw = JSON.parse(metricasRaw);
      }
      const met = leerMetricas(metricasRaw);

      const moraMap = new Map<string, MoraCliente>();
      if (moraRes.error) {
        console.error("Error cargando cuotas en mora:", moraRes.error);
      } else {
        for (const raw of (moraRes.data ?? []) as unknown as RawCuotaMora[]) {
          const prestamo = primero(raw.prestamos);
          const cliente = prestamo ? primero(prestamo.clientes) : null;
          if (!cliente) continue;
          const saldo = Number(raw.saldo_pendiente);
          const dias = diasMora(hoy, raw.fecha_vencimiento);
          const existente = moraMap.get(cliente.id);
          if (existente) {
            existente.montoVencido += saldo;
            existente.cuotasVencidas += 1;
            existente.diasMora = Math.max(existente.diasMora, dias);
          } else {
            moraMap.set(cliente.id, {
              id: cliente.id,
              nombres: cliente.nombres,
              apellidos: cliente.apellidos,
              montoVencido: saldo,
              diasMora: dias,
              cuotasVencidas: 1,
            });
          }
        }
      }

      const mora = Array.from(moraMap.values()).sort(
        (a, b) => b.montoVencido - a.montoVencido,
      );

      return {
        error: null,
        hoy: met.hoyVal ?? hoy,
        totalPrestamos: met.prestamosActivos,
        capitalEnCalle: met.capitalCalle,
        totalPorCobrar: met.totalPorCobrar,
        recaudoHoy: met.recaudoDia,
        gananciaProyectada: met.gananciaProyectada,
        gananciaRealCobrada: met.gananciaReal,
        mora,
      };
    } catch (e) {
      console.error("Error inesperado procesando métricas:", e);
      return null;
    }
  }, []);

  useEffect(() => {
    let activo = true;
    const iniciar = async () => {
      const res = await obtenerDashboard();
      if (!activo) return;
      if (res === null) {
        setErrorGlobal("No se pudieron calcular las métricas del dashboard.");
      } else if (res.error) {
        setErrorGlobal(res.error);
      } else {
        setDatos(res);
      }
      setCargando(false);
    };
    iniciar();
    return () => {
      activo = false;
    };
  }, [obtenerDashboard]);

  const montoVencidoTotal = datos?.mora.reduce((s, m) => s + m.montoVencido, 0) ?? 0;

  const exportarReporte = async () => {
    if (!supabase || !datos) return;
    setExportando(true);
    setErrorGlobal(null);
    const { data, error } = await supabase
      .from("pagos")
      .select(SELECT_PAGOS_REPORTE)
      .eq("fecha_pago", datos.hoy);
    setExportando(false);
    if (error) {
      setErrorGlobal(`No se pudo exportar el reporte: ${error.message}`);
      return;
    }
    exportarPagosCSV((data as unknown as PagoExportable[]) ?? [], datos.hoy);
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
            Dashboard financiero
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {datos
              ? aDate(datos.hoy).toLocaleDateString("es-PE", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : "Cargando resumen..."}
          </p>
        </div>
        <button
          type="button"
          onClick={exportarReporte}
          disabled={exportando || cargando}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {exportando ? (
            <Spinner />
          ) : (
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="m7 10 5 5 5-5" />
              <path d="M12 15V3" />
            </svg>
          )}
          Exportar Reporte
        </button>
      </header>

      {!supabase && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Configura las variables{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> en{" "}
          <code className="font-mono">.env.local</code>.
        </div>
      )}

      {errorGlobal && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {errorGlobal}
        </div>
      )}

      {/* Métricas principales */}
      <section
        aria-label="Métricas principales"
        className="grid grid-cols-2 gap-3 lg:grid-cols-5"
      >
        {cargando || !datos ? (
          <>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
              />
            ))}
          </>
        ) : (
          <>
            <div className="rounded-2xl bg-zinc-900 p-5 text-white dark:bg-zinc-100 dark:text-zinc-900">
              <p className="text-xs font-medium uppercase tracking-wide opacity-70">
                Capital en calle
              </p>
              <p className="mt-1 truncate text-2xl font-bold">
                {formatearMoneda(datos.capitalEnCalle)}
              </p>
              <p className="mt-1 text-xs opacity-70">
                {datos.totalPrestamos} préstamos activos
              </p>
            </div>

            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-900 dark:bg-sky-950">
              <p className="text-xs font-medium uppercase tracking-wide text-sky-600 dark:text-sky-400">
                Total por cobrar
              </p>
              <p className="mt-1 truncate text-2xl font-bold text-sky-700 dark:text-sky-300">
                {formatearMoneda(datos.totalPorCobrar)}
              </p>
              <p className="mt-1 truncate text-xs text-sky-600 dark:text-sky-400">
                Capital + intereses pendientes
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                Recaudo del día
              </p>
              <p className="mt-1 truncate text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                {formatearMoneda(datos.recaudoHoy)}
              </p>
              <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                Cobrado hoy
              </p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                Ganancia proyectada
              </p>
              <p className="mt-1 truncate text-2xl font-bold text-amber-700 dark:text-amber-300">
                {formatearMoneda(datos.gananciaProyectada)}
              </p>
              <p className="mt-1 truncate text-xs text-amber-600 dark:text-amber-400">
                Real cobrada: {formatearMoneda(datos.gananciaRealCobrada)}
              </p>
            </div>

            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950">
              <p className="text-xs font-medium uppercase tracking-wide text-red-600 dark:text-red-400">
                Clientes en mora
              </p>
              <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-300">
                {datos.mora.length}
              </p>
              <p className="mt-1 truncate text-xs text-red-600 dark:text-red-400">
                {formatearMoneda(montoVencidoTotal)} vencido
              </p>
            </div>
          </>
        )}
      </section>

      {/* Alertas de morosidad */}
      <section className="overflow-hidden rounded-2xl border-2 border-red-200 bg-white shadow-sm dark:border-red-900 dark:bg-red-950/30">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-5 py-3.5 dark:border-red-900 dark:bg-red-950/60">
          <h2 className="flex items-center gap-2 text-base font-semibold text-red-800 dark:text-red-300">
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-9-9" />
              <path d="M12 8v4l3 3" />
            </svg>
            Alertas de morosidad
          </h2>
          {!cargando && datos && (
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 dark:bg-red-900 dark:text-red-300">
              {datos.mora.length} cliente{datos.mora.length === 1 ? "" : "s"} ·{" "}
              {formatearMoneda(montoVencidoTotal)}
            </span>
          )}
        </div>

        {cargando ? (
          <div className="flex flex-col gap-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-red-50 dark:bg-red-950/40" />
            ))}
          </div>
        ) : datos && datos.mora.length > 0 ? (
          <ul className="divide-y divide-red-100 dark:divide-red-900">
            {datos.mora.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-3 px-5 py-3.5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-semibold text-red-700 dark:bg-red-900 dark:text-red-300">
                  {iniciales(m.nombres, m.apellidos)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {m.nombres} {m.apellidos}
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {m.diasMora} día{m.diasMora === 1 ? "" : "s"} de mora ·{" "}
                    {m.cuotasVencidas} cuota{m.cuotasVencidas === 1 ? "" : "s"} vencida
                    {m.cuotasVencidas === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="shrink-0 rounded-lg bg-red-100 px-3 py-1.5 text-sm font-bold text-red-700 dark:bg-red-900 dark:text-red-300">
                  {formatearMoneda(m.montoVencido)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-5 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Sin clientes en mora. ¡Todo al día!
          </div>
        )}
      </section>

      {/* Acciones rápidas */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Acciones rápidas
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            href="/"
            className="group flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-900 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-500"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M19 8v6M22 11h-6" />
              </svg>
            </span>
            <span>
              <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Registrar cliente
              </span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                Alta de un nuevo cliente
              </span>
            </span>
          </Link>

          <Link
            href="/prestamos/nuevo"
            className="group flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-900 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-500"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span>
              <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Nuevo préstamo
              </span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                Genera préstamo y cronograma
              </span>
            </span>
          </Link>

          <Link
            href="/cobros"
            className="group flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-900 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-500"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </span>
            <span>
              <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Ruta de cobro del día
              </span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                Cobros pendientes de hoy
              </span>
            </span>
          </Link>
        </div>
      </section>
    </main>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}