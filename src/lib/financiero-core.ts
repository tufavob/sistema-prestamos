import type { SupabaseClient } from "@supabase/supabase-js";

/* ================================================================== */
/* Tipos base                                                          */
/* ================================================================== */

export type PrestamoFinanciero = {
  id: string;
  cliente_id?: string | null;
  monto?: number | null;
  monto_prestado?: number | null;
  monto_total?: number | null;
  total_devolver?: number | null;
  interes?: number | null;
  interes_porcentaje?: number | null;
  porcentaje_interes?: number | null;
  estado?: string | null;
  saldo_pendiente?: number | null;
  fecha_inicio?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CuotaFinanciera = {
  id: string;
  prestamo_id?: string | null;
  monto?: number | null;
  monto_pagado?: number | null;
  saldo_pendiente?: number | null;
  estado?: string | null;
  fecha_vencimiento?: string | null;
  fecha_pago?: string | null;
  updated_at?: string | null;
};

export type PagoFinanciero = {
  id: string;
  cuota_id?: string | null;
  prestamo_id?: string | null;
  monto?: number | null;
  fecha_pago?: string | null;
  created_at?: string | null;
};

/* ================================================================== */
/* Resultados de las funciones base                                    */
/* ================================================================== */

export type MetricaCajaHoy = {
  fecha: string;
  recaudadoHoy: number;
  transaccionesHoy: number;
};

export type MetricaCarteraActiva = {
  capitalPrincipal: number;
  gananciaProyectada: number;
  totalCartera: number;
  prestamosActivos: number;
};

export type MetricaMoraVencida = {
  montoTotalMora: number;
  totalCuotasVencidas: number;
  clientesMorososUnicos: number;
  clientesMorososIds: string[];
};

export type MetricaCuotasHoy = {
  montoProgramadoHoy: number;
  totalCuotasHoy: number;
  clientesHoyUnicos: number;
  clientesHoyIds: string[];
};

/* ================================================================== */
/* Resultados de reportes                                              */
/* ================================================================== */

export type PeriodoReporte = "hoy" | "semana" | "historico";

export type DiaRecaudacion = {
  dia: string;
  fecha: string;
  monto: number;
  cobros: number;
};

export type TramoMora = {
  clave: "blanda" | "alerta" | "critica";
  etiqueta: string;
  rango: string;
  monto: number;
  cuotas: number;
  clientes: number;
};

export type SegmentoCartera = {
  clave: "al-dia" | "blanda" | "critica";
  etiqueta: string;
  descripcion: string;
  monto: number;
  color: string;
};

export type ReporteDiario = {
  fecha: string;
  cajaHoy: number;
  transaccionesHoy: number;
  montoProgramadoHoy: number;
  totalCuotasHoy: number;
  clientesHoyUnicos: number;
  montoTotalMora: number;
  totalCuotasVencidas: number;
  clientesMorososUnicos: number;
  clientesVisitar: number;
};

export type ReporteSemanal = {
  desde: string;
  hasta: string;
  recaudado: number;
  proyectado: number;
  efectividad: number;
  capitalColocado: number;
  capitalRecuperado: number;
  prestamosColocados: number;
  dias: DiaRecaudacion[];
  tramos: TramoMora[];
  moraTotal: number;
  moraCuotas: number;
  moraClientes: number;
};

/** Agrupación mensual de cobros para rangos mayores a 31 días. */
export type MesRecaudacion = {
  clave: string;
  mes: string;
  recaudado: number;
  interes: number;
  capital: number;
  cobros: number;
};

/** Punto genérico para el gráfico de barras (día o mes). */
export type PuntoRecaudacion = {
  clave: string;
  etiqueta: string;
  monto: number;
  interes: number;
  capital: number;
  cobros: number;
};

export type ReporteHistorico = {
  desde: string;
  hasta: string;
  diasRango: number;
  granularidad: "dia" | "mes";
  meses: MesRecaudacion[];
  serie: PuntoRecaudacion[];
  recaudado: number;
  interes: number;
  capitalRecuperado: number;
  cobros: number;
  capitalColocado: number;
  prestamosColocados: number;
  moraReal: number;
  moraCuotas: number;
  moraClientes: number;
  capitalPrincipal: number;
  gananciaProyectada: number;
  carteraActiva: number;
  morosidad: number;
  liquidados: number;
  nuevos: number;
  renovados: number;
  tasaRenovacion: number;
  segmentosCartera: SegmentoCartera[];
};

export type Reportes = {
  hoy: string;
  diario: ReporteDiario;
  semanal: ReporteSemanal;
};

/* ================================================================== */
/* Utilidades de fecha (zona horaria Perú, UTC-5)                      */
/* ================================================================== */

export const r2 = (n: number) => Math.round(n * 100) / 100;

/** Fecha de hoy (YYYY-MM-DD) en Perú, independiente de la zona del navegador. */
export const hoyPeruYMD = (): string =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "America/Lima" });

/** Suma días a una fecha YYYY-MM-DD sin desfases horarios. */
export const sumarDiasYMD = (ymd: string, dias: number): string => {
  const [y, m, d] = ymd.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
};

