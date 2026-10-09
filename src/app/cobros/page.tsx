"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient, hasAuthConfig } from "@/lib/supabase";
import { aYMD, formatearMoneda, hoyLocal } from "@/lib/prestamos";
import { crearLinkWhatsApp, mensajeComprobante, mensajeRecordatorio } from "@/lib/whatsapp";
import { exportarCobrosRutaCSV } from "@/lib/exportar";
import { registrarCobro } from "@/lib/acciones";

const supabase = hasAuthConfig ? createClient() : null;

type ClienteCobro = {
  id: string;
  nombres: string;
  apellidos: string;
  dni: string | null;
  telefono: string | null;
  direccion: string | null;
  referencia: string | null;
};

type Cobro = {
  id: string;
  numero_cuota: number;
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
  "w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

const formatearFechaDB = (s: string) => {
  if (!s) return "";
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return s;
  const fecha = new Date(y, m - 1, d);
  return fecha.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
  });
};

const extraerHora = (iso?: string | null): string => {
  if (!iso) return "";
  const m = String(iso).match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
};

const iniciales = (c: ClienteCobro) =>
  `${c.nombres.charAt(0)}${c.apellidos.charAt(0)}`.toUpperCase() || "?";

const nombreCompleto = (c: ClienteCobro) => `${c.nombres} ${c.apellidos}`;

const Spinner = () => (
  <svg
    className="h-4 w-4 animate-spin text-current"
    viewBox="0 0 24 24"
    fill="none"
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
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
);

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
  estado?: string | null;
  saldo_pendiente?: number | null;
  clientes: ClienteCobro | ClienteCobro[] | null;
};

