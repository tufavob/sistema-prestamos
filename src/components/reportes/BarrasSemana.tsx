import type { DiaRecaudacion } from "@/lib/financiero-core";

const formatoCompacto = (monto: number): string => {
  if (monto >= 1000) return `S/ ${(monto / 1000).toFixed(1)}k`;
  return `S/ ${monto.toFixed(0)}`;
};

export function BarrasSemana({ dias }: { dias: DiaRecaudacion[] }) {
  const maximo = Math.max(...dias.map((d) => d.monto), 0);

  return (
    <div>
      <div className="flex h-48 items-end gap-2 sm:gap-4">
        {dias.map((d) => {
          const alto = maximo > 0 ? (d.monto / maximo) * 100 : 0;
          const alturaBarra = d.monto > 0 ? Math.max(alto, 4) : 0;

          return (
            <div
              key={d.fecha}
              className="flex h-full flex-1 flex-col items-center justify-end gap-2"
              title={`${d.dia} ${d.fecha}: ${formatoCompacto(d.monto)} · ${d.cobros} cobros`}
            >
              <span className="text-[10px] font-semibold tabular-nums text-slate-400">
                {d.monto > 0 ? formatoCompacto(d.monto) : ""}
              </span>
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-emerald-700/80 to-emerald-400 transition-[height] duration-500"
                  style={{ height: `${alturaBarra}%` }}
                  aria-hidden="true"
                />
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {d.dia}
              </span>
              <span className="text-[10px] tabular-nums text-slate-500">
                {d.cobros} {d.cobros === 1 ? "cobro" : "cobros"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
