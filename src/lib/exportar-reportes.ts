/**
 * Exportadores de reportes financieros en XLSX y PDF.
 *
 * No usan librerías externas: el XLSX es un paquete OOXML mínimo (ZIP sin
 * compresión) y el PDF usa fuentes Type1 estándar con WinAnsiEncoding, de modo
 * que tildes y ñ viajan como un byte por carácter.
 */

import {
  formatearRangoFechas,
  type ReporteHistorico,
  type Reportes,
} from "@/lib/financiero-core";

/* ================================================================== */
/* Tipos y normalización                                               */
/* ================================================================== */

export type FilaDetalleExportacion = {
  etiqueta: string;
  recaudado: number;
  interes: number;
  capital: number;
  cobros: number;
};

export type DatosExportacionReporte = {
  titulo: string;
  periodo: string;
  generadoEn: string;
  resumen: { etiqueta: string; valor: number | string; esMonto: boolean }[];
  detalle: FilaDetalleExportacion[];
  cartera: { etiqueta: string; monto: number; descripcion: string }[];
  movimiento: { etiqueta: string; valor: number | string; esMonto: boolean }[];
  notas: string[];
};

export const montoSeguro = (valor: unknown): number => {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
};

export const enteroSeguro = (valor: unknown): number => {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

const REEMPLAZOS: Record<string, string> = {
  "–": "-",
  "—": "-",
  "−": "-",
  "•": "-",
  "→": "->",
  "←": "<-",
  "≥": ">=",
  "≤": "<=",
  "“": '"',
  "”": '"',
  "‘": "'",
  "’": "'",
  "…": "...",
  "\u00a0": " ",
};

/** Texto limpio, sin caracteres fuera de Latin-1 ni tokens rotos. */
export function textoSeguro(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  let s = typeof valor === "number" ? String(montoSeguro(valor)) : String(valor);
  if (["nan", "undefined", "null", "infinity"].includes(s.trim().toLowerCase())) {
    return "";
  }
  s = s
    .split("")
    .map((ch) => REEMPLAZOS[ch] ?? ch)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code <= 255;
    })
    .join("");
  return s.replace(/\s+/g, " ").trim();
}

