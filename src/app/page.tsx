"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient, hasAuthConfig, type Cliente } from "@/lib/supabase";

const supabase = hasAuthConfig ? createClient() : null;

type FormState = {
  dni: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  direccion: string;
  referencia: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const EMPTY_FORM: FormState = {
  dni: "",
  nombres: "",
  apellidos: "",
  telefono: "",
  direccion: "",
  referencia: "",
};

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-200";

const labelCls =
  "mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

const INITIALES = (nombres: string, apellidos: string) =>
  `${nombres.trim().charAt(0)}${apellidos.trim().charAt(0)}`.toUpperCase() ||
  "?";

const formatFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export default function Home() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [query, setQuery] = useState("");

  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    const cargar = async () => {
      if (supabase) {
        const { data, error } = await supabase
          .from("clientes")
          .select("*")
          .order("created_at", { ascending: false });

        if (!activo) return;
        if (error) {
          setErrorGlobal(
            `No se pudieron cargar los clientes: ${error.message}. Revisa la tabla "clientes" en Supabase.`,
          );
        } else {
          setClientes((data as Cliente[]) ?? []);
        }
      }
      if (activo) setCargando(false);
    };
    cargar();
    return () => {
      activo = false;
    };
  }, []);

  const validar = (f: FormState): FormErrors => {
    const e: FormErrors = {};
    const dni = f.dni.trim();
    if (!dni) {
      e.dni = "El DNI es obligatorio.";
    } else if (!/^\d{8}$/.test(dni)) {
      e.dni = "El DNI debe tener 8 dígitos numéricos.";
    }
    if (!f.nombres.trim()) e.nombres = "Los nombres son obligatorios.";
    if (!f.apellidos.trim()) e.apellidos = "Los apellidos son obligatorios.";
    if (f.telefono.trim() && !/^[0-9+\s-]{6,15}$/.test(f.telefono.trim()))
      e.telefono = "Ingresa un teléfono válido (solo números).";
    return e;
  };

  const handleChange =
    (campo: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setForm((prev) => ({ ...prev, [campo]: value }));
      setErrors((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));
      setMensaje(null);
    };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMensaje(null);
    const nuevosErrores = validar(form);
    setErrors(nuevosErrores);
    if (Object.values(nuevosErrores).some(Boolean)) return;

    if (!supabase) {
      setErrorGlobal(
        "Faltan las variables NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
      return;
    }

    setEnviando(true);
    setErrorGlobal(null);
    const { data, error } = await supabase
      .from("clientes")
      .insert({
        dni: form.dni.trim(),
        nombres: form.nombres.trim(),
        apellidos: form.apellidos.trim(),
        telefono: form.telefono.trim() || null,
        direccion: form.direccion.trim() || null,
        referencia: form.referencia.trim() || null,
      })
      .select()
      .single();

    setEnviando(false);
    if (error) {
      setErrorGlobal(`No se pudo registrar el cliente: ${error.message}`);
      return;
    }
    setClientes((prev) => [data as Cliente, ...prev]);
    setForm(EMPTY_FORM);
    setErrors({});
    setMensaje("Cliente registrado correctamente.");
  };

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(
      (c) =>
        c.dni.toLowerCase().includes(q) ||
        `${c.nombres} ${c.apellidos}`.toLowerCase().includes(q),
    );
  }, [clientes, query]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
          Gestión de Clientes
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Registra y consulta a tus clientes en tiempo real.
        </p>
      </header>

      {!supabase && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Configura las variables{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> en{" "}
          <code className="font-mono">.env.local</code> para conectar a Supabase.
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

      {/* Formulario de registro */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Registrar cliente
        </h2>
        <form onSubmit={handleSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="dni" className={labelCls}>
              DNI <span className="text-red-500">*</span>
            </label>
            <input
              id="dni"
              type="text"
              inputMode="numeric"
              maxLength={8}
              placeholder="Ej. 41234567"
              className={inputCls}
              value={form.dni}
              onChange={handleChange("dni")}
              aria-invalid={Boolean(errors.dni)}
            />
            {errors.dni && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.dni}</p>
            )}
          </div>

          <div>
            <label htmlFor="nombres" className={labelCls}>
              Nombres <span className="text-red-500">*</span>
            </label>
            <input
              id="nombres"
              type="text"
              placeholder="Ej. María Fernanda"
              className={inputCls}
              value={form.nombres}
              onChange={handleChange("nombres")}
              aria-invalid={Boolean(errors.nombres)}
            />
            {errors.nombres && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.nombres}</p>
            )}
          </div>

          <div>
            <label htmlFor="apellidos" className={labelCls}>
              Apellidos <span className="text-red-500">*</span>
            </label>
            <input
              id="apellidos"
              type="text"
              placeholder="Ej. Gutiérrez Ramírez"
              className={inputCls}
              value={form.apellidos}
              onChange={handleChange("apellidos")}
              aria-invalid={Boolean(errors.apellidos)}
            />
            {errors.apellidos && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.apellidos}</p>
            )}
          </div>

          <div>
            <label htmlFor="telefono" className={labelCls}>
              Teléfono
            </label>
            <input
              id="telefono"
              type="tel"
              inputMode="tel"
              placeholder="Ej. 987 654 321"
              className={inputCls}
              value={form.telefono}
              onChange={handleChange("telefono")}
              aria-invalid={Boolean(errors.telefono)}
            />
            {errors.telefono && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.telefono}</p>
            )}
          </div>

          <div>
            <label htmlFor="direccion" className={labelCls}>
              Dirección
            </label>
            <input
              id="direccion"
              type="text"
              placeholder="Ej. Av. Los Próceres 123"
              className={inputCls}
              value={form.direccion}
              onChange={handleChange("direccion")}
            />
          </div>

          <div>
            <label htmlFor="referencia" className={labelCls}>
              Referencia
            </label>
            <input
              id="referencia"
              type="text"
              placeholder="Ej. Frente al parque central"
              className={inputCls}
              value={form.referencia}
              onChange={handleChange("referencia")}
            />
          </div>

          <button
            type="submit"
            disabled={enviando}
            className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {enviando ? (
              <>
                <Spinner />
                Registrando...
              </>
            ) : (
              <>Registrar cliente</>
            )}
          </button>
        </form>
      </section>

      {/* Lista de clientes */}
      <section>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Clientes
            <span className="ml-2 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {filtrados.length}
            </span>
          </h2>

          <div className="relative w-full sm:w-72">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por DNI o nombre..."
              className={`${inputCls} pl-9`}
            />
          </div>
        </div>

        {cargando ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
              />
            ))}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            {clientes.length === 0
              ? "Aún no hay clientes registrados."
              : "No se encontraron clientes con ese criterio."}
          </div>
        ) : (
          <>
            {/* Tarjetas (móvil) */}
            <ul className="flex flex-col gap-3 md:hidden">
              {filtrados.map((c) => (
                <li
                  key={c.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white dark:bg-zinc-200 dark:text-zinc-900">
                      {INITIALES(c.nombres, c.apellidos)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        {c.nombres} {c.apellidos}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        DNI {c.dni}
                      </p>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
                    {c.telefono && (
                      <>
                        <dt className="text-zinc-500 dark:text-zinc-400">Teléfono</dt>
                        <dd className="text-zinc-800 dark:text-zinc-200">{c.telefono}</dd>
                      </>
                    )}
                    {c.direccion && (
                      <>
                        <dt className="text-zinc-500 dark:text-zinc-400">Dirección</dt>
                        <dd className="text-zinc-800 dark:text-zinc-200">{c.direccion}</dd>
                      </>
                    )}
                    {c.referencia && (
                      <>
                        <dt className="text-zinc-500 dark:text-zinc-400">Referencia</dt>
                        <dd className="text-zinc-800 dark:text-zinc-200">{c.referencia}</dd>
                      </>
                    )}
                    <dt className="hidden" />
                    <dd className="mt-1 text-zinc-400 dark:text-zinc-500">
                      Registrado el {formatFecha(c.created_at)}
                    </dd>
                  </dl>
                </li>
              ))}
            </ul>

            {/* Tabla (pantallas medianas en adelante) */}
            <div className="hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm md:block dark:border-zinc-800 dark:bg-zinc-900">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                    <th className="px-4 py-3 font-semibold">DNI</th>
                    <th className="px-4 py-3 font-semibold">Nombre</th>
                    <th className="px-4 py-3 font-semibold">Teléfono</th>
                    <th className="px-4 py-3 font-semibold">Dirección</th>
                    <th className="px-4 py-3 font-semibold">Referencia</th>
                    <th className="px-4 py-3 font-semibold">Registro</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/40"
                    >
                      <td className="px-4 py-3 font-mono text-zinc-600 dark:text-zinc-300">
                        {c.dni}
                      </td>
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                        {c.nombres} {c.apellidos}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                        {c.telefono ?? "—"}
                      </td>
                      <td className="max-w-[12rem] truncate px-4 py-3 text-zinc-600 dark:text-zinc-300">
                        {c.direccion ?? "—"}
                      </td>
                      <td className="max-w-[12rem] truncate px-4 py-3 text-zinc-600 dark:text-zinc-300">
                        {c.referencia ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-500 dark:text-zinc-400">
                        {formatFecha(c.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}