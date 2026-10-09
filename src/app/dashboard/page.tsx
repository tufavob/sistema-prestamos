"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient, hasAuthConfig } from "@/lib/supabase";
import { formatearMoneda } from "@/lib/prestamos";
import { exportarReporteFinancieroCSV } from "@/lib/exportar";
import { ETIQUETAS_CALIFICACION, obtenerScoresClientes } from "@/lib/credito";

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
  recaudoHoy: number;
  totalPorCobrar: number;
  cuotasPorCobrar: number;
  capitalEnCalle: number;
  gananciaProyectada: number;
  prestamosActivos: number;
  totalPrestadoHoy: number;
  cajaNetaHoy: number;
  mora: MoraCliente[];
};

type RawCliente = { id: string; nombres: string; apellidos: string };
type RawCuotaMora = {
  numero_cuota?: number;
  saldo_pendiente: number;
  estado: string;
  fecha_vencimiento: string;
  prestamos:
    | { clientes: RawCliente | RawCliente[] | null }
    | { clientes: RawCliente | RawCliente[] | null }[]
    | null;
};

type RawCuotaHoy = {
  monto: number;
  saldo_pendiente: number;
  estado: string;
  fecha_vencimiento: string;
};

// Formas genéricas de filas con `select('*')` (columnas opcionales para no
// asumir nombres que pueden no existir en la BD).
type RawPrestamo = {
  id: string;
  monto?: number | null;
  monto_prestado?: number;
  monto_interes?: number;
  interes?: number;
  monto_total?: number;
  total_devolver?: number;
  estado?: string | null;
  saldo_pendiente?: number | null;
  created_at?: string;
};
type RawPago = {
  id: string;
  monto: number;
  fecha_pago: string;
  cuota_id: string;
};

type RawClienteExport = {
  id: string;
  nombres: string;
  apellidos: string;
  dni: string | null;
};

type RawPrestamoExport = {
  id: string;
  cliente_id: string | null;
  estado?: string | null;
  monto?: number | null;
  monto_prestado?: number | null;
  monto_total?: number | null;
};

type RawCuotaExport = {
  prestamo_id: string | null;
  estado: string | null;
  saldo_pendiente?: number | null;
  monto?: number | null;
};

const ESTADOS_POR_COBRAR = ["pendiente", "parcial", "vencido"];

const primero = <T,>(x: T | T[] | null | undefined): T | null =>
  Array.isArray(x) ? (x[0] ?? null) : (x ?? null);

const aDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const diasMora = (hoy: string, fecha: string) =>
  Math.max(1, Math.round((aDate(hoy).getTime() - aDate(fecha).getTime()) / 86400000));

// Proporción de interés de cada préstamo: (monto_total - monto) / monto_total.
// Se usa para desglosar capital vs. ganancia en saldos y cobros.
  const proporcionGanancia = (p: RawPrestamo): number => {
    const monto = Number(p.monto_prestado ?? p.monto ?? 0);
    const totalDevolver = Number(p.monto_total ?? p.total_devolver ?? monto * 1.2);
    return totalDevolver > 0
      ? Math.max(0, (totalDevolver - monto) / totalDevolver)
      : 0.1666;
  };

