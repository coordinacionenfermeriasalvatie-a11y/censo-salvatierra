// src/utils/encabezadoExcel.ts
// =====================================================================
// Encabezado institucional UNIFICADO para las exportaciones a Excel.
// Equivalente al componente <EncabezadoOficial> de las hojas de impresión:
// logos institucionales sobre fondo BLANCO (sin bandas de color) + 3 renglones
// de texto (hospital / coordinación·CLUES / tipo de formato).
//
// Lo usan exportarProductividad.ts y exportarBitacora.ts para verse idénticos.
// =====================================================================

import ExcelJS from 'exceljs';

const COLOR_VERDE_IMSS = 'FF0E6755';
const COLOR_VERDE_OSCURO = 'FF265C4E';
const COLOR_CAFE = 'FF7D5B2F';

// Relación de aspecto real de los logos (ancho/alto), para no deformarlos al
// fijar la altura.
const ASPECTO_SALUD = 2034 / 272;
const ASPECTO_HOSPITAL = 1280 / 280;

// Excel mide el ancho de columna en "caracteres"; conversión aproximada a px
// (Calibri 11, MDW = 7) para anclar el logo derecho al borde de la hoja.
const widthToPx = (w: number) => Math.round(w * 7) + 5;

function pxToColAnchor(charWidths: number[], targetPx: number): number {
  let acc = 0;
  for (let i = 0; i < charWidths.length; i++) {
    const wpx = widthToPx(charWidths[i]);
    if (acc + wpx > targetPx) return i + Math.max(0, (targetPx - acc) / wpx);
    acc += wpx;
  }
  return charWidths.length;
}

// Descarga un logo (mismo origen) y lo devuelve como data-URI base64 para
// incrustarlo en el workbook. No es fatal si falla: el encabezado de texto
// se imprime igual.
async function cargarLogoDataUri(path: string): Promise<string | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
    }
    return 'data:image/png;base64,' + btoa(bin);
  } catch {
    return null;
  }
}

export interface LogosWorkbook {
  idSalud: number | null;
  idHospital: number | null;
}

// Descarga ambos logos y los registra una sola vez en el workbook. El id
// devuelto se reutiliza en todas las hojas (cada hoja llama a addImage).
export async function cargarLogosWorkbook(workbook: ExcelJS.Workbook): Promise<LogosWorkbook> {
  const [saludUri, hospUri] = await Promise.all([
    cargarLogoDataUri('/logos/salud_imss_bienestar.png'),
    cargarLogoDataUri('/logos/LOGO_HOSPITAL.png'),
  ]);
  return {
    idSalud: saludUri ? workbook.addImage({ base64: saludUri, extension: 'png' }) : null,
    idHospital: hospUri ? workbook.addImage({ base64: hospUri, extension: 'png' }) : null,
  };
}

// Inserta el encabezado institucional en las filas 1-4 de la hoja:
//   Fila 1 — logos sobre fondo blanco (izq: salud · der: hospital)
//   Fila 2 — nombre del hospital
//   Fila 3 — Coordinación de Enfermería · CLUES
//   Fila 4 — tipo de formato (+ subtítulo / período opcional)
// charWidths = ancho (en caracteres) de cada columna usada, para centrar el
// texto y anclar el logo derecho.
export function insertarEncabezadoExcel(
  sheet: ExcelJS.Worksheet,
  opts: { titulo: string; subtitulo?: string; charWidths: number[]; logos: LogosWorkbook },
): void {
  const { titulo, subtitulo, charWidths, logos } = opts;
  const ancho = charWidths.length;

  // Fila 1 — Logos institucionales sobre fondo blanco (sin bandas de color).
  sheet.mergeCells(1, 1, 1, ancho);
  sheet.getRow(1).height = 30;
  const logoH = 32;
  if (logos.idSalud !== null) {
    const w = Math.round(logoH * ASPECTO_SALUD);
    sheet.addImage(logos.idSalud, { tl: { col: 0.1, row: 0.12 }, ext: { width: w, height: logoH } });
  }
  if (logos.idHospital !== null) {
    const w = Math.round(logoH * ASPECTO_HOSPITAL);
    const totalPx = charWidths.reduce((a, cw) => a + widthToPx(cw), 0);
    const tlCol = pxToColAnchor(charWidths, Math.max(0, totalPx - w - 4));
    sheet.addImage(logos.idHospital, { tl: { col: tlCol, row: 0.12 }, ext: { width: w, height: logoH } });
  }

  // Fila 2 — Nombre del hospital (una sola línea, igual que el encabezado impreso)
  sheet.mergeCells(2, 1, 2, ancho);
  const c2 = sheet.getCell(2, 1);
  c2.value = 'BENEMÉRITO HOSPITAL GENERAL CON ESPECIALIDADES IMSS-BIENESTAR "JUAN MARÍA DE SALVATIERRA"';
  c2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR_VERDE_IMSS } };
  c2.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };
  sheet.getRow(2).height = 18;

  // Fila 3 — Coordinación de Enfermería + CLUES
  sheet.mergeCells(3, 1, 3, ancho);
  const c3 = sheet.getCell(3, 1);
  c3.value = 'COORDINACIÓN DE ENFERMERÍA · CLUES BSIMB000672';
  c3.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR_CAFE } };
  c3.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(3).height = 15;

  // Fila 4 — Tipo de formato + período / fecha de elaboración
  sheet.mergeCells(4, 1, 4, ancho);
  const c4 = sheet.getCell(4, 1);
  c4.value = subtitulo ? `${titulo}   ·   ${subtitulo}` : titulo;
  c4.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR_VERDE_OSCURO } };
  c4.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };
  sheet.getRow(4).height = 16;
}
