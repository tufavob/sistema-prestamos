"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createClient,
  hasAuthConfig,
  type Cliente,
} from "@/lib/supabase";
import Modal from "@/components/Modal";

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
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [query, setQuery] = useState("");

  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [editando, setEditando] = useState<Cliente | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [editErrors, setEditErrors] = useState<FormErrors>({});
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

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
      setErrorGlobal(
        error.code === "23505"
          ? "Ya existe un cliente registrado con ese DNI."
          : `No se pudo registrar el cliente: ${error.message}`,
      );
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

  const iniciarNuevoPrestamo = (cliente: Cliente) => {
    router.push(`/prestamos/nuevo?cliente_id=${cliente.id}`);
  };

  const abrirEdicion = (c: Cliente) => {
    setEditando(c);
    setEditForm({
      dni: c.dni,
      nombres: c.nombres,
      apellidos: c.apellidos,
      telefono: c.telefono ?? "",
      direccion: c.direccion ?? "",
      referencia: c.referencia ?? "",
    });
    setEditErrors({});
    setErrorEdicion(null);
  };

  const cerrarEdicion = () => {
    if (guardandoEdicion) return;
    setEditando(null);
    setEditForm(EMPTY_FORM);
    setEditErrors({});
    setErrorEdicion(null);
  };

  const handleEditChange =
    (campo: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEditForm((prev) => ({ ...prev, [campo]: e.target.value }));
      setEditErrors((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));
    };

  const guardarEdicion = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!supabase || !editando) return;
    setErrorEdicion(null);

    const errores = validar(editForm);
    setEditErrors(errores);
    if (Object.values(errores).some(Boolean)) return;

    setGuardandoEdicion(true);
    const { error } = await supabase
      .from("clientes")
      .update({
        dni: editForm.dni.trim(),
        nombres: editForm.nombres.trim(),
        apellidos: editForm.apellidos.trim(),
        telefono: editForm.telefono.trim() || null,
        direccion: editForm.direccion.trim() || null,
        referencia: editForm.referencia.trim() || null,
      })
      .eq("id", editando.id);

    setGuardandoEdicion(false);
    if (error) {
      setErrorEdicion(
        error.code === "23505"
          ? "Ya existe otro cliente registrado con ese DNI."
          : `No se pudo actualizar el cliente: ${error.message}`,
      );
      return;
    }

    const editado = editando.id;
    setClientes((prev) =>
      prev.map((c) =>
        c.id === editado
          ? {
              ...c,
              dni: editForm.dni.trim(),
              nombres: editForm.nombres.trim(),
              apellidos: editForm.apellidos.trim(),
              telefono: editForm.telefono.trim() || null,
              direccion: editForm.direccion.trim() || null,
              referencia: editForm.referencia.trim() || null,
            }
          : c,
      ),
    );
    setEditando(null);
    setEditForm(EMPTY_FORM);
    setMensaje("Cliente actualizado correctamente.");
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
            Gestión de Clientes
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Registra y consulta a tus clientes en tiempo real.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/cobros"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-700"
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
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            Cobros del día
          </Link>
          <Link
            href="/prestamos/nuevo"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-5 text-sm font-semibold text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
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
              <path d="M12 5v14M5 12h14" />
            </svg>
            Crear préstamo
          </Link>
        </div>
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
            <span className="ml-2 inline-flex items-center rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              {clientes.length}
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
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => abrirEdicion(c)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        <path d="m15 5 4 4" />
                      </svg>
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => iniciarNuevoPrestamo(c)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      Nuevo préstamo
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Tabla (pantallas medianas en adelante) */}
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-100 font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-200">
                  <tr>
                    <th className="p-3">DNI</th>
                    <th className="p-3">Nombre Completo</th>
                    <th className="p-3">Teléfono</th>
                    <th className="p-3">Dirección</th>
                    <th className="p-3">Referencia</th>
                    <th className="p-3">Fecha Registro</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                    >
                      <td className="p-3 font-mono text-slate-600 dark:text-slate-300">
                        {c.dni}
                      </td>
                      <td className="p-3 font-medium text-slate-900 dark:text-slate-50">
                        {c.nombres} {c.apellidos}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">
                        {c.telefono ?? "—"}
                      </td>
                      <td className="max-w-[10rem] truncate p-3 text-slate-600 dark:text-slate-300">
                        {c.direccion ?? "—"}
                      </td>
                      <td className="max-w-[10rem] truncate p-3 text-slate-600 dark:text-slate-300">
                        {c.referencia ?? "—"}
                      </td>
                      <td className="whitespace-nowrap p-3 text-slate-500 dark:text-slate-400">
                        {formatFecha(c.created_at)}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => abrirEdicion(c)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                              <path d="m15 5 4 4" />
                            </svg>
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => iniciarNuevoPrestamo(c)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                            Nuevo préstamo
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <Modal open={editando !== null} onClose={cerrarEdicion}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Editar cliente
            </h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Actualiza los datos de contacto del cliente.
            </p>
          </div>
          <button
            type="button"
            onClick={cerrarEdicion}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
          >
            <svg
              className="h-5 w-5"
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

        <form onSubmit={guardarEdicion} noValidate className="mt-4 flex flex-col gap-4">
          {errorEdicion && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              {errorEdicion}
            </div>
          )}

          <div>
            <label htmlFor="edit-nombres" className={labelCls}>
              Nombres <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-nombres"
              type="text"
              className={inputCls}
              value={editForm.nombres}
              onChange={handleEditChange("nombres")}
              aria-invalid={Boolean(editErrors.nombres)}
            />
            {editErrors.nombres && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {editErrors.nombres}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="edit-apellidos" className={labelCls}>
              Apellidos <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-apellidos"
              type="text"
              className={inputCls}
              value={editForm.apellidos}
              onChange={handleEditChange("apellidos")}
              aria-invalid={Boolean(editErrors.apellidos)}
            />
            {editErrors.apellidos && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {editErrors.apellidos}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="edit-telefono" className={labelCls}>
              Teléfono
            </label>
            <input
              id="edit-telefono"
              type="tel"
              inputMode="tel"
              className={inputCls}
              value={editForm.telefono}
              onChange={handleEditChange("telefono")}
              aria-invalid={Boolean(editErrors.telefono)}
            />
            {editErrors.telefono && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {editErrors.telefono}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="edit-direccion" className={labelCls}>
              Dirección
            </label>
            <input
              id="edit-direccion"
              type="text"
              className={inputCls}
              value={editForm.direccion}
              onChange={handleEditChange("direccion")}
            />
          </div>

          <div>
            <label htmlFor="edit-referencia" className={labelCls}>
              Referencia
            </label>
            <input
              id="edit-referencia"
              type="text"
              className={inputCls}
              value={editForm.referencia}
              onChange={handleEditChange("referencia")}
            />
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={cerrarEdicion}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardandoEdicion}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              {guardandoEdicion ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      </Modal>
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