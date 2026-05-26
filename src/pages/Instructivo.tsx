// src/pages/Instructivo.tsx
// Instructivo de uso del sistema Censo Salvatierra.
// Paso por paso, organizado por HOJA (censo, dietas, recetario, control,
// productividad). Mismo contenido para todos los usuarios — sin etiquetas
// de rol ni alcance.
//
// Accesible desde Dashboard. Imprimible. Mobile-friendly.

import { useNavigate } from 'react-router-dom';

interface Bloque {
  titulo: string;
  pasos: string[];
}

interface Seccion {
  key: string;
  numero: string;
  titulo: string;
  icono: string;
  subtitulo: string;
  color: string;
  contenido: Bloque[];
}

const SECCIONES: Seccion[] = [
  // ============================================================
  // 1. ARRANQUE
  // ============================================================
  {
    key: 'arranque',
    numero: '1',
    titulo: 'Cómo entrar y abrir un servicio',
    icono: '🚪',
    subtitulo: 'Login, navegación al servicio, instalación como app',
    color: '#0E6755',
    contenido: [
      {
        titulo: '1.1. Iniciar sesión',
        pasos: [
          'Abre la liga: censo-salvatierra.pages.dev',
          'Captura tu correo (con el que te dieron de alta) y tu contraseña.',
          'Toca "Iniciar sesión".',
          'Si olvidaste tu contraseña, toca "Olvidé mi contraseña" y sigue las instrucciones del correo que te llegará.',
        ],
      },
      {
        titulo: '1.2. Instalar como app en tu dispositivo',
        pasos: [
          'iPhone/iPad (Safari): ícono compartir 📤 → "Agregar a pantalla de inicio".',
          'Android (Chrome): menú 3 puntos ⋮ → "Instalar aplicación".',
          'Después aparece como ícono en tu pantalla, igual que cualquier app.',
        ],
      },
      {
        titulo: '1.3. Entrar a un servicio',
        pasos: [
          'En la pantalla principal verás tarjetas con los servicios del hospital y su porcentaje de ocupación.',
          'Toca la tarjeta del servicio que quieras revisar (ej. URGENCIAS, PEDIATRIA, etc.).',
          'Dentro del servicio aparecen las camas por subservicio (OBSERVACIÓN, ANEXOS, CAMILLAS, etc.).',
          'Arriba ves 5 pestañas: 🏥 Censo · 🍽️ Dietas · 💊 Recetario · 📋 Control · 📊 Productividad.',
          'La pestaña activa por default es Censo.',
        ],
      },
    ],
  },

  // ============================================================
  // 2. HOJA CENSO
  // ============================================================
  {
    key: 'censo',
    numero: '2',
    titulo: 'Hoja Censo',
    icono: '🏥',
    subtitulo: 'Ingresos, egresos, traslados y datos del paciente',
    color: '#1F4E79',
    contenido: [
      {
        titulo: '2.1. Ingresar un paciente nuevo',
        pasos: [
          'Localiza la cama disponible donde se asignará el paciente.',
          'Toca la cama vacía. Se abre el modal "INGRESO DE PACIENTE".',
          'Llena los campos: Nombre completo (en MAYÚSCULAS), Edad, Sexo, NSS/CURP/Expediente, Diagnóstico de ingreso, Especialidad.',
          'La Fecha y Hora de ingreso se llenan solas con el momento actual (puedes ajustarlas si el paciente ingresó antes).',
          'Si tiene observaciones especiales (aislamiento, vigilar, etc.) escríbelas en el campo Observaciones.',
          'Toca "✓ Registrar ingreso" para confirmar.',
        ],
      },
      {
        titulo: '2.2. Ver y editar datos del paciente',
        pasos: [
          'Toca la cama ocupada del paciente que quieres revisar.',
          'Se expande la tarjeta del paciente con todos sus datos.',
          'Si necesitas corregir algún dato (nombre, edad, diagnóstico), toca el ícono ✎ junto al campo.',
          'Modifica y guarda con ✓.',
        ],
      },
      {
        titulo: '2.3. Egresar un paciente (alta / defunción / traslado / fuga)',
        pasos: [
          'Toca la cama del paciente a egresar.',
          'En la tarjeta del paciente, toca "Egresar".',
          'Selecciona el motivo de egreso: Alta por curación, Alta por máximo beneficio, Traslado, Defunción, Fuga, Otro.',
          'La fecha y hora de egreso se llenan solas con el momento actual (ajustables si corresponde).',
          'Toca "Confirmar egreso".',
          'El paciente pasa al historial y la cama queda disponible.',
        ],
      },
      {
        titulo: '2.4. Camas no censables (CAMILLAS y SILLAS en URGENCIAS)',
        pasos: [
          'Las camillas (PASILLO 01–10) y sillas (SILLA 1–8) funcionan igual que cualquier cama: se ingresa, se egresa, se llenan las otras hojas.',
          'Diferencia: NO cuentan para el porcentaje de ocupación censable del servicio.',
          'Se ven con franjas diagonales y la etiqueta "NO CENSABLE".',
        ],
      },
    ],
  },

  // ============================================================
  // 3. HOJA DIETAS
  // ============================================================
  {
    key: 'dietas',
    numero: '3',
    titulo: 'Hoja Dietas',
    icono: '🍽️',
    subtitulo: 'Indicaciones nutricionales por paciente',
    color: '#5CAB34',
    contenido: [
      {
        titulo: '3.1. Capturar la dieta del paciente',
        pasos: [
          'En el servicio, toca la pestaña "🍽️ Dietas".',
          'Verás la lista de pacientes activos con su renglón para dieta.',
          'Selecciona el tipo de dieta del catálogo (Líquidos claros, Blanda, Hiposódica, etc.).',
          'Selecciona la consistencia (Normal, Picada, Pure, Líquida, etc.).',
          'Si la dieta es especial o requiere observación, anótalo en Notas.',
        ],
      },
      {
        titulo: '3.2. Modificar la dieta',
        pasos: [
          'Toca el campo que vas a cambiar (tipo, consistencia o notas).',
          'Modifica y guarda.',
          'El cambio queda registrado con tu nombre y la hora exacta.',
        ],
      },
      {
        titulo: '3.3. Imprimir la hoja de dietas del servicio',
        pasos: [
          'En la pestaña Dietas, busca el botón "🖨️ Imprimir".',
          'Se abre una vista lista para imprimir con todos los pacientes activos y su dieta indicada.',
        ],
      },
    ],
  },

  // ============================================================
  // 4. HOJA RECETARIO
  // ============================================================
  {
    key: 'recetario',
    numero: '4',
    titulo: 'Hoja Recetario',
    icono: '💊',
    subtitulo: 'Medicamentos indicados por paciente',
    color: '#7d5b2f',
    contenido: [
      {
        titulo: '4.1. Agregar un medicamento al paciente',
        pasos: [
          'Pestaña "💊 Recetario" → toca al paciente.',
          'Toca "+ Agregar medicamento".',
          'Empieza a escribir el nombre y aparecerán sugerencias del catálogo (594 medicamentos disponibles).',
          'Selecciona el medicamento de la lista.',
          'Captura: dosis, vía (oral, IV, IM, SC, etc.), frecuencia y duración.',
          'Toca "Guardar".',
        ],
      },
      {
        titulo: '4.2. Modificar o eliminar un medicamento',
        pasos: [
          'En la lista de medicamentos del paciente, toca el ✎ para editar o el ✕ para eliminar.',
          'Si modificas, confirma con ✓.',
          'Si eliminas, te pide confirmación antes de quitarlo.',
        ],
      },
      {
        titulo: '4.3. Imprimir el recetario del servicio',
        pasos: [
          'En la pestaña Recetario, toca "🖨️ Imprimir".',
          'Se genera la vista con todos los pacientes y sus medicamentos.',
        ],
      },
    ],
  },

  // ============================================================
  // 5. HOJA CONTROL
  // ============================================================
  {
    key: 'control',
    numero: '5',
    titulo: 'Hoja Control',
    icono: '📋',
    subtitulo: 'Eventos clínicos: sondas, accesos vasculares, curaciones, procedimientos',
    color: '#A32D2D',
    contenido: [
      {
        titulo: '5.1. Agregar un evento clínico al paciente',
        pasos: [
          'Pestaña "📋 Control" → toca al paciente.',
          'Toca "+ Nuevo evento".',
          'Selecciona el tipo de evento:',
          '   • Sondas (urinaria, gástrica, pleurostomía)',
          '   • Accesos vasculares (CVC, CVP, catéter umbilical)',
          '   • Oxigenoterapia (puntas, mascarilla, etc.)',
          '   • Dispositivos (ventilación mecánica, etc.)',
          '   • Curaciones (UPP, herida quirúrgica, etc.)',
          '   • Procedimientos invasivos',
          '   • Precauciones de aislamiento',
          'Captura los detalles del evento y toca "Guardar".',
        ],
      },
      {
        titulo: '5.2. Marcar un evento como REALIZADO',
        pasos: [
          'Toca el evento en la tarjeta del paciente.',
          'Toca "⏱️ Ahora" para marcar la hora actual.',
          '(O cambia el estado a "Realizada" si fue en otro momento.)',
        ],
      },
      {
        titulo: '5.3. Editar fecha/hora de un evento ya registrado',
        pasos: [
          'Toca el ícono ✎ junto a la fecha del evento.',
          'Selecciona la fecha y hora correctas.',
          'Confirma con ✓.',
        ],
      },
      {
        titulo: '5.4. Retirar una sonda o acceso vascular',
        pasos: [
          'Cuando se retira el dispositivo, cambia el estado del evento a "Retirada".',
          'Esto registra automáticamente la fecha/hora de retiro.',
        ],
      },
      {
        titulo: '5.5. Cancelar un evento creado por error',
        pasos: [
          'Toca el ✕ del evento.',
          'Confirma la cancelación.',
          'Nota: el evento NO se borra del historial; solo queda marcado como "Cancelado".',
        ],
      },
      {
        titulo: '5.6. Riesgos (UPP / caídas)',
        pasos: [
          'En la tarjeta del paciente, hay campos para "Riesgo UPP" y "Riesgo Caídas".',
          'Selecciona el nivel del catálogo (Bajo / Mediano / Alto / Muy alto).',
          'Estos datos viajan al concentrado del servicio.',
        ],
      },
    ],
  },

  // ============================================================
  // 6. HOJA PRODUCTIVIDAD
  // ============================================================
  {
    key: 'productividad',
    numero: '6',
    titulo: 'Hoja Productividad',
    icono: '📊',
    subtitulo: 'Indicadores de enfermería por día y turno',
    color: '#5978BB',
    contenido: [
      {
        titulo: '6.1. Cómo funciona la productividad automática',
        pasos: [
          'La mayoría de los indicadores se llenan SOLOS cuando registras los eventos clínicos en la Hoja Control.',
          'Ejemplos automáticos:',
          '   • Ingresar a un paciente → +1 en "Ingresos"',
          '   • Marcar sonda urinaria → +1 en S01',
          '   • Curación UPP marcada como realizada → +1 en CUR1',
          '   • Procedimiento invasivo → +1 en PRC1',
          'No necesitas capturar manualmente estos números.',
        ],
      },
      {
        titulo: '6.2. Capturar productividad manual',
        pasos: [
          'Pestaña "📊 Productividad" → selecciona el día (por default hoy) y el turno (M / V / N).',
          'Verás una tabla con los indicadores institucionales.',
          'Para los indicadores que NO se calculan solos (ej. orientaciones a familiares, eventos adversos), toca la celda y captura el número.',
          'Guarda con ✓.',
        ],
      },
      {
        titulo: '6.3. Revisar productividad del mes',
        pasos: [
          'En la pestaña Productividad, cambia el rango a "Mes".',
          'Verás el acumulado por turno (M / V / N) y por día.',
          'Toca "🖨️ Imprimir" para sacar el reporte mensual oficial.',
          'Toca "📥 Exportar Excel" o "📄 PDF" si necesitas el archivo.',
        ],
      },
    ],
  },

  // ============================================================
  // 7. ASIGNACIÓN DE PACIENTES POR TURNO
  // ============================================================
  {
    key: 'asignacion',
    numero: '7',
    titulo: 'Asignación de pacientes por turno',
    icono: '👥',
    subtitulo: 'Cómo asignar pacientes al personal de enfermería',
    color: '#C39C59',
    contenido: [
      {
        titulo: '7.1. Asignar paciente a una enfermera del turno',
        pasos: [
          'En la Hoja Censo, toca el badge "Sin asignar" que aparece junto a la cama del paciente.',
          'Se abre el modal de asignación.',
          'Selecciona el turno (M / V / N) y la enfermera del catálogo.',
          'Confirma. La enfermera asignada podrá editar la Hoja Control de ese paciente durante su turno.',
        ],
      },
      {
        titulo: '7.2. Reasignar o quitar asignación',
        pasos: [
          'Toca el badge de la enfermera ya asignada.',
          'Selecciona otra enfermera o usa "Quitar asignación".',
          'El cambio se registra con tu nombre y hora.',
        ],
      },
      {
        titulo: '7.3. Continuidad entre turnos',
        pasos: [
          'Las sondas, accesos vasculares y precauciones de aislamiento se "heredan" automáticamente al siguiente turno.',
          'No necesitas re-capturarlos cada vez que cambia el turno.',
          'Solo tienes que actualizarlos si hubo un cambio real (retiro, cambio de sitio, etc.).',
        ],
      },
    ],
  },

  // ============================================================
  // 8. TABLERO GENERAL
  // ============================================================
  {
    key: 'tablero',
    numero: '8',
    titulo: 'Tablero general',
    icono: '📈',
    subtitulo: 'Vista consolidada del hospital o de un servicio',
    color: '#265C4E',
    contenido: [
      {
        titulo: '8.1. Acceder al Tablero',
        pasos: [
          'Desde la pantalla principal, toca el botón "📊 Tablero Maestro" en la barra superior.',
          'Verás los KPIs del día: Camas totales, Ocupadas, Disponibles, % de ocupación.',
          'En URGENCIAS también aparece el KPI "Camillas/Sillas" con los espacios extra.',
        ],
      },
      {
        titulo: '8.2. Cambiar el periodo (Día / Semana / Mes)',
        pasos: [
          'En la parte superior del Tablero, hay tabs para Día, Semana, Mes.',
          'Selecciona el periodo deseado.',
          'Los datos del resumen y la productividad se actualizan al instante.',
        ],
      },
      {
        titulo: '8.3. Exportar el reporte',
        pasos: [
          'En el Tablero, toca "📥 Exportar Excel" para el reporte tabular.',
          'O "📄 Exportar PDF" para una versión imprimible.',
        ],
      },
    ],
  },

  // ============================================================
  // 9. CIERRE
  // ============================================================
  {
    key: 'cierre',
    numero: '9',
    titulo: 'Cerrar sesión y cambiar contraseña',
    icono: '🔐',
    subtitulo: 'Seguridad de tu cuenta',
    color: '#888780',
    contenido: [
      {
        titulo: '9.1. Cambiar tu contraseña',
        pasos: [
          'En la barra superior del Dashboard, toca "🔑 Contrasena".',
          'Captura tu contraseña actual.',
          'Define la nueva contraseña (mínimo 6 caracteres) y confírmala.',
          'Toca "Guardar nueva contraseña".',
          'La próxima vez que inicies sesión usa la nueva.',
        ],
      },
      {
        titulo: '9.2. Cerrar sesión',
        pasos: [
          'En la barra superior toca "Cerrar sesión".',
          'Si compartes el dispositivo con otro compañero, SIEMPRE cierra sesión antes de pasárselo.',
        ],
      },
      {
        titulo: '9.3. Recomendaciones de seguridad',
        pasos: [
          'Tu acceso es personal e intransferible.',
          'No compartas tu contraseña con nadie, ni siquiera con tu compañero de turno.',
          'Cambia tu contraseña inicial cuanto antes después de tu primer ingreso.',
          'Cada acción que realices en el sistema queda registrada con tu identidad y la hora exacta.',
        ],
      },
    ],
  },
];

