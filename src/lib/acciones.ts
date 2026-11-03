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
      "prestamo_id, monto, monto_pagado, saldo_pendiente, estado, fecha_pago, prestamos(saldo_pendiente)",
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

  // Datos previos de la cuota (para poder revertir si algo falla después).
  const saldoAnterior = Number(
    cuota.saldo_pendiente ?? Math.max(0, redondear(montoCuota - yaPagado)),
  );
  const estadoAnterior = String(cuota.estado ?? "pendiente");
  const fechaPagoAnterior =
    (cuota.fecha_pago as string | null | undefined) ?? null;

  const medioPago =
    input.medioPago === "yape" ||
    input.medioPago === "plin" ||
    input.medioPago === "transferencia"
      ? input.medioPago
      : "efectivo";

  // 2) Registrar PRIMERO el ingreso en `pagos`. La tabla solo acepta
  //    id, cuota_id, monto, metodo_pago y fecha_pago; NO se envía
  //    prestamo_id ni cliente_id. Se prueban variantes por compatibilidad
  //    entre entornos (metodo_pago/medio_pago y fecha_pago date/timestamptz).
  const fechaPagoISO = new Date().toISOString();
  const fechaPagoPeru = hoyEnLima();
  const montoPago = redondear(input.monto);
  const medioPagoEtiqueta =
    medioPago.charAt(0).toUpperCase() + medioPago.slice(1);
  const pagoId = crypto.randomUUID();

  const variantesPago: Record<string, string | number>[] = [
    {
      id: pagoId,
      cuota_id: input.cuotaId,
      monto: montoPago,
      metodo_pago: medioPago,
      fecha_pago: fechaPagoISO,
    },
    {
      id: pagoId,
      cuota_id: input.cuotaId,
      monto: montoPago,
      medio_pago: medioPago,
      fecha_pago: fechaPagoISO,
    },
    {
      id: pagoId,
      cuota_id: input.cuotaId,
      monto: montoPago,
      metodo_pago: medioPago,
      fecha_pago: fechaPagoPeru,
    },
    {
      id: pagoId,
      cuota_id: input.cuotaId,
      monto: montoPago,
      medio_pago: medioPago,
      fecha_pago: fechaPagoPeru,
    },
    {
      id: pagoId,
      cuota_id: input.cuotaId,
      monto: montoPago,
      metodo_pago: medioPagoEtiqueta,
      fecha_pago: fechaPagoISO,
    },
    {
      id: pagoId,
      cuota_id: input.cuotaId,
      monto: montoPago,
      metodo_pago: medioPagoEtiqueta,
      fecha_pago: fechaPagoPeru,
    },
    {
      id: pagoId,
      cuota_id: input.cuotaId,
      monto: montoPago,
      fecha_pago: fechaPagoISO,
    },
    {
      id: pagoId,
      cuota_id: input.cuotaId,
      monto: montoPago,
      fecha_pago: fechaPagoPeru,
    },
    {
      id: pagoId,
      cuota_id: input.cuotaId,
      monto: montoPago,
    },
  ];

  let errorPago: { message: string } | null = null;
  for (const payload of variantesPago) {
    const { error } = await supabase.from("pagos").insert(payload);
    if (!error) {
      errorPago = null;
      break;
    }
    errorPago = error;
    // Solo se reintenta cuando el error es de esquema/fecha/valor admitido;
    // otro tipo de error (permisos, FK, etc.) no mejora cambiando columnas.
    if (
      !/column|schema cache|does not exist|invalid input syntax|date\/time|check constraint|invalid input value for enum/i.test(
        error.message,
      )
    ) {
      break;
    }
  }

  if (errorPago) {
    return {
      ok: false,
      error: `No se pudo registrar el pago en "pagos": ${traducirError(errorPago.message)}`,
    };
  }

  // 3) Solo con el pago registrado, actualizar la cuota.
  const actualizacion: Record<string, string | number> = {
    estado: estadoFinal,
    monto_pagado: nuevoPagado,
    saldo_pendiente: saldoCuota,
  };
  if (estadoFinal === "pagado") {
    actualizacion.fecha_pago = new Date().toISOString();
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
    // Revertir el pago para no dejar un ingreso sin cuota actualizada.
    const { data: revertidos, error: errorReversion } = await supabase
      .from("pagos")
      .delete()
      .eq("id", pagoId)
      .select("id");
    if (errorReversion || !revertidos || revertidos.length === 0) {
      console.error(
        "No se pudo revertir el pago tras fallar la cuota (posible falta de política DELETE en pagos):",
        errorReversion?.message ?? "0 filas eliminadas",
      );
    }
    return {
      ok: false,
      error: `No se pudo actualizar la cuota: ${traducirError(errorCuota.message)}`,
    };
  }

  // 4) Descontar el saldo del préstamo y recalcular su estado según las
  //    cuotas reales. El estado NO se infiere del saldo: mientras exista
  //    alguna cuota con estado distinto de 'pagado' (incluye abonos
  //    'parcial'), el préstamo sigue 'activo'. Solo cuando quedan 0 cuotas
  //    sin pagar se marca 'completado'.
  const prestamoId = cuota.prestamo_id;
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

  let errorPrestamo: { message: string } | null = null;
  const { count: cuotasSinPagar, error: errorConteo } = await supabase
    .from("cuotas")
    .select("id", { count: "exact", head: true })
    .eq("prestamo_id", prestamoId)
    .neq("estado", "pagado");

  if (errorConteo) {
    errorPrestamo = errorConteo;
  } else {
    actualizacionPrestamo.estado =
      cuotasSinPagar === 0 ? "completado" : "activo";
    const { error } = await supabase
      .from("prestamos")
      .update(actualizacionPrestamo)
      .eq("id", prestamoId);
    errorPrestamo = error;
  }

  if (errorPrestamo) {
    // Revertir cuota y pago: la operación debe quedar consistente.
    const { error: errorReversionCuota } = await supabase
      .from("cuotas")
      .update({
        estado: estadoAnterior,
        monto_pagado: yaPagado,
        saldo_pendiente: saldoAnterior,
        fecha_pago: fechaPagoAnterior,
      })
      .eq("id", input.cuotaId);
    const { data: revertidos, error: errorReversionPago } = await supabase
      .from("pagos")
      .delete()
      .eq("id", pagoId)
      .select("id");
    if (
      errorReversionCuota ||
      errorReversionPago ||
      !revertidos ||
      revertidos.length === 0
    ) {
      console.error("No se pudo revertir la operación completa:", {
        cuota: errorReversionCuota?.message,
        pago:
          errorReversionPago?.message ??
          (revertidos && revertidos.length === 0
            ? "0 filas eliminadas (falta política DELETE en pagos)"
            : undefined),
      });
    }
    return {
      ok: false,
      error: `No se pudo actualizar el préstamo: ${traducirError(errorPrestamo.message)}`,
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