/** S/ 1,234.56 (o S/ 0.00); nunca NaN ni undefined. */
export function formatoSol(valor: unknown): string {
  const n = montoSeguro(valor);
  const signo = n < 0 ? "-" : "";
  const [entero, decimales] = Math.abs(n).toFixed(2).split(".");
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${signo}S/ ${conMiles}.${decimales}`;
}

export function fechaHoraLima(fecha = new Date()): string {
  const formato = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return textoSeguro(formato.format(fecha)).replace(/\./g, "");
}

/* ================================================================== */
/* Preparación de datos (común para Excel y PDF)                       */
/* ================================================================== */

export function prepararDatosExportacion(opciones: {
  periodo: "hoy" | "semana" | "historico";
  datos: Reportes | null;
  historico: ReporteHistorico | null;
  rango: { desde: string; hasta: string };
  hoy: string;
}): DatosExportacionReporte {
  const { periodo, datos, historico, rango, hoy } = opciones;
  const generadoEn = fechaHoraLima();

  if (periodo === "historico" && historico) {
    const h = historico;
    const detalle: FilaDetalleExportacion[] = h.serie.length
      ? h.serie.map((p) => ({
          etiqueta: p.etiqueta,
          recaudado: montoSeguro(p.monto),
          interes: montoSeguro(p.interes),
          capital: montoSeguro(p.capital),
          cobros: enteroSeguro(p.cobros),
        }))
      : [
          {
            etiqueta: "Sin registros en el periodo",
            recaudado: 0,
            interes: 0,
            capital: 0,
            cobros: 0,
          },
        ];

    return {
      titulo: "Reporte Histórico / Analítico",
      periodo: formatearRangoFechas(h.desde, h.hasta),
      generadoEn,
      resumen: [
        { etiqueta: "Recaudado total", valor: h.recaudado, esMonto: true },
        {
          etiqueta: "Rentabilidad real acumulada",
          valor: h.interes,
          esMonto: true,
        },
        {
          etiqueta: "Capital recuperado",
          valor: h.capitalRecuperado,
          esMonto: true,
        },
        { etiqueta: "Capital colocado", valor: h.capitalColocado, esMonto: true },
        { etiqueta: "Cartera activa (hoy)", valor: h.carteraActiva, esMonto: true },
        { etiqueta: "Mora real vencida (hoy)", valor: h.moraReal, esMonto: true },
        {
          etiqueta: "Morosidad sobre cartera",
          valor: `${montoSeguro(h.morosidad).toFixed(1)}%`,
          esMonto: false,
        },
        { etiqueta: "Cobros registrados", valor: enteroSeguro(h.cobros), esMonto: false },
      ],
      detalle,
      cartera: h.segmentosCartera.map((s) => ({
        etiqueta: s.etiqueta,
        monto: montoSeguro(s.monto),
        descripcion: s.descripcion,
      })),
      movimiento: [
        { etiqueta: "Préstamos liquidados", valor: h.liquidados, esMonto: false },
        { etiqueta: "Préstamos nuevos", valor: h.nuevos, esMonto: false },
        { etiqueta: "Préstamos renovados", valor: h.renovados, esMonto: false },
        {
          etiqueta: "Tasa de renovación",
          valor: `${montoSeguro(h.tasaRenovacion).toFixed(1)}%`,
          esMonto: false,
        },
      ],
      notas: [
        "Intereses, capital y cobros corresponden al rango seleccionado.",
        "Mora y cartera son la foto actual del negocio, no un saldo histórico.",
      ],
    };
  }

  if (periodo === "semana" && datos?.semanal) {
    const s = datos.semanal;
    return {
      titulo: "Reporte Semanal",
      periodo: formatearRangoFechas(s.desde, s.hasta),
      generadoEn,
      resumen: [
        { etiqueta: "Recaudado en la semana", valor: s.recaudado, esMonto: true },
        { etiqueta: "Proyectado", valor: s.proyectado, esMonto: true },
        {
          etiqueta: "Efectividad",
          valor: `${montoSeguro(s.efectividad).toFixed(1)}%`,
          esMonto: false,
        },
        { etiqueta: "Capital colocado", valor: s.capitalColocado, esMonto: true },
        { etiqueta: "Capital recuperado", valor: s.capitalRecuperado, esMonto: true },
        { etiqueta: "Mora real vencida", valor: s.moraTotal, esMonto: true },
        {
          etiqueta: "Préstamos colocados",
          valor: enteroSeguro(s.prestamosColocados),
          esMonto: false,
        },
      ],
      detalle: s.dias.map((d) => ({
        etiqueta: `${d.dia} ${d.fecha}`,
        recaudado: montoSeguro(d.monto),
        interes: 0,
        capital: 0,
        cobros: enteroSeguro(d.cobros),
      })),
      cartera: [],
      movimiento: [],
      notas: [
        "El desglose de intereses y capital está disponible en Histórico / Analítico.",
      ],
    };
  }

  const d = datos?.diario;
  return {
    titulo: "Reporte Diario",
    periodo: textoSeguro(d?.fecha ?? rango.hasta ?? hoy),
    generadoEn,
    resumen: [
      { etiqueta: "Caja del día", valor: d?.cajaHoy ?? 0, esMonto: true },
      {
        etiqueta: "Transacciones de hoy",
        valor: enteroSeguro(d?.transaccionesHoy),
        esMonto: false,
      },
      {
        etiqueta: "Monto programado hoy",
        valor: d?.montoProgramadoHoy ?? 0,
        esMonto: true,
      },
      {
        etiqueta: "Cuotas programadas hoy",
        valor: enteroSeguro(d?.totalCuotasHoy),
        esMonto: false,
      },
      { etiqueta: "Mora real vencida", valor: d?.montoTotalMora ?? 0, esMonto: true },
      {
        etiqueta: "Cuotas vencidas",
        valor: enteroSeguro(d?.totalCuotasVencidas),
        esMonto: false,
      },
    ],
    detalle: [
      {
        etiqueta: `Caja del ${textoSeguro(d?.fecha ?? hoy)}`,
        recaudado: montoSeguro(d?.cajaHoy),
        interes: 0,
        capital: 0,
        cobros: enteroSeguro(d?.transaccionesHoy),
      },
    ],
    cartera: [],
    movimiento: [],
    notas: [
      "El desglose de intereses y capital está disponible en Histórico / Analítico.",
    ],
  };
}

/* ================================================================== */
/* XLSX: OOXML mínimo + ZIP sin compresión                             */
/* ================================================================== */

const codificador = new TextEncoder();

const xml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const columna = (indice: number): string => {
  let resultado = "";
  let n = indice;
  while (n > 0) {
    n -= 1;
    resultado = String.fromCharCode(65 + (n % 26)) + resultado;
    n = Math.floor(n / 26);
  }
  return resultado;
};

type CeldaXlsx = { valor: string | number; tipo: "texto" | "numero"; estilo: number };

const celdaTexto = (valor: unknown, estilo = 0): CeldaXlsx => ({
  valor: textoSeguro(valor),
  tipo: "texto",
  estilo,
});
const celdaNumero = (valor: unknown, estilo = 0): CeldaXlsx => ({
  valor: montoSeguro(valor),
  tipo: "numero",
  estilo,
});

function hojaXml(filas: CeldaXlsx[][], anchos: number[]): string {
  const cols = anchos
    .map(
      (ancho, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${ancho}" customWidth="1"/>`,
    )
    .join("");
  const filasXml = filas
    .map((fila, indiceFila) => {
      const celdas = fila
        .map((celda, indiceCol) => {
          const ref = `${columna(indiceCol + 1)}${indiceFila + 1}`;
          if (celda.tipo === "numero") {
            return `<c r="${ref}" s="${celda.estilo}"><v>${montoSeguro(celda.valor)}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr" s="${celda.estilo}"><is><t xml:space="preserve">${xml(textoSeguro(celda.valor))}</t></is></c>`;
        })
        .join("");
      return `<row r="${indiceFila + 1}">${celdas}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols>${cols}</cols><sheetData>${filasXml}</sheetData></worksheet>`;
}

function tablaResumen(datos: DatosExportacionReporte): CeldaXlsx[][] {
  const filas: CeldaXlsx[][] = [
    [celdaTexto(datos.titulo, 1)],
    [celdaTexto(`Periodo: ${datos.periodo}`)],
    [celdaTexto(`Generado: ${datos.generadoEn} (America/Lima)`)],
    [],
    [
      celdaTexto("Concepto", 1),
      celdaTexto("Valor", 1),
      celdaTexto("Valor en soles", 1),
    ],
  ];
  for (const item of datos.resumen) {
    filas.push([
      celdaTexto(item.etiqueta),
      item.esMonto
        ? celdaNumero(item.valor, 2)
        : typeof item.valor === "number"
          ? celdaNumero(item.valor)
          : celdaTexto(item.valor),
      item.esMonto ? celdaTexto(formatoSol(item.valor)) : celdaTexto(""),
    ]);
  }
  if (datos.notas.length) {
    filas.push([]);
    for (const nota of datos.notas) filas.push([celdaTexto(nota)]);
  }
  return filas;
}

function tablaDetalle(datos: DatosExportacionReporte): CeldaXlsx[][] {
  const filas: CeldaXlsx[][] = [
    [celdaTexto("Detalle del periodo", 1)],
    [],
    [
      celdaTexto("Periodo", 1),
      celdaTexto("Recaudado (S/)", 1),
      celdaTexto("Interes (S/)", 1),
      celdaTexto("Capital (S/)", 1),
      celdaTexto("Cobros", 1),
    ],
  ];
  for (const fila of datos.detalle) {
    filas.push([
      celdaTexto(fila.etiqueta),
      celdaNumero(fila.recaudado, 2),
      celdaNumero(fila.interes, 2),
      celdaNumero(fila.capital, 2),
      celdaNumero(fila.cobros),
    ]);
  }
  filas.push([
    celdaTexto("TOTAL", 3),
    celdaNumero(
      datos.detalle.reduce((s, f) => s + montoSeguro(f.recaudado), 0),
      3,
    ),
    celdaNumero(
      datos.detalle.reduce((s, f) => s + montoSeguro(f.interes), 0),
      3,
    ),
    celdaNumero(
      datos.detalle.reduce((s, f) => s + montoSeguro(f.capital), 0),
      3,
    ),
    celdaNumero(
      datos.detalle.reduce((s, f) => s + enteroSeguro(f.cobros), 0),
      3,
    ),
  ]);
  return filas;
}

function tablaCartera(datos: DatosExportacionReporte): CeldaXlsx[][] {
  const filas: CeldaXlsx[][] = [
    [celdaTexto("Cartera y movimiento", 1)],
    [],
    [celdaTexto("Concepto", 1), celdaTexto("Monto (S/)", 1), celdaTexto("Detalle", 1)],
  ];
  for (const s of datos.cartera) {
    filas.push([celdaTexto(s.etiqueta), celdaNumero(s.monto, 2), celdaTexto(s.descripcion)]);
  }
  if (!datos.cartera.length) filas.push([celdaTexto("Sin segmentos en este reporte")]);
  filas.push([]);
  for (const m of datos.movimiento) {
    filas.push([
      celdaTexto(m.etiqueta),
      m.esMonto
        ? celdaNumero(m.valor, 2)
        : typeof m.valor === "number"
          ? celdaNumero(m.valor)
          : celdaTexto(m.valor),
    ]);
  }
  return filas;
}

const ESTILOS_XLSX = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;S/ &quot;#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const TABLA_CALCULOS = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  TABLA_CALCULOS[n] = c >>> 0;
}

function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of datos) c = TABLA_CALCULOS[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(entradas: { nombre: string; datos: Uint8Array }[]): Uint8Array {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let desplazamiento = 0;

  for (const entrada of entradas) {
    const nombre = codificador.encode(entrada.nombre);
    const crc = crc32(entrada.datos);
    const tamano = entrada.datos.length;

    const cabecera = new Uint8Array(30 + nombre.length);
    const vista = new DataView(cabecera.buffer);
    vista.setUint32(0, 0x04034b50, true);
    vista.setUint16(4, 20, true);
    vista.setUint16(6, 0x0800, true);
    vista.setUint16(8, 0, true);
    vista.setUint16(10, 0, true);
    vista.setUint16(12, 0x0021, true);
    vista.setUint32(14, crc, true);
    vista.setUint32(18, tamano, true);
    vista.setUint32(22, tamano, true);
    vista.setUint16(26, nombre.length, true);
    vista.setUint16(28, 0, true);
    cabecera.set(nombre, 30);
    local.push(cabecera, entrada.datos);

    const registro = new Uint8Array(46 + nombre.length);
    const vc = new DataView(registro.buffer);
    vc.setUint32(0, 0x02014b50, true);
    vc.setUint16(4, 20, true);
    vc.setUint16(6, 20, true);
    vc.setUint16(8, 0x0800, true);
    vc.setUint16(10, 0, true);
    vc.setUint16(12, 0, true);
    vc.setUint16(14, 0x0021, true);
    vc.setUint32(16, crc, true);
    vc.setUint32(20, tamano, true);
    vc.setUint32(24, tamano, true);
    vc.setUint16(28, nombre.length, true);
    vc.setUint32(42, desplazamiento, true);
    registro.set(nombre, 46);
    central.push(registro);

    desplazamiento += cabecera.length + tamano;
  }

  const tamanoCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new Uint8Array(22);
  const vf = new DataView(fin.buffer);
  vf.setUint32(0, 0x06054b50, true);
  vf.setUint16(8, entradas.length, true);
  vf.setUint16(10, entradas.length, true);
  vf.setUint32(12, tamanoCentral, true);
  vf.setUint32(16, desplazamiento, true);

  const total = desplazamiento + tamanoCentral + fin.length;
  const salida = new Uint8Array(total);
  let pos = 0;
  for (const parte of [...local, ...central, fin]) {
    salida.set(parte, pos);
    pos += parte.length;
  }
  return salida;
}

export function generarXlsx(datos: DatosExportacionReporte): Uint8Array {
  const hojas = [tablaResumen(datos), tablaDetalle(datos), tablaCartera(datos)];
  const contenidoTipos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("")}</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const libro = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas
    .map((_, i) => {
      const nombres = ["Resumen", "Detalle", "Cartera"];
      return `<sheet name="${nombres[i]}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`;
    })
    .join("")}</sheets></workbook>`;
  const libroRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join("")}<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  const entradas = [
    { nombre: "[Content_Types].xml", datos: codificador.encode(contenidoTipos) },
    { nombre: "_rels/.rels", datos: codificador.encode(rels) },
    { nombre: "xl/workbook.xml", datos: codificador.encode(libro) },
    { nombre: "xl/_rels/workbook.xml.rels", datos: codificador.encode(libroRels) },
    { nombre: "xl/styles.xml", datos: codificador.encode(ESTILOS_XLSX) },
  ];
  const anchos = [[38, 24, 20], [46, 18, 18, 18, 12], [38, 22, 40]];
  hojas.forEach((filas, i) => {
    entradas.push({
      nombre: `xl/worksheets/sheet${i + 1}.xml`,
      datos: codificador.encode(hojaXml(filas, anchos[i])),
    });
  });
  return zipStore(entradas);
}

/* ================================================================== */
/* PDF: Type1 + WinAnsiEncoding, una sola pasada sin librerías          */
/* ================================================================== */

type FuentePdf = "F1" | "F2" | "F3";
type LineaPdf = { texto: string; x: number; y: number; fuente: FuentePdf; tam: number };

const ANCHO_PAGINA = 595;
const ALTO_PAGINA = 842;
const MARGEN = 40;
const LIMITE_INFERIOR = 55;

const latin1 = (s: string): Uint8Array => {
  const salida = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    salida[i] = code > 255 ? 63 : code;
  }
  return salida;
};

const escaparPdf = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const recortar = (s: string, ancho: number): string => {
  const limpio = textoSeguro(s);
  if (limpio.length <= ancho) return limpio.padEnd(ancho, " ");
  return `${limpio.slice(0, Math.max(0, ancho - 3))}...`;
};

class PdfCursor {
  paginas: LineaPdf[][] = [];
  actual: LineaPdf[] = [];
  y = ALTO_PAGINA - MARGEN;

  constructor() {
    this.actual = [];
    this.paginas.push(this.actual);
  }

  salto(alto: number): void {
    this.y -= alto;
    if (this.y < LIMITE_INFERIOR) {
      this.actual = [];
      this.paginas.push(this.actual);
      this.y = ALTO_PAGINA - MARGEN;
    }
  }

  linea(texto: string, fuente: FuentePdf = "F1", tam = 9, x = MARGEN): void {
    this.lineaCruda(textoSeguro(texto), fuente, tam, x);
  }

  /** Línea ya normalizada: conserva los espacios de alineación de tablas. */
  lineaCruda(
    texto: string,
    fuente: FuentePdf = "F1",
    tam = 9,
    x = MARGEN,
  ): void {
    this.actual.push({ texto, x, y: this.y, fuente, tam });
    this.salto(tam + 4);
  }

  seccion(titulo: string): void {
    this.salto(8);
    this.linea(titulo, "F3", 11);
    this.linea("-".repeat(96), "F1", 8);
  }
}

function tablaPdf(
  cursor: PdfCursor,
  cabeceras: string[],
  filas: string[][],
  anchos: number[],
): void {
  const dibujar = (celdas: string[], negrita: boolean) =>
    cursor.lineaCruda(
      celdas.map((c, i) => recortar(c, anchos[i])).join(""),
      negrita ? "F2" : "F1",
      8,
    );

  dibujar(cabeceras, true);
  cursor.lineaCruda(
    "-".repeat(anchos.reduce((s, a) => s + a, 0)),
    "F1",
    8,
  );
  for (const fila of filas) dibujar(fila, false);
  if (!filas.length)
    dibujar(
      ["Sin registros", ...cabeceras.slice(1).map(() => "")],
      false,
    );
}

function flujoPagina(lineas: LineaPdf[]): Uint8Array {
  let contenido = "";
  for (const l of lineas) {
    contenido += `BT /${l.fuente} ${l.tam} Tf ${l.x} ${l.y} Td (${escaparPdf(l.texto)}) Tj ET\n`;
  }
  return latin1(contenido);
}

function concatenar(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((s, p) => s + p.length, 0);
  const salida = new Uint8Array(total);
  let pos = 0;
  for (const parte of partes) {
    salida.set(parte, pos);
    pos += parte.length;
  }
  return salida;
}

export function generarPdf(datos: DatosExportacionReporte): Uint8Array {
  const cursor = new PdfCursor();
  // Membrete oficial antes del título del reporte.
  cursor.linea("A&G Finanzas", "F3", 18);
  cursor.linea("Gestión de préstamos, clientes y recaudos", "F1", 8);
  cursor.linea("-".repeat(96), "F1", 8);
  cursor.linea(datos.titulo, "F3", 16);
  cursor.linea(`Periodo: ${datos.periodo}`, "F1", 9);
  cursor.linea(`Generado: ${datos.generadoEn} (America/Lima)`, "F1", 9);
  cursor.linea("Moneda: soles (S/) · Zona horaria: America/Lima", "F1", 9);

  cursor.seccion("Resumen financiero");
  tablaPdf(
    cursor,
    ["Concepto", "Valor"],
    datos.resumen.map((r) => [
      textoSeguro(r.etiqueta),
      r.esMonto
        ? formatoSol(r.valor)
        : typeof r.valor === "number"
          ? String(enteroSeguro(r.valor))
          : textoSeguro(r.valor),
    ]),
    [54, 36],
  );

  cursor.seccion("Detalle del periodo");
  tablaPdf(
    cursor,
    ["Periodo", "Recaudado", "Interes", "Capital", "Cobros"],
    datos.detalle.map((f) => [
      f.etiqueta,
      formatoSol(f.recaudado),
      formatoSol(f.interes),
      formatoSol(f.capital),
      String(enteroSeguro(f.cobros)),
    ]),
    [44, 18, 18, 18, 8],
  );

  cursor.seccion("Cartera actual");
  tablaPdf(
    cursor,
    ["Concepto", "Monto (S/)", "Detalle"],
    datos.cartera.length
      ? datos.cartera.map((s) => [s.etiqueta, formatoSol(s.monto), s.descripcion])
      : [["Sin segmentos en este reporte", "S/ 0.00", ""]],
    [50, 30, 26],
  );

  if (datos.movimiento.length) {
    cursor.seccion("Movimiento de prestamos");
    tablaPdf(
      cursor,
      ["Concepto", "Valor"],
      datos.movimiento.map((m) => [
        textoSeguro(m.etiqueta),
        m.esMonto
          ? formatoSol(m.valor)
          : typeof m.valor === "number"
            ? String(enteroSeguro(m.valor))
            : textoSeguro(m.valor),
      ]),
      [70, 20],
    );
  }

  if (datos.notas.length) {
    cursor.seccion("Notas");
    for (const nota of datos.notas) cursor.linea(`- ${nota}`, "F1", 8);
  }

  const totalPaginas = cursor.paginas.length;
  cursor.paginas.forEach((pagina, indice) => {
    pagina.push({
      texto: `Pagina ${indice + 1} de ${totalPaginas}`,
      x: MARGEN,
      y: 30,
      fuente: "F1",
      tam: 8,
    });
  });

  const objetos: Uint8Array[] = [
    codificador.encode("<< /Type /Catalog /Pages 2 0 R >>"),
    codificador.encode(""), // placeholder de /Pages
    codificador.encode(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
    ),
    codificador.encode(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>",
    ),
    codificador.encode(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    ),
  ];

  const hijos: number[] = [];
  for (const pagina of cursor.paginas) {
    const flujo = flujoPagina(pagina);
    const contenido = concatenar([
      codificador.encode(`<< /Length ${flujo.length} >>\nstream\n`),
      flujo,
      codificador.encode("\nendstream"),
    ]);
    const idContenido = objetos.push(contenido);
    const idPagina = objetos.push(
      codificador.encode(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ANCHO_PAGINA} ${ALTO_PAGINA}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${idContenido} 0 R >>`,
      ),
    );
    hijos.push(idPagina);
  }
  objetos[1] = codificador.encode(
    `<< /Type /Pages /Kids [${hijos.map((id) => `${id} 0 R`).join(" ")}] /Count ${hijos.length} >>`,
  );

  const partes: Uint8Array[] = [codificador.encode("%PDF-1.4\n")];
  const desplazamientos: number[] = [];
  let posicion = partes[0].length;
  objetos.forEach((objeto, i) => {
    desplazamientos.push(posicion);
    const bloque = concatenar([
      codificador.encode(`${i + 1} 0 obj\n`),
      objeto,
      codificador.encode("\nendobj\n"),
    ]);
    partes.push(bloque);
    posicion += bloque.length;
  });

  const xref = posicion;
  let tabla = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const d of desplazamientos) {
    tabla += `${String(d).padStart(10, "0")} 00000 n \n`;
  }
  tabla += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  partes.push(codificador.encode(tabla));
  return concatenar(partes);
}

/* ================================================================== */
/* Descarga en navegador                                                */
/* ================================================================== */

export function descargarArchivo(
  bytes: Uint8Array,
  nombre: string,
  mime: string,
): void {
  if (typeof document === "undefined") return;
  const copia = new Uint8Array(bytes);
  const blob = new Blob([copia.buffer as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.style.display = "none";
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // Revocar de inmediato puede cancelar la descarga en algunos navegadores.
  const revocar = () => URL.revokeObjectURL(url);
  if (typeof window !== "undefined") window.setTimeout(revocar, 1000);
  else setTimeout(revocar, 1000);
}
