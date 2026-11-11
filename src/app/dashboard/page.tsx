"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient, hasAuthConfig } from "@/lib/supabase";
import { formatearMoneda } from "@/lib/prestamos";
import {
  formatearFechaLarga,
  getMetricasCajaHoy,
  getMetricasCarteraActiva,
  getMetricasMoraVencida,
  hoyPeruYMD,
} from "@/lib/financiero-core";

const supabase = hasAuthConfig ? createClient() : null;

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

type Metricas = {
  hoy: string;
  recaudadoHoy: number;
  transaccionesHoy: number;
  capitalPrincipal: number;
  gananciaProyectada: number;
  totalCartera: number;
  prestamosActivos: number;
  montoTotalMora: number;
  clientesMorososUnicos: number;
  totalCuotasVencidas: number;
};

/* ------------------------------------------------------------------ */
/* Cálculo de métricas (motor unificado)                               */
/* ------------------------------------------------------------------ */

const obtenerMetricas = async (): Promise<Metricas | string> => {
  if (!supabase) {
    return "Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local.";
  }

  try {
    const [caja, cartera, mora] = await Promise.all([
      getMetricasCajaHoy(supabase),
      getMetricasCarteraActiva(supabase),
      getMetricasMoraVencida(supabase),
    ]);

    return {
      hoy: caja.fecha,
      recaudadoHoy: caja.recaudadoHoy,
      transaccionesHoy: caja.transaccionesHoy,
      capitalPrincipal: cartera.capitalPrincipal,
      gananciaProyectada: cartera.gananciaProyectada,
      totalCartera: cartera.totalCartera,
      prestamosActivos: cartera.prestamosActivos,
      montoTotalMora: mora.montoTotalMora,
      clientesMorososUnicos: mora.clientesMorososUnicos,
      totalCuotasVencidas: mora.totalCuotasVencidas,
    };
  } catch (e) {
    return e instanceof Error
      ? e.message
      : "No se pudieron cargar las métricas del negocio.";
  }
};

/* ------------------------------------------------------------------ */
/* Piezas visuales                                                     */
/* ------------------------------------------------------------------ */

type Tono = "emerald" | "blue" | "indigo" | "amber" | "slate";

const TONOS: Record<
  Tono,
  { borde: string; icono: string; valor: string; acento: string }
> = {
  emerald: {
    borde: "border-emerald-500/20",
    icono: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
    valor: "text-emerald-400",
    acento: "bg-emerald-500/60",
  },
  blue: {
    borde: "border-blue-500/20",
    icono: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
    valor: "text-blue-400",
    acento: "bg-blue-500/60",
  },
  indigo: {
    borde: "border-indigo-500/20",
    icono: "bg-indigo-500/10 text-indigo-400 ring-indigo-500/20",
    valor: "text-indigo-400",
    acento: "bg-indigo-500/60",
  },
  amber: {
    borde: "border-amber-500/25",
    icono: "bg-amber-500/10 text-amber-400 ring-amber-500/25",
    valor: "text-amber-400",
    acento: "bg-amber-500/60",
  },
  slate: {
    borde: "border-slate-800",
    icono: "bg-slate-800/80 text-slate-400 ring-slate-700/60",
    valor: "text-slate-100",
    acento: "bg-slate-600/60",
  },
};

