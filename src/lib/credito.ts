import type { SupabaseClient } from "@supabase/supabase-js";

export type Calificacion =
  | "nuevo"
  | "excelente"
  | "bueno"
  | "regular"
  | "deficiente"
  | "malo";

export type CreditScore = {
  calificacion: Calificacion;
  diasRetrasoPromedio: number;
  diasMaximoAtraso: number;
  atrasos: number;
  abonosParciales: number;
  refinanciado: number;
};

export const ETIQUETAS_CALIFICACION: Record<Calificacion, string> = {
  nuevo: "NUEVO",
  excelente: "EXCELENTE",
  bueno: "BUENO",
  regular: "REGULAR",
  deficiente: "DEFICIENTE",
  malo: "DEFICIENTE",
};

export const BADGE_CLASES_CALIFICACION: Record<Calificacion, string> = {
  nuevo: "border border-slate-500/40 bg-slate-600/30 text-slate-200",
  excelente: "bg-emerald-600 text-white",
  bueno: "bg-lime-500 text-white",
  regular: "bg-orange-500 text-white",
  deficiente: "bg-red-600 text-white",
  malo: "bg-red-600 text-white",
};

export function normalizarCalificacion(
  valor: string | null | undefined,
): Calificacion {
  const v = (valor ?? "").toLowerCase().trim();
  if (v in ETIQUETAS_CALIFICACION) return v as Calificacion;
  return "nuevo";
}

export const MEDIOS_DE_PAGO = [
  { value: "efectivo", label: "Efectivo" },
  { value: "yape", label: "Yape" },
  { value: "plin", label: "Plin" },
  { value: "transferencia", label: "Transferencia" },
] as const;

export type MedioPago = (typeof MEDIOS_DE_PAGO)[number]["value"];

export const esMedioPago = (v: string): v is MedioPago =>
  MEDIOS_DE_PAGO.some((m) => m.value === v);

const redondear = (n: number): number => Math.round(n * 100) / 100;

/**
 * Calificación dinámica según la puntualidad promedio del historial:
 * - Excelente (verde): 0 días de retraso promedio (pagos a tiempo o adelantados).
 * - Bueno (azul): promedio de 1 día de retraso (>= 1 y < 2).
 * - Regular (naranja): promedio de 2 a 4 días de retraso.
 * - Deficiente (rojo): promedio de 5+ días de retraso o deuda morosa (cuotas
 *   vencidas sin cobrar).
 */
export function calcularCalificacion(
  diasRetrasoPromedio: number,
  morosidad: boolean,
): Calificacion {
  if (morosidad || diasRetrasoPromedio >= 5) return "deficiente";
  if (diasRetrasoPromedio >= 2) return "regular";
  if (diasRetrasoPromedio >= 1) return "bueno";
  return "excelente";
}

type RawClienteRef = { cliente_id: string };

type RawCuotaHistorial = {
  id: string;
  estado: string | null;
  fecha_vencimiento: string | null;
  prestamos?: RawClienteRef | RawClienteRef[] | null;
};

type RawPrestamoHistorial = {
  cliente_id: string;
  estado: string | null;
};

type RawPagoCuota = {
  fecha_vencimiento?: string | null;
  prestamos?: RawClienteRef | RawClienteRef[] | null;
};

type RawPagoHistorial = {
  fecha_pago?: string | null;
  es_abono_parcial?: boolean | null;
  cuotas?: RawPagoCuota | RawPagoCuota[] | null;
};

const primero = <T,>(x: T | T[] | null | undefined): T | null =>
  Array.isArray(x) ? (x[0] ?? null) : (x ?? null);