/** Días transcurridos entre dos fechas YYYY-MM-DD. */
const diasEntreYMD = (desde: string, hasta: string): number => {
  const [y1, m1, d1] = desde.split("-").map(Number);
  const [y2, m2, d2] = hasta.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86_400_000);
};

/**
 * Convierte un valor de Supabase a YYYY-MM-DD.
 * - Campos `date` (fecha_pago, fecha_vencimiento): se toman tal cual.
 * - Timestamps: se convierten a la fecha real de Perú.
 */
export const fechaYMDPeru = (valor?: string | null): string => {
  const texto = String(valor ?? "");
  if (!texto) return "";
  if (texto.length <= 10) return texto.slice(0, 10);
  const fecha = new Date(texto);
  if (Number.isNaN(fecha.getTime())) return texto.slice(0, 10);
  return fecha.toLocaleDateString("sv-SE", { timeZone: "America/Lima" });
};

/** Rango ISO del día completo de Perú: [00:00:00.000, 23:59:59.999]. */
export const rangoDiaPeruISO = (ymd: string) => ({
  desde: `${ymd}T00:00:00-05:00`,
  hasta: `${sumarDiasYMD(ymd, 1)}T00:00:00-05:00`,
});

/** Lunes de la semana actual en Perú. */
export const inicioSemanaYMD = (hoy = hoyPeruYMD()): string => {
  const [y, m, d] = hoy.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  const desplazamiento = (fecha.getUTCDay() + 6) % 7;
  fecha.setUTCDate(fecha.getUTCDate() - desplazamiento);
  return fecha.toISOString().slice(0, 10);
};

/** Primer día del mes actual en Perú. */
export const inicioMesYMD = (hoy = hoyPeruYMD()): string =>
  `${hoy.slice(0, 7)}-01`;

/** Primer día del mes N meses atrás (0 = mes actual). */
export const mesesAtrasYMD = (ymd: string, meses: number): string => {
  const [y, m] = ymd.split("-").map(Number);
  const total = y * 12 + (m - 1) - meses;
  const anio = Math.floor(total / 12);
  const mes = (((total % 12) + 12) % 12) + 1;
  return `${anio}-${String(mes).padStart(2, "0")}-01`;
};

/** Primer día del año de la fecha indicada. */
export const inicioAnioYMD = (ymd: string): string =>
  `${ymd.slice(0, 4)}-01-01`;

/** Convierte una fecha de rango (Date local o YMD) a YYYY-MM-DD. */
export const fechaRangoAYMD = (fecha: Date | string): string => {
  if (typeof fecha === "string") return fecha.slice(0, 10);
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const MESES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "set",
  "oct",
  "nov",
  "dic",
];

const MESES_LARGOS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Setiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** Claves YYYY-MM de todos los meses que toca el rango, en orden. */
const clavesMesesEnRango = (desde: string, hasta: string): string[] => {
  const [anioInicio, mesInicio] = desde.slice(0, 7).split("-").map(Number);
  const [anioFin, mesFin] = hasta.slice(0, 7).split("-").map(Number);
  if (!anioInicio || !mesInicio || !anioFin || !mesFin) return [];

  const claves: string[] = [];
  let anio = anioInicio;
  let mes = mesInicio;
  while (anio < anioFin || (anio === anioFin && mes <= mesFin)) {
    claves.push(`${anio}-${String(mes).padStart(2, "0")}`);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
  }
  return claves;
};

const etiquetaMesCorta = (clave: string): string => {
  const [anio, mes] = clave.split("-").map(Number);
  return `${MESES[mes - 1] ?? ""} ${String(anio).slice(2)}`;
};

const formatearYMD = (ymd: string): string => {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const fecha = new Date(Date.UTC(y, m - 1, d));
  return `${DIAS[fecha.getUTCDay()]} ${String(d).padStart(2, "0")} ${
    MESES[m - 1] ?? ""
  } ${y}`;
};

