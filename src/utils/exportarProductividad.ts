// src/utils/exportarProductividad.ts
// =====================================================================
// BLOQUE 7 — Exportación de Productividad Mensual a Excel
// =====================================================================
// Genera un archivo .xlsx con formato institucional IMSS-Bienestar:
//   - Banda dorada + banda verde con CLUES
//   - 1 hoja CONSOLIDADO (73 indicadores × N servicios + TOTAL GENERAL)
//   - 1 hoja por servicio (73 indicadores × T_M / T_V / T_N / T_MES)
//   - 1 hoja METADATA (auditoría: conteo por origen, parámetros, firmas)
//
// Uso:
//   import { exportarProductividadMensual } from '../utils/exportarProductividad';
//   await exportarProductividadMensual(2026, 5, 'Stavros Ayala', 'subjefe');
//
// Dependencias: exceljs, file-saver
// =====================================================================

import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { supabase } from '../lib/supabase';

const COLOR_DORADO = 'FFC39C59';
const COLOR_VERDE_IMSS = 'FF0E6755';
const COLOR_VERDE_OSCURO = 'FF265C4E';
const COLOR_BEIGE = 'FFF5F1E8';
const COLOR_BLANCO = 'FFFFFFFF';
const COLOR_AUTO_ING         = 'FFC8E6C9';  // verde claro
const COLOR_AUTO_TURNO       = 'FFBBDEFB';  // azul claro
const COLOR_MANUAL           = 'FFFFFDE7';  // amarillo claro
const COLOR_AUTO_EVENTO      = 'FFE1BEE7';  // lavanda  - desde evento_apoyo_paciente realizado
const COLOR_AUTO_CONTINUIDAD = 'FFFFE0B2';  // durazno  - desde cron de continuidad por turno

const MESES_TEXTO = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

interface FilaExport {
  servicio_id: number;
  servicio_codigo: string;
  servicio_nombre: string;
  servicio_orden: number;
  indicador_id: number;
  indicador_codigo: string;
  proceso_id: number;
  proceso_nom: string;
  subproceso: string | null;
  indicador_etiqueta: string;
  catalogo_origen: string;
  indicador_orden: number;
  anio: number | null;
  mes: number | null;
  total_m: number;
  total_v: number;
  total_n: number;
  total_mes: number;
  total_auto_ing: number;
  total_auto_turno: number;
  total_manual: number;
  capturas_auto_ing: number;
  capturas_auto_turno: number;
  capturas_manual: number;
}

// =====================================================================
// HELPER — Aplicar fuente, alineación, borde estándar a una celda
// =====================================================================

function aplicarBordeCelda(cell: ExcelJS.Cell) {
  cell.border = {
    top:    { style: 'thin', color: { argb: 'FFAAAAAA' } },
    left:   { style: 'thin', color: { argb: 'FFAAAAAA' } },
    bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } },
    right:  { style: 'thin', color: { argb: 'FFAAAAAA' } },
  };
}

function aplicarEstiloEncabezado(cell: ExcelJS.Cell) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_VERDE_IMSS } };
  cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR_BLANCO } };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  aplicarBordeCelda(cell);
}

function aplicarEstiloDatoTexto(cell: ExcelJS.Cell) {
  cell.font = { name: 'Calibri', size: 10 };
  cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  aplicarBordeCelda(cell);
}

function aplicarEstiloDatoNumero(cell: ExcelJS.Cell, origen?: string) {
  cell.font = { name: 'Calibri', size: 10, bold: false };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.numFmt = '#,##0';
  if (origen === 'AUTO_ING') {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_AUTO_ING } };
  } else if (origen === 'AUTO_TURNO') {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_AUTO_TURNO } };
  } else if (origen === 'AUTO_EVENTO') {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_AUTO_EVENTO } };
  } else if (origen === 'AUTO_CONTINUIDAD') {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_AUTO_CONTINUIDAD } };
  } else if (origen === 'MANUAL') {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_MANUAL } };
  }
  aplicarBordeCelda(cell);
}

// =====================================================================
// HELPER — Insertar encabezado institucional en una hoja
// =====================================================================

