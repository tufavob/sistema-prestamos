type ClientePago = { nombres: string; apellidos: string; telefono: string | null };
type PrestamoPago = { monto: number; clientes: ClientePago | ClientePago[] | null };
type CuotaPago = { numero: number; prestamos: PrestamoPago | PrestamoPago[] | null };

export const SELECT_PAGOS_REPORTE =
  "id, monto, fecha_pago, cuotas!inner(numero, prestamos!inner(monto, clientes!inner(nombres, apellidos, telefono)))";

export type PagoExportable = {
  monto: number;
  fecha_pago: string;
  cuotas: CuotaPago | CuotaPago[] | null;
};

const primero = <T,>(x: T | T[] | null | undefined): T | null =>
  Array.isArray(x) ? (x[0] ?? null) : (x ?? null);

const celda = (valor: string | number) => {
  const s = String(valor);
  if (/[";\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export function exportarPagosCSV(pagos: PagoExportable[], fecha: string) {
  const filas = pagos.map((p) => {
    const cuota = primero(p.cuotas);
    const prestamo = cuota ? primero(cuota.prestamos) : null;
    const cliente = prestamo ? primero(prestamo.clientes) : null;
    return [
      p.fecha_pago,
      cliente ? `${cliente.nombres} ${cliente.apellidos}` : "",
      cliente?.telefono ?? "",
      prestamo ? Number(prestamo.monto).toFixed(2) : "",
      cuota ? `#${cuota.numero}` : "",
      Number(p.monto).toFixed(2),
      "Pagado",
    ];
  });

  const cabecera = [
    "Fecha",
    "Cliente",
    "Teléfono",
    "Préstamo (S/)",
    "Cuota",
    "Monto Cobrado (S/)",
    "Estado",
  ];

  const contenido = [cabecera, ...filas]
    .map((r) => r.map(celda).join(";"))
    .join("\r\n");

  const blob = new Blob([`\uFEFF${contenido}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reporte_cobros_${fecha}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}