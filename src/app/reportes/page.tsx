'use client';

import { useEffect, useMemo, useState } from "react";
import { createClient, hasAuthConfig } from "@/lib/supabase";
import { aYMD, formatearMoneda, hoyLocal } from "@/lib/prestamos";
import { MEDIOS_DE_PAGO } from "@/lib/credito";

const supabase = hasAuthConfig ? createClient() : null;

type RawPrestamo = {
  id: string;
  cliente_id?: string | null;
  monto_prestado?: number | null;
  monto?: number | null;
  monto_total?: number | null;
  total_devolver?: number | null;
  porcentaje_interes?: number | null;
  interes?: number | null;
  estado?: string | null;
  saldo_pendiente?: number | null;
  fecha_inicio?: string | null;
  created_at?: string | null;
};

type RawCuota = {
  id: string;
  prestamo_id?: string | null;
  monto?: number | null;
  monto_pagado?: number | null;
  saldo_pendiente?: number | null;
  estado?: string | null;
  fecha_vencimiento?: string | null;
  fecha_pago?: string | null;
  metodo_pago?: string | null;
  updated_at?: string | null;
};

type RawPago = {
  id: string;
  cuota_id?: string | null;
  prestamo_id?: string | null;
  monto?: number | null;
  fecha_pago?: string | null;
  medio_pago?: string | null;
};

type RawCliente = {
  id: string;
  nombres: string;
  apellidos: string;
  dni?: string | null;
};