function insertarEncabezadoInstitucional(
  sheet: ExcelJS.Worksheet,
  titulo: string,
  subtitulo: string,
  anchoColumnas: number
) {
  // Fila 1 — Banda dorada
  sheet.mergeCells(1, 1, 1, anchoColumnas);
  const c1 = sheet.getCell(1, 1);
  c1.value = 'BENEMÉRITO HOSPITAL GENERAL CON ESPECIALIDADES DEL IMSS-BIENESTAR';
  c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_DORADO } };
  c1.font = { name: 'Calibri', size: 13, bold: true, color: { argb: COLOR_BLANCO } };
  c1.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 26;

  // Fila 2 — Banda verde con CLUES
  sheet.mergeCells(2, 1, 2, anchoColumnas);
  const c2 = sheet.getCell(2, 1);
  c2.value = '"JUAN MARÍA DE SALVATIERRA" — CLUES BSIMB000672';
  c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_VERDE_IMSS } };
  c2.font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR_BLANCO } };
  c2.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(2).height = 22;

  // Fila 3 — Subtítulo
  sheet.mergeCells(3, 1, 3, anchoColumnas);
  const c3 = sheet.getCell(3, 1);
  c3.value = titulo;
  c3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BLANCO } };
  c3.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR_VERDE_IMSS } };
  c3.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(3).height = 22;

  // Fila 4 — Subtítulo secundario / período
  sheet.mergeCells(4, 1, 4, anchoColumnas);
  const c4 = sheet.getCell(4, 1);
  c4.value = subtitulo;
  c4.font = { name: 'Calibri', size: 10, italic: true, color: { argb: COLOR_VERDE_OSCURO } };
  c4.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(4).height = 18;
}

// =====================================================================
// HELPER — Insertar pie con firmas en una hoja
// =====================================================================

function insertarPieFirmas(
  sheet: ExcelJS.Worksheet,
  fila: number,
  anchoColumnas: number,
  nombreFirmante: string,
  rolFirmante: string
) {
  // Espacio
  sheet.getRow(fila).height = 24;

  // Línea de firma (2 columnas)
  const colMitad = Math.ceil(anchoColumnas / 2);

  // Firma izquierda — Elaboró
  sheet.mergeCells(fila + 1, 1, fila + 1, colMitad);
  const cE = sheet.getCell(fila + 1, 1);
  cE.value = '_______________________________________';
  cE.alignment = { horizontal: 'center', vertical: 'middle' };
  cE.font = { name: 'Calibri', size: 10 };

  sheet.mergeCells(fila + 1, colMitad + 1, fila + 1, anchoColumnas);
  const cR = sheet.getCell(fila + 1, colMitad + 1);
  cR.value = '_______________________________________';
  cR.alignment = { horizontal: 'center', vertical: 'middle' };
  cR.font = { name: 'Calibri', size: 10 };

  // Etiquetas de firma
  sheet.mergeCells(fila + 2, 1, fila + 2, colMitad);
  const lE = sheet.getCell(fila + 2, 1);
  lE.value = `ELABORÓ\n${nombreFirmante}\n${rolFirmante.toUpperCase()}`;
  lE.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  lE.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR_VERDE_IMSS } };

  sheet.mergeCells(fila + 2, colMitad + 1, fila + 2, anchoColumnas);
  const lR = sheet.getCell(fila + 2, colMitad + 1);
  lR.value = 'JEFE DE ENFERMERÍA\nNombre / Firma';
  lR.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  lR.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR_VERDE_IMSS } };

  sheet.getRow(fila + 2).height = 40;
}

// =====================================================================
// FUNCIÓN PRINCIPAL
// =====================================================================

