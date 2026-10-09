import type { SupabaseClient } from "@supabase/supabase-js";

export type ResumenCliente = {
  totalPrestamos: number;
  activos: number;
  cancelados: number;
  interesAportado: number;
};

type RawCuotaResumen = {
  id: string;
  prestamo_id: string;
  estado: string | null;
  monto: number | null;
  monto_pagado: number | null;
};

type RawPagoResumen = {
  id: string;
  monto: number | null;
  cuotas?: {
    prestamo_id: string;
  } | null;
};

type RawPrestamoResumen = {
  id: string;
  monto: number | null;
  monto_prestado?: number | null;
  monto_total: number | null;
  porcentaje_interes: number | null;
  interes_porcentaje?: number | null;
};

const primero = <T,>(x: T | T[] | null | undefined): T | null =>
  Array.isArray(x) ? (x[0] ?? null) : (x ?? null);

const redondear = (n: number) => Math.round(n * 100) / 100;

export async function obtenerResumenCliente(
  supabase: SupabaseClient,
  clienteId: string,
): Promise<ResumenCliente> {
  const base: ResumenCliente = {
    totalPrestamos: 0,
    activos: 0,
    cancelados: 0,
    interesAportado: 0,
  };
  if (!clienteId) return base;

  const [resCuotas, resPrestamos, resPagos] = await Promise.all([
    supabase
      .from("cuotas")
      .select("id, prestamo_id, estado, monto, monto_pagado, prestamos!inner(cliente_id)")
      .eq("prestamos.cliente_id", clienteId),
    supabase
      .from("prestamos")
      .select("id, monto_prestado, monto_total, porcentaje_interes")
      .eq("cliente_id", clienteId),
    supabase
      .from("pagos")
      .select("id, monto, cuotas!inner(prestamo_id, prestamos!inner(cliente_id))")
      .eq("cuotas.prestamos.cliente_id", clienteId),
  ]);

  const prestamoIds = new Set<string>();
  const cuotasPorPrestamo = new Map<string, { total: number; pagadas: number }>();
  if (!resCuotas.error) {
    for (const raw of (resCuotas.data ?? []) as unknown as RawCuotaResumen[]) {
      prestamoIds.add(raw.prestamo_id);
      const acc = cuotasPorPrestamo.get(raw.prestamo_id) ?? { total: 0, pagadas: 0 };
      acc.total += 1;
      const pagada =
        String(raw.estado ?? "").toLowerCase() === "pagado" ||
        Number(raw.monto_pagado ?? 0) >= Number(raw.monto ?? 0);
      if (pagada) acc.pagadas += 1;
      cuotasPorPrestamo.set(raw.prestamo_id, acc);
    }
  }

  const totalPrestamos = prestamoIds.size;
  let cancelados = 0;
  for (const acc of cuotasPorPrestamo.values()) {
    if (acc.total > 0 && acc.pagadas >= acc.total) cancelados += 1;
  }
  const activos = Math.max(0, totalPrestamos - cancelados);

  const prestamos = new Map<
    string,
    { monto: number; montoTotal: number; interesPorcentaje: number }
  >();
  if (!resPrestamos.error) {
    for (const raw of (resPrestamos.data ?? []) as unknown as RawPrestamoResumen[]) {
      prestamos.set(raw.id, {
        monto: Number(raw.monto ?? 0),
        montoTotal: Number(raw.monto_total ?? 0),
        interesPorcentaje: Number(raw.porcentaje_interes ?? raw.interes_porcentaje ?? 0),
      });
    }
  }

  const pagadoPorPrestamo = new Map<string, number>();
  if (!resPagos.error) {
    for (const raw of (resPagos.data ?? []) as unknown as RawPagoResumen[]) {
      const cuota = primero(raw.cuotas);
      if (!cuota?.prestamo_id) continue;
      pagadoPorPrestamo.set(
        cuota.prestamo_id,
        (pagadoPorPrestamo.get(cuota.prestamo_id) ?? 0) + Number(raw.monto ?? 0),
      );
    }
  }

  let interesTotal = 0;
  for (const [prestamoId, pagadoTotal] of pagadoPorPrestamo) {
    const loan = prestamos.get(prestamoId);
    if (!loan) continue;
    const montoPrestado = loan.monto;
    if (montoPrestado <= 0) continue;
    const totalDevolver =
      loan.montoTotal ||
      redondear(montoPrestado * (1 + loan.interesPorcentaje / 100));
    if (totalDevolver <= 0) continue;
    const proporcion = (totalDevolver - montoPrestado) / totalDevolver;
    interesTotal += pagadoTotal * proporcion;
  }

  return {
    totalPrestamos,
    activos,
    cancelados,
    interesAportado: redondear(interesTotal),
  };
}

export type ResultadoSubidaFoto = {
  url: string | null;
  error: string | null;
};

export async function subirFotoCliente(
  supabase: SupabaseClient,
  archivo: File,
  dni: string,
  tipo: "dni_frontal" | "dni_reverso" | "fachada",
): Promise<ResultadoSubidaFoto> {
  const doc = dni.trim().replace(/\D/g, "") || "cliente";
  const ext = (archivo.name.split(".").pop() ?? "jpg")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const filePath = `${doc}_${tipo}_${Date.now()}.${ext || "jpg"}`;

  const { data, error } = await supabase.storage
    .from("clientes-docs")
    .upload(filePath, archivo, {
      upsert: true,
      contentType: archivo.type || "image/jpeg",
    });

  if (error) {
    console.error("Error uploading image:", error);
    return { url: null, error: error.message };
  }

  const { data: urlData } = supabase.storage
    .from("clientes-docs")
    .getPublicUrl(filePath);

  if (!data) {
    console.error("Upload data is empty for:", filePath);
    return { url: null, error: "No se pudo confirmar la subida de la imagen." };
  }

  return { url: urlData.publicUrl, error: null };
}