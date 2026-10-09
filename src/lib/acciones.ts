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

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

function traducirError(mensaje: string): string {
  const msg = mensaje.toLowerCase();
  if (msg.includes("row-level security") || msg.includes("permission denied"))
    return "Tu sesión expiró o no tienes permisos. Vuelve a iniciar sesión.";
  return mensaje;
}

export async function registrarCobro(input: {
  cuotaId: string;
  monto: number;
  fecha: string;
  medioPago?: string;
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

  // 1) Leer la cuota para decidir pago total / abono parcial.
  const { data: cuota, error: errorLectura } = await supabase
    .from("cuotas")
    .select(
      "prestamo_id, monto, monto_pagado, saldo_pendiente, prestamos(saldo_pendiente)",
    )
    .eq("id", input.cuotaId)
    .maybeSingle();

  if (errorLectura) {
    return { ok: false, error: traducirError(errorLectura.message) };
  }
  if (!cuota) {
    return {
      ok: false,
      error: "La cuota ya no existe o no tienes permiso para registrarla.",
    };
  }

  const montoCuota = Number(cuota.monto ?? 0);
  const yaPagado = Number(cuota.monto_pagado ?? 0);
  const nuevoPagado = Math.min(montoCuota, redondear(yaPagado + input.monto));
  const saldoCuota = Math.max(0, redondear(montoCuota - nuevoPagado));
  const estadoFinal = nuevoPagado >= montoCuota ? "pagado" : "parcial";

  // 2) Actualizar la cuota (pago total -> 'pagado'; abono parcial -> 'parcial').
  const medioPago =
    input.medioPago === "yape" ||
    input.medioPago === "plin" ||
    input.medioPago === "transferencia"
      ? input.medioPago
      : "efectivo";

  const actualizacion: Record<string, string | number> = {
    estado: estadoFinal,
    monto_pagado: nuevoPagado,
    saldo_pendiente: saldoCuota,
  };
  if (estadoFinal === "pagado") {
    actualizacion.fecha_pago = input.fecha;
  }

  let { error: errorCuota } = await supabase
    .from("cuotas")
    .update({ ...actualizacion, metodo_pago: medioPago })
    .eq("id", input.cuotaId);
  if (
    errorCuota &&
    /column|does not exist|metodo_pago/i.test(errorCuota.message)
  ) {
    const reintento = await supabase
      .from("cuotas")
      .update(actualizacion)
      .eq("id", input.cuotaId);
    errorCuota = reintento.error;
  }

  if (errorCuota) {
    return {
      ok: false,
      error: `No se pudo actualizar la cuota: ${traducirError(errorCuota.message)}`,
    };
  }

  // 3) Descontar el saldo del préstamo (mismo efecto que el antiguo RPC).
  //    Cuando llega a 0, el préstamo pasa automáticamente a estado FINALIZADO.
  const prestamos = Array.isArray(cuota.prestamos)
    ? cuota.prestamos[0]
    : cuota.prestamos;
  const saldoPrestamo = Number(prestamos?.saldo_pendiente ?? 0);
  const nuevoSaldoPrestamo = Math.max(
    0,
    redondear(saldoPrestamo - input.monto),
  );
  const actualizacionPrestamo: Record<string, string | number> = {
    saldo_pendiente: nuevoSaldoPrestamo,
  };
  if (nuevoSaldoPrestamo <= 0) actualizacionPrestamo.estado = "liquidado";
  const { error: errorPrestamo } = await supabase
    .from("prestamos")
    .update(actualizacionPrestamo)
    .eq("id", cuota.prestamo_id);

  if (errorPrestamo) {
    return {
      ok: false,
      error: `La cuota se guardó, pero no se pudo actualizar el préstamo: ${traducirError(errorPrestamo.message)}`,
    };
  }

  // 4) Registrar el ingreso en `pagos` (columna estándar fecha_pago).
  const esAbonoParcial = estadoFinal === "parcial";

  const { data: sesion } = await supabase.auth.getUser();
  const basePago = {
    cuota_id: input.cuotaId,
    monto: redondear(input.monto),
    fecha_pago: input.fecha,
    ...(sesion.user?.id ? { user_id: sesion.user.id } : {}),
  };
  let errorPago: { message: string } | null = null;
  const { error: errorPagoMeta } = await supabase.from("pagos").insert({
    ...basePago,
    medio_pago: medioPago,
    es_abono_parcial: esAbonoParcial,
  });
  errorPago = errorPagoMeta;
  if (
    errorPago &&
    /column|does not exist|es_abono_parcial|medio_pago/i.test(errorPago.message)
  ) {
    const { error: errorPagoBase } = await supabase.from("pagos").insert(basePago);
    errorPago = errorPagoBase;
  }

  if (errorPago) {
    return {
      ok: false,
      error: `La cuota se guardó, pero no se pudo registrar en "pagos": ${traducirError(errorPago.message)}`,
    };
  }

  revalidatePath("/reportes");
  revalidatePath("/dashboard");
  revalidatePath("/prestamos");
  revalidatePath("/prestamos/[id]");
  revalidatePath("/cobros");
  revalidatePath("/");

  return { ok: true, error: null };
}
  // ensure cache
