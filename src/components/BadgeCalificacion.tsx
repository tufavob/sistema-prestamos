import {
  BADGE_CLASES_CALIFICACION,
  ETIQUETAS_CALIFICACION,
  normalizarCalificacion,
  type CreditScore,
} from "@/lib/credito";

export function renderCalificacionBadge(
  calificacion: string | null | undefined,
  score?: CreditScore,
) {
  const normalizada = normalizarCalificacion(calificacion);
  const titulo = score
    ? `Retraso promedio: ${score.diasRetrasoPromedio} día(s) · Max. atraso: ${score.diasMaximoAtraso} · Pagos atrasados: ${score.atrasos} · Abonos parciales: ${score.abonosParciales} · Renovaciones: ${score.refinanciado}`
    : ETIQUETAS_CALIFICACION[normalizada];
  return (
    <span
      title={titulo}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide shadow-sm ${BADGE_CLASES_CALIFICACION[normalizada]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
      {ETIQUETAS_CALIFICACION[normalizada]}
    </span>
  );
}

export default function BadgeCalificacion({
  calificacion,
  score,
}: {
  calificacion: string | null | undefined;
  score?: CreditScore;
}) {
  return renderCalificacionBadge(calificacion, score);
}
