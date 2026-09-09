"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient, hasAuthConfig } from "@/lib/supabase";
import { aYMD, formatearMoneda, hoyLocal } from "@/lib/prestamos";
import { crearLinkWhatsApp, mensajeComprobante, mensajeRecordatorio } from "@/lib/whatsapp";
import {
  exportarPagosCSV,
  SELECT_PAGOS_REPORTE,
  type PagoExportable,
} from "@/lib/exportar";
import { registrarCobro } from "@/lib/acciones";

const supabase = hasAuthConfig ? createClient() : null;

type ClienteCobro = {
  id: string;
  nombres: string;
  apellidos: string;
  telefono: string | null;
  direccion: string | null;
  referencia: string | null;
};

type Cobro = {
  id: string;
  numero: number;
  monto: number;
  fecha_vencimiento: string;
  estado: "pendiente" | "parcial" | "vencido" | "pagado";
  saldo_pendiente: number;
  fecha_pago?: string | null;
  prestamos: {
    numero_cuotas: number;
    clientes: ClienteCobro | null;
  } | null;
};

const formatearDiaMes = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const meses = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "set",
    "oct",
    "nov",
    "dic",
  ];
  return `${String(d.getDate()).padStart(2, "0")}-${meses[d.getMonth()]}.`;
};

const fechaPagoEsHoy = (c: Cobro) => {
  if (!c.fecha_pago) return true;
  return (
    new Date(c.fecha_pago).toLocaleDateString("sv-SE") ===
    new Date().toLocaleDateString("sv-SE")
  );
};

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-200";

const formatearFechaDB = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return s;
  return new Date(y, m - 1, d).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
  });
};

const iniciales = (c: ClienteCobro) =>
  `${c.nombres.charAt(0)}${c.apellidos.charAt(0)}`.toUpperCase() || "?";

const nombreCompleto = (c: ClienteCobro) => `${c.nombres} ${c.apellidos}`;

type PagoRegistrado = {
  nombres: string;
  telefono: string | null;
  montoPagado: number;
  numeroCuota: number;
  saldoPendiente: number;
};

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
  </svg>
);

type RawPrestamo = {
  numero_cuotas: number;
  clientes: ClienteCobro | ClienteCobro[] | null;
};

type RawCobro = {
  id: string;
  numero: number;
  monto: number;
  fecha_vencimiento: string;
  estado: Cobro["estado"];
  saldo_pendiente: number;
  fecha_pago?: string | null;
  updated_at?: string | null;
  prestamos: RawPrestamo | RawPrestamo[] | null;
};

type RawCobroPagada = RawCobro & {
  monto_pagado?: number | null;
  fecha_pago?: string | null;
  updated_at?: string | null;
};

const normalizarCobros = (raw: RawCobro[]): Cobro[] =>
  raw.map((r) => {
    const p = Array.isArray(r.prestamos) ? r.prestamos[0] : r.prestamos;
    const c = p?.clientes;
    const cliente = Array.isArray(c) ? c[0] : c;
    return {
      id: r.id,
      numero: r.numero,
      monto: r.monto,
      fecha_vencimiento: r.fecha_vencimiento,
      estado: r.estado,
      saldo_pendiente: r.saldo_pendiente,
      fecha_pago: r.fecha_pago ?? r.updated_at ?? null,
      prestamos: p
        ? { numero_cuotas: p.numero_cuotas, clientes: cliente ?? null }
        : null,
    };
  });

