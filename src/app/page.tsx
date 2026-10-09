"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createClient,
  hasAuthConfig,
  type Cliente,
} from "@/lib/supabase";
import Modal from "@/components/Modal";
import BadgeCalificacion from "@/components/BadgeCalificacion";
import {
  obtenerScoresClientes,
  type CreditScore,
} from "@/lib/credito";
import {
  obtenerResumenCliente,
  type ResumenCliente,
} from "@/lib/clientes";

const supabase = hasAuthConfig ? createClient() : null;

type ClienteConFotos = Cliente & {
  dni_foto_url?: string | null;
  casa_foto_url?: string | null;
  referencia_domicilio?: string | null;
  calificacion?: string | null;
};

const getPublicImageUrl = (pathOrUrl: string | null | undefined): string | null => {
  if (!pathOrUrl) return null;
  if (
    pathOrUrl.startsWith("http://") ||
    pathOrUrl.startsWith("https://") ||
    pathOrUrl.startsWith("blob:")
  )
    return pathOrUrl;
  if (!supabase) return null;
  const { data } = supabase.storage.from("clientes-docs").getPublicUrl(pathOrUrl);
  return data.publicUrl;
};

type DatosClientes = {
  error: string | null;
  lista: ClienteConFotos[];
  mapa: Map<string, CreditScore>;
  conPrestamos: Set<string>;
};

async function cargarDatosClientes(client: SupabaseClient): Promise<DatosClientes> {
  const { data, error } = await client
    .from("clientes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return {
      error: error.message,
      lista: [],
      mapa: new Map(),
      conPrestamos: new Set(),
    };
  }

  const lista = (data as ClienteConFotos[]) ?? [];
  if (lista.length === 0) {
    return { error: null, lista, mapa: new Map(), conPrestamos: new Set() };
  }

  const mapa = await obtenerScoresClientes(
    client,
    lista.map((c) => c.id),
  );
  const { data: prestamosData } = await client
    .from("prestamos")
    .select("cliente_id")
    .in(
      "cliente_id",
      lista.map((c) => c.id),
    );
  const conPrestamos = new Set(
    ((prestamosData as { cliente_id: string }[] | null) ?? []).map(
      (p) => p.cliente_id,
    ),
  );

  return { error: null, lista, mapa, conPrestamos };
}

