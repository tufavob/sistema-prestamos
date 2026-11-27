"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient, hasAuthConfig } from "@/lib/supabase";
import { formatearMoneda } from "@/lib/prestamos";
import {
  formatearFechaLarga,
  formatearRangoFechas,
  getReporteHistorico,
  getReportes,
  hoyPeruYMD,
  inicioAnioYMD,
  inicioMesYMD,
  mesesAtrasYMD,
  type PeriodoReporte,
  type ReporteHistorico,
  type Reportes,
} from "@/lib/financiero-core";
import {
  descargarArchivo,
  generarPdf,
  generarXlsx,
  prepararDatosExportacion,
} from "@/lib/exportar-reportes";
import { TarjetaKPI } from "@/components/reportes/TarjetaKPI";
import { BarrasSemana } from "@/components/reportes/BarrasSemana";
import { BarrasPeriodo } from "@/components/reportes/BarrasPeriodo";
import { DonutCartera } from "@/components/reportes/DonutCartera";

const supabase = hasAuthConfig ? createClient() : null;

/* ------------------------------------------------------------------ */
/* Iconos                                                              */
/* ------------------------------------------------------------------ */

const svg = (contenido: ReactNode) => (
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
    {contenido}
  </svg>
);

const IconoDinero = svg(
  <>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 12h.01M18 12h.01" />
  </>,
);

const IconoRecibo = svg(
  <>
    <path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21V3Z" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </>,
);

const IconoRuta = svg(
  <>
    <path d="M9 20 3 17V4l6 3 6-3 6 3v13l-6-3-6 3Z" />
    <path d="M9 7v13M15 4v13" />
  </>,
);

const IconoAlerta = svg(
  <>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </>,
);

const IconoObjetivo = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </>,
);

const IconoSube = svg(
  <>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </>,
);

const IconoBaja = svg(
  <>
    <path d="m3 7 6 6 4-4 8 8" />
    <path d="M21 17h-6v-6" />
  </>,
);

const IconoRentabilidad = svg(
  <>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </>,
);

const IconoEscudo = svg(
  <>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    <path d="M12 8v4M12 16h.01" />
  </>,
);

const IconoRenovacion = svg(
  <>
    <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
    <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
    <path d="M3 21v-5h5M21 3v5h-5" />
  </>,
);

const IconoCartera = svg(
  <>
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M2 13h20" />
  </>,
);

const IconoActualizar = svg(
  <>
    <path d="M21 12a9 9 0 1 1-2.6-6.4" />
    <path d="M21 3v6h-6" />
  </>,
);

const IconoImpresora = svg(
  <>
    <path d="M6 9V3h12v6" />
    <rect x="6" y="14" width="12" height="8" rx="1" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" />
  </>,
);

const IconoFlecha = svg(
  <>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </>,
);

const IconoExcel = svg(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M9 3v18" />
  </>,
);

/* ------------------------------------------------------------------ */
/* Configuración de pestañas                                           */
/* ------------------------------------------------------------------ */

const TABS: {
  id: PeriodoReporte;
  etiqueta: string;
  foco: string;
}[] = [
  { id: "hoy", etiqueta: "Hoy", foco: "Operativo y gestión de campo" },
  {
    id: "semana",
    etiqueta: "Esta semana",
    foco: "Táctico y rendimiento de cartera",
  },
  {
    id: "historico",
    etiqueta: "Histórico / Analítico",
    foco: "Análisis por rango de fechas",
  },
];

type PresetHistorico = "mes" | "dos" | "seis" | "anio" | "custom";

type RangoFechas = { desde: string; hasta: string };

const rangoDePreset = (
  preset: Exclude<PresetHistorico, "custom">,
  hoy: string,
): RangoFechas => {
  switch (preset) {
    case "dos":
      return { desde: mesesAtrasYMD(hoy, 1), hasta: hoy };
    case "seis":
      return { desde: mesesAtrasYMD(hoy, 5), hasta: hoy };
    case "anio":
      return { desde: inicioAnioYMD(hoy), hasta: hoy };
    case "mes":
    default:
      return { desde: inicioMesYMD(hoy), hasta: hoy };
  }
};

const pct = (n: number) => `${n.toFixed(1)}%`;

const inputFechaCls =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none transition [color-scheme:dark] focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40";

/* ------------------------------------------------------------------ */
/* Sección: reporte diario                                             */
/* ------------------------------------------------------------------ */

