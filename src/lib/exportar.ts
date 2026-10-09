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

// ------------------------------------------------------------
// Reporte financiero consolidado (Dashboard)
// ------------------------------------------------------------

export type ResumenCaja = {
  totalPrestado: number;
  totalCobrado: number;
  saldoPendienteGeneral: number;
  cobrosDelDia: number;
};

export type PrestamoReporte = {
  cliente: string;
  dni: string;
  calificacion: string;
  monto: number;
  saldoPendiente: number;
  estado: string;
};

const fijo = (n: number) => Number(n || 0).toFixed(2);

export function exportarReporteFinancieroCSV(
  resumen: ResumenCaja,
  prestamos: PrestamoReporte[],
  fecha: string,
) {
  const filas: string[] = [
    celda("Reporte Financiero"),
    celda(`Fecha de corte: ${fecha}`),
    "",
    celda("Resumen de Caja"),
    ["Concepto", "Monto (S/)"].map(celda).join(";"),
    ["Total Prestado", fijo(resumen.totalPrestado)].map(celda).join(";"),
    ["Total Cobrado", fijo(resumen.totalCobrado)].map(celda).join(";"),
    ["Saldo Pendiente General", fijo(resumen.saldoPendienteGeneral)]
      .map(celda)
      .join(";"),
    ["Cobros del Día", fijo(resumen.cobrosDelDia)].map(celda).join(";"),
    "",
    celda("Cartera de Préstamos"),
    ["Cliente", "DNI", "Calificación", "Monto Prestado", "Saldo Pendiente", "Estado"]
      .map(celda)
      .join(";"),
    ...prestamos.map((p) =>
      [
        p.cliente,
        p.dni,
        p.calificacion,
        fijo(p.monto),
        fijo(p.saldoPendiente),
        p.estado,
      ]
        .map(celda)
        .join(";"),
    ),
  ];

  const contenido = filas.join("\r\n");
  const blob = new Blob([`\uFEFF${contenido}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Reporte_Financiero_${fecha}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------
// Reporte de ruta diaria (Cobros del Día)
// ------------------------------------------------------------

export type CobroRutaReporte = {
  cliente: string;
  dni: string;
  telefono: string;
  direccion: string;
  numeroCuota: string;
  montoCuota: number;
  estado: string;
  horaPago: string;
};

export function exportarCobrosRutaCSV(
  fechaMostrar: string,
  fechaISO: string,
  porCobrar: number,
  recaudado: number,
  totalCuotas: number,
  cobros: CobroRutaReporte[],
) {
  const filas: string[] = [
    celda("Reporte de Cobros del Día"),
    celda(`Fecha: ${fechaMostrar}`),
    celda(`Por Cobrar Hoy: ${fijo(porCobrar)}`),
    celda(`Recaudado Hoy: ${fijo(recaudado)}`),
    celda(`Cuotas Totales de la Ruta: ${totalCuotas}`),
    "",
    [
      "CLIENTE",
      "DNI",
      "TELÉFONO",
      "DIRECCIÓN",
      "N° CUOTA",
      "MONTO CUOTA",
      "ESTADO",
      "HORA DE PAGO",
    ]
      .map(celda)
      .join(";"),
    ...cobros.map((c) =>
      [
        c.cliente,
        c.dni,
        c.telefono,
        c.direccion,
        c.numeroCuota,
        fijo(c.montoCuota),
        c.estado,
        c.horaPago,
      ]
        .map(celda)
        .join(";"),
    ),
  ];

  const contenido = filas.join("\r\n");
  const blob = new Blob([`\uFEFF${contenido}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Reporte_Cobros_Dia_${fechaISO}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}