type FilaCliente = {
  cliente: string;
  dni: string;
  prestamos: number;
  prestado: number;
  pagado: number;
  ganancia: number;
  pendiente: number;
  estado: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const ymd = (s?: string | null) => String(s ?? "").substring(0, 10);

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

const formatFechaCorta = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, "0")} ${MESES[m - 1]}. ${y}`;
};

const montoPrestadoDe = (p: RawPrestamo) => Number(p.monto_prestado ?? p.monto ?? 0);

const tasaDe = (p?: RawPrestamo) => {
  if (!p) return 20;
  const directa = Number(p.porcentaje_interes ?? NaN);
  if (Number.isFinite(directa) && directa > 0) return directa;
  const monto = montoPrestadoDe(p);
  const total = Number(p.monto_total ?? p.total_devolver ?? 0);
  if (monto > 0 && total > monto) return ((total - monto) / monto) * 100;
  return 20;
};

const inputCls =
  "rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

export default function ReportesPage() {
  const [filtroRapido, setFiltroRapido] = useState("Hoy");
  const [fechaDesde, setFechaDesde] = useState(() => aYMD(hoyLocal()));
  const [fechaHasta, setFechaHasta] = useState(() => aYMD(hoyLocal()));
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("Todos");

  const [prestamos, setPrestamos] = useState<RawPrestamo[]>([]);
  const [cuotas, setCuotas] = useState<RawCuota[]>([]);
  const [pagos, setPagos] = useState<RawPago[]>([]);
  const [clientes, setClientes] = useState<RawCliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;

    const cargar = async () => {
      if (!supabase) {
        if (activo) {
          setError("Supabase no está configurado. Revisa las variables de entorno.");
          setCargando(false);
        }
        return;
      }
      const [prestamosRes, cuotasRes, pagosRes, clientesRes] = await Promise.all([
        supabase.from("prestamos").select("*"),
        supabase.from("cuotas").select("*"),
        supabase.from("pagos").select("*"),
        supabase.from("clientes").select("id, nombres, apellidos, dni"),
      ]);

      if (!activo) return;

      const primerError =
        prestamosRes.error ?? cuotasRes.error ?? pagosRes.error ?? clientesRes.error;
      if (primerError) {
        setError(`No se pudieron cargar los datos del reporte: ${primerError.message}`);
      } else {
        setPrestamos((prestamosRes.data ?? []) as unknown as RawPrestamo[]);
        setCuotas((cuotasRes.data ?? []) as unknown as RawCuota[]);
        setPagos((pagosRes.data ?? []) as unknown as RawPago[]);
        setClientes((clientesRes.data ?? []) as unknown as RawCliente[]);
      }
      setCargando(false);
    };

    cargar();
    return () => {
      activo = false;
    };
  }, []);

  const aplicarFiltro = (item: string) => {
    setFiltroRapido(item);
    const hoy = hoyLocal();
    if (item === "Hoy") {
      setFechaDesde(aYMD(hoy));
      setFechaHasta(aYMD(hoy));
    } else if (item === "Esta semana") {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
      const lunes = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - lunes);
      setFechaDesde(aYMD(d));
      setFechaHasta(aYMD(hoy));
    } else if (item === "Este mes") {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      setFechaDesde(aYMD(d));
      setFechaHasta(aYMD(hoy));
    }
  };

  const calculado = useMemo(() => {
    const desde = fechaDesde || "0000-00-00";
    const hasta = fechaHasta || "9999-99-99";
    const enRango = (f?: string | null) => {
      const v = ymd(f);
      return v !== "" && v >= desde && v <= hasta;
    };

    const prestamoPorId = new Map<string, RawPrestamo>();
    for (const p of prestamos) prestamoPorId.set(p.id, p);

    const esPagada = (c: RawCuota) => {
      const e = String(c.estado ?? "").toLowerCase();
      return e === "pagado" || e === "pagada" || e === "liquidado";
    };

    const cuotasPorPrestamo = new Map<string, RawCuota[]>();
    for (const c of cuotas) {
      if (!c.prestamo_id) continue;
      const lista = cuotasPorPrestamo.get(c.prestamo_id) ?? [];
      lista.push(c);
      cuotasPorPrestamo.set(c.prestamo_id, lista);
    }

    const prestamosPeriodo = prestamos.filter((p) => enRango(p.fecha_inicio ?? p.created_at));
    const totalPrestado = r2(prestamosPeriodo.reduce((s, p) => s + montoPrestadoDe(p), 0));

    const cuotaPorId = new Map<string, RawCuota>();
    for (const c of cuotas) cuotaPorId.set(c.id, c);

    // Proporción de ganancia (interés) del préstamo sobre el monto total devuelto.
    const proporcionGanancia = (p?: RawPrestamo) => {
      if (!p) return 0;
      const monto = montoPrestadoDe(p);
      const total = Number(p.monto_total ?? p.total_devolver ?? 0);
      if (monto > 0 && total > monto) return (total - monto) / total;
      const tasa = tasaDe(p);
      return tasa > 0 ? tasa / (100 + tasa) : 0;
    };

    // Resolver el préstamo asociado a un pago (por cuota o por prestamo_id).
    const prestamoDePago = (pg: RawPago) => {
      const cuota = pg.cuota_id ? cuotaPorId.get(pg.cuota_id) : undefined;
      return prestamoPorId.get(String(cuota?.prestamo_id ?? pg.prestamo_id ?? ""));
    };

    // Cobros reales del periodo: se leen de la tabla `pagos` (fuente de verdad).
    let capitalRecuperado = 0;
    let gananciaCobrada = 0;
    const porFecha = new Map<string, { cobros: number; capital: number; ganancia: number }>();
    const porMedio = new Map<string, number>();
    for (const pg of pagos) {
      const f = ymd(pg.fecha_pago);
      if (!enRango(f)) continue;
      const cuota = pg.cuota_id ? cuotaPorId.get(pg.cuota_id) : undefined;
      const prestamo = prestamoPorId.get(
        String(cuota?.prestamo_id ?? pg.prestamo_id ?? ""),
      );
      const monto = Number(pg.monto ?? 0);
      const prop = proporcionGanancia(prestamo);
      const ganancia = r2(monto * prop);
      const capital = r2(monto - ganancia);
      capitalRecuperado += capital;
      gananciaCobrada += ganancia;

      const acc = porFecha.get(f) ?? { cobros: 0, capital: 0, ganancia: 0 };
      acc.cobros += 1;
      acc.capital = r2(acc.capital + capital);
      acc.ganancia = r2(acc.ganancia + ganancia);
      porFecha.set(f, acc);

      // Método de pago: se prioriza `cuotas.metodo_pago` (con respaldo en pagos).
      const medio =
        (String(cuota?.metodo_pago ?? pg.medio_pago ?? "efectivo").toLowerCase().trim()) ||
        "efectivo";
      porMedio.set(medio, r2((porMedio.get(medio) ?? 0) + monto));
    }
    capitalRecuperado = r2(capitalRecuperado);
    gananciaCobrada = r2(gananciaCobrada);

    const diarios = [...porFecha.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([f, v]) => ({
        fecha: formatFechaCorta(f),
        cobros: v.cobros,
        capital: v.capital,
        ganancia: v.ganancia,
      }));

    const ingresosPorMedio = MEDIOS_DE_PAGO.map((m) => ({
      value: m.value,
      label: m.label,
      total: r2(porMedio.get(m.value) ?? 0),
    }));
    const totalIngresosPeriodo = r2(
      ingresosPorMedio.reduce((s, m) => s + m.total, 0),
    );

    const today = aYMD(hoyLocal());
    let carteraVigente = 0;
    let carteraRiesgo = 0;
    let gananciaProyectada = 0;
    let carteraVigenteContador = 0;
    for (const p of prestamos) {
      const cuotasP = (cuotasPorPrestamo.get(p.id) ?? []).filter((c) => !esPagada(c));
      const pendienteCuotas = r2(cuotasP.reduce((s, c) => s + Number(c.saldo_pendiente ?? 0), 0));
      const pendiente = pendienteCuotas > 0 ? pendienteCuotas : Number(p.saldo_pendiente ?? 0);
      const activo = String(p.estado ?? "").toLowerCase() === "activo" || pendiente > 0;
      if (!activo || pendiente <= 0) continue;

      const tasa = tasaDe(p);
      gananciaProyectada += pendiente * (tasa / (100 + tasa));

      const enMora = cuotasP.some((c) => {
        const fv = ymd(c.fecha_vencimiento);
        return fv !== "" && fv < today;
      });
      if (enMora) {
        carteraRiesgo += pendiente;
      } else {
        carteraVigente += pendiente;
        carteraVigenteContador += 1;
      }
    }

    const clientesPorId = new Map<string, RawCliente>();
    for (const c of clientes) clientesPorId.set(c.id, c);

    const filas = new Map<string, FilaCliente>();
    const asegurarFila = (clienteId: string): FilaCliente => {
      let fila = filas.get(clienteId);
      if (!fila) {
        const cliente = clientesPorId.get(clienteId);
        fila = {
          cliente: cliente ? `${cliente.nombres} ${cliente.apellidos}` : "Cliente eliminado",
          dni: cliente?.dni ?? "",
          prestamos: 0,
          prestado: 0,
          pagado: 0,
          ganancia: 0,
          pendiente: 0,
          estado: "Liquidado",
        };
        filas.set(clienteId, fila);
      }
      return fila;
    };

    // Desembolsos del periodo.
    for (const p of prestamosPeriodo) {
      const fila = asegurarFila(p.cliente_id ?? "sin-cliente");
      fila.prestamos += 1;
      fila.prestado = r2(fila.prestado + montoPrestadoDe(p));
    }

    // Cobros del periodo: "Total pagado" y "Ganancia generada" (interés real).
    for (const pg of pagos) {
      if (!enRango(ymd(pg.fecha_pago))) continue;
      const prestamo = prestamoDePago(pg);
      const fila = asegurarFila(prestamo?.cliente_id ?? "sin-cliente");
      const monto = Number(pg.monto ?? 0);
      const ganancia = r2(monto * proporcionGanancia(prestamo));
      fila.pagado = r2(fila.pagado + monto);
      fila.ganancia = r2(fila.ganancia + ganancia);
    }

    // Pendiente y estado por cliente (sobre todas sus cuotas sin pagar).
    for (const p of prestamos) {
      const fila = filas.get(p.cliente_id ?? "sin-cliente");
      if (!fila) continue;
      const pendiente = r2(
        (cuotasPorPrestamo.get(p.id) ?? [])
          .filter((c) => !esPagada(c))
          .reduce((s, c) => s + Number(c.saldo_pendiente ?? 0), 0),
      );
      fila.pendiente = r2(fila.pendiente + pendiente);
    }
    for (const fila of filas.values()) {
      fila.estado = fila.pendiente > 0 ? "Activo" : "Liquidado";
    }

    return {
      resumen: {
        totalPrestado,
        prestamosContador: prestamosPeriodo.length,
        capitalRecuperado,
        gananciaCobrada,
        gananciaProyectada: r2(gananciaProyectada),
        carteraVigente: r2(carteraVigente),
        carteraVigenteContador,
        carteraRiesgo: r2(carteraRiesgo),
      },
      diarios,
      ingresosPorMedio,
      totalIngresosPeriodo,
      filasClientes: [...filas.values()],
    };
  }, [prestamos, cuotas, pagos, clientes, fechaDesde, fechaHasta]);

  const { resumen, diarios, ingresosPorMedio, totalIngresosPeriodo, filasClientes } =
    calculado;

  const clientesFiltrados = filasClientes.filter((c) => {
    const q = busquedaCliente.trim().toLowerCase();
    const coincideTexto =
      q === "" || c.cliente.toLowerCase().includes(q) || c.dni.includes(q);
    const coincideEstado = filtroEstado === "Todos" || c.estado === filtroEstado;
    return coincideTexto && coincideEstado;
  });

  const totalCobrosDiarios = diarios.reduce((acc, d) => acc + d.cobros, 0);
  const totalCapitalDiario = r2(diarios.reduce((acc, d) => acc + d.capital, 0));
  const totalGananciaDiaria = r2(diarios.reduce((acc, d) => acc + d.ganancia, 0));

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 text-slate-100 sm:px-6">
      {/* Encabezado Principal */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-sm md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">Reportes Financieros</h1>
          <p className="mt-1 text-sm text-slate-400">Inversión, ganancias y cartera por periodo</p>
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-lg shadow-emerald-950/50 transition hover:bg-emerald-500"
        >
          Exportar Reporte Financiero (PDF)
        </button>
      </div>

      {/* Controles de Periodo */}
      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm md:flex-row">
        <div className="flex rounded-lg bg-slate-950/70 p-1 text-sm font-medium">
          {["Hoy", "Esta semana", "Este mes", "Personalizado"].map((item) => (
            <button
              key={item}
              onClick={() => aplicarFiltro(item)}
              className={`rounded-md px-3 py-1.5 transition ${
                filtroRapido === item
                  ? "bg-emerald-600 font-bold text-slate-950"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-400">Desde</span>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => {
              setFechaDesde(e.target.value);
              setFiltroRapido("Personalizado");
            }}
            className={inputCls}
          />
          <span className="font-medium text-slate-400">Hasta</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => {
              setFechaHasta(e.target.value);
              setFiltroRapido("Personalizado");
            }}
            className={inputCls}
          />
        </div>
      </div>

      {/* Sub-encabezado Informativo */}
      <div className="text-xs font-medium text-slate-400">
        Reporte Financiero de Cartera y Ganancias - Sistema de Préstamos · Periodo: {fechaDesde} al {fechaHasta}
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/60 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Resumen Ejecutivo - 6 Tarjetas */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-100">Resumen Ejecutivo</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-400">Total Prestado</p>
            <p className="mt-1 text-3xl font-black tracking-tight text-sky-400">{formatearMoneda(resumen.totalPrestado)}</p>
            <p className="mt-2 text-xs text-slate-500">Inversión del periodo · {resumen.prestamosContador} préstamo(s)</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-400">Capital Recuperado</p>
            <p className="mt-1 text-3xl font-black tracking-tight text-emerald-400">{formatearMoneda(resumen.capitalRecuperado)}</p>
            <p className="mt-2 text-xs text-slate-500">Efectivo ingresado por amortizaciones · periodo seleccionado</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-400">Ganancia Real Cobrada</p>
            <p className="mt-1 text-3xl font-black tracking-tight text-emerald-400">{formatearMoneda(resumen.gananciaCobrada)}</p>
            <p className="mt-2 text-xs text-slate-500">Intereses efectivamente cobrados · periodo seleccionado</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-400">Ganancia Proyectada</p>
            <p className="mt-1 text-3xl font-black tracking-tight text-slate-100">{formatearMoneda(resumen.gananciaProyectada)}</p>
            <p className="mt-2 text-xs text-slate-500">Intereses por cobrar en cuotas futuras · préstamos activos</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-400">Cartera Vigente</p>
            <p className="mt-1 text-3xl font-black tracking-tight text-slate-100">{formatearMoneda(resumen.carteraVigente)}</p>
            <p className="mt-2 text-xs text-slate-500">Capital pendiente por cobrar (al día) · {resumen.carteraVigenteContador} préstamo(s)</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-400">Cartera en Riesgo</p>
            <p className="mt-1 text-3xl font-black tracking-tight text-red-400">{formatearMoneda(resumen.carteraRiesgo)}</p>
            <p className="mt-2 text-xs text-slate-500">Monto en morosidad · préstamos activos con cuotas vencidas</p>
          </div>
        </div>
      </div>

      {/* Tabla Diaria */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl">
        <div className="border-b border-slate-800 bg-slate-950/50 p-5">
          <h2 className="text-lg font-semibold text-slate-100">Ganancias por Periodo (Diario)</h2>
          <p className="mt-1 text-xs text-slate-400">Cobros realizados, capital recuperado y ganancia neta del día</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950">
              <tr className="text-xs uppercase tracking-wider text-slate-400">
                <th className="border-b border-slate-800 p-3 pl-5 font-semibold">Fecha</th>
                <th className="border-b border-slate-800 p-3 font-semibold">Cobros realizados</th>
                <th className="border-b border-slate-800 p-3 font-semibold">Capital recuperado</th>
                <th className="border-b border-slate-800 p-3 pr-5 font-semibold">Ganancia neta del día</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {diarios.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-10 text-center text-sm text-slate-400">
                    {cargando ? "Cargando..." : "No hay cobros registrados en este periodo"}
                  </td>
                </tr>
              ) : (
                diarios.map((d, i) => (
                  <tr key={i} className="border-b border-slate-800/80 transition-colors hover:bg-slate-800/40">
                    <td className="p-3 pl-5 font-semibold text-slate-100">{d.fecha}</td>
                    <td className="p-3">{d.cobros}</td>
                    <td className="p-3 font-medium text-slate-300">{formatearMoneda(d.capital)}</td>
                    <td className="p-3 pr-5 font-bold text-emerald-400">{formatearMoneda(d.ganancia)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {diarios.length > 0 && (
              <tfoot className="border-t border-slate-800 bg-slate-950/70 font-bold text-slate-100">
                <tr>
                  <td className="p-3 pl-5">Totales del periodo</td>
                  <td className="p-3">{totalCobrosDiarios}</td>
                  <td className="p-3">{formatearMoneda(totalCapitalDiario)}</td>
                  <td className="p-3 pr-5 text-emerald-400">{formatearMoneda(totalGananciaDiaria)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Ingresos por Método de Pago */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl">
        <div className="border-b border-slate-800 bg-slate-950/50 p-5">
          <h2 className="text-lg font-semibold text-slate-100">Ingresos por Método de Pago</h2>
          <p className="mt-1 text-xs text-slate-400">
            Total recaudado en el periodo según el medio de pago registrado en cada cobro
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          {ingresosPorMedio.map((m) => (
            <div
              key={m.value}
              className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {m.label}
              </p>
              <p className="mt-1 text-lg font-bold text-emerald-400">
                {formatearMoneda(m.total)}
              </p>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/70 px-5 py-3 text-sm font-bold text-slate-100">
          <span>Total del periodo</span>
          <span className="text-emerald-400">{formatearMoneda(totalIngresosPeriodo)}</span>
        </div>
      </div>

      {/* Tabla por Cliente con Buscador Integrado */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-800 bg-slate-950/50 p-5 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Resumen Financiero por Cliente</h2>
            <p className="mt-1 text-xs text-slate-400">Clientes con desembolsos o cobros en el periodo</p>
          </div>
          <div className="flex w-full gap-2 md:w-auto">
            <input
              type="text"
              placeholder="Buscar por cliente o DNI..."
              value={busquedaCliente}
              onChange={(e) => setBusquedaCliente(e.target.value)}
              className={`${inputCls} w-full md:w-64`}
            />
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className={inputCls}
            >
              <option value="Todos">Todos los estados</option>
              <option value="Liquidado">Liquidado</option>
              <option value="Activo">Activo</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950">
              <tr className="text-xs uppercase tracking-wider text-slate-400">
                <th className="border-b border-slate-800 p-3 pl-5 font-semibold">Cliente</th>
                <th className="border-b border-slate-800 p-3 font-semibold">Préstamos totales</th>
                <th className="border-b border-slate-800 p-3 font-semibold">Total prestado</th>
                <th className="border-b border-slate-800 p-3 font-semibold">Total pagado</th>
                <th className="border-b border-slate-800 p-3 font-semibold">Ganancia generada</th>
                <th className="border-b border-slate-800 p-3 pr-5 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {clientesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-sm text-slate-400">
                    No se encontraron clientes con ese criterio.
                  </td>
                </tr>
              ) : (
                clientesFiltrados.map((c, i) => (
                  <tr key={i} className="border-b border-slate-800/80 transition-colors hover:bg-slate-800/40">
                    <td className="p-3 pl-5">
                      <div className="font-bold text-slate-100">{c.cliente}</div>
                      <div className="text-xs text-slate-500">DNI {c.dni || "—"}</div>
                    </td>
                    <td className="p-3 font-medium text-slate-300">{c.prestamos}</td>
                    <td className="p-3 font-medium text-slate-300">{formatearMoneda(c.prestado)}</td>
                    <td className="p-3 font-medium text-slate-300">{formatearMoneda(c.pagado)}</td>
                    <td className="p-3 font-bold text-emerald-400">{formatearMoneda(c.ganancia)}</td>
                    <td className="p-3 pr-5">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                          c.estado === "Liquidado"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                        }`}
                      >
                        {c.estado}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