function SeccionDiaria({
  datos,
  cargando,
}: {
  datos: Reportes;
  cargando: boolean;
}) {
  const d = datos.diario;
  const hayMora = d.montoTotalMora > 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            Reporte diario
          </h2>
          <p className="text-xs text-slate-400">
            Lo que vence hoy, la mora acumulada y la ruta de cobro
          </p>
        </div>
        <span className="rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1 text-[11px] font-medium capitalize text-slate-300">
          {formatearFechaLarga(d.fecha)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaKPI
          titulo="Caja recaudada hoy"
          valor={formatearMoneda(d.cajaHoy)}
          detalle={`${d.transaccionesHoy} ${
            d.transaccionesHoy === 1
              ? "transacción registrada"
              : "transacciones registradas"
          } hoy`}
          tono="emerald"
          icono={IconoDinero}
          cargando={cargando}
        />
        <TarjetaKPI
          titulo="Cobros programados para hoy"
          valor={formatearMoneda(d.montoProgramadoHoy)}
          detalle={`${d.totalCuotasHoy} ${
            d.totalCuotasHoy === 1 ? "cuota vence hoy" : "cuotas vencen hoy"
          } · ${d.clientesHoyUnicos} ${
            d.clientesHoyUnicos === 1 ? "cliente" : "clientes"
          }`}
          tono="blue"
          icono={IconoRecibo}
          cargando={cargando}
        />
        <TarjetaKPI
          titulo="Mora vencida acumulada"
          valor={formatearMoneda(d.montoTotalMora)}
          detalle={
            hayMora
              ? `${d.totalCuotasVencidas} ${
                  d.totalCuotasVencidas === 1 ? "cuota" : "cuotas"
                } · ${d.clientesMorososUnicos} ${
                  d.clientesMorososUnicos === 1 ? "cliente" : "clientes"
                } en mora`
              : "Sin cuotas vencidas"
          }
          tono={hayMora ? "amber" : "slate"}
          icono={IconoAlerta}
          cargando={cargando}
        />
        <TarjetaKPI
          titulo="Total clientes a visitar"
          valor={String(d.clientesVisitar)}
          detalle="Unión de cuotas de hoy + clientes en mora"
          tono="indigo"
          icono={IconoRuta}
          cargando={cargando}
        />
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 p-5 shadow-lg shadow-slate-950/30 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100">
            Ruta de cobro del día
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {d.clientesVisitar > 0
              ? `${d.clientesVisitar} ${
                  d.clientesVisitar === 1 ? "cliente" : "clientes"
                } a visitar entre cobros programados y mora acumulada.`
              : "No hay cuotas pendientes ni mora. La cartera está al día."}
          </p>
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
  );
}

/* ------------------------------------------------------------------ */
/* Sección: reporte semanal                                            */
/* ------------------------------------------------------------------ */