function aYMDLocal(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function diasRetraso(
  fechaPago: string | null | undefined,
  vencimiento: string | null | undefined,
): number {
  if (!fechaPago || !vencimiento) return 0;
  const p = Date.parse(fechaPago);
  const v = Date.parse(vencimiento);
  if (!Number.isFinite(p) || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.round((p - v) / 86_400_000));
}

function acumuladorVacio() {
  return {
    sumaRetrasos: 0,
    nPagos: 0,
    maxAtraso: 0,
    atrasos: 0,
    abonosParciales: 0,
    refinanciado: 0,
    morosidad: false,
  };
}

export async function obtenerScoresClientes(
  supabase: SupabaseClient,
  clienteIds: string[],
): Promise<Map<string, CreditScore>> {
  const scores = new Map<string, CreditScore>();
  const limpios = [...new Set(clienteIds)].filter(Boolean);
  if (limpios.length === 0) return scores;

  const acumuladores = new Map<
    string,
    ReturnType<typeof acumuladorVacio>
  >();
  for (const id of limpios) acumuladores.set(id, acumuladorVacio());

  const hoy = aYMDLocal(new Date());

  const [respCuotas, respPagosBase, respPrestamos] = await Promise.all([
    supabase
      .from("cuotas")
      .select("id, estado, fecha_vencimiento, prestamos!inner(cliente_id)")
      .in("prestamos.cliente_id", limpios),
    supabase
      .from("pagos")
      .select(
        "fecha_pago, es_abono_parcial, cuotas!inner(fecha_vencimiento, prestamos!inner(cliente_id))",
      )
      .in("cuotas.prestamos.cliente_id", limpios),
    supabase
      .from("prestamos")
      .select("cliente_id, estado")
      .in("cliente_id", limpios),
  ]);

  let respPagos: {
    error: { message: string } | null;
    data: unknown;
  } = respPagosBase;
  if (
    respPagos.error &&
    /es_abono_parcial|column/i.test(respPagos.error.message)
  ) {
    // Entornos sin la columna es_abono_parcial: reintenta sin ella.
    respPagos = await supabase
      .from("pagos")
      .select(
        "fecha_pago, cuotas!inner(fecha_vencimiento, prestamos!inner(cliente_id))",
      )
      .in("cuotas.prestamos.cliente_id", limpios);
  }

  if (!respCuotas.error) {
    for (const raw of (respCuotas.data ?? []) as unknown as RawCuotaHistorial[]) {
      const ref = primero(raw.prestamos);
      if (!ref) continue;
      const acc = acumuladores.get(ref.cliente_id);
      if (!acc) continue;
      // Deuda morosa: cuota sin cobrar cuyo vencimiento ya pasó.
      if (
        String(raw.estado ?? "").toLowerCase() !== "pagado" &&
        raw.fecha_vencimiento &&
        raw.fecha_vencimiento < hoy
      ) {
        acc.morosidad = true;
      }
    }
  }

  if (!respPagos.error) {
    for (const raw of (respPagos.data ?? []) as unknown as RawPagoHistorial[]) {
      const cuota = primero(raw.cuotas);
      const ref = cuota ? primero(cuota.prestamos) : null;
      if (!ref) continue;
      const acc = acumuladores.get(ref.cliente_id);
      if (!acc) continue;
      const retraso = diasRetraso(raw.fecha_pago, cuota?.fecha_vencimiento);
      acc.sumaRetrasos += retraso;
      acc.nPagos += 1;
      acc.maxAtraso = Math.max(acc.maxAtraso, retraso);
      if (retraso > 0) acc.atrasos += 1;
      if (raw.es_abono_parcial) acc.abonosParciales += 1;
    }
  }

  if (!respPrestamos.error) {
    for (const raw of (respPrestamos.data ?? []) as unknown as RawPrestamoHistorial[]) {
      const acc = acumuladores.get(raw.cliente_id);
      if (!acc) continue;
      const estado = (raw.estado ?? "").toLowerCase();
      if (estado === "liquidado" || estado === "cancelado") {
        acc.refinanciado += 1;
      }
    }
  }

  for (const id of limpios) {
    const acc = acumuladores.get(id) ?? acumuladorVacio();
    const diasRetrasoPromedio =
      acc.nPagos > 0 ? redondear(acc.sumaRetrasos / acc.nPagos) : 0;
    scores.set(id, {
      calificacion: calcularCalificacion(diasRetrasoPromedio, acc.morosidad),
      diasRetrasoPromedio,
      diasMaximoAtraso: acc.maxAtraso,
      atrasos: acc.atrasos,
      abonosParciales: acc.abonosParciales,
      refinanciado: acc.refinanciado,
    });
  }

  return scores;
}