export async function exportarProductividadMensual(
  anio: number,
  mes: number,
  nombreFirmante: string,
  rolFirmante: string
): Promise<void> {
  // 1. Traer todos los datos del mes en una sola query
  const { data, error } = await supabase
    .from('v_productividad_export_mensual')
    .select('*')
    .or(`anio.eq.${anio},anio.is.null`)
    .or(`mes.eq.${mes},mes.is.null`);

  if (error) {
    throw new Error(`No se pudieron cargar datos: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('No hay datos de productividad para exportar este mes.');
  }

  // Filtrar: queremos las filas del mes/año Y las filas donde anio/mes son NULL (sin capturas)
  const filas = (data as FilaExport[]).filter(f =>
    (f.anio === anio && f.mes === mes) || (f.anio === null && f.mes === null)
  );

  // Agrupar: servicios y indicadores
  const serviciosMap = new Map<number, { codigo: string; nombre: string; orden: number }>();
  const indicadoresMap = new Map<number, {
    codigo: string;
    etiqueta: string;
    proceso_id: number;
    proceso_nom: string;
    subproceso: string | null;
    orden: number;
    catalogo_origen: string;
  }>();

  filas.forEach(f => {
    serviciosMap.set(f.servicio_id, {
      codigo: f.servicio_codigo,
      nombre: f.servicio_nombre,
      orden: f.servicio_orden,
    });
    indicadoresMap.set(f.indicador_id, {
      codigo: f.indicador_codigo,
      etiqueta: f.indicador_etiqueta,
      proceso_id: f.proceso_id,
      proceso_nom: f.proceso_nom,
      subproceso: f.subproceso,
      orden: f.indicador_orden,
      catalogo_origen: f.catalogo_origen,
    });
  });

  const servicios = Array.from(serviciosMap.entries())
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => a.orden - b.orden);

  const indicadores = Array.from(indicadoresMap.entries())
    .map(([id, i]) => ({ id, ...i }))
    .sort((a, b) => {
      if (a.proceso_id !== b.proceso_id) return a.proceso_id - b.proceso_id;
      return a.orden - b.orden;
    });

  // Acceso rápido: filaMap.get(`${servicio_id}-${indicador_id}`) = fila
  const filaMap = new Map<string, FilaExport>();
  filas.forEach(f => {
    filaMap.set(`${f.servicio_id}-${f.indicador_id}`, f);
  });

  // =====================================================================
  // CONSTRUIR WORKBOOK
  // =====================================================================
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Censo Salvatierra';
  workbook.company = 'Benemérito Hospital General con Especialidades del IMSS-Bienestar Juan María de Salvatierra · CLUES BSIMB000672';
  workbook.created = new Date();

  const periodoTexto = `PERIODO: ${MESES_TEXTO[mes - 1]} ${anio}`;
  const fechaElaboracion = `Elaborado: ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mazatlan' })}`;

  // =====================================================================
  // HOJA 1 — CONSOLIDADO
  // =====================================================================
  {
    const sheet = workbook.addWorksheet('CONSOLIDADO', {
      views: [{ state: 'frozen', xSplit: 2, ySplit: 7 }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });

    const totalCols = 2 + servicios.length + 1; // COD + INDICADOR + N servicios + TOTAL

    insertarEncabezadoInstitucional(
      sheet,
      'PRODUCTIVIDAD MENSUAL CONSOLIDADA POR SERVICIO',
      `${periodoTexto}    ·    ${fechaElaboracion}`,
      totalCols
    );

    // Fila 5 — vacía
    sheet.getRow(5).height = 8;

    // Fila 6 — encabezados
    const headerRow = sheet.getRow(6);
    headerRow.values = ['CÓDIGO', 'INDICADOR', ...servicios.map(s => s.codigo), 'TOTAL'];
    headerRow.eachCell((cell) => aplicarEstiloEncabezado(cell));
    headerRow.height = 32;

    // Fila 7 — nombres completos de servicios (segunda línea encabezado)
    const headerRow2 = sheet.getRow(7);
    headerRow2.values = ['', '', ...servicios.map(s => s.nombre), 'GRAN TOTAL'];
    headerRow2.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BEIGE } };
      cell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: COLOR_VERDE_OSCURO } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      aplicarBordeCelda(cell);
    });
    headerRow2.height = 30;

    // Filas de datos
    let filaActual = 8;
    let procesoActual = -1;

    indicadores.forEach(ind => {
      // Header de proceso si cambió
      if (ind.proceso_id !== procesoActual) {
        sheet.mergeCells(filaActual, 1, filaActual, totalCols);
        const procCell = sheet.getCell(filaActual, 1);
        procCell.value = `▶ ${ind.proceso_id}. ${ind.proceso_nom}`;
        procCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BEIGE } };
        procCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR_VERDE_IMSS } };
        procCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        aplicarBordeCelda(procCell);
        sheet.getRow(filaActual).height = 22;
        filaActual++;
        procesoActual = ind.proceso_id;
      }

      // Fila del indicador
      const row = sheet.getRow(filaActual);
      const valores: any[] = [ind.codigo, ind.etiqueta];

      let totalIndicador = 0;
      servicios.forEach(sv => {
        const fila = filaMap.get(`${sv.id}-${ind.id}`);
        const v = fila?.total_mes ?? 0;
        valores.push(v);
        totalIndicador += v;
      });
      valores.push(totalIndicador);

      row.values = valores;

      // Estilos
      aplicarEstiloDatoTexto(row.getCell(1));
      row.getCell(1).font = { name: 'Calibri', size: 9, bold: true, color: { argb: '666666' } };
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

      aplicarEstiloDatoTexto(row.getCell(2));

      for (let col = 3; col <= 2 + servicios.length; col++) {
        aplicarEstiloDatoNumero(row.getCell(col));
      }

      // Total (última columna): negrita
      const totalCell = row.getCell(2 + servicios.length + 1);
      aplicarEstiloDatoNumero(totalCell);
      totalCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR_VERDE_IMSS } };
      totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

      filaActual++;
    });

    // Fila GRAN TOTAL
    const granTotalRow = sheet.getRow(filaActual);
    sheet.mergeCells(filaActual, 1, filaActual, 2);
    granTotalRow.getCell(1).value = '▶ GRAN TOTAL';
    granTotalRow.getCell(1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR_BLANCO } };
    granTotalRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_VERDE_OSCURO } };
    granTotalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    aplicarBordeCelda(granTotalRow.getCell(1));

    let sumaGeneral = 0;
    servicios.forEach((sv, idx) => {
      const sumaSv = indicadores.reduce((acc, ind) => {
        const fila = filaMap.get(`${sv.id}-${ind.id}`);
        return acc + (fila?.total_mes ?? 0);
      }, 0);
      sumaGeneral += sumaSv;
      const c = granTotalRow.getCell(3 + idx);
      c.value = sumaSv;
      c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR_BLANCO } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_VERDE_OSCURO } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.numFmt = '#,##0';
      aplicarBordeCelda(c);
    });

    const gtCell = granTotalRow.getCell(2 + servicios.length + 1);
    gtCell.value = sumaGeneral;
    gtCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR_BLANCO } };
    gtCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_VERDE_OSCURO } };
    gtCell.alignment = { horizontal: 'center', vertical: 'middle' };
    gtCell.numFmt = '#,##0';
    aplicarBordeCelda(gtCell);
    granTotalRow.height = 26;

    // Anchos de columna
    sheet.getColumn(1).width = 8;   // CÓDIGO
    sheet.getColumn(2).width = 45;  // INDICADOR
    for (let col = 3; col <= 2 + servicios.length; col++) {
      sheet.getColumn(col).width = 12;
    }
    sheet.getColumn(2 + servicios.length + 1).width = 13;  // TOTAL

    // Pie con firmas
    insertarPieFirmas(sheet, filaActual + 3, totalCols, nombreFirmante, rolFirmante);
  }

  // =====================================================================
  // HOJAS POR SERVICIO
  // =====================================================================
  servicios.forEach(sv => {
    // Nombre de hoja: máximo 31 caracteres en Excel
    const nombreHoja = sv.nombre.substring(0, 31);
    const sheet = workbook.addWorksheet(nombreHoja, {
      views: [{ state: 'frozen', xSplit: 2, ySplit: 7 }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
    });

    insertarEncabezadoInstitucional(
      sheet,
      `PRODUCTIVIDAD MENSUAL — ${sv.nombre.toUpperCase()}`,
      `${periodoTexto}    ·    ${fechaElaboracion}`,
      6
    );

    sheet.getRow(5).height = 8;

    // Fila 6 — encabezados
    const header = sheet.getRow(6);
    header.values = ['CÓDIGO', 'INDICADOR', 'T_M', 'T_V', 'T_N', 'T_MES'];
    header.eachCell(cell => aplicarEstiloEncabezado(cell));
    header.height = 28;

    // Fila 7 — sub-encabezados (descripción de turnos)
    const sub = sheet.getRow(7);
    sub.values = ['', '', 'MATUTINO', 'VESPERTINO', 'NOCTURNO', 'TOTAL MES'];
    sub.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BEIGE } };
      cell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: COLOR_VERDE_OSCURO } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      aplicarBordeCelda(cell);
    });
    sub.height = 18;

    let filaActual = 8;
    let procesoActual = -1;
    let totalMServicio = 0, totalVServicio = 0, totalNServicio = 0, totalMesServicio = 0;

    indicadores.forEach(ind => {
      // Header de proceso si cambió
      if (ind.proceso_id !== procesoActual) {
        sheet.mergeCells(filaActual, 1, filaActual, 6);
        const procCell = sheet.getCell(filaActual, 1);
        procCell.value = `▶ ${ind.proceso_id}. ${ind.proceso_nom}`;
        procCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BEIGE } };
        procCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR_VERDE_IMSS } };
        procCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        aplicarBordeCelda(procCell);
        sheet.getRow(filaActual).height = 22;
        filaActual++;
        procesoActual = ind.proceso_id;
      }

      const fila = filaMap.get(`${sv.id}-${ind.id}`);
      const tM = fila?.total_m ?? 0;
      const tV = fila?.total_v ?? 0;
      const tN = fila?.total_n ?? 0;
      const tMes = fila?.total_mes ?? 0;

      totalMServicio += tM;
      totalVServicio += tV;
      totalNServicio += tN;
      totalMesServicio += tMes;

      const row = sheet.getRow(filaActual);
      row.values = [ind.codigo, ind.etiqueta, tM, tV, tN, tMes];

      const c1 = row.getCell(1);
      aplicarEstiloDatoTexto(c1);
      c1.font = { name: 'Calibri', size: 9, bold: true, color: { argb: '666666' } };
      c1.alignment = { horizontal: 'center', vertical: 'middle' };

      aplicarEstiloDatoTexto(row.getCell(2));

      // Color de fondo según origen del catálogo (background de info)
      const colorOrigen = ind.catalogo_origen === 'AUTO_ING'   ? 'AUTO_ING' :
                          ind.catalogo_origen === 'AUTO_TURNO' ? 'AUTO_TURNO' : 'MANUAL';
      aplicarEstiloDatoNumero(row.getCell(3), colorOrigen);
      aplicarEstiloDatoNumero(row.getCell(4), colorOrigen);
      aplicarEstiloDatoNumero(row.getCell(5), colorOrigen);

      const totalCell = row.getCell(6);
      aplicarEstiloDatoNumero(totalCell);
      totalCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR_VERDE_IMSS } };
      totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

      filaActual++;
    });

    // GRAN TOTAL DEL SERVICIO
    const gt = sheet.getRow(filaActual);
    sheet.mergeCells(filaActual, 1, filaActual, 2);
    gt.getCell(1).value = '▶ GRAN TOTAL DEL SERVICIO';
    gt.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_VERDE_OSCURO } };
    gt.getCell(1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR_BLANCO } };
    gt.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    aplicarBordeCelda(gt.getCell(1));

    [totalMServicio, totalVServicio, totalNServicio, totalMesServicio].forEach((v, idx) => {
      const c = gt.getCell(3 + idx);
      c.value = v;
      c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR_BLANCO } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_VERDE_OSCURO } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.numFmt = '#,##0';
      aplicarBordeCelda(c);
    });
    gt.height = 26;

    // Anchos
    sheet.getColumn(1).width = 8;
    sheet.getColumn(2).width = 52;
    sheet.getColumn(3).width = 11;
    sheet.getColumn(4).width = 11;
    sheet.getColumn(5).width = 11;
    sheet.getColumn(6).width = 13;

    insertarPieFirmas(sheet, filaActual + 3, 6, nombreFirmante, rolFirmante);
  });

  // =====================================================================
  // HOJA METADATA — Auditoría por origen
  // =====================================================================
  {
    const sheet = workbook.addWorksheet('METADATA', {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true },
    });

    insertarEncabezadoInstitucional(
      sheet,
      'METADATA DE AUDITORÍA — DESGLOSE POR ORIGEN DE CAPTURA',
      `${periodoTexto}    ·    ${fechaElaboracion}`,
      5
    );

    sheet.getRow(5).height = 8;

    // Tabla resumen por servicio y origen
    const header = sheet.getRow(6);
    header.values = ['SERVICIO', 'AUTO_ING (sistema)', 'AUTO_TURNO (cierre turno)', 'MANUAL (enfermera)', 'TOTAL'];
    header.eachCell(cell => aplicarEstiloEncabezado(cell));
    header.height = 32;

    let filaActual = 7;
    let totalAutoIng = 0, totalAutoTurno = 0, totalManual = 0, totalAll = 0;

    servicios.forEach(sv => {
      const sumas = indicadores.reduce((acc, ind) => {
        const fila = filaMap.get(`${sv.id}-${ind.id}`);
        return {
          ai: acc.ai + (fila?.total_auto_ing ?? 0),
          at: acc.at + (fila?.total_auto_turno ?? 0),
          mn: acc.mn + (fila?.total_manual ?? 0),
        };
      }, { ai: 0, at: 0, mn: 0 });

      const total = sumas.ai + sumas.at + sumas.mn;
      totalAutoIng += sumas.ai;
      totalAutoTurno += sumas.at;
      totalManual += sumas.mn;
      totalAll += total;

      const row = sheet.getRow(filaActual);
      row.values = [sv.nombre, sumas.ai, sumas.at, sumas.mn, total];

      aplicarEstiloDatoTexto(row.getCell(1));
      row.getCell(1).font = { name: 'Calibri', size: 10, bold: true };

      aplicarEstiloDatoNumero(row.getCell(2), 'AUTO_ING');
      aplicarEstiloDatoNumero(row.getCell(3), 'AUTO_TURNO');
      aplicarEstiloDatoNumero(row.getCell(4), 'MANUAL');

      const tc = row.getCell(5);
      aplicarEstiloDatoNumero(tc);
      tc.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR_VERDE_IMSS } };

      filaActual++;
    });

    // Total final
    const gt = sheet.getRow(filaActual);
    gt.values = ['TOTAL HOSPITAL', totalAutoIng, totalAutoTurno, totalManual, totalAll];
    [1, 2, 3, 4, 5].forEach(col => {
      const c = gt.getCell(col);
      c.font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR_BLANCO } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_VERDE_OSCURO } };
      c.alignment = { horizontal: col === 1 ? 'left' : 'center', vertical: 'middle', indent: col === 1 ? 1 : 0 };
      if (col > 1) c.numFmt = '#,##0';
      aplicarBordeCelda(c);
    });
    gt.height = 28;

    // Porcentajes
    filaActual += 3;
    const explicacion = sheet.getRow(filaActual);
    sheet.mergeCells(filaActual, 1, filaActual, 5);
    explicacion.getCell(1).value =
      `Distribución del trabajo: AUTO_ING ${pct(totalAutoIng, totalAll)} · AUTO_TURNO ${pct(totalAutoTurno, totalAll)} · MANUAL ${pct(totalManual, totalAll)}`;
    explicacion.getCell(1).font = { name: 'Calibri', size: 11, italic: true, color: { argb: COLOR_VERDE_OSCURO } };
    explicacion.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

    filaActual += 2;

    // Notas
    const notas = [
      'AUTO_ING:         capturas autollenadas por el sistema al registrar ingreso de paciente o instalación de dispositivo en VistaFormatoControl.',
      'AUTO_TURNO:       capturas autollenadas al detectar cambio de turno (M/V/N) según horarios institucionales BCS.',
      'AUTO_EVENTO:      capturas autollenadas al marcar un evento como Realizada en la sección de eventos del paciente.',
      'AUTO_CONTINUIDAD: capturas autollenadas por pg_cron al inicio de cada turno para items de continuidad activos (sondas, accesos, oxígeno).',
      'MANUAL:           capturas hechas directamente por personal de enfermería en la pestaña Productividad.',
      '',
      `Periodo:          ${MESES_TEXTO[mes - 1]} ${anio}`,
      `Generado:         ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mazatlan' })}`,
      `Sistema:          Censo Salvatierra v1.0`,
      `Hospital:         Benemérito Hospital General con Especialidades del IMSS-Bienestar "Juan María de Salvatierra"`,
      `CLUES:            BSIMB000672`,
      `Firmante:         ${nombreFirmante} (${rolFirmante})`,
    ];

    notas.forEach((nota, idx) => {
      sheet.mergeCells(filaActual + idx, 1, filaActual + idx, 5);
      const c = sheet.getCell(filaActual + idx, 1);
      c.value = nota;
      c.font = { name: 'Calibri', size: 10, color: { argb: '444444' } };
      c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    });

    sheet.getColumn(1).width = 40;
    sheet.getColumn(2).width = 22;
    sheet.getColumn(3).width = 25;
    sheet.getColumn(4).width = 22;
    sheet.getColumn(5).width = 15;
  }

  // =====================================================================
  // GENERAR Y DESCARGAR
  // =====================================================================
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const nombreArchivo = `Productividad_BCS_Salvatierra_${MESES_TEXTO[mes - 1]}_${anio}.xlsx`;
  saveAs(blob, nombreArchivo);
}

// =====================================================================
// HELPER — porcentaje
// =====================================================================
function pct(parte: number, total: number): string {
  if (total === 0) return '0%';
  return `${((parte / total) * 100).toFixed(1)}%`;
}
