"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient, hasAuthConfig } from "@/lib/supabase";
import { aYMD, formatearMoneda, FRECUENCIAS, hoyLocal, type Frecuencia } from "@/lib/prestamos";
import { registrarCobro } from "@/lib/acciones";

const supabase = hasAuthConfig ? createClient() : null;

type ClienteDetalle = {
  nombres: string;
  apellidos: string;
  dni: string;
  telefono: string | null;
};

type PrestamoDetalle = {
  id: string;
  monto: number;
  interes_porcentaje: number;
  frecuencia: Frecuencia;
  numero_cuotas: number;
  fecha_inicio: string;
  monto_total: number;
  saldo_pendiente: number;
  created_at: string;
  clientes: ClienteDetalle | ClienteDetalle[] | null;
};

type CuotaDetalle = {
  id: string;
  numero: number;
  monto: number;
  fecha_vencimiento: string;
  estado: string;
  saldo_pendiente: number;
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

export default function DetallePrestamo({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [prestamo, setPrestamo] = useState<PrestamoDetalle | null>(null);
  const [cuotas, setCuotas] = useState<CuotaDetalle[]>([]);
  const [enviandoCuota, setEnviandoCuota] = useState<string | null>(null);

  const saldoPendiente = useMemo(
    () =>
      cuotas.reduce(
        (acc, cuota) =>
          acc + (cuota.estado.toLowerCase() === "pagado" ? 0 : Number(cuota.saldo_pendiente)),
        0,
      ),
    [cuotas],
  );

  const obtenerDatos = useCallback(async (): Promise<ResultadoDetalle | null> => {
    if (!supabase || !id) return null;
    const [prestamoRes, cuotasRes] = await Promise.all([
      supabase
        .from("prestamos")
        .select(
          "id, monto, interes_porcentaje, frecuencia, numero_cuotas, fecha_inicio, monto_total, saldo_pendiente, created_at, clientes(nombres, apellidos, dni, telefono)",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("cuotas")
        .select("id, numero, monto, fecha_vencimiento, estado, saldo_pendiente")
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

    return {
      error: null,
      noEncontrado: prestamoRes.data === null,
      prestamo: prestamoRes.data as unknown as PrestamoDetalle | null,
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

  const registrarPago = async (c: CuotaDetalle) => {
    setMensaje(null);
    setError(null);
    setEnviandoCuota(c.id);
    const res = await registrarCobro({
      cuotaId: c.id,
      monto: Number(c.saldo_pendiente),
      fecha: aYMD(hoyLocal()),
    });
    setEnviandoCuota(null);
    if (!res.ok) {
      setError(`No se pudo registrar el pago: ${res.error}`);
      return;
    }
    setMensaje(`Cuota ${c.numero} pagada correctamente.`);
    router.refresh();
    await refrescar();
  };

  if (!supabase) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
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
            Volver a préstamos
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
            Detalle del préstamo
          </h1>
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

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {mensaje && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          {mensaje}
        </div>
      )}

      {cargando ? (
        <div className="flex flex-col gap-4">
          <div className="h-64 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
          <div className="h-72 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
        </div>
      ) : noEncontrado ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No se encontró el préstamo solicitado.
        </div>
      ) : prestamo ? (
        <>
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-800/60">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white dark:bg-zinc-200 dark:text-zinc-900">
                  {primero(prestamo.clientes)?.nombres.charAt(0) ?? "?"}
                  {primero(prestamo.clientes)?.apellidos.charAt(0) ?? ""}
                </span>
                <div>
                  <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {primero(prestamo.clientes)
                      ? `${primero(prestamo.clientes)?.nombres} ${primero(prestamo.clientes)?.apellidos}`
                      : "Cliente eliminado"}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    DNI {primero(prestamo.clientes)?.dni ?? "—"}
                  </p>
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  saldoPendiente > 0
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {saldoPendiente > 0 ? "Activo" : "Pagado"}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-5 p-5 sm:grid-cols-3 lg:grid-cols-6">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Monto prestado
                </dt>
                <dd className="mt-1 text-base font-bold text-zinc-900 dark:text-zinc-50">
                  {formatearMoneda(Number(prestamo.monto))}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Interés
                </dt>
                <dd className="mt-1 text-base font-bold text-zinc-900 dark:text-zinc-50">
                  {Number(prestamo.interes_porcentaje)}%
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Total a devolver
                </dt>
                <dd className="mt-1 text-base font-bold text-zinc-900 dark:text-zinc-50">
                  {formatearMoneda(Number(prestamo.monto_total))}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Frecuencia
                </dt>
                <dd className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  {labelFrecuencia(prestamo.frecuencia)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Fecha de inicio
                </dt>
                <dd className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  {formatearFechaDB(prestamo.fecha_inicio)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Saldo pendiente
                </dt>
                <dd className="mt-1 text-base font-bold text-red-600 dark:text-red-400">
                  {formatearMoneda(saldoPendiente)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-5 py-3.5 dark:border-zinc-800 dark:bg-zinc-800/60">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Cronograma de pagos
              </h2>
              <span className="rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {prestamo.numero_cuotas} cuotas
              </span>
            </div>

            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-100 font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
                  <tr>
                    <th className="w-20 p-3 text-center">N° Cuota</th>
                    <th className="p-3">Fecha Vencimiento</th>
                    <th className="p-3">Monto</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {cuotas.map((cuota, index) => {
                    const pagada = cuota.estado.toLowerCase() === "pagado";
                    return (
                      <tr key={cuota.id || index} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40">
                        <td className="p-3 text-center font-bold text-slate-900 dark:text-zinc-50">
                          {index + 1}
                        </td>
                        <td className="p-3 text-slate-700 dark:text-zinc-300">
                          {formatearFechaDB(cuota.fecha_vencimiento)}
                        </td>
                        <td className="p-3 font-semibold text-slate-900 dark:text-zinc-50">
                          S/ {Number(cuota.monto).toFixed(2)}
                        </td>
                        <td className="p-3">
                          {pagada ? (
                            <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700 dark:bg-green-950 dark:text-green-300">
                              ✓ Pagado
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                              Pendiente
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {!pagada && (
                            <button
                              type="button"
                              onClick={() => registrarPago(cuota)}
                              disabled={enviandoCuota === cuota.id}
                              className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {enviandoCuota === cuota.id ? "Procesando..." : "Registrar Pago"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}