export default function Cobros() {
  const router = useRouter();
  const [cobros, setCobros] = useState<Cobro[]>([]);
  const [totalACobrar, setTotalACobrar] = useState(0);
  const [totalRecaudado, setTotalRecaudado] = useState(0);
  const [fechaHoy, setFechaHoy] = useState("");

  const [cargando, setCargando] = useState(true);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [abonoAbierto, setAbonoAbierto] = useState<string | null>(null);
  const [abonos, setAbonos] = useState<Record<string, string>>({});
  const [errorAbono, setErrorAbono] = useState<string | null>(null);
  const [pagoRegistrado, setPagoRegistrado] = useState<PagoRegistrado | null>(null);
  const [exportando, setExportando] = useState(false);

  type ResultadoCobros = {
  error: string | null;
  cobros: Cobro[];
  totalACobrar: number;
  totalRecaudado: number;
  hoy: string;
};

const obtenerCobros = useCallback(async (): Promise<ResultadoCobros | null> => {
    if (!supabase) return null;
    const hoy = aYMD(hoyLocal());
    const hoySVE = new Date().toLocaleDateString("sv-SE");

    // Uso `*` para no depender de columnas específicas de cada entorno.
    const seleccionCuotas =
      "*, prestamos!inner(numero_cuotas, clientes!inner(id, nombres, apellidos, telefono, direccion, referencia))";

    const [respDia, respPagadas] = await Promise.all([
      supabase
        .from("cuotas")
        .select(seleccionCuotas)
        .eq("fecha_vencimiento", hoy)
        .in("estado", ["pendiente", "parcial", "vencido", "pagado"])
        .order("fecha_vencimiento", { ascending: true }),
      supabase.from("cuotas").select(seleccionCuotas).eq("estado", "pagado"),
    ]);

    if (respDia.error) {
      return {
        error: `No se pudieron cargar los cobros: ${respDia.error.message}. Revisa que la tabla "cuotas" tenga la columna fecha_vencimiento (migración 02).`,
        cobros: [],
        totalACobrar: 0,
        totalRecaudado: 0,
        hoy,
      };
    }

    const diaCuotas = normalizarCobros((respDia.data as unknown as RawCobro[]) ?? []);

    // Recaudado hoy = cuotas pagadas cuyo cobro se registró HOY.
    // (updated_at o fecha_pago de la cuota; si no hay fecha, se asume hoy.)
    let recaudadoHoy = 0;
    const pagadasHoy: RawCobroPagada[] = [];
    if (respPagadas.error) {
      for (const c of diaCuotas) {
        if (c.estado === "pagado") recaudadoHoy += Number(c.monto);
      }
    } else {
      for (const raw of (respPagadas.data as unknown as RawCobroPagada[]) ?? []) {
        const fechaPago = raw.updated_at ?? raw.fecha_pago ?? null;
        const esHoy = fechaPago
          ? new Date(fechaPago).toLocaleDateString("sv-SE") === hoySVE
          : true;
        if (esHoy) {
          pagadasHoy.push(raw);
          recaudadoHoy += Number(raw.monto_pagado ?? raw.monto ?? 0);
        }
      }
    }

    // Listado: cuotas del día + pagadas hoy con vencimiento distinto
    // (pago adelantado o atrasado).
    const cobros = [...diaCuotas];
    const idsActuales = new Set(cobros.map((c) => c.id));
    for (const raw of pagadasHoy) {
      if (idsActuales.has(raw.id)) continue;
      idsActuales.add(raw.id);
      cobros.push(normalizarCobros([raw])[0]);
    }

    return {
      error: null,
      cobros,
      totalACobrar: diaCuotas.reduce(
        (s, c) => (c.estado === "pendiente" ? s + Number(c.monto) : s),
        0,
      ),
      totalRecaudado: recaudadoHoy,
      hoy,
    };
  }, []);

  const refrescar = async () => {
    const res = await obtenerCobros();
    if (!res) return;
    if (res.error) {
      setErrorGlobal(res.error);
      setCargando(false);
      return;
    }
    setCobros(res.cobros);
    setTotalACobrar(res.totalACobrar);
    setTotalRecaudado(res.totalRecaudado);
    setFechaHoy(res.hoy);
    setErrorGlobal(null);
    setCargando(false);
  };

  useEffect(() => {
    let activo = true;
    const iniciar = async () => {
      const res = await obtenerCobros();
      if (!activo || !res) return;
      if (res.error) {
        setErrorGlobal(res.error);
      } else {
        setCobros(res.cobros);
        setTotalACobrar(res.totalACobrar);
        setTotalRecaudado(res.totalRecaudado);
        setFechaHoy(res.hoy);
      }
      if (activo) setCargando(false);
    };
    iniciar();
    return () => {
      activo = false;
    };
  }, [obtenerCobros]);

  const progresoHoy = useMemo(() => {
    if (totalACobrar <= 0) return 0;
    return Math.min(100, Math.round((totalRecaudado / totalACobrar) * 100));
  }, [totalACobrar, totalRecaudado]);

  type GrupoCobros = {
    cliente: ClienteCobro;
    cobros: Cobro[];
  };

  const grupos = useMemo<GrupoCobros[]>(() => {
    const mapa = new Map<string, GrupoCobros>();
    for (const c of cobros) {
      const cliente = c.prestamos?.clientes;
      if (!cliente) continue;
      const actual = mapa.get(cliente.id);
      if (actual) {
        actual.cobros.push(c);
      } else {
        mapa.set(cliente.id, { cliente, cobros: [c] });
      }
    }
    return [...mapa.values()];
  }, [cobros]);

  const pagarCuota = async (c: Cobro) => {
    setMensaje(null);
    setEnviandoId(c.id);
    setErrorGlobal(null);
    const res = await registrarCobro({
      cuotaId: c.id,
      monto: Number(c.saldo_pendiente),
      fecha: aYMD(hoyLocal()),
    });
    setEnviandoId(null);
    if (!res.ok) {
      setErrorGlobal(`No se pudo registrar el pago: ${res.error}`);
      return;
    }
    setMensaje(
      `Cuota ${c.numero} pagada. Registrado en el historial de pagos.`,
    );
    const cliente = c.prestamos?.clientes ?? null;
    setPagoRegistrado(
      cliente
        ? {
            nombres: `${cliente.nombres} ${cliente.apellidos}`,
            telefono: cliente.telefono,
            montoPagado: Number(c.saldo_pendiente),
            numeroCuota: c.numero,
            saldoPendiente: 0,
          }
        : null,
    );
    router.refresh();
    await refrescar();
  };

  const abrirAbono = (c: Cobro) => {
    setAbonoAbierto((actual) => (actual === c.id ? null : c.id));
    setAbonos((prev) => ({ ...prev, [c.id]: "" }));
    setErrorAbono(null);
    setMensaje(null);
  };

  const registrarAbono = async (c: Cobro) => {
    const valor = abonos[c.id] ?? "";
    const monto = Number(valor);
    const saldo = Number(c.saldo_pendiente);
    if (!valor || !Number.isFinite(monto) || monto <= 0) {
      setErrorAbono("Ingresa un monto mayor a cero.");
      return;
    }
    if (monto >= saldo) {
      setErrorAbono("Usa un monto menor al saldo (para el total usa Pagar Cuota).");
      return;
    }
    setEnviandoId(c.id);
    setErrorGlobal(null);
    setErrorAbono(null);
    const res = await registrarCobro({
      cuotaId: c.id,
      monto,
      fecha: aYMD(hoyLocal()),
    });
    setEnviandoId(null);
    if (!res.ok) {
      setErrorGlobal(`No se pudo registrar el abono: ${res.error}`);
      return;
    }
    setMensaje(
      `Abono de ${formatearMoneda(monto)} registrado en la cuota ${c.numero}.`,
    );
    const cliente = c.prestamos?.clientes ?? null;
    setPagoRegistrado(
      cliente
        ? {
            nombres: `${cliente.nombres} ${cliente.apellidos}`,
            telefono: cliente.telefono,
            montoPagado: monto,
            numeroCuota: c.numero,
            saldoPendiente: saldo - monto,
          }
        : null,
    );
    setAbonoAbierto(null);
    setAbonos((prev) => ({ ...prev, [c.id]: "" }));
    router.refresh();
    await refrescar();
  };

  const exportarReporte = async () => {
    if (!supabase) return;
    setExportando(true);
    setErrorGlobal(null);
    const fecha = fechaHoy || aYMD(hoyLocal());
    const { data, error } = await supabase
      .from("pagos")
      .select(SELECT_PAGOS_REPORTE)
      .eq("fecha_pago", fecha);
    setExportando(false);
    if (error) {
      setErrorGlobal(`No se pudo exportar el reporte: ${error.message}`);
      return;
    }
    exportarPagosCSV((data as unknown as PagoExportable[]) ?? [], fecha);
    setMensaje("Reporte CSV exportado correctamente.");
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/"
            className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
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
              <path d="m15 18-6-6 6-6" />
            </svg>
            Volver a clientes
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
            Cobros del día
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {fechaHoy
              ? new Date(`${fechaHoy}T00:00:00`).toLocaleDateString("es-PE", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })
              : "Cargando fecha..."}
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

      {mensaje && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          {mensaje}
        </div>
      )}

      {pagoRegistrado && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950">
          <div className="text-sm text-emerald-800 dark:text-emerald-200">
            <p className="font-semibold">
              Pago registrado:{" "}
              {formatearMoneda(pagoRegistrado.montoPagado)} · cuota #
              {pagoRegistrado.numeroCuota}
            </p>
            <p className="mt-0.5 text-xs">
              {pagoRegistrado.nombres} · Saldo pendiente:{" "}
              {formatearMoneda(pagoRegistrado.saldoPendiente)}
            </p>
            {!pagoRegistrado.telefono && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                El cliente no tiene teléfono registrado; no se puede generar el
                comprobante.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {pagoRegistrado.telefono && (
              <a
                href={crearLinkWhatsApp(
                  pagoRegistrado.telefono,
                  mensajeComprobante(pagoRegistrado),
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                <WhatsAppIcon className="h-4 w-4" />
                Enviar Comprobante WhatsApp
              </a>
            )}
            <button
              type="button"
              onClick={() => setPagoRegistrado(null)}
              aria-label="Descartar comprobante"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-300 text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-900"
            >
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
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Resumen del día */}
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Por cobrar hoy
          </p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {formatearMoneda(totalACobrar)}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {cobros.filter((c) => c.estado !== "pagado").length} cuota
            {cobros.filter((c) => c.estado !== "pagado").length === 1 ? "" : "s"} por cobrar
            hoy
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm dark:border-emerald-900 dark:bg-emerald-950">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            Recaudado hoy
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">
            S/ {totalRecaudado.toFixed(2)}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-emerald-200/70 dark:bg-emerald-900">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all dark:bg-emerald-400"
              style={{ width: `${progresoHoy}%` }}
            />
          </div>
          <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {cobros.filter((c) => c.estado === "pagado").length} cuota
            {cobros.filter((c) => c.estado === "pagado").length === 1 ? "" : "s"} cobrada
            {cobros.filter((c) => c.estado === "pagado").length === 1 ? "" : "s"} hoy
          </p>
        </div>
      </section>

      {/* Lista de cobros */}
      {cargando ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
            />
          ))}
        </div>
      ) : cobros.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No hay cuotas pendientes para hoy. ¡Ruta al día!
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {grupos.map((g) => {
            const cliente = g.cliente;
            const pagadas = g.cobros.filter((c) => c.estado === "pagado");
            const pendientes = g.cobros.filter((c) => c.estado !== "pagado");
            const totalHoy = pagadas.reduce(
              (s, c) => (fechaPagoEsHoy(c) ? s + Number(c.monto) : s),
              0,
            );

            return (
              <li
                key={cliente.id}
                className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900"
              >
                {/* Cabecera del cliente */}
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white dark:bg-zinc-200 dark:text-zinc-900">
                    {iniciales(cliente)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {nombreCompleto(cliente)}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {cliente.telefono && (
                        <a
                          href={`tel:${cliente.telefono}`}
                          className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400"
                        >
                          <svg
                            className="h-3 w-3"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                          {cliente.telefono}
                        </a>
                      )}
                      {cliente.direccion && (
                        <span className="inline-flex items-center gap-1">
                          <svg
                            className="h-3 w-3"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          {cliente.direccion}
                        </span>
                      )}
                    </div>
                    {cliente.referencia && (
                      <p className="mt-0.5 truncate text-xs text-zinc-400 dark:text-zinc-500">
                        Ref: {cliente.referencia}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {totalHoy > 0 && (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        Cobrado hoy · S/ {totalHoy.toFixed(2)}
                      </span>
                    )}
                    {pendientes.length > 0 && (
                      <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {pendientes.length} por cobrar
                      </span>
                    )}
                  </div>
                </div>

                {/* Cuotas cobradas (cobradas hoy) */}
                {pagadas.length > 0 && (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 dark:border-emerald-800 dark:bg-emerald-950">
                    <ul className="flex flex-col gap-1.5">
                      {pagadas.map((c) => {
                        const adelantada = c.fecha_vencimiento > fechaHoy;
                        return (
                          <li
                            key={c.id}
                            className="flex items-center justify-between gap-3"
                          >
                            <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                              ✓ Cuota {c.numero}/
                              {c.prestamos?.numero_cuotas ?? "?"} · Cobrado el{" "}
                              {formatearDiaMes(c.fecha_pago)}
                              {adelantada && (
                                <span className="ml-1.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                                  Adelantado
                                </span>
                              )}
                            </span>
                            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                              {formatearMoneda(Number(c.monto))}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="mt-2 flex items-center justify-between border-t border-emerald-200 pt-2 text-sm dark:border-emerald-800">
                      <span className="font-medium text-emerald-800 dark:text-emerald-200">
                        Total cobrado hoy
                      </span>
                      <span className="text-base font-bold text-emerald-700 dark:text-emerald-300">
                        S/ {totalHoy.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Cuotas por cobrar */}
                {pendientes.map((c) => {
                  const saldo = Number(c.saldo_pendiente);
                  const monto = Number(c.monto);
                  const montoPagadoCuota = monto - saldo;
                  const parcial = c.estado === "parcial";
                  const vencida = c.estado === "vencido" || c.fecha_vencimiento < fechaHoy;
                  const pctCuota =
                    monto > 0
                      ? Math.min(100, Math.round((montoPagadoCuota / monto) * 100))
                      : 0;

                  return (
                    <div
                      key={c.id}
                      className={`mt-3 rounded-xl border p-3.5 ${
                        parcial
                          ? "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950"
                          : "border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-800/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {`Cuota ${c.numero} de ${c.prestamos?.numero_cuotas ?? "?"}`} ·{" "}
                          {formatearFechaDB(c.fecha_vencimiento)}
                        </p>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {cliente.telefono && (
                            <a
                              href={crearLinkWhatsApp(
                                cliente.telefono,
                                mensajeRecordatorio({
                                  nombres: nombreCompleto(cliente),
                                  numeroCuota: c.numero,
                                  monto,
                                }),
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="Enviar recordatorio por WhatsApp"
                              title="Enviar recordatorio por WhatsApp"
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700"
                            >
                              <WhatsAppIcon className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                              vencida
                                ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                : parcial
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                            }`}
                          >
                            {vencida ? "Vencida" : parcial ? "Parcial" : "Hoy"}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {parcial ? "Saldo pendiente" : "Saldo a cobrar"}
                        </p>
                        <p
                          className={`text-base font-bold ${
                            parcial
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-zinc-900 dark:text-zinc-50"
                          }`}
                        >
                          {formatearMoneda(saldo)}
                        </p>
                      </div>

                      {parcial && (
                        <div className="mt-2">
                          <div className="mb-1 flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                            <span>
                              Pagado {formatearMoneda(montoPagadoCuota)} de{" "}
                              {formatearMoneda(monto)}
                            </span>
                            <span>{pctCuota}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                            <div
                              className="h-full rounded-full bg-amber-500"
                              style={{ width: `${pctCuota}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {abonoAbierto === c.id && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            registrarAbono(c);
                          }}
                          className="mt-3 flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <label
                            htmlFor={`abono-${c.id}`}
                            className="text-xs font-medium text-zinc-600 dark:text-zinc-300"
                          >
                            Monto del abono (menor a {formatearMoneda(saldo)})
                          </label>
                          <div className="flex gap-2">
                            <input
                              id={`abono-${c.id}`}
                              type="number"
                              min={0}
                              step="0.01"
                              inputMode="decimal"
                              autoFocus
                              placeholder="0.00"
                              className={inputCls}
                              value={abonos[c.id] ?? ""}
                              onChange={(e) => {
                                setAbonos((prev) => ({
                                  ...prev,
                                  [c.id]: e.target.value,
                                }));
                                setErrorAbono(null);
                              }}
                              disabled={enviandoId === c.id}
                            />
                            <button
                              type="submit"
                              disabled={enviandoId === c.id}
                              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 px-4 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
                            >
                              {enviandoId === c.id ? <Spinner /> : "Registrar"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAbonoAbierto(null);
                                setErrorAbono(null);
                              }}
                              disabled={enviandoId === c.id}
                              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-300 text-zinc-500 transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
                              aria-label="Cancelar abono"
                            >
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
                                <path d="M18 6 6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          {errorAbono && (
                            <p className="text-xs text-red-600 dark:text-red-400">
                              {errorAbono}
                            </p>
                          )}
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            El pago total se registra con &quot;Pagar cuota&quot;.
                          </p>
                        </form>
                      )}

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={
                            abonoAbierto === c.id
                              ? () => setAbonoAbierto(null)
                              : () => abrirAbono(c)
                          }
                          disabled={enviandoId === c.id}
                          className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-300 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          {abonoAbierto === c.id ? "Cancelar" : "Abono parcial"}
                        </button>
                        <button
                          type="button"
                          onClick={() => pagarCuota(c)}
                          disabled={enviandoId === c.id}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-zinc-900 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                        >
                          {enviandoId === c.id ? (
                            <>
                              <Spinner />
                              Procesando...
                            </>
                          ) : (
                            "Pagar cuota"
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </li>
            );
          })}
        </ul>
      )}
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