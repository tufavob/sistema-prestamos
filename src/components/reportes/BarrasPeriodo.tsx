import type { PuntoRecaudacion } from "@/lib/financiero-core";
import { formatearMoneda } from "@/lib/prestamos";

const formatoCompacto = (monto: number): string => {
  if (monto >= 1000) return `S/ ${(monto / 1000).toFixed(1)}k`;
  return `S/ ${monto.toFixed(0)}`;
};

export function BarrasPeriodo({
  puntos,
  unidad,
}: {
  puntos: PuntoRecaudacion[];
  unidad: "dia" | "mes";
}) {
  if (puntos.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-slate-500">
        No hay cobros registrados en este periodo.
      </p>
    );
  }

  const maximo = Math.max(...puntos.map((p) => p.monto), 0);
  const mostrarMontos = puntos.length <= 15;
  const anchoMinimo =
    unidad === "dia"
      ? Math.max(720, puntos.length * 30)
      : Math.max(420, puntos.length * 52);

  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="flex h-52 items-end gap-1.5"
        style={{ minWidth: `${anchoMinimo}px` }}
      >
        {puntos.map((p) => {
          const alto = maximo > 0 ? (p.monto / maximo) * 100 : 0;
          const alturaBarra = p.monto > 0 ? Math.max(alto, 4) : 0;

          return (
            <div
              key={p.clave}
              className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
              title={`${p.etiqueta}: ${formatearMoneda(p.monto)} · ${
                p.cobros
              } ${p.cobros === 1 ? "cobro" : "cobros"}`}
            >
              {mostrarMontos && (
                <span className="text-[10px] font-semibold tabular-nums text-slate-400">
                  {p.monto > 0 ? formatoCompacto(p.monto) : ""}
                </span>
              )}
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-emerald-700/80 to-emerald-400 transition-[height,filter] duration-500 group-hover:brightness-125"
                  style={{ height: `${alturaBarra}%` }}
                  aria-hidden="true"
                />
              </div>
              <span
                className={`w-full truncate text-center font-semibold uppercase tracking-wide text-slate-400 ${
                  unidad === "dia" ? "text-[9px]" : "text-[10px]"
                }`}
              >
                {p.etiqueta}
              </span>
              <span className="text-[9px] tabular-nums text-slate-500">
                {p.cobros}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