function TarjetaMetrica({
  titulo,
  valor,
  detalle,
  tono,
  icono,
  cargando,
}: {
  titulo: string;
  valor: string;
  detalle: string;
  tono: Tono;
  icono: ReactNode;
  cargando: boolean;
}) {
  const estilo = TONOS[tono];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${estilo.borde} bg-slate-900/80 p-5 shadow-lg shadow-slate-950/30`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-0.5 ${estilo.acento}`}
        aria-hidden="true"
      />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {titulo}
        </p>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${estilo.icono}`}
        >
          {icono}
        </span>
      </div>

      {cargando ? (
        <div className="mt-3 h-8 w-32 animate-pulse rounded-lg bg-slate-800/80" />
      ) : (
        <p
          className={`mt-3 text-3xl font-bold tracking-tight tabular-nums ${estilo.valor}`}
        >
          {valor}
        </p>
      )}
      <p className="mt-1.5 text-xs text-slate-400">{detalle}</p>
    </div>
  );
}

const IconoDinero = (
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
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
);

const IconoCapital = (
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
    <path d="M3 21h18" />
    <path d="M5 21V8l7-4 7 4v13" />
    <path d="M9 21v-6h6v6" />
  </svg>
);

const IconoGanancia = (
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
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </svg>
);

const IconoAlerta = (
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
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

const IconoFlecha = (
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
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

export default function Dashboard() {
  const [cargando, setCargando] = useState(true);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [metricas, setMetricas] = useState<Metricas | null>(null);

  useEffect(() => {
    let activo = true;
    const cargar = async () => {
      const res = await obtenerMetricas();
      if (!activo) return;
      if (typeof res === "string") {
        setErrorGlobal(res);
        setMetricas(null);
      } else {
        setErrorGlobal(null);
        setMetricas(res);
      }
      setCargando(false);
    };
    void cargar();
    return () => {
      activo = false;
    };
  }, []);

  const fechaHoy = metricas?.hoy ?? hoyPeruYMD();
  const totalCartera = metricas?.totalCartera ?? 0;
  const pctCapital =
    totalCartera > 0
      ? Math.round(((metricas?.capitalPrincipal ?? 0) / totalCartera) * 100)
      : 0;
  const pctGanancia = totalCartera > 0 ? 100 - pctCapital : 0;
  const hayMora = (metricas?.montoTotalMora ?? 0) > 0;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      {/* Encabezado */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/80">
            Resumen ejecutivo
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
            Dashboard financiero
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {formatearFechaLarga(fechaHoy)} · Zona horaria Perú
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-xs font-medium text-slate-300">
          <span
            className={`h-2 w-2 rounded-full ${
              errorGlobal
                ? "bg-red-500"
                : cargando
                  ? "animate-pulse bg-amber-400"
                  : "bg-emerald-500"
            }`}
            aria-hidden="true"
          />
          {errorGlobal
            ? "Datos no disponibles"
            : cargando
              ? "Actualizando..."
              : "Datos al día"}
        </span>
      </header>

      {errorGlobal && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-300">
          {errorGlobal}
        </div>
      )}

      {/* 4 bloques principales */}
      <section
        aria-label="Indicadores del día"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <TarjetaMetrica
          titulo="Caja del día"
          valor={formatearMoneda(metricas?.recaudadoHoy ?? 0)}
          detalle={`${metricas?.transaccionesHoy ?? 0} ${
            (metricas?.transaccionesHoy ?? 0) === 1
              ? "transacción registrada"
              : "transacciones registradas"
          } hoy`}
          tono="emerald"
          icono={IconoDinero}
          cargando={cargando}
        />

        <TarjetaMetrica
          titulo="Capital Principal"
          valor={formatearMoneda(metricas?.capitalPrincipal ?? 0)}
          detalle={`${metricas?.prestamosActivos ?? 0} ${
            (metricas?.prestamosActivos ?? 0) === 1
              ? "préstamo activo"
              : "préstamos activos"
          }`}
          tono="blue"
          icono={IconoCapital}
          cargando={cargando}
        />

        <TarjetaMetrica
          titulo="Ganancia proyectada"
          valor={formatearMoneda(metricas?.gananciaProyectada ?? 0)}
          detalle="Interés por recuperar"
          tono="indigo"
          icono={IconoGanancia}
          cargando={cargando}
        />

        <TarjetaMetrica
          titulo="Mora real vencida"
          valor={formatearMoneda(metricas?.montoTotalMora ?? 0)}
          detalle={
            hayMora
              ? `${metricas?.clientesMorososUnicos ?? 0} ${
                  (metricas?.clientesMorososUnicos ?? 0) === 1
                    ? "cliente"
                    : "clientes"
                } · ${metricas?.totalCuotasVencidas ?? 0} ${
                  (metricas?.totalCuotasVencidas ?? 0) === 1
                    ? "cuota"
                    : "cuotas"
                }`
              : "Sin cuotas vencidas"
          }
          tono={hayMora ? "amber" : "slate"}
          icono={IconoAlerta}
          cargando={cargando}
        />
      </section>

      {/* Banner inferior: valor total de cartera activa */}
      <section
        aria-label="Valor total de cartera activa"
        className="overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-900/60 p-5 shadow-lg shadow-slate-950/30 sm:p-6"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Valor total de cartera activa
            </p>
            <p className="mt-1.5 text-3xl font-bold tracking-tight text-slate-50 tabular-nums sm:text-4xl">
              {formatearMoneda(totalCartera)}
            </p>
            <p className="mt-1.5 text-xs text-slate-400">
              Capital {formatearMoneda(metricas?.capitalPrincipal ?? 0)}
              <span className="mx-1.5 text-slate-600">+</span>
              Ganancia{" "}
              {formatearMoneda(metricas?.gananciaProyectada ?? 0)}
            </p>

            {totalCartera > 0 && (
              <div className="mt-4 max-w-md">
                <div
                  className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-800"
                  role="img"
                  aria-label={`${pctCapital}% capital y ${pctGanancia}% ganancia`}
                >
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${pctCapital}%` }}
                  />
                  <div
                    className="h-full bg-indigo-500"
                    style={{ width: `${pctGanancia}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-4 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    Capital {pctCapital}%
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    Ganancia {pctGanancia}%
                  </span>
                </div>
              </div>
            )}
          </div>

          <Link
            href="/cobros"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-950/40 transition hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            Ir a Ruta de Cobro
            {IconoFlecha}
          </Link>
        </div>
      </section>
    </main>
  );
}