export const formatearFechaLarga = (ymd: string): string => {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

export const formatearRangoFechas = (desde: string, hasta: string): string =>
  desde === hasta
    ? formatearFechaLarga(desde)
    : `${formatearYMD(desde)} – ${formatearYMD(hasta)}`;

/* ================================================================== */
/* Helpers de dominio compartidos                                      */
/* ================================================================== */

const entre = (fecha: string, desde: string, hasta: string): boolean =>
  fecha !== "" && fecha >= desde && fecha <= hasta;

const estadoDe = (item: { estado?: string | null }): string =>
  String(item.estado ?? "")
    .trim()
    .toLowerCase();

export const esCuotaPagada = (c: CuotaFinanciera): boolean =>
  ["pagado", "pagada", "liquidado", "cancelado", "anulado"].includes(
    estadoDe(c),
  );

const esPrestamoActivo = (p: PrestamoFinanciero): boolean => {
  const estado = estadoDe(p);
  return estado === "activo" || estado === "";
};

const esPrestamoCompletado = (p: PrestamoFinanciero): boolean =>
  ["completado", "pagado", "liquidado", "finalizado"].includes(estadoDe(p));

const montoPrestadoDe = (p: PrestamoFinanciero): number =>
  Number(p.monto_prestado ?? p.monto ?? 0);

const montoTotalDe = (p: PrestamoFinanciero): number =>
  Number(p.monto_total ?? p.total_devolver ?? 0);

/** Interés total del préstamo, tolerante a variantes de esquema. */
const montoInteresDe = (p: PrestamoFinanciero): number => {
  const directo = Number(p.interes ?? NaN);
  if (Number.isFinite(directo) && directo > 0) return directo;

  const capital = montoPrestadoDe(p);
  const total = montoTotalDe(p);
  if (total > capital && capital > 0) return r2(total - capital);

  const tasa = Number(p.interes_porcentaje ?? p.porcentaje_interes ?? NaN);
  if (Number.isFinite(tasa) && tasa > 0 && capital > 0) {
    return r2((capital * tasa) / 100);
  }
  return 0;
};

/** Saldo insoluto de una cuota; si no hay saldo, monto original. */
export const montoPendienteCuota = (c: CuotaFinanciera): number => {
  const saldo = Number(c.saldo_pendiente ?? 0);
  if (Number.isFinite(saldo) && saldo > 0) return saldo;
  return Number(c.monto ?? 0);
};

/**
 * Saldo real de un préstamo activo.
 * Las cuotas son la fuente de verdad: en la BD real `prestamos.saldo_pendiente`
 * puede quedar en 0 aunque las cuotas estén pendientes (p. ej. pago único).
 * Se tolera cualquier estado de cuota escrito con otro casing.
 */
const saldoPendientePrestamo = (
  p: PrestamoFinanciero,
  cuotasPorPrestamo: Map<string, CuotaFinanciera[]>,
): number => {
  const total = montoTotalDe(p);
  const tope = total > 0 ? total : Number.POSITIVE_INFINITY;
  const cuotas = cuotasPorPrestamo.get(String(p.id ?? ""));

  if (cuotas && cuotas.length > 0) {
    const pendiente = cuotas
      .filter((c) => !esCuotaPagada(c))
      .reduce((suma, c) => suma + montoPendienteCuota(c), 0);
    return r2(Math.min(pendiente, tope));
  }

  const directo = Number(p.saldo_pendiente ?? 0);
  if (Number.isFinite(directo) && directo > 0) {
    return r2(Math.min(directo, tope));
  }
  // Sin cuotas cargadas: un préstamo activo se considera íntegramente pendiente.
  return r2(total > 0 ? total : 0);
};

/** Mapa de cuotas por préstamo, reutilizado por cartera y segmentos. */
const indexarCuotasPorPrestamo = (
  cuotas: CuotaFinanciera[],
): Map<string, CuotaFinanciera[]> => {
  const mapa = new Map<string, CuotaFinanciera[]>();
  for (const c of cuotas) {
    const id = String(c.prestamo_id ?? "");
    if (!id) continue;
    const lista = mapa.get(id) ?? [];
    lista.push(c);
    mapa.set(id, lista);
  }
  return mapa;
};

/** Monto programado de una cuota (para proyecciones semanales). */
const montoProgramadoCuota = (c: CuotaFinanciera): number => {
  const monto = Number(c.monto ?? 0);
  if (monto > 0) return monto;
  return montoPendienteCuota(c);
};

const fechaCobroYMD = (pg: PagoFinanciero): string =>
  fechaYMDPeru(pg.created_at) || fechaYMDPeru(pg.fecha_pago);

/**
 * Fecha real de otorgamiento del préstamo en America/Lima.
 * `created_at` es la fuente de verdad: en préstamos de `pago_unico`,
 * `fecha_inicio` es el vencimiento de la única cuota (puede ser futuro y
 * quedar fuera del rango aunque el préstamo se haya creado dentro de él).
 */
export const fechaOtorgamientoPrestamo = (p: PrestamoFinanciero): string =>
  fechaYMDPeru(p.created_at) || fechaYMDPeru(p.fecha_inicio);

/* ================================================================== */
/* Cálculos puros (misma matemática para Dashboard y Reportes)         */
/* ================================================================== */

/** a) Caja del día: pagos creados hoy en Perú. */
export function calcularCajaHoy(
  pagos: PagoFinanciero[],
  hoy = hoyPeruYMD(),
): MetricaCajaHoy {
  const pagosHoy = pagos.filter((pg) => fechaCobroYMD(pg) === hoy);
  return {
    fecha: hoy,
    recaudadoHoy: r2(
      pagosHoy.reduce((s, pg) => s + Number(pg.monto ?? 0), 0),
    ),
    transaccionesHoy: pagosHoy.length,
  };
}

/** b) Cartera activa: capital principal + ganancia proyectada. */
export function calcularCarteraActiva(
  prestamos: PrestamoFinanciero[],
  cuotas: CuotaFinanciera[] = [],
): MetricaCarteraActiva {
  let capitalPrincipal = 0;
  let gananciaProyectada = 0;
  let prestamosActivos = 0;

  const cuotasPorPrestamo = indexarCuotasPorPrestamo(cuotas);

  for (const p of prestamos) {
    if (!esPrestamoActivo(p)) continue;
    prestamosActivos += 1;

    const saldo = saldoPendientePrestamo(p, cuotasPorPrestamo);
    if (!Number.isFinite(saldo) || saldo <= 0) continue;

    const capital = montoPrestadoDe(p);
    const total = montoTotalDe(p);
    const interes = montoInteresDe(p);

    const proporcionCapital =
      total > 0 ? Math.min(1, Math.max(0, capital / total)) : 1;
    const proporcionGanancia =
      total > 0 ? Math.max(0, interes / total) : 0;

    capitalPrincipal += saldo * proporcionCapital;
    gananciaProyectada += saldo * proporcionGanancia;
  }

  const totalCartera = r2(capitalPrincipal + gananciaProyectada);
  return {
    capitalPrincipal: r2(capitalPrincipal),
    gananciaProyectada: r2(gananciaProyectada),
    totalCartera,
    prestamosActivos,
  };
}

/** Cuotas en mora: vencidas estrictamente antes de hoy, impagas, préstamo activo. */
export function obtenerCuotasEnMora(
  prestamos: PrestamoFinanciero[],
  cuotas: CuotaFinanciera[],
  hoy = hoyPeruYMD(),
): CuotaFinanciera[] {
  const activos = new Set(
    prestamos.filter(esPrestamoActivo).map((p) => p.id),
  );

  return cuotas.filter((c) => {
    if (esCuotaPagada(c)) return false;
    if (!activos.has(String(c.prestamo_id ?? ""))) return false;
    const vencimiento = fechaYMDPeru(c.fecha_vencimiento);
    return vencimiento !== "" && vencimiento < hoy;
  });
}

/** c) Mora vencida acumulada. */
export function calcularMoraVencida(
  prestamos: PrestamoFinanciero[],
  cuotas: CuotaFinanciera[],
  hoy = hoyPeruYMD(),
): MetricaMoraVencida {
  const prestamoPorId = new Map(prestamos.map((p) => [p.id, p]));
  const mora = obtenerCuotasEnMora(prestamos, cuotas, hoy);
  const clientes = new Set<string>();
  let montoTotalMora = 0;

  for (const c of mora) {
    montoTotalMora += montoPendienteCuota(c);
    const clienteId = String(
      prestamoPorId.get(String(c.prestamo_id ?? ""))?.cliente_id ?? "",
    );
    if (clienteId) clientes.add(clienteId);
  }

  return {
    montoTotalMora: r2(montoTotalMora),
    totalCuotasVencidas: mora.length,
    clientesMorososUnicos: clientes.size,
    clientesMorososIds: [...clientes],
  };
}

/** d) Cuotas que vencen estrictamente hoy y siguen impagas. */
export function calcularCuotasProgramadasHoy(
  prestamos: PrestamoFinanciero[],
  cuotas: CuotaFinanciera[],
  hoy = hoyPeruYMD(),
): MetricaCuotasHoy {
  const activos = new Set(
    prestamos.filter(esPrestamoActivo).map((p) => p.id),
  );
  const prestamoPorId = new Map(prestamos.map((p) => [p.id, p]));
  const clientes = new Set<string>();
  let montoProgramadoHoy = 0;
  let totalCuotasHoy = 0;

  for (const c of cuotas) {
    if (esCuotaPagada(c)) continue;
    if (!activos.has(String(c.prestamo_id ?? ""))) continue;
    if (fechaYMDPeru(c.fecha_vencimiento) !== hoy) continue;

    totalCuotasHoy += 1;
    montoProgramadoHoy += montoPendienteCuota(c);

    const clienteId = String(
      prestamoPorId.get(String(c.prestamo_id ?? ""))?.cliente_id ?? "",
    );
    if (clienteId) clientes.add(clienteId);
  }

  return {
    montoProgramadoHoy: r2(montoProgramadoHoy),
    totalCuotasHoy,
    clientesHoyUnicos: clientes.size,
    clientesHoyIds: [...clientes],
  };
}

/* ================================================================== */
/* Funciones async base (consultas a Supabase)                         */
/* ================================================================== */

const errorConsulta = (mensaje: string): Error =>
  new Error(`No se pudieron cargar las métricas: ${mensaje}`);

/** a) Suma de `pagos.monto` y conteo de transacciones de hoy. */
export async function getMetricasCajaHoy(
  supabase: SupabaseClient,
  hoy = hoyPeruYMD(),
): Promise<MetricaCajaHoy> {
  const { desde, hasta } = rangoDiaPeruISO(hoy);
  const { data, error } = await supabase
    .from("pagos")
    .select("*")
    .gte("created_at", desde)
    .lt("created_at", hasta);

  if (error) throw errorConsulta(error.message);
  return calcularCajaHoy((data ?? []) as unknown as PagoFinanciero[], hoy);
}

/** b) Capital principal + ganancia proyectada de préstamos activos. */
export async function getMetricasCarteraActiva(
  supabase: SupabaseClient,
): Promise<MetricaCarteraActiva> {
  // Se consultan también las cuotas: son la fuente de verdad del saldo cuando
  // `prestamos.saldo_pendiente` no fue actualizado por la RPC (caso pago_unico).
  const [prestamosRes, cuotasRes] = await Promise.all([
    supabase.from("prestamos").select("*").ilike("estado", "activo"),
    supabase.from("cuotas").select("*"),
  ]);

  const primerError = prestamosRes.error ?? cuotasRes.error;
  if (primerError) throw errorConsulta(primerError.message);

  return calcularCarteraActiva(
    (prestamosRes.data ?? []) as unknown as PrestamoFinanciero[],
    (cuotasRes.data ?? []) as unknown as CuotaFinanciera[],
  );
}

/** c) Mora vencida acumulada de préstamos activos. */
export async function getMetricasMoraVencida(
  supabase: SupabaseClient,
  hoy = hoyPeruYMD(),
): Promise<MetricaMoraVencida> {
  const [cuotasRes, prestamosRes] = await Promise.all([
    supabase
      .from("cuotas")
      .select("*")
      .neq("estado", "pagado")
      .lt("fecha_vencimiento", hoy),
    supabase.from("prestamos").select("*").ilike("estado", "activo"),
  ]);

  const primerError = cuotasRes.error ?? prestamosRes.error;
  if (primerError) throw errorConsulta(primerError.message);

  return calcularMoraVencida(
    (prestamosRes.data ?? []) as unknown as PrestamoFinanciero[],
    (cuotasRes.data ?? []) as unknown as CuotaFinanciera[],
    hoy,
  );
}

/** d) Cuotas programadas estrictamente para hoy. */
export async function getCuotasProgramadasHoy(
  supabase: SupabaseClient,
  hoy = hoyPeruYMD(),
): Promise<MetricaCuotasHoy> {
  const [cuotasRes, prestamosRes] = await Promise.all([
    supabase
      .from("cuotas")
      .select("*")
      .neq("estado", "pagado")
      .eq("fecha_vencimiento", hoy),
    supabase.from("prestamos").select("*").ilike("estado", "activo"),
  ]);

  const primerError = cuotasRes.error ?? prestamosRes.error;
  if (primerError) throw errorConsulta(primerError.message);

  return calcularCuotasProgramadasHoy(
    (prestamosRes.data ?? []) as unknown as PrestamoFinanciero[],
    (cuotasRes.data ?? []) as unknown as CuotaFinanciera[],
    hoy,
  );
}

/* ================================================================== */
/* Reportes: cálculo completo reutilizando los helpers anteriores      */
/* ================================================================== */

const detallePago = (
  pg: PagoFinanciero,
  cuotaPorId: Map<string, CuotaFinanciera>,
  prestamoPorId: Map<string, PrestamoFinanciero>,
) => {
  const cuota = pg.cuota_id ? cuotaPorId.get(pg.cuota_id) : undefined;
  const prestamo = prestamoPorId.get(
    String(cuota?.prestamo_id ?? pg.prestamo_id ?? ""),
  );
  const monto = Number(pg.monto ?? 0);

  let proporcionGanancia = 0;
  if (prestamo) {
    const total = montoTotalDe(prestamo);
    const interes = montoInteresDe(prestamo);
    proporcionGanancia = total > 0 ? Math.max(0, interes / total) : 0;
  }

  const ganancia = r2(monto * proporcionGanancia);
  return { monto, ganancia, capital: r2(monto - ganancia), prestamo };
};

/** Distribución actual de cartera según el peor tramo de mora del préstamo. */
const calcularSegmentosCartera = (
  prestamos: PrestamoFinanciero[],
  cuotasPorPrestamo: Map<string, CuotaFinanciera[]>,
  hoy: string,
): SegmentoCartera[] => {
  let segmentoAlDia = 0;
  let segmentoBlanda = 0;
  let segmentoCritica = 0;

  for (const p of prestamos) {
    if (!esPrestamoActivo(p)) continue;
    const saldo = saldoPendientePrestamo(p, cuotasPorPrestamo);
    if (!Number.isFinite(saldo) || saldo <= 0) continue;

    const vencidas = (cuotasPorPrestamo.get(p.id) ?? []).filter((c) => {
      if (esCuotaPagada(c)) return false;
      const vencimiento = fechaYMDPeru(c.fecha_vencimiento);
      return vencimiento !== "" && vencimiento < hoy;
    });

    if (vencidas.length === 0) {
      segmentoAlDia += saldo;
      continue;
    }

    const peorMora = Math.max(
      ...vencidas.map((c) =>
        diasEntreYMD(fechaYMDPeru(c.fecha_vencimiento), hoy),
      ),
    );
    if (peorMora <= 15) segmentoBlanda += saldo;
    else segmentoCritica += saldo;
  }

  return [
    {
      clave: "al-dia",
      etiqueta: "Cartera al día",
      descripcion: "Sin cuotas vencidas",
      monto: r2(segmentoAlDia),
      color: "#10b981",
    },
    {
      clave: "blanda",
      etiqueta: "Mora blanda",
      descripcion: "1 a 15 días",
      monto: r2(segmentoBlanda),
      color: "#f59e0b",
    },
    {
      clave: "critica",
      etiqueta: "Mora crítica",
      descripcion: "Más de 15 días",
      monto: r2(segmentoCritica),
      color: "#ef4444",
    },
  ];
};

/**
 * Reporte histórico para un rango dinámico de fechas.
 * - Agrupa por mes si el rango supera 31 días; caso contrario, por día.
 * - La mora y la cartera son la foto actual del negocio (no histórica).
 */
export function calcularReporteHistorico(
  prestamos: PrestamoFinanciero[],
  cuotas: CuotaFinanciera[],
  pagos: PagoFinanciero[],
  desde: string,
  hasta: string,
  hoy = hoyPeruYMD(),
): ReporteHistorico {
  const diasRango = Math.max(0, diasEntreYMD(desde, hasta) + 1);
  const granularidad: "dia" | "mes" = diasRango > 31 ? "mes" : "dia";

  const prestamoPorId = new Map(prestamos.map((p) => [p.id, p]));
  const cuotaPorId = new Map(cuotas.map((c) => [c.id, c]));
  const cuotasPorPrestamo = new Map<string, CuotaFinanciera[]>();
  for (const c of cuotas) {
    const id = String(c.prestamo_id ?? "");
    if (!id) continue;
    const lista = cuotasPorPrestamo.get(id) ?? [];
    lista.push(c);
    cuotasPorPrestamo.set(id, lista);
  }

  const prestamosPorCliente = new Map<string, PrestamoFinanciero[]>();
  for (const p of prestamos) {
    const id = String(p.cliente_id ?? "");
    if (!id) continue;
    const lista = prestamosPorCliente.get(id) ?? [];
    lista.push(p);
    prestamosPorCliente.set(id, lista);
  }

  const pagosRango = pagos.filter((pg) =>
    entre(fechaCobroYMD(pg), desde, hasta),
  );

  /* ---------- Acumulados del rango ---------- */
  let recaudado = 0;
  let interes = 0;
  let capitalRecuperado = 0;

  const clavesMes = clavesMesesEnRango(desde, hasta);
  const acumuladoMes = new Map<string, MesRecaudacion>(
    clavesMes.map((clave) => {
      const [anio, mes] = clave.split("-").map(Number);
      return [
        clave,
        {
          clave,
          mes: `${MESES_LARGOS[mes - 1] ?? ""} ${anio}`,
          recaudado: 0,
          interes: 0,
          capital: 0,
          cobros: 0,
        },
      ];
    }),
  );

  const pagosPorDia = new Map<string, PagoFinanciero[]>();
  for (const pg of pagosRango) {
    const fecha = fechaCobroYMD(pg);
    const detalle = detallePago(pg, cuotaPorId, prestamoPorId);
    recaudado += detalle.monto;
    interes += detalle.ganancia;
    capitalRecuperado += detalle.capital;

    const bucket = acumuladoMes.get(fecha.slice(0, 7));
    if (bucket) {
      bucket.recaudado = r2(bucket.recaudado + detalle.monto);
      bucket.interes = r2(bucket.interes + detalle.ganancia);
      bucket.capital = r2(bucket.capital + detalle.capital);
      bucket.cobros += 1;
    }

    const listaDia = pagosPorDia.get(fecha) ?? [];
    listaDia.push(pg);
    pagosPorDia.set(fecha, listaDia);
  }

  const meses = [...acumuladoMes.values()];

  /* ---------- Serie para el gráfico ---------- */
  let serie: PuntoRecaudacion[];
  if (granularidad === "mes") {
    serie = meses.map((m) => ({
      clave: m.clave,
      etiqueta: etiquetaMesCorta(m.clave),
      monto: m.recaudado,
      interes: m.interes,
      capital: m.capital,
      cobros: m.cobros,
    }));
  } else {
    serie = [];
    for (let indice = 0; indice < diasRango; indice += 1) {
      const fecha = sumarDiasYMD(desde, indice);
      const pagosDia = pagosPorDia.get(fecha) ?? [];
      let montoDia = 0;
      let interesDia = 0;
      let capitalDia = 0;
      for (const pg of pagosDia) {
        const detalle = detallePago(pg, cuotaPorId, prestamoPorId);
        montoDia += detalle.monto;
        interesDia += detalle.ganancia;
        capitalDia += detalle.capital;
      }
      const [, mes, dia] = fecha.split("-").map(Number);
      serie.push({
        clave: fecha,
        etiqueta: `${dia} ${MESES[mes - 1] ?? ""}`,
        monto: r2(montoDia),
        interes: r2(interesDia),
        capital: r2(capitalDia),
        cobros: pagosDia.length,
      });
    }
  }

  /* ---------- Capital colocado y movimiento de préstamos ---------- */
  const prestamosRango = prestamos.filter((p) =>
    entre(fechaOtorgamientoPrestamo(p), desde, hasta),
  );
  const capitalColocado = r2(
    prestamosRango.reduce((s, p) => s + montoPrestadoDe(p), 0),
  );

  const fechaLiquidacion = (p: PrestamoFinanciero): string => {
    const lista = cuotasPorPrestamo.get(p.id) ?? [];
    if (lista.length > 0 && lista.every(esCuotaPagada)) {
      const maxima = lista.reduce((max, c) => {
        const fecha = fechaYMDPeru(c.fecha_pago) || fechaYMDPeru(c.updated_at);
        return fecha > max ? fecha : max;
      }, "");
      if (maxima) return maxima;
    }
    if (esPrestamoCompletado(p)) {
      return fechaYMDPeru(p.updated_at) || fechaYMDPeru(p.created_at);
    }
    return "";
  };

  const liquidados = prestamos.filter((p) =>
    entre(fechaLiquidacion(p), desde, hasta),
  ).length;

  const renovados = prestamosRango.filter((p) => {
    const clienteId = String(p.cliente_id ?? "");
    if (!clienteId) return false;
    const otorgamientoActual = fechaOtorgamientoPrestamo(p);
    return (prestamosPorCliente.get(clienteId) ?? []).some((otro) => {
      if (otro.id === p.id) return false;
      const otorgamientoOtro = fechaOtorgamientoPrestamo(otro);
      if (
        !otorgamientoOtro ||
        !otorgamientoActual ||
        otorgamientoOtro >= otorgamientoActual
      ) {
        return false;
      }
      const cuotasOtro = cuotasPorPrestamo.get(otro.id) ?? [];
      return (
        esPrestamoCompletado(otro) ||
        (cuotasOtro.length > 0 && cuotasOtro.every(esCuotaPagada))
      );
    });
  }).length;

  const nuevos = prestamosRango.length;
  const baseTasa = liquidados + nuevos;
  const tasaRenovacion =
    baseTasa > 0 ? r2((renovados / baseTasa) * 100) : 0;

  /* ---------- Foto actual de cartera y mora ---------- */
  const cartera = calcularCarteraActiva(prestamos, cuotas);
  const mora = calcularMoraVencida(prestamos, cuotas, hoy);

  return {
    desde,
    hasta,
    diasRango,
    granularidad,
    meses,
    serie,
    recaudado: r2(recaudado),
    interes: r2(interes),
    capitalRecuperado: r2(capitalRecuperado),
    cobros: pagosRango.length,
    capitalColocado,
    prestamosColocados: nuevos,
    moraReal: mora.montoTotalMora,
    moraCuotas: mora.totalCuotasVencidas,
    moraClientes: mora.clientesMorososUnicos,
    capitalPrincipal: cartera.capitalPrincipal,
    gananciaProyectada: cartera.gananciaProyectada,
    carteraActiva: cartera.totalCartera,
    morosidad:
      cartera.totalCartera > 0
        ? r2((mora.montoTotalMora / cartera.totalCartera) * 100)
        : 0,
    liquidados,
    nuevos,
    renovados,
    tasaRenovacion,
    segmentosCartera: calcularSegmentosCartera(
      prestamos,
      cuotasPorPrestamo,
      hoy,
    ),
  };
}

/**
 * Consulta histórica con rango dinámico. El filtro usa `created_at` en la
 * zona horaria de Perú y el día final se incluye completo.
 */
export async function getReporteHistorico(
  supabase: SupabaseClient,
  fechaInicio: Date | string,
  fechaFin: Date | string,
  hoy = hoyPeruYMD(),
): Promise<ReporteHistorico> {
  const desde = fechaRangoAYMD(fechaInicio);
  const hasta = fechaRangoAYMD(fechaFin);
  const formatoValido = /^\d{4}-\d{2}-\d{2}$/;

  if (
    !formatoValido.test(desde) ||
    !formatoValido.test(hasta) ||
    desde > hasta
  ) {
    throw new Error("El rango de fechas del reporte no es válido.");
  }

  const hastaExclusivo = sumarDiasYMD(hasta, 1);
  const [pagosRes, prestamosRes, cuotasRes] = await Promise.all([
    supabase
      .from("pagos")
      .select("*")
      .gte("created_at", `${desde}T00:00:00-05:00`)
      .lt("created_at", `${hastaExclusivo}T00:00:00-05:00`),
    supabase.from("prestamos").select("*"),
    supabase.from("cuotas").select("*"),
  ]);

  const primerError =
    pagosRes.error ?? prestamosRes.error ?? cuotasRes.error;
  if (primerError) {
    throw new Error(
      `No se pudo cargar el reporte histórico: ${primerError.message}`,
    );
  }

  return calcularReporteHistorico(
    (prestamosRes.data ?? []) as unknown as PrestamoFinanciero[],
    (cuotasRes.data ?? []) as unknown as CuotaFinanciera[],
    (pagosRes.data ?? []) as unknown as PagoFinanciero[],
    desde,
    hasta,
    hoy,
  );
}

export async function getReportes(
  supabase: SupabaseClient,
): Promise<Reportes> {
  const hoy = hoyPeruYMD();
  const inicioSemana = inicioSemanaYMD(hoy);
  const inicio7Dias = sumarDiasYMD(hoy, -6);
  const finVentana = sumarDiasYMD(hoy, 1);

  const [pagosRes, prestamosRes, cuotasRes] = await Promise.all([
    supabase
      .from("pagos")
      .select("*")
      .gte("created_at", `${inicio7Dias}T00:00:00-05:00`)
      .lt("created_at", `${finVentana}T00:00:00-05:00`),
    supabase.from("prestamos").select("*"),
    supabase.from("cuotas").select("*"),
  ]);

  const primerError =
    pagosRes.error ?? prestamosRes.error ?? cuotasRes.error;
  if (primerError) {
    throw new Error(`No se pudieron cargar los reportes: ${primerError.message}`);
  }

  const pagos = (pagosRes.data ?? []) as unknown as PagoFinanciero[];
  const prestamos = (prestamosRes.data ?? []) as unknown as PrestamoFinanciero[];
  const cuotas = (cuotasRes.data ?? []) as unknown as CuotaFinanciera[];

  const prestamoPorId = new Map(prestamos.map((p) => [p.id, p]));
  const cuotaPorId = new Map(cuotas.map((c) => [c.id, c]));

  /* ---------- Métricas base compartidas ---------- */
  const caja = calcularCajaHoy(pagos, hoy);
  const mora = calcularMoraVencida(prestamos, cuotas, hoy);
  const programadasHoy = calcularCuotasProgramadasHoy(prestamos, cuotas, hoy);

  /* ---------- 1) Reporte diario ---------- */
  const clientesVisitar = new Set([
    ...mora.clientesMorososIds,
    ...programadasHoy.clientesHoyIds,
  ]).size;

  const diario: ReporteDiario = {
    fecha: hoy,
    cajaHoy: caja.recaudadoHoy,
    transaccionesHoy: caja.transaccionesHoy,
    montoProgramadoHoy: programadasHoy.montoProgramadoHoy,
    totalCuotasHoy: programadasHoy.totalCuotasHoy,
    clientesHoyUnicos: programadasHoy.clientesHoyUnicos,
    montoTotalMora: mora.montoTotalMora,
    totalCuotasVencidas: mora.totalCuotasVencidas,
    clientesMorososUnicos: mora.clientesMorososUnicos,
    clientesVisitar,
  };

  /* ---------- 2) Reporte semanal ---------- */
  const sabado = sumarDiasYMD(inicioSemana, 5);

  const pagosSemana = pagos.filter((pg) =>
    entre(fechaCobroYMD(pg), inicioSemana, sabado),
  );
  const recaudadoSemana = r2(
    pagosSemana.reduce((s, pg) => s + Number(pg.monto ?? 0), 0),
  );

  const proyectadoSemana = r2(
    cuotas
      .filter((c) =>
        entre(fechaYMDPeru(c.fecha_vencimiento), inicioSemana, sabado),
      )
      .reduce((s, c) => s + montoProgramadoCuota(c), 0),
  );

  const pagos7Dias = pagos.filter((pg) =>
    entre(fechaCobroYMD(pg), inicio7Dias, hoy),
  );
  const capitalRecuperado7 = r2(
    pagos7Dias.reduce(
      (s, pg) => s + detallePago(pg, cuotaPorId, prestamoPorId).capital,
      0,
    ),
  );

  const prestamos7Dias = prestamos.filter((p) =>
    entre(fechaOtorgamientoPrestamo(p), inicio7Dias, hoy),
  );
  const capitalColocado7 = r2(
    prestamos7Dias.reduce((s, p) => s + montoPrestadoDe(p), 0),
  );

  const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const dias: DiaRecaudacion[] = DIAS_SEMANA.map((dia, indice) => {
    const fecha = sumarDiasYMD(inicioSemana, indice);
    const pagosDia = pagos.filter((pg) => fechaCobroYMD(pg) === fecha);
    return {
      dia,
      fecha,
      monto: r2(pagosDia.reduce((s, pg) => s + Number(pg.monto ?? 0), 0)),
      cobros: pagosDia.length,
    };
  });

  const moraCuotas = obtenerCuotasEnMora(prestamos, cuotas, hoy);
  const tramosBase = [
    {
      clave: "blanda" as const,
      etiqueta: "Mora blanda",
      rango: "1 a 7 días",
      min: 1,
      max: 7,
      monto: 0,
      cuotas: 0,
      clientes: new Set<string>(),
    },
    {
      clave: "alerta" as const,
      etiqueta: "Alerta amarilla",
      rango: "8 a 15 días",
      min: 8,
      max: 15,
      monto: 0,
      cuotas: 0,
      clientes: new Set<string>(),
    },
    {
      clave: "critica" as const,
      etiqueta: "Mora crítica",
      rango: "+15 días",
      min: 16,
      max: Number.POSITIVE_INFINITY,
      monto: 0,
      cuotas: 0,
      clientes: new Set<string>(),
    },
  ];

  for (const c of moraCuotas) {
    const diasMora = diasEntreYMD(fechaYMDPeru(c.fecha_vencimiento), hoy);
    const tramo = tramosBase.find(
      (t) => diasMora >= t.min && diasMora <= t.max,
    );
    if (!tramo) continue;
    tramo.monto = r2(tramo.monto + montoPendienteCuota(c));
    tramo.cuotas += 1;
    const clienteId = String(
      prestamoPorId.get(String(c.prestamo_id ?? ""))?.cliente_id ?? "",
    );
    if (clienteId) tramo.clientes.add(clienteId);
  }

  const semanal: ReporteSemanal = {
    desde: inicioSemana,
    hasta: sabado,
    recaudado: recaudadoSemana,
    proyectado: proyectadoSemana,
    efectividad:
      proyectadoSemana > 0
        ? r2((recaudadoSemana / proyectadoSemana) * 100)
        : 0,
    capitalColocado: capitalColocado7,
    capitalRecuperado: capitalRecuperado7,
    prestamosColocados: prestamos7Dias.length,
    dias,
    tramos: tramosBase.map((t) => ({
      clave: t.clave,
      etiqueta: t.etiqueta,
      rango: t.rango,
      monto: r2(t.monto),
      cuotas: t.cuotas,
      clientes: t.clientes.size,
    })),
    moraTotal: mora.montoTotalMora,
    moraCuotas: mora.totalCuotasVencidas,
    moraClientes: mora.clientesMorososUnicos,
  };

  return { hoy, diario, semanal };
}
