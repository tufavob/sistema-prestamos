"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient, hasAuthConfig } from "@/lib/supabase";
import { aYMD, formatearMoneda, FRECUENCIAS, hoyLocal, type Frecuencia } from "@/lib/prestamos";
import { MEDIOS_DE_PAGO, type MedioPago } from "@/lib/credito";
import BadgeCalificacion from "@/components/BadgeCalificacion";

const supabase = hasAuthConfig ? createClient() : null;

type ClienteDetalle = {
  id: string;
  nombres: string;
  apellidos: string;
  dni: string;
  telefono: string | null;
  calificacion?: string | null;
};

type PrestamoDetalle = {
  id: string;
  monto_prestado: number;
  monto?: number;
  porcentaje_interes: number;
  frecuencia: Frecuencia;
  numero_cuotas: number;
  fecha_inicio: string;
  monto_total: number;
  saldo_pendiente: number;
  estado?: string | null;
  created_at: string;
  clientes: ClienteDetalle | ClienteDetalle[] | null;
};

type CuotaDetalle = {
  id: string;
  numero_cuota: number;
  monto: number;
  fecha_vencimiento: string;
  estado: string;
  saldo_pendiente: number;
  monto_pagado: number | null;
};

type ResultadoDetalle = {
  error: string | null;
  noEncontrado: boolean;
  prestamo: PrestamoDetalle | null;
  cuotas: CuotaDetalle[];
};

const primero = <T,>(x: T | T[] | null | undefined): T | null =>
  Array.isArray(x) ? (x[0] ?? null) : (x ?? null);

const labelFrecuencia = (f: string) =>
  FRECUENCIAS.find((x) => x.value === f)?.label ?? f;

const formatearFechaDB = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return s;
  return new Date(y, m - 1, d).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const numeroWhatsApp = (t: string) => {
  const d = t.replace(/\D+/g, "");
  return d.startsWith("51") ? d : `51${d}`;
};

