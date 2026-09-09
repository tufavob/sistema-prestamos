"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  createClient,
  hasAuthConfig,
  obtenerSaldoPendienteCliente,
  type Cliente,
} from "@/lib/supabase";
import {
  aYMD,
  calcularPrestamo,
  formatearFecha,
  formatearMoneda,
  FRECUENCIAS,
  hoyLocal,
  type Frecuencia,
} from "@/lib/prestamos";

const supabase = hasAuthConfig ? createClient() : null;

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-200";

const labelCls =
  "mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

type FormErrors = {
  cliente?: string;
  monto?: string;
  interes?: string;
  cuotas?: string;
  fecha?: string;
  liquidar?: string;
};

const nombreCompleto = (c: Cliente) => `${c.nombres} ${c.apellidos}`;

export default function NuevoPrestamo() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargandoClientes, setCargandoClientes] = useState(true);

  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [dropdownAbierto, setDropdownAbierto] = useState(false);
  const comboboxRef = useRef<HTMLDivElement>(null);

  const [monto, setMonto] = useState("");
  const [interes, setInteres] = useState("");
  const [frecuencia, setFrecuencia] = useState<Frecuencia>("mensual");
  const [numeroCuotas, setNumeroCuotas] = useState("");
  const [fechaInicio, setFechaInicio] = useState(aYMD(hoyLocal()));

  const [errors, setErrors] = useState<FormErrors>({});
  const [enviando, setEnviando] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [verificando, setVerificando] = useState<string | null>(null);
  const [saldoPendiente, setSaldoPendiente] = useState(0);
  const [liquidarSaldo, setLiquidarSaldo] = useState(false);

  useEffect(() => {
    let activo = true;
    const cargar = async () => {
      if (supabase) {
        const { data, error } = await supabase
          .from("clientes")
          .select("*")
          .order("nombres", { ascending: true });
        if (activo && error) {
          setErrorGlobal(`No se pudieron cargar los clientes: ${error.message}`);
        } else if (activo) {
          const lista = (data as Cliente[]) ?? [];
          setClientes(lista);
          const params = new URLSearchParams(window.location.search);
          const clienteId = params.get("cliente_id");
          if (clienteId) {
            const coincide = lista.find((c) => c.id === clienteId);
            if (coincide) {
              const saldo = await obtenerSaldoPendienteCliente(supabase, coincide.id);
              if (activo) {
                setClienteSeleccionado(coincide);
                setSaldoPendiente(saldo);
                setBusquedaCliente("");
              }
            }
          }
        }
      }
      if (activo) setCargandoClientes(false);
    };
    cargar();
    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    const alHacerClicFuera = (e: MouseEvent) => {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setDropdownAbierto(false);
      }
    };
    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
  }, []);

  const clientesFiltrados = useMemo(() => {
    const q = busquedaCliente.trim().toLowerCase();
    let lista = clientes;
    if (q) {
      lista = lista.filter(
        (c) =>
          c.dni.toLowerCase().includes(q) ||
          nombreCompleto(c).toLowerCase().includes(q),
      );
    }
    return lista.slice(0, 8);
  }, [clientes, busquedaCliente]);

  const calculo = useMemo(() => {
    const m = Number(monto);
    const i = Number(interes);
    const c = Number(numeroCuotas);
    if (
      !Number.isFinite(m) ||
      m <= 0 ||
      !Number.isFinite(i) ||
      i < 0 ||
      !Number.isInteger(c) ||
      c <= 0 ||
      c > 60 ||
      !fechaInicio
    ) {
      return null;
    }
    const fecha = new Date(`${fechaInicio}T00:00:00`);
    if (Number.isNaN(fecha.getTime())) return null;
    return calcularPrestamo(m, i, frecuencia, c, fecha);
  }, [monto, interes, frecuencia, numeroCuotas, fechaInicio]);

  const seleccionarCliente = async (c: Cliente) => {
    if (!supabase) {
      setClienteSeleccionado(c);
      setSaldoPendiente(0);
      setLiquidarSaldo(false);
      setBusquedaCliente("");
      setDropdownAbierto(false);
      setErrors((prev) => ({ ...prev, cliente: undefined, liquidar: undefined }));
      return;
    }
    setVerificando(c.id);
    const saldo = await obtenerSaldoPendienteCliente(supabase, c.id);
    setVerificando(null);
    setClienteSeleccionado(c);
    setSaldoPendiente(saldo);
    setLiquidarSaldo(false);
    setBusquedaCliente("");
    setDropdownAbierto(false);
    setErrors((prev) => ({ ...prev, cliente: undefined, liquidar: undefined }));
  };

  const aDosDecimales = (n: number) => Math.round(n * 100) / 100;

  const validar = (): FormErrors => {
    const e: FormErrors = {};
    if (!clienteSeleccionado) e.cliente = "Selecciona un cliente.";
    const m = Number(monto);
    if (!monto || !Number.isFinite(m) || m <= 0)
      e.monto = "Ingresa un monto mayor a cero.";
    else if (aDosDecimales(m) !== m)
      e.monto = "El monto debe tener máximo dos decimales.";
    const i = Number(interes);
    if (!interes || !Number.isFinite(i) || i < 0)
      e.interes = "Ingresa un porcentaje igual o mayor a cero.";
    else if (aDosDecimales(i) !== i)
      e.interes = "El interés debe tener máximo dos decimales.";
    const c = Number(numeroCuotas);
    if (!numeroCuotas || !Number.isInteger(c) || c <= 0 || c > 60)
      e.cuotas = "Ingresa un número de cuotas entre 1 y 60.";
    if (!fechaInicio) e.fecha = "Selecciona la fecha de inicio.";
    if (saldoPendiente > 0 && !liquidarSaldo)
      e.liquidar = `El cliente tiene un saldo pendiente de ${formatearMoneda(
        saldoPendiente,
      )}. Marca la casilla para liquidarlo con este nuevo préstamo.`;
    return e;
  };

  const handleSubmit = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    setMensaje(null);
    const e = validar();
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;

    if (!supabase || !clienteSeleccionado) {
      setErrorGlobal(
        "Faltan las variables NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
      return;
    }

    setEnviando(true);
    setErrorGlobal(null);
    const liquidar = liquidarSaldo && saldoPendiente > 0;
    const params = {
      p_cliente_id: clienteSeleccionado.id,
      p_monto: aDosDecimales(Number(monto)),
      p_interes_porcentaje: aDosDecimales(Number(interes)),
      p_frecuencia: frecuencia,
      p_numero_cuotas: Number(numeroCuotas),
      p_fecha_inicio: fechaInicio,
    };
    const { data, error } = liquidar
      ? await supabase.rpc("liquidar_y_registrar_prestamo", {
          ...params,
          p_fecha_liquidacion: aYMD(hoyLocal()),
        })
      : await supabase.rpc("registrar_prestamo", params);
    setEnviando(false);

    if (error) {
      if (error.message.toLowerCase().includes("vigente")) {
        setErrorGlobal(
          `El cliente tiene un préstamo vigente con cuotas pendientes. Marca la casilla "Liquidar saldo pendiente" para renovarlo.`,
        );
      } else {
        setErrorGlobal(
          `No se pudo generar el préstamo: ${error.message}${
            error.message.toLowerCase().includes("function")
              ? " Asegúrate de ejecutar la migración SQL en supabase/migrations."
              : ""
          }`,
        );
      }
      return;
    }

    setMensaje(
      liquidar
        ? `Préstamo generado y saldo anterior liquidado para ${nombreCompleto(
            clienteSeleccionado,
          )} (ID: ${String(data).slice(0, 8)}…).`
        : `Préstamo generado correctamente para ${nombreCompleto(clienteSeleccionado)} (ID: ${String(data).slice(0, 8)}…).`,
    );
    setMonto("");
    setInteres("");
    setNumeroCuotas("");
    setFechaInicio(aYMD(hoyLocal()));
    setClienteSeleccionado(null);
    setSaldoPendiente(0);
    setLiquidarSaldo(false);
    setErrors({});
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
            Nuevo préstamo
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Genera el préstamo y su cronograma de cuotas automáticamente.
          </p>
        </div>
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

      <div className="grid items-start gap-6 lg:grid-cols-5">
        {/* Formulario */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 lg:col-span-3 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Datos del préstamo
          </h2>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            {/* Cliente */}
            <div>
              <label htmlFor="cliente" className={labelCls}>
                Cliente <span className="text-red-500">*</span>
              </label>
              <div ref={comboboxRef} className="relative">
                <input
                  id="cliente"
                  type="text"
                  role="combobox"
                  aria-controls="lista-clientes"
                  aria-expanded={dropdownAbierto}
                  aria-invalid={Boolean(errors.cliente)}
                  value={
                    clienteSeleccionado
                      ? nombreCompleto(clienteSeleccionado)
                      : busquedaCliente
                  }
                  onChange={(e) => {
                    setBusquedaCliente(e.target.value);
                    setClienteSeleccionado(null);
                    setSaldoPendiente(0);
                    setLiquidarSaldo(false);
                    setDropdownAbierto(true);
                    setErrors((prev) => ({
                      ...prev,
                      cliente: undefined,
                      liquidar: undefined,
                    }));
                  }}
                  onFocus={() => setDropdownAbierto(true)}
                  placeholder={cargandoClientes ? "Cargando clientes..." : "Buscar por DNI o nombre..."}
                  className={inputCls}
                  disabled={cargandoClientes}
                />
                {dropdownAbierto && (
                  <ul
                  id="lista-clientes"
                  className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                >
                    {clientesFiltrados.length === 0 ? (
                      <li className="px-3.5 py-2.5 text-sm text-zinc-500 dark:text-zinc-400">
                        {clientes.length === 0
                          ? "No hay clientes registrados. " +
                            (cargandoClientes ? "Cargando..." : "")
                          : "Sin resultados."}
                      </li>
                    ) : (
                      clientesFiltrados.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            disabled={verificando !== null}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => seleccionarCliente(c)}
                            className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm transition hover:bg-zinc-100 disabled:cursor-wait dark:hover:bg-zinc-800 ${
                              clienteSeleccionado?.id === c.id
                                ? "bg-zinc-100 dark:bg-zinc-800"
                                : ""
                            }`}
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white dark:bg-zinc-200 dark:text-zinc-900">
                              {`${c.nombres.charAt(0)}${c.apellidos.charAt(0)}`.toUpperCase()}
                            </span>
                            <span className="min-w-0">
                              <span className="block font-medium text-zinc-900 dark:text-zinc-50">
                                {nombreCompleto(c)}
                              </span>
                              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                                DNI {c.dni}
                              </span>
                            </span>
                            {clienteSeleccionado?.id === c.id && (
                              <svg
                                className="ml-auto h-4 w-4 shrink-0 text-zinc-900 dark:text-zinc-50"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                            )}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
              {errors.cliente && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.cliente}</p>
              )}
            </div>

            {clienteSeleccionado && saldoPendiente > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  El cliente tiene un saldo pendiente de{" "}
                  {formatearMoneda(saldoPendiente)} en préstamos anteriores.
                </p>
                <label className="mt-3 flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={liquidarSaldo}
                    onChange={(e) => {
                      setLiquidarSaldo(e.target.checked);
                      setErrors((prev) => ({ ...prev, liquidar: undefined }));
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 accent-zinc-900 dark:accent-zinc-100"
                  />
                  <span className="text-sm text-amber-900 dark:text-amber-200">
                    Liquidar saldo pendiente con este nuevo préstamo
                  </span>
                </label>
                {errors.liquidar && (
                  <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
                    {errors.liquidar}
                  </p>
                )}
              </div>
            )}

            {/* Monto e interés */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="monto" className={labelCls}>
                  Monto del préstamo <span className="text-red-500">*</span>
                </label>
                <input
                  id="monto"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="1,000.00"
                  className={inputCls}
                  value={monto}
                  onChange={(e) => {
                    setMonto(e.target.value);
                    setErrors((prev) => ({ ...prev, monto: undefined }));
                  }}
                  aria-invalid={Boolean(errors.monto)}
                />
                {errors.monto && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.monto}</p>
                )}
              </div>
              <div>
                <label htmlFor="interes" className={labelCls}>
                  Interés / Ganancia (%) <span className="text-red-500">*</span>
                </label>
                <input
                  id="interes"
                  type="number"
                  min={0}
                  step="0.1"
                  placeholder="20"
                  className={inputCls}
                  value={interes}
                  onChange={(e) => {
                    setInteres(e.target.value);
                    setErrors((prev) => ({ ...prev, interes: undefined }));
                  }}
                  aria-invalid={Boolean(errors.interes)}
                />
                {errors.interes && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.interes}</p>
                )}
              </div>
            </div>

            {/* Frecuencia y cuotas */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="frecuencia" className={labelCls}>
                  Frecuencia de cobro <span className="text-red-500">*</span>
                </label>
                <select
                  id="frecuencia"
                  className={inputCls}
                  value={frecuencia}
                  onChange={(e) => setFrecuencia(e.target.value as Frecuencia)}
                >
                  {FRECUENCIAS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="cuotas" className={labelCls}>
                  Número de cuotas <span className="text-red-500">*</span>
                </label>
                <input
                  id="cuotas"
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  placeholder="Ej. 4"
                  className={inputCls}
                  value={numeroCuotas}
                  onChange={(e) => {
                    setNumeroCuotas(e.target.value);
                    setErrors((prev) => ({ ...prev, cuotas: undefined }));
                  }}
                  aria-invalid={Boolean(errors.cuotas)}
                />
                {errors.cuotas && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.cuotas}</p>
                )}
              </div>
            </div>

            {/* Fecha de inicio */}
            <div>
              <label htmlFor="fechaInicio" className={labelCls}>
                Fecha de inicio <span className="text-red-500">*</span>
              </label>
              <input
                id="fechaInicio"
                type="date"
                className={inputCls}
                value={fechaInicio}
                onChange={(e) => {
                  setFechaInicio(e.target.value);
                  setErrors((prev) => ({ ...prev, fecha: undefined }));
                }}
                aria-invalid={Boolean(errors.fecha)}
              />
              {errors.fecha && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.fecha}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={enviando}
              className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {enviando ? (
                <>
                  <Spinner />
                  Generando préstamo...
                </>
              ) : liquidarSaldo && saldoPendiente > 0 ? (
                "Liquidar y Generar Préstamo"
              ) : (
                "Generar Préstamo"
              )}
            </button>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Al generar se registrarán el préstamo y todas sus cuotas en Supabase.
            </p>
          </form>
        </section>

        {/* Calculadora */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 lg:sticky lg:top-6 lg:col-span-2 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Resumen del préstamo
          </h2>

          {!calculo ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              Completa el monto, interés y número de cuotas para ver el cálculo en
              tiempo real.
            </div>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/60">
                  <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Monto
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {formatearMoneda(calculo.monto)}
                  </dd>
                </div>
                <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/60">
                  <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Interés ({Number(interes)}%)
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {formatearMoneda(calculo.interes)}
                  </dd>
                </div>
                <div className="col-span-2 rounded-xl bg-zinc-900 p-4 text-white dark:bg-zinc-100 dark:text-zinc-900">
                  <dt className="text-xs font-medium uppercase tracking-wide opacity-70">
                    Total a devolver
                  </dt>
                  <dd className="mt-1 text-2xl font-bold">
                    {formatearMoneda(calculo.montoTotal)}
                  </dd>
                </div>
                <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/60">
                  <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Cuota ({FRECUENCIAS.find((f) => f.value === frecuencia)?.label.toLowerCase()})
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {formatearMoneda(calculo.cuotaBase)}
                  </dd>
                  {calculo.ultimaCuota !== calculo.cuotaBase && (
                    <dd className="text-xs text-zinc-500 dark:text-zinc-400">
                      Última: {formatearMoneda(calculo.ultimaCuota)}
                    </dd>
                  )}
                </div>
                <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/60">
                  <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Vence el
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {formatearFecha(calculo.cuotas[calculo.cuotas.length - 1].fecha)}
                  </dd>
                </div>
              </dl>

              {liquidarSaldo && saldoPendiente > 0 && (
                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Liquidación incluida
                  </p>
                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex items-center justify-between text-amber-900 dark:text-amber-200">
                      <dt>Monto del préstamo</dt>
                      <dd className="font-semibold">{formatearMoneda(calculo.monto)}</dd>
                    </div>
                    <div className="flex items-center justify-between text-amber-900 dark:text-amber-200">
                      <dt>Saldo a liquidar</dt>
                      <dd className="font-medium">
                        − {formatearMoneda(saldoPendiente)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between border-t border-amber-300 pt-1.5 text-amber-900 dark:border-amber-800 dark:text-amber-200">
                      <dt className="font-medium">Monto Neto a Entregar</dt>
                      <dd className="text-base font-bold">
                        {formatearMoneda(
                          Math.max(calculo.monto - saldoPendiente, 0),
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              <h3 className="mb-2 mt-6 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Cronograma de pagos
                <span className="ml-2 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {calculo.cuotas.length} cuotas
                </span>
              </h3>
              <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800/60">
                      <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                        <th className="px-3 py-2.5 font-semibold">#</th>
                        <th className="px-3 py-2.5 font-semibold">Fecha</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calculo.cuotas.map((c) => (
                        <tr
                          key={c.numero}
                          className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                        >
                          <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                            {c.numero}
                          </td>
                          <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200">
                            {formatearFecha(c.fecha)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-zinc-900 dark:text-zinc-50">
                            {formatearMoneda(c.monto)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
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