export default function Dashboard() {
  const [cargando, setCargando] = useState(true);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [datos, setDatos] = useState<ResultadoDashboard | null>(null);
  const [exportando, setExportando] = useState(false);

  const obtenerDashboard = useCallback(async (): Promise<ResultadoDashboard | null> => {
    if (!supabase) return null;
    const hoy = new Date().toLocaleDateString("en-CA");

    let totalPorCobrar = 0;
    let cuotasPorCobrar = 0;
    let recaudoHoy = 0;
    let prestamosActivos = 0;
    let totalPrestadoHoy = 0;
    let capitalEnCalle = 0;
    let gananciaProyectada = 0;

    // 1) Pagos y préstamos con `select('*')` para evitar errores 400 por
    //    nombres de columnas inexistentes. Se asocian en memoria por IDs.
    const [pagosRes, prestamosResRaw] = await Promise.all([
      supabase.from("pagos").select("*"),
      supabase
        .from("prestamos")
        .select("*")
        .eq("estado", "activo"),
    ]);

    const prestamoPorId = new Map<string, RawPrestamo>();
    if (prestamosResRaw.error) {
      console.error("Dashboard (préstamos):", prestamosResRaw.error.message);
    } else {
      for (const p of (prestamosResRaw.data ?? []) as unknown as RawPrestamo[]) {
        prestamoPorId.set(p.id, p);
      }
    }

    // Total prestado HOY (desembolsos de la fecha actual) para la caja neta.
    for (const p of prestamoPorId.values()) {
      const fechaCreacion = String(p.created_at ?? "").substring(0, 10);
      if (fechaCreacion === hoy) {
        totalPrestadoHoy += Number(p.monto_prestado ?? p.monto ?? 0);
      }
    }

    if (pagosRes.error) {
      console.error("Dashboard (pagos):", pagosRes.error.message);
    } else {
      for (const p of (pagosRes.data ?? []) as unknown as RawPago[]) {
        const montoPago = Number(p.monto ?? 0);
        // Fecha segura: "YYYY-MM-DD" vía substring (evita descuadres UTC).
        const fechaPagoStr = String(p.fecha_pago ?? "").substring(0, 10);
        if (fechaPagoStr === hoy) {
          recaudoHoy += montoPago;
        }
      }
    }

    // 2) Por cobrar HOY, cuotas pendientes (para cartera activa por cuotas) y mora.
    const [porCobrarRes, moraRes, cuotasPendientesRes] = await Promise.all([
      supabase
        .from("cuotas")
        .select("monto, saldo_pendiente, estado, fecha_vencimiento")
        .eq("fecha_vencimiento", hoy)
        .eq("estado", "pendiente"),
      supabase
        .from("cuotas")
        .select(
          "numero_cuota, saldo_pendiente, estado, fecha_vencimiento, prestamos!inner(clientes!inner(id, nombres, apellidos))",
        )
        .lt("fecha_vencimiento", hoy)
        .in("estado", ESTADOS_POR_COBRAR),
      supabase.from("cuotas").select("*"),
    ]);

    // Log de control solicitado
    if (cuotasPendientesRes.error) {
      console.error(
        "Dashboard (cuotas para cartera activa):",
        cuotasPendientesRes.error.message,
      );
    } else {
      console.log(
        "Préstamos/Cuotas activas encontradas:",
        cuotasPendientesRes.data,
      );
    }

    // Cartera activa basada en CUOTAS pendientes (no depende solo del estado del préstamo)
    const prestamosActivosSet = new Set<string>();
    capitalEnCalle = 0;
    gananciaProyectada = 0;
    if (!cuotasPendientesRes.error) {
      for (const c of (cuotasPendientesRes.data ?? []) as unknown as Array<{
        id: string;
        prestamo_id: string;
        estado?: string | null;
        monto?: number | null;
        monto_pagado?: number | null;
        saldo_pendiente?: number | null;
      }>) {
        const estadoCuota = String(c.estado ?? "").toLowerCase();
        if (estadoCuota === "pagado") continue;
        const montoCuota = Number(c.monto ?? 0);
        const montoPagadoCuota = Number(c.monto_pagado ?? 0);
        if (montoPagadoCuota >= montoCuota) continue;
        const saldoPendCuota = Number(c.saldo_pendiente ?? 0);
        if (saldoPendCuota <= 0) continue;

        const prestamo = prestamoPorId.get(c.prestamo_id);
        if (!prestamo) continue;

        const prop = proporcionGanancia(prestamo);
        capitalEnCalle += saldoPendCuota * (1 - prop);
        gananciaProyectada += saldoPendCuota * prop;
        prestamosActivosSet.add(c.prestamo_id);
      }
    }
    prestamosActivos = prestamosActivosSet.size;

    if (porCobrarRes.error) {
      console.error(
        "Dashboard (cuotas con vencimiento hoy):",
        porCobrarRes.error.message,
      );
    } else {
      for (const cuota of (porCobrarRes.data ?? []) as unknown as RawCuotaHoy[]) {
        totalPorCobrar += Number(cuota.saldo_pendiente ?? 0);
        cuotasPorCobrar += 1;
      }
    }

    const moraMap = new Map<string, MoraCliente>();
    if (moraRes.error) {
      console.error("Dashboard (cuotas en mora):", moraRes.error.message);
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

    const moraOrdenada = Array.from(moraMap.values()).sort(
      (a, b) => b.montoVencido - a.montoVencido,
    );

    return {
      error: null,
      hoy,
      recaudoHoy: Math.round(recaudoHoy * 100) / 100,
      totalPorCobrar: Math.round(totalPorCobrar * 100) / 100,
      cuotasPorCobrar,
      capitalEnCalle: Math.round(capitalEnCalle * 100) / 100,
      gananciaProyectada: Math.round(gananciaProyectada * 100) / 100,
      prestamosActivos,
      totalPrestadoHoy: Math.round(totalPrestadoHoy * 100) / 100,
      cajaNetaHoy: Math.round((recaudoHoy - totalPrestadoHoy) * 100) / 100,
      mora: moraOrdenada,
    };
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
    try {
      const [prestamosRes, clientesRes, cuotasRes, pagosRes] = await Promise.all([
        supabase.from("prestamos").select("*"),
        supabase
          .from("clientes")
          .select("id, nombres, apellidos, dni"),
        supabase.from("cuotas").select("*"),
        supabase.from("pagos").select("*"),
      ]);

      const primerError =
        prestamosRes.error ??
        clientesRes.error ??
        cuotasRes.error ??
        pagosRes.error;
      if (primerError) {
        setErrorGlobal(`No se pudo exportar el reporte: ${primerError.message}`);
        return;
      }

      const prestamos = (prestamosRes.data ?? []) as unknown as RawPrestamoExport[];
      const clientesRaw = (clientesRes.data ?? []) as unknown as RawClienteExport[];
      const cuotasRaw = (cuotasRes.data ?? []) as unknown as RawCuotaExport[];
      const pagosRaw = (pagosRes.data ?? []) as unknown as RawPago[];

      const clientePorId = new Map(clientesRaw.map((c) => [c.id, c]));

      const cuotasPorPrestamo = new Map<string, RawCuotaExport[]>();
      for (const c of cuotasRaw) {
        if (!c.prestamo_id) continue;
        const lista = cuotasPorPrestamo.get(c.prestamo_id) ?? [];
        lista.push(c);
        cuotasPorPrestamo.set(c.prestamo_id, lista);
      }

      const r2 = (n: number) => Math.round(n * 100) / 100;

      const saldoDe = (p: RawPrestamoExport): number => {
        const cuotas = cuotasPorPrestamo.get(p.id) ?? [];
        return r2(
          cuotas
            .filter((c) => String(c.estado ?? "").toLowerCase() !== "pagado")
            .reduce((acc, c) => acc + Number(c.saldo_pendiente ?? c.monto ?? 0), 0),
        );
      };

      const totalPrestado = r2(
        prestamos.reduce(
          (acc, p) => acc + Number(p.monto_total ?? p.monto_prestado ?? p.monto ?? 0),
          0,
        ),
      );
      const totalCobrado = r2(
        pagosRaw.reduce((acc, p) => acc + Number(p.monto ?? 0), 0),
      );
      const saldoPendienteGeneral = r2(
        cuotasRaw
          .filter((c) => String(c.estado ?? "").toLowerCase() !== "pagado")
          .reduce((acc, c) => acc + Number(c.saldo_pendiente ?? c.monto ?? 0), 0),
      );
      const cobrosDelDia = r2(
        pagosRaw
          .filter(
            (p) => String(p.fecha_pago ?? "").substring(0, 10) === datos.hoy,
          )
          .reduce((acc, p) => acc + Number(p.monto ?? 0), 0),
      );

      const scores = await obtenerScoresClientes(
        supabase,
        prestamos
          .map((p) => p.cliente_id)
          .filter((x): x is string => Boolean(x)),
      );

      const cartera = prestamos.map((p) => {
        const cliente = p.cliente_id ? clientePorId.get(p.cliente_id) : null;
        const saldo = saldoDe(p);
        const finalizado =
          saldo <= 0 ||
          ["finalizado", "liquidado", "cancelado"].includes(
            String(p.estado ?? "").toLowerCase(),
          );
        const calificacion = p.cliente_id
          ? scores.get(p.cliente_id)?.calificacion
          : undefined;
        return {
          cliente: cliente
            ? `${cliente.nombres} ${cliente.apellidos}`
            : "Cliente eliminado",
          dni: cliente?.dni ?? "",
          calificacion: calificacion
            ? ETIQUETAS_CALIFICACION[calificacion]
            : "",
          monto: Number(p.monto_prestado ?? p.monto ?? 0),
          saldoPendiente: saldo,
          estado: finalizado ? "Finalizado" : "Activo",
        };
      });

      exportarReporteFinancieroCSV(
        {
          totalPrestado,
          totalCobrado,
          saldoPendienteGeneral,
          cobrosDelDia,
        },
        cartera,
        datos.hoy,
      );
    } catch {
      setErrorGlobal(
        "No se pudo exportar el reporte. Intenta nuevamente.",
      );
    } finally {
      setExportando(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl dark:text-zinc-50">
            Dashboard financiero
          </h1>
          <p className="mt-1 text-sm text-slate-400 dark:text-zinc-400">
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
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-950/50 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
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
        <div className="rounded-lg border border-amber-800 bg-amber-950/60 p-4 text-sm text-amber-300 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Configura las variables{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> en{" "}
          <code className="font-mono">.env.local</code>.
        </div>
      )}

      {errorGlobal && (
        <div className="rounded-lg border border-red-800 bg-red-950/60 p-4 text-sm text-red-300 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {errorGlobal}
        </div>
      )}

{/* TARJETA 1: CAJA DEL DÍA */}
      <section aria-label="Caja del día" className="rounded-2xl border border-slate-800/80 bg-slate-900/80 p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Caja del Día
          </p>
          <span className="shrink-0 rounded-lg bg-teal-950/70 p-2 text-teal-400">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 3v18h18" />
              <path d="m7 14 4-4 3 3 5-6" />
            </svg>
          </span>
        </div>
        {cargando || !datos ? (
          <div className="mt-4 h-20 animate-pulse rounded-xl border-2 border-slate-800 bg-slate-800/60 shadow-sm" />
        ) : (
          <>
            <p className={`mt-3 text-3xl font-black tracking-tight ${datos.cajaNetaHoy < 0 ? "text-red-400" : "text-emerald-400"}`}>
              {formatearMoneda(datos.cajaNetaHoy)}
            </p>
            <p className="mt-3 text-sm font-medium text-slate-400">
              Cobrado: {formatearMoneda(datos.recaudoHoy)} · Prestado: {formatearMoneda(datos.totalPrestadoHoy)}
            </p>
          </>
        )}
      </section>

      {/* TARJETA 2: COBRANZA DE HOY */}
      <section aria-label="Cobranza de hoy" className="rounded-2xl border border-slate-800/80 bg-slate-900/80 p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Cobranza de Hoy
          </p>
          <span className="shrink-0 rounded-lg bg-amber-950/70 p-2 text-amber-400">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
          </span>
        </div>
        {cargando || !datos ? (
          <div className="mt-4 h-20 animate-pulse rounded-xl border-2 border-slate-800 bg-slate-800/60 shadow-sm" />
        ) : (
          <>
            <p className="mt-3 text-3xl font-black tracking-tight text-emerald-400">
              {formatearMoneda(datos.totalPorCobrar)}
            </p>
            <p className="mt-3 text-sm font-medium text-slate-400">
              {datos.cuotasPorCobrar} cuota
              {datos.cuotasPorCobrar === 1 ? "" : "s"} programada
              {datos.cuotasPorCobrar === 1 ? "" : "s"} para hoy
            </p>
            <Link
              href="/cobros"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-3 text-sm font-bold text-white shadow-md shadow-emerald-950/40 transition hover:from-emerald-500 hover:to-teal-400"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              Ir a Ruta de Cobro
            </Link>
          </>
        )}
      </section>

      {/* TARJETA 3: CAPITAL Y GANANCIA ACTIVA */}
      <section aria-label="Capital y ganancia activa" className="rounded-2xl border border-slate-800/80 bg-slate-900/80 p-5 shadow-sm sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
          Capital y Ganancia Activa
        </p>
        {cargando || !datos ? (
          <div className="mt-4 h-20 animate-pulse rounded-xl border-2 border-slate-800 bg-slate-800/60 shadow-sm" />
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Fierro (capital por recuperar)
              </p>
              <p className="mt-1.5 text-2xl font-black tracking-tight text-slate-100">
                {formatearMoneda(datos.capitalEnCalle)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-400">
                Ganancia (interés por recuperar)
              </p>
              <p className="mt-1.5 text-2xl font-black tracking-tight text-emerald-400">
                {formatearMoneda(datos.gananciaProyectada)}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* TARJETA 4: CLIENTES EN MORA */}
      <section aria-label="Clientes en mora" className={`rounded-2xl border-2 p-5 shadow-sm sm:p-6 ${datos && datos.mora.length > 0 ? "border-red-900/60 bg-red-950/30" : "border-slate-800/80 bg-slate-900/80"}`}>
        <div className="flex items-center justify-between gap-3">
          <p className={`text-xs font-bold uppercase tracking-wide ${datos && datos.mora.length > 0 ? "text-red-300" : "text-slate-400"}`}>
            Clientes en Mora
          </p>
          <span className={`shrink-0 rounded-lg p-2 ${datos && datos.mora.length > 0 ? "bg-red-900/50 text-red-300" : "bg-slate-800/80 text-slate-400"}`}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-9-9" />
              <path d="M12 8v4l3 3" />
            </svg>
          </span>
        </div>
        {cargando || !datos ? (
          <div className="mt-4 h-20 animate-pulse rounded-xl border-2 border-slate-800 bg-slate-800/60 shadow-sm" />
        ) : (
          <>
            <p className={`mt-3 text-3xl font-black tracking-tight ${datos.mora.length > 0 ? "text-red-300" : "text-slate-100"}`}>
              {formatearMoneda(montoVencidoTotal)}
            </p>
            <p className="mt-3 text-sm font-medium text-slate-400">
              {datos.mora.length} cliente
              {datos.mora.length === 1 ? "" : "s"} moroso
              {datos.mora.length === 1 ? "" : "s"}
            </p>
          </>
        )}
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
