// Exporta la bitácora de un día a Excel con 3 hojas (turno M/V/N)
// + portada con resumen. Estilo institucional IMSS-Bienestar.

import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { cargarLogosWorkbook, insertarEncabezadoExcel } from './encabezadoExcel';

interface BitacoraRow {
  folio: string;
  creado_en: string;
  turno: 'M' | 'V' | 'N';
  estado_aprobacion: string;
  aprobado_nombre: string | null;
  paciente_cama: string | null;
  paciente_nombre: string;
  paciente_edad: number | null;
  paciente_edad_unidad: string | null;
  paciente_genero: string | null;
  paciente_nss_curp: string | null;
  paciente_diagnostico: string | null;
  paciente_subservicio: string | null;
  servicio_codigo: string | null;
  medicamento_nombre: string;
  medicamento_grupo: string;
  dosis: string | null;
  via: string | null;
  frecuencia: string | null;
  cantidad_numero: string | null;
  cantidad_letra: string | null;
  medico_nombre: string | null;
  medico_cedula: string | null;
  enfermera_nombre: string;
  enfermera_matricula: string | null;
  observaciones: string | null;
}

const COLOR_HEADER = 'FF0E6755';
const COLOR_HEADER_FG = 'FFFFFFFF';
const COLOR_ALT = 'FFF5F1E8';

const HEADERS = [
  'Folio', 'Hora', 'Servicio', 'Subservicio', 'Cama',
  'Nombre del Paciente', 'Edad', 'Género', 'NSS / Expediente',
  'Diagnóstico Principal', 'Medicamento', 'Grupo',
  'Dosis', 'Vía', 'Frecuencia',
  'Cantidad (N°)', 'Cantidad (letra)',
  'Médico', 'Cédula', 'Enfermero Solicita', 'Matrícula',
  'Estado', 'Supervisora (aprobó)', 'Observaciones',
];

const turnoLabel = (t: 'M' | 'V' | 'N') => ({ M: 'Matutino', V: 'Vespertino', N: 'Nocturno' }[t]);

export async function exportarBitacoraDia(
  fechaIso: string,
  filas: BitacoraRow[],
  generadoPor: string,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = generadoPor;
  wb.created = new Date();

  // Logos institucionales: se descargan una vez y se reutilizan en todas las hojas.
  const logos = await cargarLogosWorkbook(wb);

  // === Portada / Resumen ===
  const portada = wb.addWorksheet('Resumen');
  const WIDTHS_PORTADA = [32, 50];
  WIDTHS_PORTADA.forEach((w, i) => { portada.getColumn(i + 1).width = w; });

  // Encabezado institucional unificado (logos + 3 renglones, filas 1-4).
  // El nombre del hospital y la CLUES ya van dentro del encabezado.
  insertarEncabezadoExcel(portada, {
    titulo: 'BITÁCORA DE SUPERVISIÓN — MEDICAMENTOS CONTROLADOS (GRUPOS I-V LGS)',
    subtitulo: `Fecha del día: ${fechaIso}`,
    charWidths: WIDTHS_PORTADA,
    logos,
  });

  const total = filas.length;
  const pend = filas.filter(f => f.estado_aprobacion === 'pendiente').length;
  const apro = filas.filter(f => f.estado_aprobacion === 'aprobada').length;
  const canj = filas.filter(f => f.estado_aprobacion === 'canjeada').length;
  const rech = filas.filter(f => f.estado_aprobacion === 'rechazada').length;

  // Metadatos y resumen (a partir de la fila 6)
  const info: [string, string | number][] = [
    ['Ciudad', 'La Paz, Baja California Sur'],
    ['Generado por', generadoPor],
    ['Generado el', new Date().toLocaleString('es-MX')],
    ['', ''],
    ['Total de vales', total],
    ['Pendientes', pend],
    ['Aprobadas', apro],
    ['Canjeadas', canj],
    ['Rechazadas', rech],
  ];
  info.forEach(([label, value], idx) => {
    const row = portada.getRow(6 + idx);
    row.getCell(1).value = label;
    row.getCell(2).value = value;
    if (label) row.getCell(1).font = { bold: true, color: { argb: 'FF7D5B2F' } };
  });

  // === Una hoja por turno ===
  // Anchos de columna (también se usan para anclar el logo derecho del encabezado).
  const WIDTHS_TURNO = [12, 8, 10, 14, 8, 28, 10, 8, 16, 28, 22, 8, 12, 8, 12, 10, 14, 22, 12, 22, 12, 14, 22, 22];

  for (const turno of ['M', 'V', 'N'] as const) {
    const filasTurno = filas.filter(f => f.turno === turno);
    const ws = wb.addWorksheet(`Turno ${turnoLabel(turno)}`, {
      views: [{ state: 'frozen', ySplit: 5 }],
      pageSetup: { paperSize: 5, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });

    WIDTHS_TURNO.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    // Encabezado institucional unificado (logos + 3 renglones, filas 1-4)
    insertarEncabezadoExcel(ws, {
      titulo: `BITÁCORA DE SUPERVISIÓN — TURNO ${turnoLabel(turno).toUpperCase()}`,
      subtitulo: `Fecha: ${fechaIso}`,
      charWidths: WIDTHS_TURNO,
      logos,
    });

    // Fila 5 — encabezados de columna
    const headerRow = ws.getRow(5);
    headerRow.values = HEADERS;
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER } };
      cell.font = { bold: true, color: { argb: COLOR_HEADER_FG }, size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' },
      };
    });
    headerRow.height = 32;

    // Filas de datos (a partir de la fila 6)
    filasTurno.forEach((f, idx) => {
      const hora = new Date(f.creado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      const row = ws.getRow(6 + idx);
      row.values = [
        f.folio, hora,
        f.servicio_codigo, f.paciente_subservicio, f.paciente_cama,
        f.paciente_nombre,
        `${f.paciente_edad ?? ''} ${f.paciente_edad_unidad ?? ''}`.trim(),
        f.paciente_genero, f.paciente_nss_curp,
        f.paciente_diagnostico,
        f.medicamento_nombre, f.medicamento_grupo,
        f.dosis, f.via, f.frecuencia,
        f.cantidad_numero, f.cantidad_letra,
        f.medico_nombre, f.medico_cedula,
        f.enfermera_nombre, f.enfermera_matricula,
        f.estado_aprobacion.toUpperCase(),
        f.aprobado_nombre,
        f.observaciones,
      ];

      if (idx % 2 === 1) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ALT } };
        });
      }
      row.eachCell(cell => {
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.font = { size: 9 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
          left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
          bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
          right: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        };
      });
      // Color por estado
      const estadoCell = row.getCell(22);
      const colorByEstado: Record<string, string> = {
        PENDIENTE: 'FFFFF7E0', APROBADA: 'FFDFF5E6', CANJEADA: 'FFE0E8FF', RECHAZADA: 'FFFBEAEA',
      };
      const c = colorByEstado[estadoCell.value as string];
      if (c) {
        estadoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
        estadoCell.font = { size: 9, bold: true };
      }
    });

    // Pie con conteo
    const pieRow = ws.getRow(6 + filasTurno.length + 1);
    pieRow.getCell(1).value = `Total turno ${turnoLabel(turno)}: ${filasTurno.length} vale${filasTurno.length !== 1 ? 's' : ''}`;
    pieRow.getCell(1).font = { bold: true, italic: true, color: { argb: 'FF7D5B2F' } };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `Bitacora_Supervision_${fechaIso}.xlsx`);
}
