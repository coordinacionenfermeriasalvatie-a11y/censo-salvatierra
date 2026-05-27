// src/pages/components/VistaInstructivoHDL.tsx
// Instructivo dedicado del servicio HEMODIALISIS. Cubre el flujo
// especial de ingreso (CURP + fecha nac + tipo de terapia obligatorios)
// y cómo los datos alimentan automáticamente Censo ERC y Productividad.
import React from 'react';

interface Bloque {
  titulo?: string;
  pasos: string[];
}
interface Seccion {
  numero: string;
  titulo: string;
  subtitulo: string;
  icono: string;
  color: string;
  contenido: Bloque[];
}

const SECCIONES: Seccion[] = [
  {
    numero: '1',
    icono: '🩺',
    titulo: 'Cómo funciona este servicio',
    subtitulo: 'Lo que hace diferente a HEMODIÁLISIS del resto del hospital',
    color: '#0E6755',
    contenido: [
      {
        pasos: [
          'HEMODIÁLISIS tiene 3 camillas físicas no censables, pero también lleva un censo histórico amplio de pacientes con Enfermedad Renal Crónica (ERC) que reciben Terapia de Sustitución Renal.',
          'Cada ingreso a una camilla queda registrado en 3 lugares automáticamente: el Censo del servicio, la bitácora Censo ERC y la productividad mensual del hospital (P05 o P06 según el tipo de terapia).',
          'Las camillas no afectan el % de ocupación del Tablero Maestro porque son no censables.',
          'Solo los gestores asignados a HEMODIÁLISIS y los administradores (jefe/subjefe/supervisor) pueden ingresar o egresar pacientes aquí.',
        ],
      },
    ],
  },
  {
    numero: '2',
    icono: '➕',
    titulo: 'Ingresar un paciente nuevo en HEMODIÁLISIS',
    subtitulo: 'Flujo especial: CURP + fecha de nacimiento + tipo de terapia OBLIGATORIOS',
    color: '#0E6755',
    contenido: [
      {
        titulo: '2.1. Pasos generales',
        pasos: [
          'En la pestaña 🏥 Censo, toca cualquier camilla disponible (fondo beige).',
          'Aparece el selector: elige "📝 Registrar ingreso de paciente".',
          'Se abre el modal "INGRESO DE PACIENTE — CAMILLA N".',
          'Llena los campos básicos: Nombre completo (APELLIDOS NOMBRES en MAYÚSCULAS), Edad, Sexo, Diagnóstico, Especialidad, Fecha y Hora de ingreso.',
        ],
      },
      {
        titulo: '2.2. Bloque especial 🩺 INGRESO HEMODIÁLISIS',
        pasos: [
          'En este bloque (resaltado en verde) tienes que llenar OBLIGATORIAMENTE los 3 campos:',
          '   • CURP — los 18 caracteres en mayúsculas. Si la dejas incompleta el sistema no guarda.',
          '   • Fecha de nacimiento — selecciona la fecha real en el calendario.',
          '   • Tipo de terapia sustitutiva — elige una de las 4 opciones:',
          '       ◦ Hemodiálisis',
          '       ◦ DPCA — Diálisis Peritoneal Continua Ambulatoria',
          '       ◦ DPA — Diálisis Peritoneal Automatizada',
          '       ◦ DPI — Diálisis Peritoneal Intermitente',
          'Debajo del dropdown te dice qué indicador de productividad se va a llenar (P05 para DP, P06 para HD). Es solo informativo.',
        ],
      },
      {
        titulo: '2.3. Otros datos opcionales (recomendado)',
        pasos: [
          'Grupo y RH — para la Tarjeta de Identificación 🪪',
          'Alergias — si tiene, escríbelas. Vacío = NO alergias.',
          'Riesgo de Caídas y Riesgo UPP — evaluación inicial. Se traza a Control.',
          'Observaciones — texto libre.',
        ],
      },
      {
        titulo: '2.4. Toca "✓ Registrar ingreso"',
        pasos: [
          'El sistema realiza automáticamente 3 acciones simultáneas:',
          '   1. Inserta al paciente en la camilla.',
          '   2. Crea una entrada en la bitácora 🩺 Censo ERC con los datos completos.',
          '   3. Suma +1 al indicador correcto de Productividad del día y turno actuales (P06 Hemodiálisis o P05 Diálisis peritoneal).',
          'No tienes que hacer nada más. Las 3 hojas se sincronizan solas.',
        ],
      },
    ],
  },
  {
    numero: '3',
    icono: '📋',
    titulo: 'Pestaña 🩺 Censo ERC — bitácora histórica',
    subtitulo: 'Censo independiente de pacientes con Enfermedad Renal Crónica',
    color: '#1a5f8a',
    contenido: [
      {
        titulo: '3.1. Qué es y por qué existe',
        pasos: [
          'Es una bitácora separada del censo de camillas. Acumula CADA vez que un paciente recibe una sesión de terapia (no deduplica).',
          'Vienen pre-cargados 208 registros históricos consolidados de los archivos institucionales.',
          'Cada ingreso nuevo que hagas con tipo de terapia se agrega automáticamente como una entrada más.',
        ],
      },
      {
        titulo: '3.2. KPIs en la parte superior',
        pasos: [
          'Total — total acumulado de sesiones registradas',
          'Activos — pacientes sin EGRESO/BAJA/DEFUNCION en su estatus',
          'Hemodiálisis — sesiones que fueron HD',
          'Diálisis peritoneal (DP) — sesiones que fueron DPCA / DPA / DPI',
        ],
      },
      {
        titulo: '3.3. Buscar y filtrar',
        pasos: [
          '🔎 Buscador — escribe nombre, CURP o cama',
          'Dropdown terapia — filtra solo HD, DPCA, DPA o DPI',
          'Dropdown estatus — todos / solo activos / solo egresados',
        ],
      },
    ],
  },
  {
    numero: '4',
    icono: '📊',
    titulo: 'Pestaña Productividad — indicadores P05 / P06 / P07',
    subtitulo: 'Cómo se llenan solos y qué te toca capturar manualmente',
    color: '#5b3a8a',
    contenido: [
      {
        titulo: '4.1. Auto-llenado por ingreso',
        pasos: [
          'P05 (Diálisis) — se suma sola por cada ingreso con tipo DPCA / DPA / DPI.',
          'P06 (Hemodiálisis) — se suma sola por cada ingreso con tipo Hemodiálisis.',
          'Ambas aparecen en color lavanda (AUTO-EVENTO) — no se editan manualmente.',
        ],
      },
      {
        titulo: '4.2. Manual',
        pasos: [
          'P07 (PRISMA / terapia de reemplazo continua) — sigue siendo manual. Captúrala al cierre del turno cuando aplique.',
          'Otros indicadores: H01–H05 (heridas), K01 (caídas), K04 (REA), K05 (QAPE) — manuales como en cualquier servicio.',
        ],
      },
    ],
  },
  {
    numero: '5',
    icono: '📈',
    titulo: 'Tablero Maestro — visión histórica del jefe',
    subtitulo: 'Cómo se ven los datos de HEMODIÁLISIS a nivel hospital',
    color: '#7d5b2f',
    contenido: [
      {
        pasos: [
          'El jefe / subjefe / supervisor ve una sección dedicada "🩺 HEMODIÁLISIS Y DIÁLISIS" en el Tablero Maestro.',
          'Pacientes ERC (bitácora total) — TODOS los registros históricos, sin filtros.',
          'ERC activos hoy — pacientes con estatus distinto a EGRESO/BAJA/DEFUNCION.',
          'Hemodiálisis del mes (P06) — suma del periodo seleccionado (día/semana/mes).',
          'Diálisis peritoneal del mes (P05) — suma del periodo seleccionado.',
          'Las camillas de HEMODIÁLISIS NO entran al % de ocupación censable del hospital.',
        ],
      },
    ],
  },
  {
    numero: '6',
    icono: '🚪',
    titulo: 'Egreso del paciente',
    subtitulo: 'Igual que cualquier servicio',
    color: '#A32D2D',
    contenido: [
      {
        pasos: [
          'Toca la camilla ocupada del paciente a egresar.',
          'Selecciona el MOTIVO: ALTA POR MEJORÍA / DEFUNCIÓN / TRASLADO / ALTA VOLUNTARIA / etc.',
          'La fecha y hora se llenan con el momento actual (ajustables).',
          'Toca "🚪 Registrar egreso".',
          'La camilla queda DISPONIBLE para la siguiente sesión.',
          'En la bitácora Censo ERC el registro queda con su estatus original — si quieres marcarla como EGRESADA manualmente, edítala desde la tabla.',
        ],
      },
    ],
  },
];