export default function DetallePrestamo({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [prestamo, setPrestamo] = useState<PrestamoDetalle | null>(null);
  const [cuotas, setCuotas] = useState<CuotaDetalle[]>([]);
  const [enviandoCuota, setEnviandoCuota] = useState<string | null>(null);
  const [mediosPago, setMediosPago] = useState<Record<string, MedioPago>>({});

  const saldoPendiente = useMemo(
    () =>
      cuotas
        .filter((c) => c.estado.toLowerCase() !== "pagado")
        .reduce(
          (acc, c) =>
            acc +
            (Number(c.monto) - Number(c.monto_pagado ?? 0)),
          0,
        ),
    [cuotas],
  );

  const finalizado = useMemo(() => {
    if (!prestamo) return false;
    const est = String(prestamo.estado ?? "").toLowerCase();
    if (est === "finalizado" || est === "liquidado" || est === "cancelado")
      return true;
    return saldoPendiente <= 0;
  }, [prestamo, saldoPendiente]);

  const cliente = prestamo ? primero(prestamo.clientes) : null;
  const cuotasPagadas = cuotas.filter(
    (c) => c.estado.toLowerCase() === "pagado",
  ).length;
  const proximoVencimiento = cuotas
    .filter((c) => c.estado.toLowerCase() !== "pagado")
    .map((c) => c.fecha_vencimiento)
    .sort()[0];

  const obtenerDatos = useCallback(async (): Promise<ResultadoDetalle | null> => {
    if (!supabase || !id) return null;
    const [prestamoRes, cuotasRes] = await Promise.all([
      supabase
        .from("prestamos")
        .select(
          "*, clientes(calificacion, nombres, apellidos, dni, telefono)",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("cuotas")
        .select("id, numero_cuota, monto, fecha_vencimiento, estado, saldo_pendiente, monto_pagado")
        .eq("prestamo_id", id)
        .order("fecha_vencimiento", { ascending: true }),
    ]);

    if (prestamoRes.error || cuotasRes.error) {
      return {
        error: `No se pudo cargar el préstamo: ${
          prestamoRes.error?.message ?? cuotasRes.error?.message ?? ""
        }`,
        noEncontrado: false,
        prestamo: null,
        cuotas: [],
      };
    }

    const detalle = prestamoRes.data as unknown as PrestamoDetalle | null;

    return {
      error: null,
      noEncontrado: prestamoRes.data === null,
      prestamo: detalle,
      cuotas: (cuotasRes.data ?? []) as CuotaDetalle[],
    };
  }, [id]);

  useEffect(() => {
    let activo = true;
    const iniciar = async () => {
      const res = await obtenerDatos();
      if (!activo || !res) return;
      if (res.error) {
        setError(res.error);
      } else if (res.noEncontrado) {
        setNoEncontrado(true);
      } else {
        setPrestamo(res.prestamo);
        setCuotas(res.cuotas);
      }
      if (activo) setCargando(false);
    };
    iniciar();
    return () => {
      activo = false;
    };
  }, [obtenerDatos]);

  const refrescar = async () => {
    const res = await obtenerDatos();
    if (!res) return;
    if (res.error) {
      setError(res.error);
      return;
    }
    setPrestamo(res.prestamo);
    setCuotas(res.cuotas);
  };

  const registrarPago = async (cuota: CuotaDetalle, index: number) => {
    if (!supabase) {
      setError("No se pudo registrar el pago: Supabase no configurado.");
      return;
    }
    setMensaje(null);
    setError(null);
    setEnviandoCuota(cuota.id);
    try {
      const montoCuota = Number(cuota.monto);
      const hoy = aYMD(hoyLocal());
      const medioPago = mediosPago[cuota.id] ?? "efectivo";

      // 1) Marcar la cuota como pagada guardando el método de pago.
      const baseCuota = {
        estado: "pagado",
        monto_pagado: montoCuota,
        saldo_pendiente: 0,
        fecha_pago: hoy,
      };
      let { error: errorCuota } = await supabase
        .from("cuotas")
        .update({ ...baseCuota, metodo_pago: medioPago })
        .eq("id", cuota.id);
      if (
        errorCuota &&
        /column|does not exist|metodo_pago/i.test(errorCuota.message)
      ) {
        const reintento = await supabase
          .from("cuotas")
          .update(baseCuota)
          .eq("id", cuota.id);
        errorCuota = reintento.error;
      }

      if (errorCuota) {
        setError(`No se pudo actualizar la cuota: ${errorCuota.message}`);
        return;
      }

      // 2) Registrar el pago en `pagos`.
      const basePago = {
        cuota_id: cuota.id,
        monto: montoCuota,
        fecha_pago: hoy,
      };
      const { error: errorPago } = await supabase.from("pagos").insert({
        ...basePago,
        medio_pago: medioPago,
        es_abono_parcial: false,
      });
      if (
        errorPago &&
        /column|does not exist|es_abono_parcial|medio_pago/i.test(errorPago.message)
      ) {
        const { error: errorPagoBase } = await supabase.from("pagos").insert(basePago);
        if (errorPagoBase) {
          setError(
            `La cuota quedó pagada, pero no se pudo registrar en "pagos": ${errorPagoBase.message}`,
          );
          return;
        }
      } else if (errorPago) {
        setError(
          `La cuota quedó pagada, pero no se pudo registrar en "pagos": ${errorPago.message}`,
        );
        return;
      }

      // 3) Recalcular el saldo del préstamo y finalizarlo cuando llega a 0.
      const saldoRestante = cuotas
        .filter(
          (c) =>
            c.id !== cuota.id && c.estado.toLowerCase() !== "pagado",
        )
        .reduce(
          (acc, c) => acc + (Number(c.monto) - Number(c.monto_pagado ?? 0)),
          0,
        );
      const actualizacionPrestamo: Record<string, string | number> = {
        saldo_pendiente: Math.max(0, saldoRestante),
      };
      if (saldoRestante <= 0) actualizacionPrestamo.estado = "finalizado";
      const { error: errorPrestamo } = await supabase
        .from("prestamos")
        .update(actualizacionPrestamo)
        .eq("id", id);
      if (errorPrestamo) {
        setError(
          `La cuota quedó pagada, pero no se pudo actualizar el préstamo: ${errorPrestamo.message}`,
        );
        return;
      }

      await refrescar();
      setMensaje(`Cuota ${index + 1} pagada correctamente.`);
    } finally {
      setEnviandoCuota(null);
    }
  };

  if (!supabase) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-amber-800 bg-amber-950/60 p-4 text-sm text-amber-300">
          Configura las variables{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> en{" "}
          <code className="font-mono">.env.local</code>.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/prestamos"
            className="mb-2 inline-flex items-center gap-1 text-sm text-slate-400 transition hover:text-slate-100"
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
            Volver a préstamos
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
            Detalle del préstamo
          </h1>
        </div>
        <Link
          href="/prestamos/nuevo"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 px-4 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-950/50 transition hover:from-emerald-500"
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

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/60 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {mensaje && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-950/60 p-4 text-sm text-emerald-300">
          {mensaje}
        </div>
      )}

      {cargando ? (
        <div className="flex flex-col gap-4">
          <div className="h-64 animate-pulse rounded-2xl border border-slate-800 bg-slate-800/60" />
          <div className="h-72 animate-pulse rounded-2xl border border-slate-800 bg-slate-800/60" />
        </div>
      ) : noEncontrado ? (
        <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-400">
          No se encontró el préstamo solicitado.
        </div>
      ) : prestamo ? (
        <>
          <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 px-5 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 text-sm font-semibold text-white">
                  {cliente?.nombres.charAt(0) ?? "?"}
                  {cliente?.apellidos.charAt(0) ?? ""}
                </span>
                <div>
                  <p className="text-lg font-semibold text-slate-100">
                    {cliente ? `${cliente.nombres} ${cliente.apellidos}` : "Cliente eliminado"}
                  </p>
                  <p className="text-xs text-slate-400">
                    DNI {cliente?.dni ?? "—"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    finalizado
                      ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border border-amber-500/30 bg-amber-500/10 text-amber-400"
                  }`}
                >
                  {finalizado ? "Finalizado" : "Activo"}
                </span>
                {cliente && (
                  <BadgeCalificacion calificacion={cliente.calificacion} />
                )}
                {cliente?.telefono && (
                  <a
                    href={`https://wa.me/${numeroWhatsApp(cliente.telefono)}?text=${encodeURIComponent(
                      `Hola ${cliente.nombres} ${cliente.apellidos}, este es el estado de su cuenta:\n` +
                        `• Préstamo: S/ ${formatearMoneda(Number(prestamo.monto_total))}\n` +
                        `• Saldo pendiente: S/ ${formatearMoneda(saldoPendiente)}\n` +
                        `• Cuotas pagadas: ${cuotasPagadas}/${cuotas.length}\n` +
                        `• Próximo vencimiento: ${
                          proximoVencimiento ? formatearFechaDB(proximoVencimiento) : "—"
                        }\n\n` +
                        `Gracias por su confianza.`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
                    </svg>
                    Enviar Resumen por WhatsApp
                  </a>
                )}
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-5 p-5 sm:grid-cols-3 lg:grid-cols-6">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Monto prestado
                </dt>
                <dd className="mt-1 text-base font-bold text-slate-100">
                  {formatearMoneda(Number(prestamo.monto_prestado))}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Interés
                </dt>
                <dd className="mt-1 text-base font-bold text-slate-100">
                   {Number(prestamo.porcentaje_interes)}%
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Total a devolver
                </dt>
                <dd className="mt-1 text-base font-bold text-slate-100">
                  {formatearMoneda(Number(prestamo.monto_total))}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Frecuencia
                </dt>
                <dd className="mt-1 text-base font-semibold text-slate-100">
                  {labelFrecuencia(prestamo.frecuencia)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Fecha de inicio
                </dt>
                <dd className="mt-1 text-base font-semibold text-slate-100">
                  {formatearFechaDB(prestamo.fecha_inicio)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Saldo pendiente
                </dt>
                <dd className="mt-1 text-base font-bold text-emerald-400">
                  {formatearMoneda(saldoPendiente)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950 px-5 py-3.5">
              <h2 className="text-base font-semibold text-slate-100">
                Cronograma de pagos
              </h2>
              <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300">
                {prestamo.numero_cuotas} cuotas
              </span>
            </div>

            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/70 shadow-xl">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-slate-800 bg-slate-950 font-semibold text-slate-400">
                  <tr>
                    <th className="border-r border-slate-800 p-3 text-center">N° Cuota</th>
                    <th className="border-r border-slate-800 p-3">Fecha Vencimiento</th>
                    <th className="border-r border-slate-800 p-3">Monto</th>
                    <th className="border-r border-slate-800 p-3">Estado</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {cuotas && cuotas.length > 0 ? (
                    cuotas.map((cuota, index) => (
                      <tr key={cuota.id || index} className="hover:bg-slate-800/40">
                        <td className="border-r border-slate-800 p-3 text-center font-bold text-slate-100">
                          {index + 1}
                        </td>
                        <td className="border-r border-slate-800 p-3 text-slate-300">
                          {formatearFechaDB(cuota.fecha_vencimiento)}
                        </td>
                        <td className="border-r border-slate-800 p-3 font-semibold text-slate-100">
                          S/ {Number(cuota.monto).toFixed(2)}
                        </td>
                        <td className="border-r border-slate-800 p-3">
                          {String(cuota.estado).toLowerCase() === "pagado" ? (
                            <span className="inline-block rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-semibold text-green-400">
                              ✓ Pagado
                            </span>
                          ) : (
                            <span className="inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-400">
                              Pendiente
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {String(cuota.estado).toLowerCase() === "pagado" ? (
                            cliente?.telefono && (
                              <a
                                href={`https://wa.me/${numeroWhatsApp(cliente.telefono)}?text=${encodeURIComponent(
                                  `Hola ${cliente.nombres}, confirmamos el recibo de pago de la Cuota #${index + 1} por S/ ${Number(cuota.monto).toFixed(2)}. Saldo restante: S/ ${saldoPendiente.toFixed(2)}. ¡Gracias!`,
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-2 inline-flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-green-700"
                              >
                                💬 Recibo WA
                              </a>
                            )
                          ) : (
                            <div className="inline-flex flex-col items-stretch gap-1.5">
                              <select
                                aria-label={`Medio de pago cuota ${index + 1}`}
                                value={mediosPago[cuota.id] ?? "efectivo"}
                                onChange={(e) =>
                                  setMediosPago((prev) => ({
                                    ...prev,
                                    [cuota.id]: e.target.value as MedioPago,
                                  }))
                                }
                                disabled={enviandoCuota === cuota.id}
                                className="w-full rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1.5 text-xs text-slate-100 outline-none transition focus:border-emerald-500"
                              >
                                {MEDIOS_DE_PAGO.map((m) => (
                                  <option key={m.value} value={m.value}>
                                    {m.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => registrarPago(cuota, index)}
                                disabled={enviandoCuota === cuota.id}
                                className="rounded-md bg-gradient-to-r from-emerald-600 to-teal-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:from-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {enviandoCuota === cuota.id ? "Procesando..." : "Registrar Pago"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-400">
                        No hay cuotas registradas para este préstamo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}