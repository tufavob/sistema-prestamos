import type { ReactNode } from "react";

export type TonoKPI =
  | "emerald"
  | "blue"
  | "indigo"
  | "amber"
  | "orange"
  | "red"
  | "slate";

const TONOS: Record<
  TonoKPI,
  { borde: string; icono: string; valor: string; acento: string }
> = {
  emerald: {
    borde: "border-emerald-500/20",
    icono: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
    valor: "text-emerald-400",
    acento: "bg-emerald-500/60",
  },
  blue: {
    borde: "border-blue-500/20",
    icono: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
    valor: "text-blue-400",
    acento: "bg-blue-500/60",
  },
  indigo: {
    borde: "border-indigo-500/20",
    icono: "bg-indigo-500/10 text-indigo-400 ring-indigo-500/20",
    valor: "text-indigo-400",
    acento: "bg-indigo-500/60",
  },
  amber: {
    borde: "border-amber-500/25",
    icono: "bg-amber-500/10 text-amber-400 ring-amber-500/25",
    valor: "text-amber-400",
    acento: "bg-amber-500/60",
  },
  orange: {
    borde: "border-orange-500/25",
    icono: "bg-orange-500/10 text-orange-400 ring-orange-500/25",
    valor: "text-orange-400",
    acento: "bg-orange-500/60",
  },
  red: {
    borde: "border-red-500/25",
    icono: "bg-red-500/10 text-red-400 ring-red-500/25",
    valor: "text-red-400",
    acento: "bg-red-500/60",
  },
  slate: {
    borde: "border-slate-800",
    icono: "bg-slate-800/80 text-slate-400 ring-slate-700/60",
    valor: "text-slate-100",
    acento: "bg-slate-600/60",
  },
};

export function TarjetaKPI({
  titulo,
  valor,
  detalle,
  tono,
  icono,
  cargando = false,
}: {
  titulo: string;
  valor: string;
  detalle: string;
  tono: TonoKPI;
  icono: ReactNode;
  cargando?: boolean;
}) {
  const estilo = TONOS[tono];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${estilo.borde} bg-slate-900/80 p-5 shadow-lg shadow-slate-950/30`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-0.5 ${estilo.acento}`}
        aria-hidden="true"
      />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {titulo}
        </p>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${estilo.icono}`}
        >
          {icono}
        </span>
      </div>

      {cargando ? (
        <div className="mt-3 h-8 w-28 animate-pulse rounded-lg bg-slate-800/80" />
      ) : (
        <p
          className={`mt-3 text-2xl font-bold tracking-tight tabular-nums sm:text-3xl ${estilo.valor}`}
        >
          {valor}
        </p>
      )}
      <p className="mt-1.5 min-h-[1rem] text-xs text-slate-400">{detalle}</p>
    </div>
  );
}
