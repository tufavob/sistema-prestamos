import { formatearMoneda } from "@/lib/prestamos";
import type { SegmentoCartera } from "@/lib/financiero-core";

const RADIO = 54;
const GROSOR = 18;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

export function DonutCartera({
  segmentos,
}: {
  segmentos: SegmentoCartera[];
}) {
  const total = segmentos.reduce((s, seg) => s + seg.monto, 0);
  const visibles = segmentos.filter((seg) => seg.monto > 0);

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
      <div className="relative h-44 w-44 shrink-0">
        <svg viewBox="0 0 160 160" className="h-full w-full" aria-hidden="true">
          <circle
            cx="80"
            cy="80"
            r={RADIO}
            fill="none"
            stroke="#1e293b"
            strokeWidth={GROSOR}
          />
          <g transform="rotate(-90 80 80)">
            {visibles.map((seg, indice) => {
              const largo =
                total > 0 ? (seg.monto / total) * CIRCUNFERENCIA : 0;
              const previos = visibles
                .slice(0, indice)
                .reduce(
                  (s, anterior) =>
                    s +
                    (total > 0
                      ? (anterior.monto / total) * CIRCUNFERENCIA
                      : 0),
                  0,
                );
              const dash = `${largo} ${CIRCUNFERENCIA - largo}`;
              const offset = -previos;

              return (
                <circle
                  key={seg.clave}
                  cx="80"
                  cy="80"
                  r={RADIO}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={GROSOR}
                  strokeDasharray={dash}
                  strokeDashoffset={offset}
                  strokeLinecap="butt"
                />
              );
            })}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Cartera
          </span>
          <span className="mt-0.5 text-base font-bold tabular-nums text-slate-100">
            {formatearMoneda(total)}
          </span>
        </div>
      </div>

      <ul className="w-full flex-1 space-y-2.5">
        {segmentos.map((seg) => {
          const porcentaje =
            total > 0 ? ((seg.monto / total) * 100).toFixed(1) : "0.0";
          return (
            <li
              key={seg.clave}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: seg.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-slate-200">
                    {seg.etiqueta}
                  </span>
                  <span className="block text-[10px] text-slate-500">
                    {seg.descripcion}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-xs font-bold tabular-nums text-slate-200">
                  {formatearMoneda(seg.monto)}
                </span>
                <span className="block text-[10px] tabular-nums text-slate-500">
                  {porcentaje}%
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