export const VistaInstructivoHDL: React.FC = () => {
  return (
    <div style={contenedor}>
      <div style={cabecera}>
        <div style={cabeceraTitulo}>
          📖 INSTRUCTIVO HEMODIÁLISIS
        </div>
        <div style={cabeceraSubtitulo}>
          Guía exclusiva del servicio. Lee antes de capturar tu primer ingreso.
        </div>
      </div>

      {SECCIONES.map(s => (
        <section key={s.numero} style={seccionBox}>
          <div style={{ ...seccionBanda, background: s.color }}>
            <span style={seccionNumero}>{s.numero}</span>
            <span style={seccionIcono}>{s.icono}</span>
            <div>
              <div style={seccionTituloTxt}>{s.titulo}</div>
              <div style={seccionSubtituloTxt}>{s.subtitulo}</div>
            </div>
          </div>
          <div style={seccionBody}>
            {s.contenido.map((b, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                {b.titulo && <div style={bloqueTitulo}>{b.titulo}</div>}
                <ol style={lista}>
                  {b.pasos.map((p, j) => (
                    <li key={j} style={paso}>{p}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>
      ))}

      <div style={pie}>
        <strong>Cualquier duda</strong> contacta a la Subjefatura de Enfermería.
        <br />
        Hospital General con Especialidades "Juan María de Salvatierra" — IMSS-Bienestar
      </div>
    </div>
  );
};

// ---- estilos ----
const contenedor: React.CSSProperties = { maxWidth: 900, margin: '0 auto', padding: '8px 4px' };
const cabecera: React.CSSProperties = { background: '#0E6755', color: '#fff', borderRadius: 6, padding: '14px 18px', marginBottom: 16 };
const cabeceraTitulo: React.CSSProperties = { fontSize: 18, fontWeight: 800, letterSpacing: 0.5 };
const cabeceraSubtitulo: React.CSSProperties = { fontSize: 13, opacity: 0.9, marginTop: 4 };
const seccionBox: React.CSSProperties = { background: '#fff', border: '1px solid #C39C59', borderRadius: 6, marginBottom: 14, overflow: 'hidden' };
const seccionBanda: React.CSSProperties = { color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 };
const seccionNumero: React.CSSProperties = { background: 'rgba(255,255,255,0.25)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16 };
const seccionIcono: React.CSSProperties = { fontSize: 22 };
const seccionTituloTxt: React.CSSProperties = { fontSize: 15, fontWeight: 700 };
const seccionSubtituloTxt: React.CSSProperties = { fontSize: 12, opacity: 0.85, marginTop: 2 };
const seccionBody: React.CSSProperties = { padding: '14px 18px', background: '#fdfaf2' };
const bloqueTitulo: React.CSSProperties = { fontWeight: 700, fontSize: 13, color: '#7d5b2f', marginBottom: 6 };
const lista: React.CSSProperties = { margin: 0, paddingLeft: 24, color: '#265C4E' };
const paso: React.CSSProperties = { marginBottom: 6, fontSize: 13, lineHeight: 1.5 };
const pie: React.CSSProperties = { background: '#F5F1E8', border: '1px dashed #C39C59', borderRadius: 6, padding: 14, textAlign: 'center', fontSize: 12, color: '#7d5b2f' };
