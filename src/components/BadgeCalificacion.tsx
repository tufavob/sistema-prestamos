import {
  BADGE_CLASES_CALIFICACION,
  ETIQUETAS_CALIFICACION,
  type Calificacion,
  type CreditScore,
} from "@/lib/credito";

export default function BadgeCalificacion({
  calificacion,
  score,
}: {
  calificacion: Calificacion;
  score?: CreditScore;
}) {
  const titulo = score
    ? `Retraso promedio: ${score.diasRetrasoPromedio} día(s) · Max. atraso: ${score.diasMaximoAtraso} · Pagos atrasados: ${score.atrasos} · Abonos parciales: ${score.abonosParciales} · Renovaciones: ${score.refinanciado}`
    : ETIQUETAS_CALIFICACION[calificacion];
  return (
    <span
      title={titulo}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide shadow-sm ${BADGE_CLASES_CALIFICACION[calificacion]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
      {ETIQUETAS_CALIFICACION[calificacion]}
    </span>
  );
}