export function Instructivo() {
  const navigate = useNavigate();

  return (
    <div style={contenedor} className="instructivo-page">
      {/* HEADER */}
      <header style={header} className="no-print">
        <button onClick={() => navigate('/')} style={botonVolver}>← Tablero</button>
        <div style={{ flex: 1, textAlign: 'center', minWidth: 220 }}>
          <h1 style={titulo}>📖 Instructivo del Sistema</h1>
          <div style={subtitulo}>Censo Salvatierra · IMSS-Bienestar BCS</div>
        </div>
        <button onClick={() => window.print()} style={botonImprimir}>🖨️ Imprimir</button>
      </header>

      {/* INTRO */}
      <div style={introContenedor} className="no-print">
        <p style={introTexto}>
          Guía paso a paso para llenar el sistema desde un servicio. Las instrucciones aplican
          igual para todos los usuarios; los permisos los maneja el sistema automáticamente.
        </p>
      </div>

      {/* SECCIONES */}
      <main style={main}>
        {SECCIONES.map(seccion => (
          <section key={seccion.key} style={seccionContenedor}>
            <div style={{ ...seccionHeader, background: seccion.color }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <span style={numeroBadge}>{seccion.numero}</span>
                <h2 style={seccionTitulo}>
                  <span style={{ marginRight: 8 }}>{seccion.icono}</span>
                  {seccion.titulo}
                </h2>
              </div>
              <p style={seccionSubtitulo}>{seccion.subtitulo}</p>
            </div>

            <div style={seccionCuerpo}>
              {seccion.contenido.map((bloque, idx) => (
                <div key={idx} style={bloqueContenedor}>
                  {bloque.titulo && <h3 style={bloqueTitulo}>{bloque.titulo}</h3>}
                  <ol style={listaOl}>
                    {bloque.pasos.map((paso, i) => (
                      <li key={i} style={pasoItem}>{paso}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>

      <footer style={footer}>
        <p>Hospital General "Juan María de Salvatierra" · IMSS-Bienestar Baja California Sur</p>
        <p style={{ fontSize: 11, marginTop: 4 }}>
          Dudas, sugerencias o problemas técnicos → contacta al subjefe de enfermería.
        </p>
      </footer>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .instructivo-page { background: white !important; }
          section { page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// ESTILOS
// ============================================================
const COLOR_FONDO = '#F5F1E8';
const COLOR_DORADO = '#C39C59';
const COLOR_VERDE_IMSS = '#0E6755';
const COLOR_TEXTO = '#2C2A26';

const contenedor: React.CSSProperties = {
  minHeight: '100vh',
  background: COLOR_FONDO,
  paddingBottom: 40,
};

const header: React.CSSProperties = {
  background: '#FFFFFF',
  borderBottom: `3px solid ${COLOR_DORADO}`,
  padding: '14px 20px',
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
  position: 'sticky',
  top: 0,
  zIndex: 10,
};

const botonVolver: React.CSSProperties = {
  padding: '8px 14px',
  background: COLOR_VERDE_IMSS,
  color: COLOR_DORADO,
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 500,
};

const botonImprimir: React.CSSProperties = {
  ...botonVolver,
  background: COLOR_DORADO,
  color: '#FFFFFF',
};

const titulo: React.CSSProperties = {
  margin: 0,
  fontSize: 19,
  color: COLOR_VERDE_IMSS,
  fontWeight: 600,
};

const subtitulo: React.CSSProperties = {
  fontSize: 11,
  color: '#665e51',
  marginTop: 2,
};

const introContenedor: React.CSSProperties = {
  maxWidth: 900,
  margin: '20px auto 0',
  padding: '0 20px',
};

const introTexto: React.CSSProperties = {
  fontSize: 13,
  color: COLOR_TEXTO,
  background: '#FFFFFF',
  border: `1px solid ${COLOR_DORADO}`,
  borderRadius: 6,
  padding: '12px 16px',
  lineHeight: 1.5,
  margin: 0,
};

const main: React.CSSProperties = {
  maxWidth: 900,
  margin: '0 auto',
  padding: '20px',
};

const seccionContenedor: React.CSSProperties = {
  background: '#FFFFFF',
  border: `1px solid ${COLOR_DORADO}`,
  borderRadius: 8,
  marginBottom: 20,
  overflow: 'hidden',
};

const seccionHeader: React.CSSProperties = {
  padding: '14px 20px',
  color: '#FFFFFF',
};

const numeroBadge: React.CSSProperties = {
  background: 'rgba(255,255,255,0.25)',
  padding: '4px 10px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
};

const seccionTitulo: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
};

const seccionSubtitulo: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: 12,
  opacity: 0.9,
};

const seccionCuerpo: React.CSSProperties = {
  padding: '18px 24px',
};

const bloqueContenedor: React.CSSProperties = {
  marginBottom: 16,
};

const bloqueTitulo: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: 14,
  color: COLOR_VERDE_IMSS,
  fontWeight: 600,
};

const listaOl: React.CSSProperties = {
  margin: 0,
  paddingLeft: 22,
};

const pasoItem: React.CSSProperties = {
  fontSize: 13,
  color: COLOR_TEXTO,
  lineHeight: 1.55,
  marginBottom: 4,
};

const footer: React.CSSProperties = {
  textAlign: 'center',
  padding: '20px',
  color: '#665e51',
  fontSize: 12,
};