type RawCobro = {
  id: string;
  numero_cuota: number;
  numero?: number;
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

const esPrestamoActivoConSaldo = (raw: RawCobro | RawCobroPagada): boolean => {
  const p = Array.isArray(raw.prestamos) ? raw.prestamos[0] : raw.prestamos;
  if (!p) return false;
  const estado = String(p.estado ?? "").toLowerCase();
  const saldo = Number(p.saldo_pendiente ?? 0);
  return estado === "activo" && saldo > 0;
};

const normalizarCobros = (raw: RawCobro[]): Cobro[] =>
  raw.map((r) => {
    const p = Array.isArray(r.prestamos) ? r.prestamos[0] : r.prestamos;
    const c = p?.clientes;
    const cliente = Array.isArray(c) ? c[0] : c;
    return {
      id: r.id,
      numero_cuota: r.numero_cuota ?? r.numero ?? 0,
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

    const seleccionCuotas =
      "*, prestamos!inner(numero_cuotas, estado, saldo_pendiente, clientes!inner(id, nombres, apellidos, dni, telefono, direccion, referencia))";

    const [respPendientes, respPagadas] = await Promise.all([
      supabase
        .from("cuotas")
        .select(seleccionCuotas)
        .lte("fecha_vencimiento", hoy)
        .in("estado", ["pendiente", "parcial", "vencido"])
        .eq("prestamos.estado", "activo")
        .gt("prestamos.saldo_pendiente", 0)
        .order("fecha_vencimiento", { ascending: true }),
      supabase.from("cuotas").select(seleccionCuotas).eq("estado", "pagado"),
    ]);

    if (respPendientes.error) {
      return {
        error: `No se pudieron cargar los cobros: ${respPendientes.error.message}.`,
        cobros: [],
        totalACobrar: 0,
        totalRecaudado: 0,
        hoy,
      };
    }

    const cuotasPendientes = normalizarCobros((respPendientes.data as unknown as RawCobro[]) ?? []);

    let recaudadoHoy = 0;
    const pagadasHoy: RawCobroPagada[] = [];
    if (respPagadas.error) {
      for (const c of cuotasPendientes) {
        if (c.estado === "pagado") recaudadoHoy += Number(c.monto);
      }
    } else {
      for (const raw of (respPagadas.data as unknown as RawCobroPagada[]) ?? []) {
        const fechaPago = raw.updated_at ?? raw.fecha_pago ?? null;
        const esHoy = fechaPago
          ? new Date(fechaPago).toLocaleDateString("sv-SE") === hoySVE
          : true;
        if (esHoy) {
          recaudadoHoy += Number(raw.monto_pagado ?? raw.monto ?? 0);
          if (esPrestamoActivoConSaldo(raw)) pagadasHoy.push(raw);
        }
      }
    }

    const cobrosList = [...cuotasPendientes];
    const idsActuales = new Set(cobrosList.map((c) => c.id));
    for (const raw of pagadasHoy) {
      if (idsActuales.has(raw.id)) continue;
      idsActuales.add(raw.id);
      cobrosList.push(normalizarCobros([raw])[0]);
    }

    return {
      error: null,
      cobros: cobrosList,
      totalACobrar: cuotasPendientes.reduce(
        (s, c) => (c.estado !== "pagado" ? s + Number(c.saldo_pendiente) : s),
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
    setMensaje(`Cuota ${c.numero_cuota} pagada. Registrado en el historial.`);
    const cliente = c.prestamos?.clientes ?? null;
    setPagoRegistrado(
      cliente
        ? {
            nombres: `${cliente.nombres} ${cliente.apellidos}`,
            telefono: cliente.telefono,
             montoPagado: Number(c.saldo_pendiente),
             numeroCuota: c.numero_cuota,
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
    setMensaje(`Abono de ${formatearMoneda(monto)} registrado en la cuota ${c.numero_cuota}.`);
    const cliente = c.prestamos?.clientes ?? null;
    setPagoRegistrado(
      cliente
        ? {
            nombres: `${cliente.nombres} ${cliente.apellidos}`,
            telefono: cliente.telefono,
            montoPagado: monto,
             numeroCuota: c.numero_cuota,
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
    try {
      const fechaISO = fechaHoy || aYMD(hoyLocal());
      const clienteIds = [
        ...new Set(
          cobros
            .map((c) => c.prestamos?.clientes?.id)
            .filter((x): x is string => Boolean(x)),
        ),
      ];
      const dnisPorCliente = new Map<string, string>();
      if (clienteIds.length > 0) {
        const { data } = await supabase
          .from("clientes")
          .select("id, dni")
          .in("id", clienteIds);
        if (data) {
          for (const cli of data as unknown as { id: string; dni: string | null }[]) {
            dnisPorCliente.set(cli.id, cli.dni ?? "");
          }
        }
      }

      const [y, m, d] = fechaISO.split("-").map(Number);
      const fechaMostrar = new Date(y, m - 1, d).toLocaleDateString("es-PE");

      const detalle = cobros.map((c) => {
        const cliente = c.prestamos?.clientes ?? null;
        const pagado = c.estado === "pagado";
        return {
          cliente: cliente ? nombreCompleto(cliente) : "Cliente eliminado",
          dni: cliente ? (dnisPorCliente.get(cliente.id) ?? "") : "",
          telefono: cliente?.telefono ?? "",
          direccion: cliente?.direccion ?? "",
          numeroCuota: String(c.numero_cuota),
          montoCuota: Number(c.monto),
          estado: pagado ? "PAGADO" : "PENDIENTE",
          horaPago: pagado ? extraerHora(c.fecha_pago) : "",
        };
      });

      exportarCobrosRutaCSV(
        fechaMostrar,
        fechaISO,
        totalACobrar,
        totalRecaudado,
        cobros.length,
        detalle,
      );
      setMensaje("Reporte CSV exportado correctamente.");
    } catch {
      setErrorGlobal("No se pudo exportar el reporte. Intenta nuevamente.");
    } finally {
      setExportando(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/"
            className="mb-2 inline-flex items-center gap-1 text-sm text-slate-400 transition hover:text-slate-100 dark:text-slate-500 dark:hover:text-zinc-50"
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
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl dark:text-zinc-50">
            Cobros del día
          </h1>
          <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
            {fechaHoy
              ? (() => {
                  const [y, m, d] = fechaHoy.split("-").map(Number);
                  return new Date(y, m - 1, d).toLocaleDateString("es-PE", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  });
                })()
              : "Cargando fecha..."}
          </p>
        </div>
        <button
          type="button"
          onClick={exportarReporte}
          disabled={exportando || cargando}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/80 px-4 text-sm font-semibold text-slate-300 shadow-sm transition hover:bg-slate-800/60 disabled:cursor-not-allowed disabled:opacity-60"
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
          Configura las variables <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> y <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> en <code className="font-mono">.env.local</code>.
        </div>
      )}

      {errorGlobal && (
        <div className="rounded-lg border border-red-800 bg-red-950/60 p-4 text-sm text-red-300 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {errorGlobal}
        </div>
      )}

      {mensaje && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-950/60 p-4 text-sm text-emerald-300 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          {mensaje}
        </div>
      )}

      {pagoRegistrado && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-800 bg-emerald-950/60 p-4">
          <div className="text-sm text-emerald-300">
            <p className="font-semibold">
              Pago registrado: {formatearMoneda(pagoRegistrado.montoPagado)} · cuota #{pagoRegistrado.numeroCuota}
            </p>
            <p className="mt-0.5 text-xs">
              {pagoRegistrado.nombres} · Saldo pendiente: {formatearMoneda(pagoRegistrado.saldoPendiente)}
            </p>
            {!pagoRegistrado.telefono && (
              <p className="mt-1 text-xs text-amber-300">
                El cliente no tiene teléfono registrado; no se puede generar el comprobante.
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
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-800 text-emerald-300 transition hover:bg-emerald-950/50"
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
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm dark:border-zinc-800 dark:bg-slate-800">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Por cobrar hoy
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-400">
            {formatearMoneda(totalACobrar)}
          </p>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            {cobros.filter((c) => c.estado !== "pagado").length} cuota
            {cobros.filter((c) => c.estado !== "pagado").length === 1 ? "" : "s"} por cobrar hoy
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-900/60 bg-emerald-950/50 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-400">
            Recaudado hoy
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-400 dark:text-emerald-300">
            S/ {totalRecaudado.toFixed(2)}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-emerald-900 dark:bg-emerald-900">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all dark:bg-emerald-400"
              style={{ width: `${progresoHoy}%` }}
            />
          </div>
          <p className="mt-1 text-xs font-medium text-emerald-400 dark:text-emerald-300">
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
              className="h-44 animate-pulse rounded-2xl border border-slate-800 bg-slate-800/60 dark:border-zinc-800 dark:bg-slate-800"
            />
          ))}
        </div>
      ) : cobros.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 p-10 text-center text-sm text-slate-400 dark:border-zinc-700 dark:text-slate-500">
          No hay cobros pendientes para hoy.
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
                className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-slate-800"
              >
                {/* Cabecera del cliente */}
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-white dark:bg-slate-800 dark:text-slate-100">
                    {iniciales(cliente)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-100 dark:text-zinc-50">
                      {nombreCompleto(cliente)}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400 dark:text-slate-500">
                      {cliente.telefono && (
                        <a
                          href={`tel:${cliente.telefono}`}
                          className="inline-flex items-center gap-1 font-medium text-emerald-400 dark:text-emerald-400"
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
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        Ref: {cliente.referencia}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {totalHoy > 0 && (
                      <span className="rounded-full bg-emerald-950/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-400 dark:bg-emerald-950 dark:text-emerald-300">
                        Cobrado hoy · S/ {totalHoy.toFixed(2)}
                      </span>
                    )}
                    {pendientes.length > 0 && (
                      <span className="rounded-full bg-slate-800/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300 dark:bg-zinc-800 dark:text-zinc-300">
                        {pendientes.length} por cobrar
                      </span>
                    )}
                  </div>
                </div>

                {/* Cuotas pagadas */}
                {pagadas.length > 0 && (
                  <div className="mt-3 rounded-xl border border-emerald-800/50 bg-emerald-950/30 p-3.5">
                    <ul className="flex flex-col gap-1.5">
                      {pagadas.map((c) => {
                        const adelantada = c.fecha_vencimiento > fechaHoy;
                        return (
                          <li
                            key={c.id}
                            className="flex items-center justify-between gap-3"
                          >
                            <span className="text-sm font-medium text-emerald-300">
                               ✓ Cuota {c.numero_cuota}/{c.prestamos?.numero_cuotas ?? "?"} · Cobrado el{" "}
                              {formatearDiaMes(c.fecha_pago)}
                              {adelantada && (
                                <span className="ml-1.5 rounded-full bg-sky-950 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
                                  Adelantado
                                </span>
                              )}
                            </span>
                            <span className="text-sm font-semibold text-emerald-400">
                              {formatearMoneda(Number(c.monto))}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="mt-2 flex items-center justify-between border-t border-emerald-800/50 pt-2 text-sm">
                      <span className="font-medium text-emerald-300">
                        Total cobrado hoy
                      </span>
                      <span className="text-base font-bold text-emerald-400">
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

                  return (
                    <div
                      key={c.id}
                      className={`mt-3 rounded-xl border p-3.5 ${
                        parcial
                          ? "border-amber-900/60 bg-amber-950/40"
                          : "border-slate-800 bg-slate-800/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                           {`Cuota ${c.numero_cuota} de ${c.prestamos?.numero_cuotas ?? "?"}`} ·{" "}
                          {formatearFechaDB(c.fecha_vencimiento)}
                          {vencida && (
                            <span className="ml-2 rounded-full bg-red-950/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-400">
                              Vencida
                            </span>
                          )}
                        </p>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {cliente.telefono && (
                            <a
                              href={crearLinkWhatsApp(
                                cliente.telefono,
                                mensajeRecordatorio({
                                  nombres: nombreCompleto(cliente),
                                  montoCuota: monto,
                                  saldoPendiente: saldo,
                                   numeroCuota: c.numero_cuota,
                                   fechaVencimiento: formatearFechaDB(c.fecha_vencimiento),
                                 }),
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
                              title="Enviar recordatorio WhatsApp"
                            >
                              <WhatsAppIcon className="h-3.5 w-3.5 text-emerald-500" />
                              <span className="hidden sm:inline">Recordatorio</span>
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="mt-2 flex items-baseline justify-between gap-2">
                        <div>
                          <p className="text-xl font-bold text-slate-100">
                            {formatearMoneda(saldo)}
                          </p>
                          {parcial && (
                            <p className="text-xs text-amber-400">
                              Abonado: {formatearMoneda(montoPagadoCuota)} de {formatearMoneda(monto)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => abrirAbono(c)}
                            disabled={enviandoId === c.id}
                            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
                          >
                            Abonar
                          </button>
                          <button
                            type="button"
                            onClick={() => pagarCuota(c)}
                            disabled={enviandoId === c.id}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                          >
                            {enviandoId === c.id ? <Spinner /> : "Pagar Cuota"}
                          </button>
                        </div>
                      </div>

                      {/* Modal/Desplegable de Abono */}
                      {abonoAbierto === c.id && (
                        <div className="mt-3 border-t border-slate-800 pt-3">
                          <label className="block text-xs font-medium text-slate-300">
                            Monto a abonar
                          </label>
                          <div className="mt-1 flex items-center gap-2">
                            <input
                              type="number"
                              step="0.01"
                              placeholder={`Máx S/ ${saldo.toFixed(2)}`}
                              value={abonos[c.id] ?? ""}
                              onChange={(e) =>
                                setAbonos((prev) => ({
                                  ...prev,
                                  [c.id]: e.target.value,
                                }))
                              }
                              className={inputCls}
                            />
                            <button
                              type="button"
                              onClick={() => registrarAbono(c)}
                              disabled={enviandoId === c.id}
                              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                            >
                              {enviandoId === c.id ? <Spinner /> : "Confirmar"}
                            </button>
                          </div>
                          {errorAbono && (
                            <p className="mt-1 text-xs text-red-400">{errorAbono}</p>
                          )}
                        </div>
                      )}
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