type FormState = {
  dni: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  direccion: string;
  referencia: string;
  fotoDniFrontal: string;
  fotoDniPosterior: string;
  fotoFachada: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const EMPTY_FORM: FormState = {
  dni: "",
  nombres: "",
  apellidos: "",
  telefono: "",
  direccion: "",
  referencia: "",
  fotoDniFrontal: "",
  fotoDniPosterior: "",
  fotoFachada: "",
};

type Campofoto = "dniFrontal" | "dniPosterior" | "fachada";

const CAMPOS_FOTO = [
  {
    id: "foto-dni",
    etiqueta: "DNI",
    descripcion: "Documento de identidad del cliente",
    campo: "dniFrontal" as const,
    urlCampo: "fotoDniFrontal" as const,
    columna: "dni_foto_url" as const,
    prefijo: "dni" as const,
  },
  {
    id: "foto-casa",
    etiqueta: "Casa / Fachada",
    descripcion: "Exterior de la vivienda del cliente",
    campo: "dniPosterior" as const,
    urlCampo: "fotoDniPosterior" as const,
    columna: "casa_foto_url" as const,
    prefijo: "casa" as const,
  },
  {
    id: "foto-referencia",
    etiqueta: "Referencia del domicilio",
    descripcion: "Referencia o punto cercano a la vivienda",
    campo: "fachada" as const,
    urlCampo: "fotoFachada" as const,
    columna: "referencia_domicilio" as const,
    prefijo: "ref" as const,
  },
] as const;

const inputCls =
  "w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

const labelCls =
  "mb-1.5 block text-sm font-medium text-slate-300 dark:text-zinc-300";

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
  const [clientes, setClientes] = useState<ClienteConFotos[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [query, setQuery] = useState("");

  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [editando, setEditando] = useState<ClienteConFotos | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [editErrors, setEditErrors] = useState<FormErrors>({});
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  const [scores, setScores] = useState<Map<string, CreditScore>>(new Map());
  const [conPrestamos, setConPrestamos] = useState<Set<string>>(new Set());
  const [expedienteAbierto, setExpedienteAbierto] = useState<string | null>(null);
  const [resumenes, setResumenes] = useState<Record<string, ResumenCliente>>({});
  const [cargandoExpediente, setCargandoExpediente] = useState<string | null>(null);

  const [fotos, setFotos] = useState<Record<Campofoto, File | null>>({
    dniFrontal: null,
    dniPosterior: null,
    fachada: null,
  });
  const [previews, setPreviews] = useState<Record<Campofoto, string | null>>({
    dniFrontal: null,
    dniPosterior: null,
    fachada: null,
  });
  const [fotoError, setFotoError] = useState<string | null>(null);
  const [avisoBucket, setAvisoBucket] = useState<string | null>(null);

  const [fotosEdicion, setFotosEdicion] = useState<Record<Campofoto, File | null>>({
    dniFrontal: null,
    dniPosterior: null,
    fachada: null,
  });
  const [previewsEdicion, setPreviewsEdicion] = useState<
    Record<Campofoto, string | null>
  >({
    dniFrontal: null,
    dniPosterior: null,
    fachada: null,
  });
  const [fotoErrorEdicion, setFotoErrorEdicion] = useState<string | null>(null);

  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  const fetchClientes = async () => {
    if (!supabase) return;
    const r = await cargarDatosClientes(supabase);
    if (r.error) {
      setErrorGlobal(
        `No se pudieron cargar los clientes: ${r.error}. Revisa la tabla "clientes" en Supabase.`,
      );
      return;
    }
    setClientes(r.lista);
    setScores(r.mapa);
    setConPrestamos(r.conPrestamos);
  };

  useEffect(() => {
    let activo = true;
    const cargar = async () => {
      if (supabase) {
        const r = await cargarDatosClientes(supabase);
        if (!activo) return;
        if (r.error) {
          setErrorGlobal(
            `No se pudieron cargar los clientes: ${r.error}. Revisa la tabla "clientes" en Supabase.`,
          );
        } else {
          setClientes(r.lista);
          setScores(r.mapa);
          setConPrestamos(r.conPrestamos);
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

  const revocarPreview = (url: string | null) => {
    if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
  };

  const uploadFileToSupabase = async (
    file: File,
    folderPrefix: string,
    dni: string,
  ): Promise<string | null> => {
    if (!supabase) {
      setAvisoBucket("Supabase no está configurado.");
      return null;
    }
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const cleanFileName = `${dni}_${folderPrefix}_${Date.now()}.${ext}`.replace(
        /[^a-zA-Z0-9_.-]/g,
        "_",
      );
      const { error } = await supabase.storage
        .from("clientes-docs")
        .upload(cleanFileName, file, { cacheControl: "3600", upsert: true });
      if (error) {
        setAvisoBucket(`No se pudo subir la imagen: ${error.message}`);
        return null;
      }
      return cleanFileName;
    } catch (e) {
      setAvisoBucket(`No se pudo subir la imagen: ${(e as Error).message}`);
      return null;
    }
  };

  const subirYResolver = async (
    archivo: File | null,
    prefijo: string,
    dni: string,
  ): Promise<string | null> => {
    if (!archivo) return null;
    const fileName = await uploadFileToSupabase(archivo, prefijo, dni);
    if (!fileName) return null;
    return getPublicImageUrl(fileName);
  };

  const manejarArchivoForm =
    (campo: Campofoto) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const archivo = e.target.files?.[0];
      if (!archivo) return;
      revocarPreview(previews[campo]);
      setPreviews((prev) => ({ ...prev, [campo]: URL.createObjectURL(archivo) }));
      setFotos((prev) => ({ ...prev, [campo]: archivo }));
      setFotoError(null);
    };

  const manejarArchivoEdicion =
    (campo: Campofoto) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const archivo = e.target.files?.[0];
      if (!archivo) return;
      revocarPreview(previewsEdicion[campo]);
      setPreviewsEdicion((prev) => ({
        ...prev,
        [campo]: URL.createObjectURL(archivo),
      }));
      setFotosEdicion((prev) => ({ ...prev, [campo]: archivo }));
      setFotoErrorEdicion(null);
    };

  const liberarPreviews = () => {
    Object.values(previews).forEach(revocarPreview);
    Object.values(previewsEdicion).forEach(revocarPreview);
    setPreviews({ dniFrontal: null, dniPosterior: null, fachada: null });
    setPreviewsEdicion({ dniFrontal: null, dniPosterior: null, fachada: null });
  };

  const compartirWhatsApp = async (url: string) => {
    const texto = `Foto del expediente del cliente: ${url}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Foto del cliente", text: texto, url });
        return;
      } catch {
        // el usuario canceló el compartir nativo; caer al enlace wa.me
      }
    }
    window.open(
      `https://wa.me/?text=${encodeURIComponent(texto)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const descargarImagen = (url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = url.split("/").pop() ?? "foto.jpg";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
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

    const dni = form.dni.trim();

    let dniFotoUrl: string | null = null;
    let casaFotoUrl: string | null = null;
    let refFotoUrl: string | null = null;
    try {
      [dniFotoUrl, casaFotoUrl, refFotoUrl] = await Promise.all([
        subirYResolver(fotos.dniFrontal, "dni", dni),
        subirYResolver(fotos.dniPosterior, "casa", dni),
        subirYResolver(fotos.fachada, "ref", dni),
      ]);
    } catch (err) {
      setEnviando(false);
      setErrorGlobal(
        `No se pudo procesar las fotografías: ${(err as Error).message}. El cliente se guardará igualmente.`,
      );
    }

    const { error } = await supabase.from("clientes").insert({
      dni,
      nombres: form.nombres.trim(),
      apellidos: form.apellidos.trim(),
      telefono: form.telefono.trim() || null,
      direccion: form.direccion.trim() || null,
      referencia: form.referencia.trim() || null,
      calificacion: "nuevo",
      dni_foto_url: dniFotoUrl,
      casa_foto_url: casaFotoUrl,
      referencia_domicilio: refFotoUrl,
    });

    setEnviando(false);
    if (error) {
      setErrorGlobal(
        error.code === "23505"
          ? "Ya existe un cliente registrado con ese DNI."
          : `No se pudo registrar el cliente: ${error.message}`,
      );
      return;
    }

    setForm(EMPTY_FORM);
    setErrors({});
    setFotos({ dniFrontal: null, dniPosterior: null, fachada: null });
    setPreviews({ dniFrontal: null, dniPosterior: null, fachada: null });
    setFotoError(null);
    setMensaje("Cliente registrado correctamente.");
    await fetchClientes();
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

  const abrirEdicion = (c: ClienteConFotos) => {
    liberarPreviews();
    setEditando(c);
    setEditForm({
      dni: c.dni,
      nombres: c.nombres,
      apellidos: c.apellidos,
      telefono: c.telefono ?? "",
      direccion: c.direccion ?? "",
      referencia: c.referencia ?? "",
      fotoDniFrontal: c.dni_foto_url ?? "",
      fotoDniPosterior: c.casa_foto_url ?? "",
      fotoFachada: c.referencia_domicilio ?? "",
    });
    setPreviewsEdicion({
      dniFrontal: c.dni_foto_url ?? null,
      dniPosterior: c.casa_foto_url ?? null,
      fachada: c.referencia_domicilio ?? null,
    });
    setFotosEdicion({ dniFrontal: null, dniPosterior: null, fachada: null });
    setFotoErrorEdicion(null);
    setEditErrors({});
    setErrorEdicion(null);
  };

  const cerrarEdicion = () => {
    if (guardandoEdicion) return;
    setEditando(null);
    setEditForm(EMPTY_FORM);
    liberarPreviews();
    setFotosEdicion({ dniFrontal: null, dniPosterior: null, fachada: null });
    setFotoErrorEdicion(null);
    setEditErrors({});
    setErrorEdicion(null);
  };

  const setEditCampo = (campo: keyof FormState) => (value: string) => {
    setEditForm((prev) => ({ ...prev, [campo]: value }));
    setEditErrors((prev) =>
      prev[campo] ? { ...prev, [campo]: undefined } : prev,
    );
  };

  const handleEditChange =
    (campo: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEditForm((prev) => ({ ...prev, [campo]: e.target.value }));
      setEditErrors((prev) =>
        prev[campo] ? { ...prev, [campo]: undefined } : prev,
      );
    };

  const guardarEdicion = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!supabase || !editando) return;
    setErrorEdicion(null);

    const errores = validar(editForm);
    setEditErrors(errores);
    if (Object.values(errores).some(Boolean)) return;

    setGuardandoEdicion(true);

    const dniEdit = editForm.dni.trim();

    let dniFotoUrl: string | null = editForm.fotoDniFrontal.trim() || null;
    let casaFotoUrl: string | null = editForm.fotoDniPosterior.trim() || null;
    let refFotoUrl: string | null = editForm.fotoFachada.trim() || null;
    try {
      const [nDni, nCasa, nRef] = await Promise.all([
        subirYResolver(fotosEdicion.dniFrontal, "dni", dniEdit),
        subirYResolver(fotosEdicion.dniPosterior, "casa", dniEdit),
        subirYResolver(fotosEdicion.fachada, "ref", dniEdit),
      ]);
      if (nDni) dniFotoUrl = nDni;
      if (nCasa) casaFotoUrl = nCasa;
      if (nRef) refFotoUrl = nRef;
    } catch (err) {
      setGuardandoEdicion(false);
      setErrorEdicion(
        `No se pudo procesar las fotografías: ${(err as Error).message}. Los demás datos se guardarán igualmente.`,
      );
    }

    const { error } = await supabase
      .from("clientes")
      .update({
        dni: editForm.dni.trim(),
        nombres: editForm.nombres.trim(),
        apellidos: editForm.apellidos.trim(),
        telefono: editForm.telefono.trim() || null,
        direccion: editForm.direccion.trim() || null,
        referencia: editForm.referencia.trim() || null,
        dni_foto_url: dniFotoUrl,
        casa_foto_url: casaFotoUrl,
        referencia_domicilio: refFotoUrl,
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

    setEditando(null);
    setEditForm(EMPTY_FORM);
    liberarPreviews();
    setFotosEdicion({ dniFrontal: null, dniPosterior: null, fachada: null });
    setFotoErrorEdicion(null);
    setMensaje("Cliente actualizado correctamente.");
    await fetchClientes();
  };

  const alternarExpediente = (id: string) => {
    if (expedienteAbierto === id) {
      setExpedienteAbierto(null);
      return;
    }
    setExpedienteAbierto(id);
    if (!resumenes[id] && supabase) {
      setCargandoExpediente(id);
      obtenerResumenCliente(supabase, id)
        .then((r) => setResumenes((prev) => ({ ...prev, [id]: r })))
        .finally(() => setCargandoExpediente(null));
    }
  };

  const renderCalificacion = (c: ClienteConFotos) => {
    const cal = String(c.calificacion ?? "").toLowerCase();
    const sinPrestamos = !conPrestamos.has(c.id);
    if (sinPrestamos || cal === "nuevo" || cal === "sin_historial") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-200 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-white/60" />
          {cal === "sin_historial" ? "Sin Historial" : "Nuevo"}
        </span>
      );
    }
    const score = scores.get(c.id);
    if (!score) return null;
    return <BadgeCalificacion calificacion={score.calificacion} score={score} />;
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl dark:text-zinc-50">
            Gestión de Clientes
          </h1>
          <p className="mt-1 text-sm text-slate-400 dark:text-slate-400">
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
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 px-5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/40 transition hover:from-emerald-500"
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
        <div className="rounded-lg border border-amber-800 bg-amber-950/60 p-4 text-sm text-amber-300 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Configura las variables{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> en{" "}
          <code className="font-mono">.env.local</code> para conectar a Supabase.
        </div>
      )}

      {errorGlobal && (
        <div className="rounded-lg border border-red-800 bg-red-950/60 p-4 text-sm text-red-300 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {errorGlobal}
        </div>
      )}

      {avisoBucket && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-lg border border-amber-800 bg-amber-950/60 p-4 text-sm text-amber-300 dark:border-yellow-700 dark:bg-amber-950 dark:text-yellow-200"
        >
          <span>{avisoBucket}</span>
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => setAvisoBucket(null)}
            className="shrink-0 rounded p-1 text-amber-300 transition hover:bg-amber-900 hover:text-amber-100"
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
      )}

      {mensaje && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-950/60 p-4 text-sm text-emerald-300 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          {mensaje}
        </div>
      )}

      {/* Formulario de registro */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-slate-800">
        <h2 className="mb-4 text-lg font-semibold text-slate-100 dark:text-zinc-50">
          Registrar cliente
        </h2>
        <form onSubmit={handleSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
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

          {/* Documentación y Verificación de Campo */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:col-span-2">
            <div className="mb-1 flex items-center gap-2">
              <svg
                className="h-4 w-4 text-emerald-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              <h3 className="text-sm font-semibold text-slate-100 dark:text-zinc-50">
                Documentación y Verificación de Campo
              </h3>
            </div>
            <p className="mb-4 text-xs text-slate-400 dark:text-slate-400">
              Toma o sube una foto de cada documento o evidencia. Se guarda la
              referencia en el expediente del cliente.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {CAMPOS_FOTO.map((p) => (
                <div key={p.id}>
                  <label htmlFor={p.id} className={labelCls}>
                    {p.etiqueta}
                  </label>
                  {previews[p.campo] ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        aria-label={`Ampliar ${p.etiqueta}`}
                        onClick={() => setFotoAmpliada(previews[p.campo]!)}
                        className="block w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-950/70 transition hover:border-emerald-500"
                      >
                        <img
                          src={previews[p.campo]!}
                          alt={p.etiqueta}
                          className="h-32 w-full object-cover"
                        />
                      </button>
                      <div className="flex gap-2">
                        <label
                          htmlFor={p.id}
                          className="inline-flex flex-1 cursor-pointer items-center justify-center rounded-lg border border-slate-700 px-2 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
                        >
                          Reemplazar
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label
                      htmlFor={p.id}
                      className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-700 bg-slate-950/70 text-center text-slate-400 transition hover:border-emerald-500 hover:text-emerald-400"
                    >
                      <svg
                        className="h-6 w-6"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                        <circle cx="12" cy="13" r="3" />
                      </svg>
                      <span className="px-3 text-xs">{p.descripcion}</span>
                    </label>
                  )}
                  <input
                    id={p.id}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={manejarArchivoForm(p.campo)}
                  />
                </div>
              ))}
            </div>
            {fotoError && (
              <p className="mt-3 text-xs text-red-500 dark:text-red-400">{fotoError}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={enviando}
            className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2 dark:bg-emerald-100 dark:text-emerald-900 dark:hover:bg-emerald-300"
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
          <h2 className="text-lg font-semibold text-slate-100 dark:text-zinc-50">
            Clientes
            <span className="ml-2 inline-flex items-center rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 px-2.5 py-0.5 text-xs font-semibold text-white">
              {clientes.length}
            </span>
          </h2>

          <div className="relative w-full sm:w-72">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por DNI o nombre..."
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 pl-9 text-sm text-slate-100 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        </div>

        {cargando ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-2xl border border-slate-800 bg-slate-800/60 dark:border-zinc-800 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 p-10 text-center text-sm text-slate-400 dark:border-zinc-700 dark:text-slate-400">
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
                  className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm dark:border-zinc-800 dark:bg-slate-800"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-white dark:bg-zinc-200 dark:text-slate-100">
                      {INITIALES(c.nombres, c.apellidos)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-100 dark:text-zinc-50">
                          {c.nombres} {c.apellidos}
                        </p>
                        {renderCalificacion(c)}
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-400">
                        DNI {c.dni}
                      </p>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
                    {c.telefono && (
                      <>
                        <dt className="text-slate-400 dark:text-slate-400">Teléfono</dt>
                        <dd className="text-slate-200 dark:text-zinc-200">{c.telefono}</dd>
                      </>
                    )}
                    {c.direccion && (
                      <>
                        <dt className="text-slate-400 dark:text-slate-400">Dirección</dt>
                        <dd className="text-slate-200 dark:text-zinc-200">{c.direccion}</dd>
                      </>
                    )}
                    {c.referencia && (
                      <>
                        <dt className="text-slate-400 dark:text-slate-400">Referencia</dt>
                        <dd className="text-slate-200 dark:text-zinc-200">{c.referencia}</dd>
                      </>
                    )}
                    <dt className="hidden" />
                    <dd className="mt-1 text-slate-400 dark:text-slate-400">
                      Registrado el {formatFecha(c.created_at)}
                    </dd>
                  </dl>
                  {c.dni_foto_url || c.casa_foto_url || c.referencia_domicilio ? (
                    <div className="mt-3 flex items-center gap-1.5">
                      {[
                        { url: c.dni_foto_url, alt: "DNI" },
                        { url: c.casa_foto_url, alt: "Casa" },
                        { url: c.referencia_domicilio, alt: "Referencia" },
                      ].map(
                        (f, i) =>
                          f.url && (
                            <button
                              key={i}
                              type="button"
                              aria-label={`Ampliar ${f.alt}`}
                              onClick={() =>
                                setFotoAmpliada(getPublicImageUrl(f.url))
                              }
                              className="overflow-hidden rounded-md border border-slate-700 transition hover:border-emerald-500"
                            >
                              <img
                                src={getPublicImageUrl(f.url) || "/placeholder.png"}
                                alt={f.alt}
                                className="h-12 w-12 object-cover"
                              />
                            </button>
                          ),
                      )}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => abrirEdicion(c)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-950 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
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
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 dark:bg-emerald-100 dark:text-emerald-900 dark:hover:bg-emerald-300"
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
            <div className="hidden overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 shadow-sm md:block dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-950 font-semibold text-slate-400">
                  <tr>
                    <th className="p-3">DNI</th>
                    <th className="p-3">Nombre Completo</th>
                    <th className="p-3">Calificación</th>
                    <th className="p-3">Fotos</th>
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
                      className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40 dark:border-slate-800 dark:hover:bg-slate-800/40"
                    >
                      <td className="p-3 font-mono text-slate-400 dark:text-slate-300">
                        {c.dni}
                      </td>
                      <td className="p-3 font-medium text-slate-100 dark:text-slate-50">
                        {c.nombres} {c.apellidos}
                      </td>
                      <td className="p-3">
                        {renderCalificacion(c) ?? (
                          <span className="text-xs text-slate-400 dark:text-slate-400">
                            —
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {c.dni_foto_url ||
                        c.casa_foto_url ||
                        c.referencia_domicilio ? (
                          <div className="flex items-center gap-1.5">
                            {[
                              { url: c.dni_foto_url, alt: "DNI" },
                              { url: c.casa_foto_url, alt: "Casa" },
                              { url: c.referencia_domicilio, alt: "Referencia" },
                            ].map(
                              (f, i) =>
                                f.url && (
                                  <button
                                    key={i}
                                    type="button"
                                    aria-label={`Ampliar ${f.alt}`}
                                    onClick={() =>
                                      setFotoAmpliada(getPublicImageUrl(f.url))
                                    }
                                    className="overflow-hidden rounded-md border border-slate-700 transition hover:border-emerald-500"
                                  >
                                    <img
                                      src={
                                        getPublicImageUrl(f.url) ||
                                        "/placeholder.png"
                                      }
                                      alt={f.alt}
                                      className="h-9 w-9 object-cover"
                                    />
                                  </button>
                                ),
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-500">
                            —
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-slate-400 dark:text-slate-300">
                        {c.telefono ?? "—"}
                      </td>
                      <td className="max-w-[10rem] truncate p-3 text-slate-400 dark:text-slate-300">
                        {c.direccion ?? "—"}
                      </td>
                      <td className="max-w-[10rem] truncate p-3 text-slate-400 dark:text-slate-300">
                        {c.referencia ?? "—"}
                      </td>
                      <td className="whitespace-nowrap p-3 text-slate-400 dark:text-slate-400">
                        {formatFecha(c.created_at)}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => abrirEdicion(c)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-950 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
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
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 dark:bg-emerald-100 dark:text-emerald-900 dark:hover:bg-emerald-300"
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
            <h3 className="text-lg font-semibold text-slate-100 dark:text-zinc-50">
              Editar cliente
            </h3>
            <p className="mt-1 text-sm text-slate-400 dark:text-slate-400">
              Actualiza los datos de contacto del cliente.
            </p>
          </div>
          <button
            type="button"
            onClick={cerrarEdicion}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
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
            <label htmlFor="edit-dni" className={labelCls}>
              DNI <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-dni"
              type="text"
              inputMode="numeric"
              maxLength={8}
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              value={editForm.dni}
              onChange={handleEditChange("dni")}
              aria-invalid={Boolean(editErrors.dni)}
            />
            {editErrors.dni && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{editErrors.dni}</p>
            )}
          </div>

          <div>
            <label htmlFor="edit-nombres" className={labelCls}>
              Nombres <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-nombres"
              type="text"
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              value={editForm.nombres}
              onChange={handleEditChange("nombres")}
              aria-invalid={Boolean(editErrors.nombres)}
            />
            {editErrors.nombres && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{editErrors.nombres}</p>
            )}
          </div>

          <div>
            <label htmlFor="edit-apellidos" className={labelCls}>
              Apellidos <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-apellidos"
              type="text"
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              value={editForm.apellidos}
              onChange={handleEditChange("apellidos")}
              aria-invalid={Boolean(editErrors.apellidos)}
            />
            {editErrors.apellidos && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{editErrors.apellidos}</p>
            )}
          </div>

          <div>
            <label htmlFor="edit-telefono" className={labelCls}>
              Teléfono
            </label>
            <input
              id="edit-telefono"
              type="tel"
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              value={editForm.telefono}
              onChange={handleEditChange("telefono")}
              aria-invalid={Boolean(editErrors.telefono)}
            />
            {editErrors.telefono && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{editErrors.telefono}</p>
            )}
          </div>

          <div>
            <label htmlFor="edit-direccion" className={labelCls}>
              Dirección
            </label>
            <input
              id="edit-direccion"
              type="text"
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
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
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              value={editForm.referencia}
              onChange={handleEditChange("referencia")}
            />
          </div>

          {/* Documentación y fotos (edición) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="mb-1 flex items-center gap-2">
              <svg
                className="h-4 w-4 text-emerald-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              <h3 className="text-sm font-semibold text-slate-100 dark:text-zinc-50">
                Documentación y fotos
              </h3>
            </div>
            <p className="mb-4 text-xs text-slate-400 dark:text-slate-400">
              Actualiza o reemplaza las fotos del expediente del cliente.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {CAMPOS_FOTO.map((p) => (
                <div key={p.id}>
                  <label htmlFor={`edit-${p.id}`} className={labelCls}>
                    {p.etiqueta}
                  </label>
                  {previewsEdicion[p.campo] ? (
                    <button
                      type="button"
                      aria-label={`Ampliar ${p.etiqueta}`}
                      onClick={() =>
                        setFotoAmpliada(getPublicImageUrl(previewsEdicion[p.campo]))
                      }
                      className="block w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-950/70 transition hover:border-emerald-500"
                    >
                      <img
                        src={
                          getPublicImageUrl(previewsEdicion[p.campo]) ||
                          "/placeholder.png"
                        }
                        alt={p.etiqueta}
                        className="h-32 w-full object-cover"
                      />
                    </button>
                  ) : (
                    <label
                      htmlFor={`edit-${p.id}`}
                      className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-700 bg-slate-950/70 text-center text-slate-400 transition hover:border-emerald-500 hover:text-emerald-400"
                    >
                      <svg
                        className="h-6 w-6"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                        <circle cx="12" cy="13" r="3" />
                      </svg>
                      <span className="text-xs">Toma o sube una foto</span>
                    </label>
                  )}
                  <input
                    id={`edit-${p.id}`}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={manejarArchivoEdicion(p.campo)}
                  />
                </div>
              ))}
            </div>
            {fotoErrorEdicion && (
              <p className="mt-3 text-xs text-red-500 dark:text-red-400">
                {fotoErrorEdicion}
              </p>
            )}
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={cerrarEdicion}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-800 px-4 text-sm font-semibold text-slate-300 transition hover:bg-slate-800/60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardandoEdicion}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 px-5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/40 transition hover:from-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {guardandoEdicion ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Vista ampliada de fotografía */}
      <Modal
        open={fotoAmpliada !== null}
        onClose={() => setFotoAmpliada(null)}
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold text-slate-100 dark:text-zinc-50">
            Foto del cliente
          </h3>
          <button
            type="button"
            onClick={() => setFotoAmpliada(null)}
            aria-label="Cerrar foto"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
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
        {fotoAmpliada && (
          <img
            src={getPublicImageUrl(fotoAmpliada) || "/placeholder.png"}
            alt="Fotografía ampliada"
            className="mt-4 max-h-[60vh] w-full rounded-lg border border-slate-800 object-contain bg-slate-950/70"
          />
        )}
        {fotoAmpliada && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => compartirWhatsApp(fotoAmpliada)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/40 transition hover:from-emerald-500"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
              </svg>
              Compartir por WhatsApp
            </button>
            <button
              type="button"
              onClick={() => descargarImagen(fotoAmpliada)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
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
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="m7 10 5 5 5-5" />
                <path d="M12 15V3" />
              </svg>
              Descargar Imagen
            </button>
          </div>
        )}
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
