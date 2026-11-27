"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase, hasAuthConfig } from "@/lib/supabase-server";
import { aYMD, calcularPrestamo, type Frecuencia } from "@/lib/prestamos";
import { hoyPeruYMD } from "@/lib/financiero-core";

export type ResultadoCobro =
  | { ok: true; error: null }
  | { ok: false; error: string };

export type ResultadoPrestamo =
  | { ok: true; error: null; id: string }
  | { ok: false; error: string };

const FRECUENCIAS_VALIDAS: readonly Frecuencia[] = [
  "diario",
  "semanal",
  "quincenal",
  "mensual",
  "pago_unico",
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const DIAS_ATRASO_MAXIMO = 90;

function hoyEnLima(): string {
  return hoyPeruYMD();
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

function fechaYMDValida(s: string): boolean {
  if (!FECHA_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  return (
    fecha.getFullYear() === y &&
    fecha.getMonth() === m - 1 &&
    fecha.getDate() === d
  );
}

function fechaDesdeYMD(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function esCuotaPagadaBD(estado: string | null | undefined): boolean {
  return ["pagado", "pagada", "liquidado", "cancelado", "anulado"].includes(
    String(estado ?? "").trim().toLowerCase(),
  );
}

function pendienteDeCuotaBD(c: {
  monto?: number | null;
  monto_pagado?: number | null;
  saldo_pendiente?: number | null;
}): number {
  const saldo = Number(c.saldo_pendiente ?? 0);
  if (Number.isFinite(saldo) && saldo > 0) return redondear(saldo);
  return Math.max(
    0,
    redondear(Number(c.monto ?? 0) - Number(c.monto_pagado ?? 0)),
  );
}

function traducirError(mensaje: string): string {
  const msg = mensaje.toLowerCase();
  if (msg.includes("row-level security") || msg.includes("permission denied"))
    return "Tu sesión expiró o no tienes permisos. Vuelve a iniciar sesión.";
  return mensaje;
}

/**
 * Alta de préstamos sin depender de RPC ausentes en la BD real.
 * Soporta `pago_unico` (una sola cuota en la fecha exacta) y la amortización
 * previa opcional, dejando constantes `prestamos`, `cuotas` y `pagos`.
 */
export async function registrarPrestamo(input: {
  clienteId: string;
  monto: number;
  porcentajeInteres: number;
  frecuencia: Frecuencia;
  numeroCuotas: number;
  fechaInicio: string;
  liquidarSaldo?: boolean;
}): Promise<ResultadoPrestamo> {
  if (!hasAuthConfig) {
    return { ok: false, error: "Supabase no configurado" };
  }
  if (!UUID_RE.test(input.clienteId)) {
    return { ok: false, error: "Identificador de cliente inválido." };
  }

  const monto = redondear(Number(input.monto));
  const porcentajeInteres = redondear(Number(input.porcentajeInteres));
  if (!Number.isFinite(monto) || monto <= 0 || aDosDecimales(monto) !== monto) {
    return {
      ok: false,
      error: "El monto debe ser un número mayor a cero con máximo dos decimales.",
    };
  }
  if (
    !Number.isFinite(porcentajeInteres) ||
    porcentajeInteres < 0 ||
    aDosDecimales(porcentajeInteres) !== porcentajeInteres
  ) {
    return {
      ok: false,
      error: "El interés debe ser un número válido con máximo dos decimales.",
    };
  }
  if (!FRECUENCIAS_VALIDAS.includes(input.frecuencia)) {
    return { ok: false, error: "La frecuencia seleccionada no es válida." };
  }
  const numeroCuotas =
    input.frecuencia === "pago_unico" ? 1 : Math.trunc(Number(input.numeroCuotas));
  if (!Number.isInteger(numeroCuotas) || numeroCuotas < 1 || numeroCuotas > 60) {
    return { ok: false, error: "Ingresa un número de cuotas entre 1 y 60." };
  }
  if (!fechaYMDValida(input.fechaInicio)) {
    return { ok: false, error: "La fecha de pago/inicio no es válida." };
  }

  const supabase = await createServerSupabase();

  const { data: cliente, error: errorCliente } = await supabase
    .from("clientes")
    .select("id")
    .eq("id", input.clienteId)
    .maybeSingle();
  if (errorCliente) {
    return { ok: false, error: traducirError(errorCliente.message) };
  }
  if (!cliente) {
    return { ok: false, error: "El cliente seleccionado ya no existe." };
  }

  const hoy = hoyPeruYMD();
  const pagosLiquidacion: string[] = [];
  const cuotasLiquidacion: Array<{
    id: string;
    estado: string | null;
    monto_pagado: number | null;
    saldo_pendiente: number | null;
    fecha_pago: string | null;
  }> = [];
  const prestamosLiquidacion: Array<{
    id: string;
    estado: string | null;
    saldo_pendiente: number | null;
  }> = [];

  const revertirLiquidacion = async () => {
    if (pagosLiquidacion.length > 0) {
      await supabase.from("pagos").delete().in("id", pagosLiquidacion);
    }
    for (const c of cuotasLiquidacion) {
      await supabase
        .from("cuotas")
        .update({
          estado: c.estado,
          monto_pagado: c.monto_pagado,
          saldo_pendiente: c.saldo_pendiente,
          fecha_pago: c.fecha_pago,
        })
        .eq("id", c.id);
    }
    for (const p of prestamosLiquidacion) {
      await supabase
        .from("prestamos")
        .update({
          estado: p.estado ?? "activo",
          saldo_pendiente: p.saldo_pendiente ?? 0,
        })
        .eq("id", p.id);
    }
  };

  if (input.liquidarSaldo) {
    const { data: prestamosPrevios, error: errorPrestamosPrevios } = await supabase
      .from("prestamos")
      .select("id, estado, saldo_pendiente")
      .eq("cliente_id", input.clienteId);
    if (errorPrestamosPrevios) {
      return {
        ok: false,
        error: traducirError(errorPrestamosPrevios.message),
      };
    }

    const idsPrevios = (prestamosPrevios ?? []).map((p) => String(p.id));
    if (idsPrevios.length > 0) {
      const { data: cuotasPrevias, error: errorCuotasPrevias } = await supabase
        .from("cuotas")
        .select(
          "id, prestamo_id, monto, monto_pagado, saldo_pendiente, estado, fecha_pago",
        )
        .in("prestamo_id", idsPrevios)
        .neq("estado", "pagado");
      if (errorCuotasPrevias) {
        return {
          ok: false,
          error: traducirError(errorCuotasPrevias.message),
        };
      }

      for (const c of cuotasPrevias ?? []) {
        const saldo = pendienteDeCuotaBD(c);
        if (saldo <= 0) continue;
        const pagoId = crypto.randomUUID();
        const { error: errorPago } = await supabase.from("pagos").insert({
          id: pagoId,
          cuota_id: c.id,
          monto: saldo,
          metodo_pago: "efectivo",
          fecha_pago: hoy,
          es_abono_parcial: false,
        });
        if (errorPago) {
          await revertirLiquidacion();
          return {
            ok: false,
            error: `No se pudo amortizar el saldo anterior: ${traducirError(errorPago.message)}`,
          };
        }
        pagosLiquidacion.push(pagoId);

        const { error: errorCuota } = await supabase
          .from("cuotas")
          .update({
            estado: "pagado",
            monto_pagado: redondear(Number(c.monto ?? 0)),
            saldo_pendiente: 0,
            fecha_pago: hoy,
            metodo_pago: "efectivo",
          })
          .eq("id", c.id);
        if (errorCuota) {
          await revertirLiquidacion();
          return {
            ok: false,
            error: `No se pudo amortizar el saldo anterior: ${traducirError(errorCuota.message)}`,
          };
        }
        cuotasLiquidacion.push({
          id: String(c.id),
          estado: c.estado ?? null,
          monto_pagado: c.monto_pagado ?? null,
          saldo_pendiente: c.saldo_pendiente ?? null,
          fecha_pago: c.fecha_pago ?? null,
        });
      }

      for (const p of prestamosPrevios ?? []) {
        const { error: errorPrestamo } = await supabase
          .from("prestamos")
          .update({ estado: "completado", saldo_pendiente: 0 })
          .eq("id", p.id);
        if (errorPrestamo) {
          await revertirLiquidacion();
          return {
            ok: false,
            error: `No se pudo amortizar el saldo anterior: ${traducirError(errorPrestamo.message)}`,
          };
        }
        prestamosLiquidacion.push({
          id: String(p.id),
          estado: p.estado ?? null,
          saldo_pendiente: p.saldo_pendiente ?? null,
        });
      }
    }
  }

  const calculo = calcularPrestamo(
    monto,
    porcentajeInteres,
    input.frecuencia,
    numeroCuotas,
    fechaDesdeYMD(input.fechaInicio),
  );
  const prestamoId = crypto.randomUUID();
  const { error: errorNuevo } = await supabase.from("prestamos").insert({
    id: prestamoId,
    cliente_id: input.clienteId,
    monto_prestado: monto,
    porcentaje_interes: porcentajeInteres,
    monto_total: calculo.montoTotal,
    frecuencia: input.frecuencia,
    fecha_inicio: input.fechaInicio,
    estado: "activo",
    numero_cuotas: numeroCuotas,
    saldo_pendiente: calculo.montoTotal,
    casa_propia: false,
    deudas_otras_entidades: null,
  });

  if (errorNuevo) {
    await revertirLiquidacion();
    return {
      ok: false,
      error: `No se pudo generar el préstamo: ${traducirError(errorNuevo.message)}`,
    };
  }

  const { error: errorCuotas } = await supabase.from("cuotas").insert(
    calculo.cuotas.map((c) => ({
      id: crypto.randomUUID(),
      prestamo_id: prestamoId,
      monto: c.monto,
      fecha_vencimiento: aYMD(c.fecha),
      estado: "pendiente",
      monto_pagado: 0,
      numero_cuota: c.numero,
      saldo_pendiente: c.monto,
      fecha_pago: null,
      metodo_pago: "efectivo",
    })),
  );

  if (errorCuotas) {
    await supabase.from("prestamos").delete().eq("id", prestamoId);
    await revertirLiquidacion();
    return {
      ok: false,
      error: `No se pudo generar el cronograma: ${traducirError(errorCuotas.message)}`,
    };
  }

  const { error: errorCalificacion } = await supabase.rpc(
    "recalcular_calificacion_cliente",
    { p_cliente_id: input.clienteId },
  );
  if (errorCalificacion) {
    console.warn(
      `No se pudo recalcular la calificación del cliente: ${errorCalificacion.message}`,
    );
  }

  revalidatePath("/reportes");
  revalidatePath("/dashboard");
  revalidatePath("/prestamos");
  revalidatePath("/prestamos/nuevo");
  revalidatePath("/cobros");
  revalidatePath("/");

  return { ok: true, error: null, id: prestamoId };
}

function aDosDecimales(n: number): number {
  return redondear(n);
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
      "prestamo_id, monto, monto_pagado, saldo_pendiente, estado, fecha_pago, prestamos(saldo_pendiente, estado, cliente_id)",
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

  // 2) Registrar PRIMERO el ingreso en `pagos`. La BD real usa `metodo_pago`
  //    y `fecha_pago DATE`; se conservan variantes por compatibilidad con
  //    esquemas anteriores. La fecha es la validada en zona Perú (nunca UTC).
  const fechaPago = input.fecha;
  const fechaPagoISO = `${fechaPago}T12:00:00-05:00`;
  const montoPago = redondear(input.monto);
  const esAbonoParcial = estadoFinal === "parcial";
  const medioPagoEtiqueta =
    medioPago.charAt(0).toUpperCase() + medioPago.slice(1);
  const pagoId = crypto.randomUUID();
  const basePago = {
    id: pagoId,
    cuota_id: input.cuotaId,
    monto: montoPago,
    es_abono_parcial: esAbonoParcial,
  };

  const variantesPago: Record<string, string | number | boolean>[] = [
    { ...basePago, metodo_pago: medioPago, fecha_pago: fechaPago },
    { ...basePago, medio_pago: medioPago, fecha_pago: fechaPago },
    { ...basePago, metodo_pago: medioPago, fecha_pago: fechaPagoISO },
    { ...basePago, medio_pago: medioPago, fecha_pago: fechaPagoISO },
    {
      ...basePago,
      metodo_pago: medioPagoEtiqueta,
      fecha_pago: fechaPago,
    },
    {
      ...basePago,
      metodo_pago: medioPagoEtiqueta,
      fecha_pago: fechaPagoISO,
    },
    { ...basePago, fecha_pago: fechaPago },
    { ...basePago, fecha_pago: fechaPagoISO },
    { ...basePago },
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
    actualizacion.fecha_pago = fechaPago;
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

  // 4) Recalcular el saldo denormalizado del préstamo desde las cuotas.
  //    Esto corrige el caso `pago_unico` cuyo saldo nació en 0: un abono
  //    parcial debe dejar el saldo real pendiente, y solo se marca
  //    'completado' cuando no queda ninguna cuota sin pagar.
  const prestamoId = cuota.prestamo_id;
  const prestamos = Array.isArray(cuota.prestamos)
    ? cuota.prestamos[0]
    : cuota.prestamos;
  const saldoPrestamoAnterior = Number(prestamos?.saldo_pendiente ?? 0);
  const estadoPrestamoAnterior = String(prestamos?.estado ?? "activo");

  let errorPrestamo: { message: string } | null = null;
  const { data: cuotasPrestamo, error: errorCuotasPrestamo } = await supabase
    .from("cuotas")
    .select("estado, monto, monto_pagado, saldo_pendiente")
    .eq("prestamo_id", prestamoId);

  if (errorCuotasPrestamo) {
    errorPrestamo = errorCuotasPrestamo;
  } else {
    const saldoCalculado = redondear(
      (cuotasPrestamo ?? [])
        .filter((c) => !esCuotaPagadaBD(c.estado))
        .reduce((total, c) => total + pendienteDeCuotaBD(c), 0),
    );
    const { error } = await supabase
      .from("prestamos")
      .update({
        saldo_pendiente: saldoCalculado,
        estado: saldoCalculado <= 0 ? "completado" : "activo",
      })
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
    const { error: errorReversionPrestamo } = await supabase
      .from("prestamos")
      .update({
        saldo_pendiente: saldoPrestamoAnterior,
        estado: estadoPrestamoAnterior,
      })
      .eq("id", prestamoId);
    const { data: revertidos, error: errorReversionPago } = await supabase
      .from("pagos")
      .delete()
      .eq("id", pagoId)
      .select("id");
    if (
      errorReversionCuota ||
      errorReversionPrestamo ||
      errorReversionPago ||
      !revertidos ||
      revertidos.length === 0
    ) {
      console.error("No se pudo revertir la operación completa:", {
        cuota: errorReversionCuota?.message,
        prestamo: errorReversionPrestamo?.message,
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

  const clienteId = String(prestamos?.cliente_id ?? "");
  if (clienteId) {
    const { error: errorCalificacion } = await supabase.rpc(
      "recalcular_calificacion_cliente",
      { p_cliente_id: clienteId },
    );
    if (errorCalificacion) {
      console.warn(
        `No se pudo recalcular la calificación del cliente: ${errorCalificacion.message}`,
      );
    }
  }

  revalidatePath("/reportes");
  revalidatePath("/dashboard");
  revalidatePath("/prestamos");
  revalidatePath("/prestamos/[id]");
  revalidatePath("/cobros");
  revalidatePath("/");

  return { ok: true, error: null };
}