function SeccionSemanal({
  datos,
  cargando,
}: {
  datos: Reportes;
  cargando: boolean;
}) {
  const s = datos.semanal;
  const totalSemana = s.dias.reduce((acc, d) => acc + d.monto, 0);
  const tramos = s.tramos;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            Reporte semanal
          </h2>
          <p className="text-xs text-slate-400">
            Efectividad de cobranza, capital y envejecimiento de mora
          </p>
        </div>
        <span className="rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1 text-[11px] font-medium capitalize text-slate-300">
          {formatearRangoFechas(s.desde, s.hasta)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaKPI
          titulo="Efectividad de cobranza"
          valor={pct(s.efectividad)}
          detalle={`${formatearMoneda(s.recaudado)} de ${formatearMoneda(
            s.proyectado,
          )} proyectado`}
          tono={
            s.efectividad >= 85
              ? "emerald"
              : s.efectividad >= 60
                ? "amber"
                : "red"
          }
          icono={IconoObjetivo}
          cargando={cargando}
        />
        <TarjetaKPI
          titulo="Capital colocado"
          valor={formatearMoneda(s.capitalColocado)}
          detalle={`${s.prestamosColocados} ${
            s.prestamosColocados === 1 ? "préstamo" : "préstamos"
          } · ${formatearRangoFechas(s.desde, s.hasta)}`}
          tono="blue"
          icono={IconoSube}
          cargando={cargando}
        />
        <TarjetaKPI
          titulo="Capital recuperado"
          valor={formatearMoneda(s.capitalRecuperado)}
          detalle={`Amortización cobrada · ${formatearRangoFechas(
            s.desde,
            s.hasta,
          )}`}
          tono="indigo"
          icono={IconoBaja}
          cargando={cargando}
        />
        <TarjetaKPI
          titulo="Mora real vencida"
          valor={formatearMoneda(s.moraTotal)}
          detalle={`${s.moraCuotas} ${
            s.moraCuotas === 1 ? "cuota" : "cuotas"
          } · ${s.moraClientes} ${
            s.moraClientes === 1 ? "cliente" : "clientes"
          }`}
          tono={s.moraTotal > 0 ? "red" : "slate"}
          icono={IconoAlerta}
          cargando={cargando}
        />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-slate-950/30">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Recaudación por día
            </h3>
            <p className="text-xs text-slate-400">
              Lunes a sábado de la semana en curso
            </p>
          </div>
          <p className="text-lg font-bold tabular-nums text-emerald-400">
            {formatearMoneda(totalSemana)}
          </p>
        </div>
        <div className="mt-5">
          <BarrasSemana dias={s.dias} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-100">
            Aging de mora por tramo
          </h3>
          <p className="text-xs text-slate-400">
            Saldo pendiente de cuotas vencidas
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {tramos.map((t) => (
            <TarjetaKPI
              key={t.clave}
              titulo={`${t.etiqueta} · ${t.rango}`}
              valor={formatearMoneda(t.monto)}
              detalle={`${t.cuotas} ${
                t.cuotas === 1 ? "cuota" : "cuotas"
              } · ${t.clientes} ${
                t.clientes === 1 ? "cliente" : "clientes"
              }`}
              tono={
                t.clave === "blanda"
                  ? "amber"
                  : t.clave === "alerta"
                    ? "orange"
                    : "red"
              }
              icono={IconoAlerta}
              cargando={cargando}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Sección: reporte histórico / analítico                              */
/* ------------------------------------------------------------------ */

function SeccionHistorico({
  datos,
  cargando,
}: {
  datos: ReporteHistorico;
  cargando: boolean;
}) {
  const d = datos;
  const resultado = d.interes - d.moraReal;
  const etiquetaPeriodo =
    d.granularidad === "mes"
      ? `${d.meses.length} ${d.meses.length === 1 ? "mes" : "meses"}`
      : `${d.diasRango} ${d.diasRango === 1 ? "día" : "días"}`;
  const recuperacion =
    d.capitalColocado > 0
      ? (d.capitalRecuperado / d.capitalColocado) * 100
      : 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            Reporte histórico
          </h2>
          <p className="text-xs text-slate-400">
            Rentabilidad acumulada, capital y evolución del rango seleccionado
          </p>
        </div>
        <span className="rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1 text-[11px] font-medium capitalize text-slate-300">
          {formatearRangoFechas(d.desde, d.hasta)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaKPI
          titulo="Rentabilidad real acumulada"
          valor={formatearMoneda(d.interes)}
          detalle={`Intereses cobrados · ${d.cobros} ${
            d.cobros === 1 ? "cobro" : "cobros"
          } · ${etiquetaPeriodo}`}
          tono="emerald"
          icono={IconoRentabilidad}
          cargando={cargando}
        />
        <TarjetaKPI
          titulo="Total colocado"
          valor={formatearMoneda(d.capitalColocado)}
          detalle={`${d.prestamosColocados} ${
            d.prestamosColocados === 1 ? "préstamo" : "préstamos"
          } · capital inyectado`}
          tono="blue"
          icono={IconoSube}
          cargando={cargando}
        />
        <TarjetaKPI
          titulo="Total recuperado"
          valor={formatearMoneda(d.capitalRecuperado)}
          detalle={
            d.capitalColocado > 0
              ? `${pct(recuperacion)} del capital colocado`
              : "Amortización cobrada en el periodo"
          }
          tono="indigo"
          icono={IconoBaja}
          cargando={cargando}
        />
        <TarjetaKPI
          titulo="Recaudado total"
          valor={formatearMoneda(d.recaudado)}
          detalle={`${d.cobros} ${
            d.cobros === 1 ? "transacción" : "transacciones"
          } · ${etiquetaPeriodo}`}
          tono="slate"
          icono={IconoDinero}
          cargando={cargando}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-slate-950/30 xl:col-span-3">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                {d.granularidad === "mes"
                  ? "Recaudación por mes"
                  : "Recaudación por día"}
              </h3>
              <p className="text-xs text-slate-400">
                {d.granularidad === "mes"
                  ? "Evolución mensual del rango seleccionado"
                  : "Detalle diario del rango seleccionado"}
              </p>
            </div>
            <p className="text-lg font-bold tabular-nums text-emerald-400">
              {formatearMoneda(d.recaudado)}
            </p>
          </div>
          <BarrasPeriodo puntos={d.serie} unidad={d.granularidad} />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-slate-950/30 xl:col-span-2">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Estado de resultados
              </h3>
              <p className="text-xs text-slate-400">
                Simplificado · rango activo
              </p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800/80 text-slate-400 ring-1 ring-inset ring-slate-700/60">
              {IconoEscudo}
            </span>
          </div>

          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-400">Recaudado total</dt>
              <dd className="font-semibold tabular-nums text-slate-200">
                {formatearMoneda(d.recaudado)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-400">Intereses cobrados</dt>
              <dd className="font-semibold tabular-nums text-emerald-400">
                + {formatearMoneda(d.interes)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-400">Capital recuperado</dt>
              <dd className="font-semibold tabular-nums text-slate-300">
                {formatearMoneda(d.capitalRecuperado)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-400">Mora real vencida (hoy)</dt>
              <dd className="font-semibold tabular-nums text-red-400">
                − {formatearMoneda(d.moraReal)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-3">
              <dt className="font-semibold text-slate-100">
                Resultado del periodo
              </dt>
              <dd
                className={`text-lg font-bold tabular-nums ${
                  resultado >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {formatearMoneda(resultado)}
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
            Los intereses y el capital corresponden al rango elegido. La mora se
            muestra como provisión referencial con la foto actual del negocio.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-slate-950/30 xl:col-span-3">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Cartera actual
              </h3>
              <p className="text-xs text-slate-400">
                Foto de hoy: no depende del rango seleccionado
              </p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 ring-1 ring-inset ring-indigo-500/20">
              {IconoCartera}
            </span>
          </div>
          <DonutCartera segmentos={d.segmentosCartera} />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-slate-950/30 xl:col-span-2">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Movimiento de préstamos
              </h3>
              <p className="text-xs text-slate-400">
                Altas, liquidaciones y renovaciones del rango
              </p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 ring-1 ring-inset ring-blue-500/20">
              {IconoRenovacion}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Liquidados
              </dt>
              <dd className="mt-1 text-xl font-bold tabular-nums text-slate-100">
                {d.liquidados}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Nuevos
              </dt>
              <dd className="mt-1 text-xl font-bold tabular-nums text-slate-100">
                {d.nuevos}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Renovados
              </dt>
              <dd className="mt-1 text-xl font-bold tabular-nums text-slate-100">
                {d.renovados}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Renovación
              </dt>
              <dd className="mt-1 text-xl font-bold tabular-nums text-blue-400">
                {pct(d.tasaRenovacion)}
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
            Cartera actual {formatearMoneda(d.carteraActiva)} · mora{" "}
            {pct(d.morosidad)} sobre cartera.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

function EsqueletoReportes() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-36 animate-pulse rounded-2xl border border-slate-800 bg-slate-800/60"
        />
      ))}
    </div>
  );
}

export default function ReportesPage() {
  const hoyBase = hoyPeruYMD();
  const rangoInicial = rangoDePreset("mes", hoyBase);

  const [periodo, setPeriodo] = useState<PeriodoReporte>("hoy");
  const [datos, setDatos] = useState<Reportes | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  const [preset, setPreset] = useState<PresetHistorico>("mes");
  const [rango, setRango] = useState<RangoFechas>(rangoInicial);
  const [desdeCustom, setDesdeCustom] = useState(rangoInicial.desde);
  const [hastaCustom, setHastaCustom] = useState(rangoInicial.hasta);
  const [errorRango, setErrorRango] = useState<string | null>(null);
  const [historico, setHistorico] = useState<ReporteHistorico | null>(null);
  const [cargandoHistorico, setCargandoHistorico] = useState(
    Boolean(supabase),
  );
  const [errorHistorico, setErrorHistorico] = useState<string | null>(null);
  const [exportando, setExportando] = useState<"excel" | "pdf" | null>(null);
  const [errorExport, setErrorExport] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;

    const cargar = async () => {
      if (!supabase) {
        if (activo) {
          setError(
            "Supabase no está configurado. Revisa las variables de entorno.",
          );
          setCargando(false);
        }
        return;
      }

      try {
        const res = await getReportes(supabase);
        if (!activo) return;
        setDatos(res);
        setError(null);
      } catch (e) {
        if (!activo) return;
        setError(
          e instanceof Error
            ? e.message
            : "No se pudieron cargar los reportes financieros.",
        );
      } finally {
        if (activo) setCargando(false);
      }
    };

    void cargar();
    return () => {
      activo = false;
    };
  }, [recarga]);

  useEffect(() => {
    if (periodo !== "historico" || !supabase) return;
    let activo = true;

    const cargar = async () => {
      setCargandoHistorico(true);
      try {
        const res = await getReporteHistorico(
          supabase,
          rango.desde,
          rango.hasta,
        );
        if (!activo) return;
        setHistorico(res);
        setErrorHistorico(null);
      } catch (e) {
        if (!activo) return;
        setErrorHistorico(
          e instanceof Error
            ? e.message
            : "No se pudo cargar el reporte histórico.",
        );
      } finally {
        if (activo) setCargandoHistorico(false);
      }
    };

    void cargar();
    return () => {
      activo = false;
    };
  }, [periodo, rango.desde, rango.hasta, recarga]);

  const actualizar = () => {
    setCargando(true);
    setCargandoHistorico(true);
    setRecarga((valor) => valor + 1);
  };

  const cambiarRango = (nuevo: RangoFechas) => {
    if (nuevo.desde === rango.desde && nuevo.hasta === rango.hasta) return;
    setHistorico(null);
    setCargandoHistorico(true);
    setRango(nuevo);
  };

  const elegirPreset = (siguiente: PresetHistorico) => {
    setPreset(siguiente);
    setErrorRango(null);

    if (siguiente === "custom") {
      setDesdeCustom(rango.desde);
      setHastaCustom(rango.hasta);
      return;
    }

    cambiarRango(rangoDePreset(siguiente, hoyPeruYMD()));
  };

  const aplicarRango = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!desdeCustom || !hastaCustom) {
      setErrorRango("Selecciona la fecha de inicio y la fecha de fin.");
      return;
    }
    if (desdeCustom > hastaCustom) {
      setErrorRango("La fecha 'Desde' no puede ser posterior a 'Hasta'.");
      return;
    }

    setErrorRango(null);
    cambiarRango({ desde: desdeCustom, hasta: hastaCustom });
  };

  const presets: { id: PresetHistorico; etiqueta: string }[] = [
    { id: "mes", etiqueta: "Este Mes" },
    { id: "dos", etiqueta: "Últimos 2 Meses" },
    { id: "seis", etiqueta: "Últimos 6 Meses" },
    { id: "anio", etiqueta: `Año Actual (${hoyBase.slice(0, 4)})` },
    { id: "custom", etiqueta: "Rango Personalizado" },
  ];

  const hoy = datos?.hoy ?? hoyBase;
  const tabActiva = TABS.find((t) => t.id === periodo) ?? TABS[0];
  const mostrarSkeleton = cargando && !datos;
  const cargandoVisible =
    periodo === "historico" ? cargandoHistorico : cargando;
  const errorVisible =
    periodo === "historico"
      ? (errorHistorico ?? (supabase ? null : error))
      : error;

  const exportar = (formato: "excel" | "pdf") => {
    const origen = periodo === "historico" ? historico : datos;
    if (!origen) {
      setErrorExport(
        cargandoVisible
          ? "Espera a que terminen de cargar los datos."
          : "No hay datos disponibles para exportar.",
      );
      return;
    }

    setErrorExport(null);
    setExportando(formato);
    try {
      const preparado = prepararDatosExportacion({
        periodo,
        datos,
        historico,
        rango,
        hoy,
      });
      const sufijo =
        periodo === "historico" ? `${rango.desde}_${rango.hasta}` : hoy;
      const nombre = `Reporte_Financiero_${periodo}_${sufijo}`;

      if (formato === "excel") {
        descargarArchivo(
          generarXlsx(preparado),
          `${nombre}.xlsx`,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
      } else {
        descargarArchivo(
          generarPdf(preparado),
          `${nombre}.pdf`,
          "application/pdf",
        );
      }
    } catch (e) {
      setErrorExport(
        e instanceof Error
          ? `No se pudo generar el archivo: ${e.message}`
          : "No se pudo generar el archivo.",
      );
    } finally {
      setExportando(null);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      {/* Encabezado */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/80">
            Gestión financiera
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
            Reportes y KPIs Financieros
          </h1>
          <p className="mt-1 text-sm capitalize text-slate-400">
            {formatearFechaLarga(hoy)} · Zona horaria Perú
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-xs font-medium text-slate-300">
            <span
              className={`h-2 w-2 rounded-full ${
                errorVisible
                  ? "bg-red-500"
                  : cargandoVisible
                    ? "animate-pulse bg-amber-400"
                    : "bg-emerald-500"
              }`}
              aria-hidden="true"
            />
            {errorVisible
              ? "Datos no disponibles"
              : cargandoVisible
                ? "Actualizando..."
                : "Datos al día"}
          </span>
          <button
            type="button"
            onClick={actualizar}
            disabled={cargandoVisible}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/70 px-3 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
          >
            <span className={cargandoVisible ? "animate-spin" : ""}>
              {IconoActualizar}
            </span>
            Actualizar
          </button>
          <button
            type="button"
            onClick={() => exportar("excel")}
            disabled={exportando !== null || cargandoVisible}
            title="Descargar reporte en Excel"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/70 px-3 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
          >
            <span className={exportando === "excel" ? "animate-spin" : ""}>
              {exportando === "excel" ? IconoActualizar : IconoExcel}
            </span>
            Excel
          </button>
          <button
            type="button"
            onClick={() => exportar("pdf")}
            disabled={exportando !== null || cargandoVisible}
            title="Descargar reporte en PDF"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/70 px-3 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
          >
            <span className={exportando === "pdf" ? "animate-spin" : ""}>
              {exportando === "pdf" ? IconoActualizar : IconoImpresora}
            </span>
            PDF
          </button>
        </div>
      </header>

      {/* Selector de periodo */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-2 sm:flex-row sm:items-center sm:justify-between sm:pr-4">
        <div className="flex flex-1 rounded-xl bg-slate-950/70 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPeriodo(tab.id)}
              aria-pressed={periodo === tab.id}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${
                periodo === tab.id
                  ? "bg-emerald-600 font-bold text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab.etiqueta}
            </button>
          ))}
        </div>
        <p className="px-2 text-xs font-medium text-slate-400 sm:px-0">
          {tabActiva.foco}
        </p>
      </div>

      {/* Filtros del reporte histórico */}
      {periodo === "historico" && (
        <section
          aria-label="Selector de periodo histórico"
          className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3 shadow-lg shadow-slate-950/20"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Periodo
            </span>
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => elegirPreset(p.id)}
                aria-pressed={preset === p.id}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  preset === p.id
                    ? "bg-slate-100 text-slate-950 shadow-sm"
                    : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
                }`}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>

          {preset === "custom" && (
            <form
              onSubmit={aplicarRango}
              className="mt-3 flex flex-col gap-3 border-t border-slate-800 pt-3 sm:flex-row sm:items-end"
            >
              <label className="flex-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Desde
                <input
                  type="date"
                  value={desdeCustom}
                  max={hastaCustom || undefined}
                  onChange={(event) => setDesdeCustom(event.target.value)}
                  className={`mt-1 ${inputFechaCls}`}
                />
              </label>
              <label className="flex-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Hasta
                <input
                  type="date"
                  value={hastaCustom}
                  min={desdeCustom || undefined}
                  max={hoyBase}
                  onChange={(event) => setHastaCustom(event.target.value)}
                  className={`mt-1 ${inputFechaCls}`}
                />
              </label>
              <button
                type="submit"
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-4 text-xs font-bold text-slate-950 transition hover:bg-emerald-500"
              >
                Aplicar rango
              </button>
            </form>
          )}

          {errorRango && (
            <p className="mt-2 text-xs text-red-400">{errorRango}</p>
          )}
        </section>
      )}

      {(errorVisible || errorExport) && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-300">
          {[errorVisible, errorExport].filter(Boolean).join(" ")}
        </div>
      )}

      {periodo === "historico" ? (
        historico ? (
          <SeccionHistorico datos={historico} cargando={cargandoHistorico} />
        ) : cargandoHistorico ? (
          <EsqueletoReportes />
        ) : null
      ) : mostrarSkeleton ? (
        <EsqueletoReportes />
      ) : datos ? (
        <>
          {periodo === "hoy" && (
            <SeccionDiaria datos={datos} cargando={cargando} />
          )}
          {periodo === "semana" && (
            <SeccionSemanal datos={datos} cargando={cargando} />
          )}
        </>
      ) : null}
    </main>
  );
}
