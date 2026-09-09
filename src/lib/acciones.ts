"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase, hasAuthConfig } from "@/lib/supabase-server";

export type ResultadoCobro =
  | { ok: true; error: null }
  | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const DIAS_ATRASO_MAXIMO = 90;

function hoyEnLima(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function validarFecha(s: string): string | null {
  if (!FECHA_RE.test(s)) return "La fecha de pago tiene un formato inválido.";
  const hoy = hoyEnLima();
  if (s > hoy) return "La fecha de pago no puede ser futura.";
  const dias = Math.round((Date.parse(hoy) - Date.parse(s)) / 86_400_000);
  if (dias > DIAS_ATRASO_MAXIMO)
    return `La fecha de pago no puede tener más de ${DIAS_ATRASO_MAXIMO} días de atraso.`;
  return null;
}

function traducirError(rpcMsg: string): string {
  const msg = rpcMsg.toLowerCase();
  if (msg.includes("cuota no encontrada"))
    return "La cuota ya no existe o no tienes permiso para registrarla.";
  if (msg.includes("no puede superar el saldo"))
    return "El monto supera el saldo pendiente de la cuota.";
  if (msg.includes("mayor a cero")) return "El monto debe ser mayor a cero.";
  if (msg.includes("row-level security") || msg.includes("permission denied"))
    return "Tu sesión expiró o no tienes permisos. Vuelve a iniciar sesión.";
  return rpcMsg;
}

export async function registrarCobro(input: {
  cuotaId: string;
  monto: number;
  fecha: string;
}): Promise<ResultadoCobro> {
  if (!hasAuthConfig) {
    return { ok: false, error: "Supabase no configurado" };
  }

  if (!UUID_RE.test(input.cuotaId)) {
    return { ok: false, error: "Identificador de cuota inválido." };
  }

  if (!Number.isFinite(input.monto) || input.monto <= 0) {
    return { ok: false, error: "El monto debe ser un número mayor a cero." };
  }

  const errorFecha = validarFecha(input.fecha);
  if (errorFecha) {
    return { ok: false, error: errorFecha };
  }

  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("pagar_cuota", {
    p_cuota_id: input.cuotaId,
    p_monto: input.monto,
    p_fecha: input.fecha,
  });

  if (error) {
    return { ok: false, error: traducirError(error.message) };
  }

  revalidatePath("/");
  revalidatePath("/prestamos");
  revalidatePath("/cobros");
  revalidatePath("/dashboard");

  return { ok: true, error: null };
}