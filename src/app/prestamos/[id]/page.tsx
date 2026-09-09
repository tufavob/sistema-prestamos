"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient, hasAuthConfig } from "@/lib/supabase";
import { aYMD, formatearMoneda, FRECUENCIAS, hoyLocal, type Frecuencia } from "@/lib/prestamos";
import { crearLinkWhatsApp, mensajeRecordatorio } from "@/lib/whatsapp";
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

const estadoCuota = (estado: string) => {
  switch (estado) {
    case "pagado":
      return { label: "Pagada", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" };
    case "parcial":
      return { label: "Abonada", cls: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" };
    case "vencido":
      return { label: "Vencida", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" };
    default:
      return { label: "Pendiente", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" };
  }
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
        .order("numero", { ascending: true }),
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

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-100 font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
                  <tr>
                    <th className="p-3 text-center">N° Cuota</th>
                    <th className="p-3">Fecha Vencimiento</th>
                    <th className="p-3">Monto</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {cuotas.map((cuota) => {
                    const ec = estadoCuota(cuota.estado);
                    const pagada = cuota.estado.toLowerCase() === "pagado";
                    const cliente = primero(prestamo.clientes);
                    return (
                      <tr
                        key={cuota.id}
                        className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-zinc-800/40"
                      >
                        <td className="p-3 text-center font-medium text-zinc-900 dark:text-zinc-50">
                          {cuota.numero}
                        </td>
                        <td className="p-3 text-zinc-600 dark:text-zinc-300">
                          {formatearFechaDB(cuota.fecha_vencimiento)}
                        </td>
                        <td className="p-3 font-medium text-zinc-900 dark:text-zinc-50">
                          {formatearMoneda(Number(cuota.monto))}
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${ec.cls}`}
                          >
                            {ec.label}
                          </span>
                          {cuota.estado === "parcial" && (
                            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                              Saldo: {formatearMoneda(Number(cuota.saldo_pendiente))}
                            </p>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {!pagada && cliente?.telefono && (
                              <a
                                href={crearLinkWhatsApp(
                                  cliente.telefono,
                                  mensajeRecordatorio({
                                    nombres: `${cliente.nombres} ${cliente.apellidos}`,
                                    numeroCuota: cuota.numero,
                                    monto: Number(cuota.monto),
                                  }),
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Enviar recordatorio por WhatsApp"
                                title="Enviar recordatorio por WhatsApp"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 text-emerald-600 transition hover:bg-emerald-50 dark:border-zinc-700 dark:text-emerald-400 dark:hover:bg-emerald-950"
                              >
                                <WhatsAppIcon className="h-4 w-4" />
                              </a>
                            )}
                            {pagada ? (
                              <span className="font-medium text-green-600 dark:text-green-400">
                                ✓ Pagado
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => registrarPago(cuota)}
                                disabled={enviandoCuota === cuota.id}
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-xs font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                              >
                                {enviandoCuota === cuota.id ? (
                                  <>
                                    <Spinner />
                                    Procesando...
                                  </>
                                ) : (
                                  "Registrar Pago"
                                )}
                              </button>
                            )}
                          </div>
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