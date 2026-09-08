export type Frecuencia = "diario" | "semanal" | "quincenal" | "mensual";

export const FRECUENCIAS: ReadonlyArray<{ value: Frecuencia; label: string }> = [
  { value: "diario", label: "Diario" },
  { value: "semanal", label: "Semanal" },
  { value: "quincenal", label: "Quincenal" },
  { value: "mensual", label: "Mensual" },
];

export type CuotaPreview = {
  numero: number;
  monto: number;
  fecha: Date;
};

export type PrestamoCalculo = {
  monto: number;
  interes: number;
  montoTotal: number;
  cuotaBase: number;
  ultimaCuota: number;
  cuotas: CuotaPreview[];
};

const redondear = (n: number) => Math.round(n * 100) / 100;

function sumarPeriodos(fecha: Date, frecuencia: Frecuencia, periodos: number): Date {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  switch (frecuencia) {
    case "diario":
      d.setDate(d.getDate() + periodos);
      break;
    case "semanal":
      d.setDate(d.getDate() + periodos * 7);
      break;
    case "quincenal":
      d.setDate(d.getDate() + periodos * 15);
      break;
    case "mensual": {
      const dia = d.getDate();
      d.setMonth(d.getMonth() + periodos);
      if (d.getDate() < dia) d.setDate(0);
      break;
    }
  }
  return d;
}

export function calcularPrestamo(
  monto: number,
  interesPorcentaje: number,
  frecuencia: Frecuencia,
  numeroCuotas: number,
  fechaInicio: Date,
): PrestamoCalculo {
  const interes = redondear((monto * interesPorcentaje) / 100);
  const montoTotal = redondear(monto + interes);
  const cuotaBase = redondear(montoTotal / numeroCuotas);
  const ultimaCuota = redondear(montoTotal - cuotaBase * (numeroCuotas - 1));

  const cuotas: CuotaPreview[] = Array.from({ length: numeroCuotas }, (_, i) => ({
    numero: i + 1,
    monto: i + 1 === numeroCuotas ? ultimaCuota : cuotaBase,
    fecha: sumarPeriodos(fechaInicio, frecuencia, i + 1),
  }));

  return { monto, interes, montoTotal, cuotaBase, ultimaCuota, cuotas };
}

export const formatearMoneda = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatearFecha = (fecha: Date) =>
  fecha.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export const hoyLocal = () => new Date();

export const aYMD = (fecha: Date) => {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};