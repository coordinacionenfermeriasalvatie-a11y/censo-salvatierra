// src/pages/Instructivo.tsx
// Instructivo de uso del sistema Censo Salvatierra, organizado por
// NIVELES DE PRIVILEGIO DE ACCESO. Cada nivel anuncia explicitamente
// que puede y que no puede hacer, y los pasos operativos correspondientes.
//
// Accesible desde Dashboard. Imprimible. Mobile-friendly.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { Rol } from '../types';

type NivelKey = 'matriz' | 'comun' | 'n1_total' | 'n2_hospital' | 'n3_servicio' | 'n4_captura';

interface Permiso {
  texto: string;
  permitido: boolean;
}

interface Bloque {
  titulo: string;
  pasos: string[];
}

interface Seccion {
  key: NivelKey;
  nivel?: string;             // "Nivel 1", "Nivel 2"...
  titulo: string;
  roles?: string;             // ej. "jefe / subjefe"
  subtitulo: string;
  color: string;
  permisos?: Permiso[];        // bullets de "Sí puede / No puede"
  contenido: Bloque[];
}

const SECCIONES: Seccion[] = [
  // ============================================================
  // MATRIZ COMPARATIVA (siempre visible)
  // ============================================================
  {
    key: 'matriz',
    titulo: 'Niveles de privilegio del sistema',
    subtitulo: 'Resumen comparativo: qué puede hacer cada nivel',
    color: '#265C4E',
    contenido: [
      {
        titulo: '',
        pasos: [
          'El sistema tiene 4 niveles de privilegio jerárquicos. Cada usuario pertenece a UN nivel según su rol asignado.',
          'NIVEL 1 — Acceso Total (jefe / subjefe): hospital completo, Tablero Día/Semana/Mes, reportes mensuales oficiales, gestión de usuarios.',
          'NIVEL 2 — Acceso Hospital (supervisor): ve y edita todos los servicios, Tablero solo Día, sin reportes mensuales ni alta de usuarios.',
          'NIVEL 3 — Acceso Servicio (jefe de servicio / gestor): edita un solo servicio asignado, Tablero solo Día de su servicio.',
          'NIVEL 4 — Captura (enfermera de piso): captura en un solo servicio asignado, sin acceso al Tablero Maestro.',
        ],
      },
    ],
  },

  // ============================================================
  // COMÚN A TODOS
  // ============================================================
  {
    key: 'comun',
    titulo: 'Operaciones comunes a todos los niveles',
    subtitulo: 'Login, instalación y cierre de sesión',
    color: '#0E6755',
    contenido: [
      {
        titulo: '1. Iniciar sesión',
        pasos: [
          'Abre la URL: censo-salvatierra.vercel.app',
          'Captura tu correo institucional y la contraseña que recibiste al darte de alta.',
          'Si olvidaste tu contraseña, contacta al subjefe de enfermería para que la restablezca.',
        ],
      },
      {
        titulo: '2. Instalar como app en tu dispositivo',
        pasos: [
          'iPhone/iPad (Safari): ícono compartir → "Agregar a pantalla de inicio".',
          'Android (Chrome): menú 3 puntos → "Instalar app" o "Agregar a pantalla principal".',
          'La app abre en pantalla completa sin barra del navegador, con el ícono del hospital.',
        ],
      },
      {
        titulo: '3. Cerrar sesión',
        pasos: [
          'Click el botón "Cerrar sesión" arriba a la derecha de cualquier pantalla.',
          'Importante: al terminar tu turno, cierra sesión si compartes la tablet con otra enfermera.',
        ],
      },
    ],
  },

  // ============================================================
  // NIVEL 1 — ACCESO TOTAL
  // ============================================================
  {
    key: 'n1_total',
    nivel: 'Nivel 1',
    titulo: 'Acceso Total',
    roles: 'Jefe de enfermería · Subjefe de enfermería',
    subtitulo: 'Control absoluto del sistema. Reportes oficiales. Gestión de usuarios.',
    color: '#A32D2D',
    permisos: [
      { texto: 'Ver y editar TODOS los servicios del hospital', permitido: true },
      { texto: 'Tablero Maestro: vistas Día · Semana · Mes', permitido: true },
      { texto: 'Exportar reporte mensual Excel + PDF (BCS oficial)', permitido: true },
      { texto: 'Crear, editar y resetear contraseñas de usuarios', permitido: true },
      { texto: 'Modificar configuración base de datos (catálogos, indicadores)', permitido: true },
      { texto: 'Auditar quién hizo qué y cuándo en cada paciente', permitido: true },
    ],
    contenido: [
      {
        titulo: '1. Tablero Maestro completo',
        pasos: [
          'Botón "📊 Tablero Maestro" arriba a la derecha del Dashboard.',
          'Verás 3 tabs: Día / Semana / Mes (los 3 visibles solo para tu nivel).',
          'Día: análisis fino de un día específico con desglose por turno M/V/N.',
          'Semana: lunes a domingo de la fecha seleccionada.',
          'Mes: vista mensual completa con botón "📊 Exportar Excel + PDF".',
        ],
      },
      {
        titulo: '2. Exportar reporte mensual oficial',
        pasos: [
          'En Tablero Maestro, selecciona pestaña "Mes" → mes y año.',
          'Toca "📊 Exportar Excel + PDF".',
          'Descarga archivo .xlsx con: hoja CONSOLIDADO (indicadores × servicios), una hoja por servicio, y hoja METADATA con auditoría por origen de captura.',
          'El PDF se abre auto-imprimible con el formato institucional BCS.',
        ],
      },
      {
        titulo: '3. Alta de nuevos colaboradores',
        pasos: [
          'Comparte el link del formulario de alta por WhatsApp al staff entrante: forms.gle/HrHZYuFYwuPuvb3t7',
          'Cuando llegan respuestas, en Supabase → Authentication → Users → "Add user" con email y password + ✅ Auto Confirm.',
          'Luego en SQL Editor inserta la fila en perfiles con su matrícula, rol y servicio_id (si aplica).',
        ],
      },
      {
        titulo: '4. Reseteo de contraseña a un colaborador',
        pasos: [
          'Supabase → Authentication → Users → buscar al usuario.',
          'Click 3 puntos "..." → "Send password recovery" (le llega correo) o "Reset password" (la defines tú directamente).',
        ],
      },
      {
        titulo: '5. Mantenimiento periódico',
        pasos: [
          'Verifica que pg_cron esté activo (recompute continuidad cada turno automáticamente).',
          'Revisa logs de Supabase si hay errores frecuentes.',
          'Los pacientes egresados se archivan automáticamente en historicos_egresos.',
        ],
      },
    ],
  },

  // ============================================================
  // NIVEL 2 — ACCESO HOSPITAL COMPLETO
  // ============================================================
  {
    key: 'n2_hospital',
    nivel: 'Nivel 2',
    titulo: 'Acceso Hospital Completo',
    roles: 'Supervisor de enfermería',
    subtitulo: 'Vista panorámica del hospital. Coordina entre servicios. Sin reportes mensuales ni gestión de usuarios.',
    color: '#1F4E79',
    permisos: [
      { texto: 'Ver y editar TODOS los servicios del hospital', permitido: true },
      { texto: 'Tablero Maestro: vista DÍA con desglose por turno M/V/N', permitido: true },
      { texto: 'Editar capturas de cualquier paciente para corregir omisiones', permitido: true },
      { texto: 'Imprimir hojas de censo, dietas, recetario, control', permitido: true },
      { texto: 'Tablero Maestro Semana / Mes', permitido: false },
      { texto: 'Exportar reporte mensual oficial', permitido: false },
      { texto: 'Crear o eliminar usuarios', permitido: false },
    ],
    contenido: [
      {
        titulo: '1. Vista global del hospital',
        pasos: [
          'En el Dashboard verás los 10 servicios con sus porcentajes de ocupación en tiempo real.',
          'Puedes entrar a cualquier servicio (toca su tarjeta) y operar capturas o correcciones.',
        ],
      },
      {
        titulo: '2. Tablero Maestro — vista Día',
        pasos: [
          'Botón "📊 Tablero Maestro" arriba a la derecha.',
          'Tienes acceso a la vista DÍA del hospital completo con desglose por turno M/V/N.',
          'Útil para detectar a tiempo: servicios con sobrecarga, ausencia de capturas, indicadores en cero que deberían estar arriba.',
        ],
      },
      {
        titulo: '3. Recorrido virtual cada turno',
        pasos: [
          'Tu rutina típica: cada inicio de turno entras al Tablero Día, identificas servicios con alertas o capturas faltantes.',
          'Bajas al servicio específico → corriges desde Control o Productividad.',
          'Asegúrate de que cada servicio tenga al menos su Control y Productividad al día.',
        ],
      },
      {
        titulo: '4. Cierre de turno',
        pasos: [
          'Antes de entregar el turno, valida que todos los servicios tengan capturas completas.',
          'Si encuentras errores, edita directamente desde la pestaña correspondiente.',
          'Las modificaciones quedan registradas en auditoría con tu matrícula y hora.',
        ],
      },
    ],
  },

  // ============================================================
  // NIVEL 3 — ACCESO SERVICIO COMPLETO
  // ============================================================
  {
    key: 'n3_servicio',
    nivel: 'Nivel 3',
    titulo: 'Acceso Servicio Completo',
    roles: 'Jefe de servicio · Gestor del cuidado · Encargado de servicio',
    subtitulo: 'Coordina su servicio. Edita censo, dietas, recetario, control, productividad. Sin acceso a otros servicios.',
    color: '#7d5b2f',
    permisos: [
      { texto: 'Ver y editar TODO en su servicio asignado', permitido: true },
      { texto: 'Tablero Maestro: vista DÍA con datos SOLO de su servicio', permitido: true },
      { texto: 'Imprimir hojas oficiales del servicio', permitido: true },
      { texto: 'Validar productividad y corregir capturas del personal', permitido: true },
      { texto: 'Ver otros servicios del hospital', permitido: false },
      { texto: 'Tablero Semana / Mes', permitido: false },
      { texto: 'Reportes mensuales y alta de usuarios', permitido: false },
    ],
    contenido: [
      {
        titulo: '1. Acceso completo a tu servicio',
        pasos: [
          'En el Dashboard verás SOLO tu servicio asignado (no los otros 9).',
          'Toca la tarjeta para entrar. Encontrarás 5 pestañas: Censo · Dietas · Recetario · Control · Productividad.',
          'Puedes capturar, editar y validar cualquier paciente del servicio en cualquier turno.',
        ],
      },
      {
        titulo: '2. Tablero Maestro de tu servicio',
        pasos: [
          'Toca "📊 Tablero Maestro".',
          'Verás solo la vista DÍA y solo de tu servicio (no del hospital completo).',
          'Selecciona la fecha con el date picker para revisar días anteriores.',
        ],
      },
      {
        titulo: '3. Imprimir hojas del turno',
        pasos: [
          'Pestaña "Control" → botón "🖨️ Imprimir Censo" abre vista oficio horizontal con todos los pacientes activos.',
          'Pestañas Dietas y Recetario también tienen botones de impresión propios.',
          'Usa la impresión para pase de visita médica o entrega de turno.',
        ],
      },
      {
        titulo: '4. Validar productividad antes del cierre',
        pasos: [
          'Al final del turno, revisa la pestaña Productividad del servicio.',
          'Verifica que las celdas automáticas (verde/azul/lavanda/durazno) cuadren con los eventos realizados.',
          'Si una enfermera olvidó marcar un evento como Realizada, edita el evento desde Control y se reflejará automáticamente.',
        ],
      },
    ],
  },

  // ============================================================
  // NIVEL 4 — CAPTURA DEL SERVICIO
  // ============================================================
  {
    key: 'n4_captura',
    nivel: 'Nivel 4',
    titulo: 'Captura del Servicio',
    roles: 'Enfermera de piso',
    subtitulo: 'Captura datos del paciente en tu servicio asignado durante tu turno. Sin acceso a otros servicios ni al Tablero.',
    color: '#5a4a8a',
    permisos: [
      { texto: 'Capturar y editar pacientes de tu servicio en tu turno', permitido: true },
      { texto: 'Llenar dietas, recetario, control y productividad', permitido: true },
      { texto: 'Imprimir tu hoja de servicio para pase de visita', permitido: true },
      { texto: 'Ingresar y egresar pacientes', permitido: true },
      { texto: 'Acceder a otros servicios del hospital', permitido: false },
      { texto: 'Acceder al Tablero Maestro', permitido: false },
      { texto: 'Editar capturas históricas de otros turnos', permitido: false },
    ],
    contenido: [
      {
        titulo: '1. Entrar a tu servicio',
        pasos: [
          'En el Dashboard ves solo tu servicio. Toca la tarjeta.',
          'Verás 5 pestañas: Censo · Dietas · Recetario · Control · Productividad.',
        ],
      },
      {
        titulo: '2. Ingresar un paciente nuevo',
        pasos: [
          'Pestaña "Censo" → botón "+ Ingresar paciente".',
          'Llena: nombre completo, edad, género, NSS/CURP, diagnóstico de ingreso, especialidad.',
          'Selecciona la cama disponible.',
          'Al guardar, el sistema registra fecha y hora automáticas.',
        ],
      },
      {
        titulo: '3. Capturar Dietas',
        pasos: [
          'Pestaña "Dietas" → cada paciente aparece como tarjeta.',
          'Selecciona tipo de dieta del catálogo (normal, blanda, líquidos, etc.) y restricciones.',
          'Los cambios se guardan automáticamente.',
        ],
      },
      {
        titulo: '4. Capturar Recetario',
        pasos: [
          'Pestaña "Recetario" → busca el medicamento por nombre (594 medicamentos en catálogo).',
          'Captura dosis, vía, horario y número de aplicaciones del día (0-5).',
          'Para borrar entrada incorrecta usa el botón ❌.',
        ],
      },
      {
        titulo: '5. Llenar Control (eventos clínicos)',
        pasos: [
          'Pestaña "Control" → toca al paciente para expandir su tarjeta.',
          'Eventos como sondas, accesos vasculares, curaciones, procedimientos se gestionan con tarjetas individuales.',
          'AGREGAR: toca "+ Nuevo evento" → selecciona código → confirma.',
          'MARCAR REALIZADO: en la tarjeta del evento toca "⏱️ Ahora" o cambia estado a "Realizada".',
          'EDITAR FECHA: ícono ✎ junto a la fecha → ajusta con el picker.',
          'RETIRAR sonda/acceso: cambia estado a "Retirada".',
          'CANCELAR evento creado por error: toca la ✕ y confirma.',
        ],
      },
      {
        titulo: '6. Productividad del turno',
        pasos: [
          'Pestaña "Productividad" → matriz de indicadores × días.',
          'Celdas amarillas: captura manual (tócalas para editar).',
          'Celdas verdes/azules/lavanda/durazno: automáticas (no editables; modifica el evento que las generó).',
          'El sistema cuenta automáticamente: ingresos, eventos realizados, continuidad de sondas/accesos por turno.',
        ],
      },
      {
        titulo: '7. Egresar un paciente',
        pasos: [
          'Pestaña "Censo" → toca el paciente que va a egresar.',
          'Botón "Egresar" → selecciona motivo (alta, traslado, defunción, voluntario, fuga).',
          'Captura observaciones si aplica. Al confirmar, la cama queda disponible y el paciente se archiva.',
        ],
      },
    ],
  },
];

function rolANivelKey(rol: Rol | null | undefined): NivelKey | null {
  if (rol === 'jefe' || rol === 'subjefe') return 'n1_total';
  if (rol === 'supervisor') return 'n2_hospital';
  if (rol === 'gestor') return 'n3_servicio';
  if (rol === 'enfermera') return 'n4_captura';
  return null;
}

function nivelLabel(rol: Rol | null | undefined): string {
  const k = rolANivelKey(rol);
  if (k === 'n1_total') return 'Nivel 1 · Acceso Total';
  if (k === 'n2_hospital') return 'Nivel 2 · Acceso Hospital';
  if (k === 'n3_servicio') return 'Nivel 3 · Acceso Servicio';
  if (k === 'n4_captura') return 'Nivel 4 · Captura del Servicio';
  return 'Sin nivel asignado';
}

export function Instructivo() {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const nivelUsuario = rolANivelKey(perfil?.rol);

  // Por default: jefe/subjefe ven todos los niveles (para capacitar). Otros ven
  // solo matriz + común + su propio nivel.
  const [verTodos, setVerTodos] = useState(nivelUsuario === 'n1_total');

  const seccionesVisibles = verTodos
    ? SECCIONES
    : SECCIONES.filter(s =>
        s.key === 'matriz' || s.key === 'comun' || s.key === nivelUsuario
      );

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

      {/* SELECTOR DE VISTA */}
      <div style={selectorContenedor} className="no-print">
        <label style={selectorLabel}>
          <input
            type="checkbox"
            checked={verTodos}
            onChange={e => setVerTodos(e.target.checked)}
            style={{ marginRight: 8 }}
          />
          Ver instructivo de todos los niveles
          {perfil?.rol && (
            <span style={{ marginLeft: 12, fontSize: 12, color: '#888' }}>
              (Tu nivel: <strong>{nivelLabel(perfil.rol)}</strong>)
            </span>
          )}
        </label>
      </div>

      {/* SECCIONES */}
      <main style={main}>
        {seccionesVisibles.map(seccion => (
          <section key={seccion.key} style={seccionContenedor}>
            <div style={{ ...seccionHeader, background: seccion.color }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                {seccion.nivel && (
                  <span style={nivelBadge}>{seccion.nivel}</span>
                )}
                <h2 style={seccionTitulo}>{seccion.titulo}</h2>
              </div>
              {seccion.roles && <div style={seccionRoles}>{seccion.roles}</div>}
              <div style={seccionSubtitulo}>{seccion.subtitulo}</div>
            </div>

            {/* CARD DE PERMISOS — sí/no */}
            {seccion.permisos && seccion.permisos.length > 0 && (
              <div style={permisosContenedor}>
                <div style={permisosTitulo}>Lo que este nivel SÍ puede / NO puede hacer:</div>
                <ul style={permisosLista}>
                  {seccion.permisos.map((p, i) => (
                    <li key={i} style={{
                      ...permisosItem,
                      color: p.permitido ? '#0E6755' : '#A32D2D',
                    }}>
                      <span style={{
                        display: 'inline-block',
                        width: 18,
                        fontWeight: 700,
                        textAlign: 'center',
                      }}>{p.permitido ? '✓' : '✕'}</span>
                      {p.texto}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* PASOS OPERATIVOS */}
            <div style={seccionBody}>
              {seccion.contenido.map(bloque => (
                <div key={bloque.titulo} style={bloqueContenedor}>
                  {bloque.titulo && (
                    <h3 style={{ ...bloqueTitulo, color: seccion.color }}>{bloque.titulo}</h3>
                  )}
                  <ol style={listaPasos}>
                    {bloque.pasos.map((paso, i) => (
                      <li key={i} style={pasoItem}>{paso}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        ))}

        <footer style={pieFooter}>
          <p style={{ margin: 0 }}>
            Hospital General con Especialidades IMSS-Bienestar
            <br/>"Juan María de Salvatierra" · CLUES BSIMB000672 · La Paz, BCS
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 10, color: '#aaa' }}>
            Documento generado por el sistema. Para correcciones o sugerencias, contacta al subjefe de enfermería.
          </p>
        </footer>
      </main>

      <style>{`
        @media print {
          @page { size: letter; margin: 12mm; }
          body { background: white !important; }
          .no-print { display: none !important; }
          .instructivo-page {
            background: white !important;
            padding: 0 !important;
          }
        }
        @media (max-width: 640px) {
          .instructivo-page h1 { font-size: 18px !important; }
          .instructivo-page h2 { font-size: 14px !important; }
        }
      `}</style>
    </div>
  );
}

// ============ ESTILOS ============
const contenedor: React.CSSProperties = {
  padding: 'clamp(8px, 2vw, 20px)',
  maxWidth: 900,
  margin: '0 auto',
  background: '#F5F1E8',
  minHeight: '100vh',
};
const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 16,
  background: '#fff',
  padding: 12,
  borderRadius: 8,
  border: '1px solid #C39C59',
  flexWrap: 'wrap',
  gap: 8,
};
const titulo: React.CSSProperties = { fontSize: 22, color: '#0E6755', margin: 0 };
const subtitulo: React.CSSProperties = { fontSize: 11, color: '#888', marginTop: 4 };
const botonVolver: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #0E6755',
  color: '#0E6755',
  padding: '8px 14px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  whiteSpace: 'nowrap',
};
const botonImprimir: React.CSSProperties = {
  background: '#0E6755',
  border: 'none',
  color: '#fff',
  padding: '8px 14px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};
const selectorContenedor: React.CSSProperties = {
  background: '#fff',
  padding: 12,
  borderRadius: 8,
  border: '1px solid #C39C59',
  marginBottom: 16,
};
const selectorLabel: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: 13,
  color: '#265C4E',
  cursor: 'pointer',
  flexWrap: 'wrap',
};
const main: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 20 };
const seccionContenedor: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  border: '1px solid #C39C59',
  overflow: 'hidden',
  boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
};
const seccionHeader: React.CSSProperties = {
  color: '#fff',
  padding: '14px 18px',
};
const seccionTitulo: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
};
const nivelBadge: React.CSSProperties = {
  background: 'rgba(255,255,255,0.25)',
  border: '1px solid rgba(255,255,255,0.5)',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
};
const seccionRoles: React.CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  fontWeight: 600,
  opacity: 0.95,
  fontStyle: 'italic',
};
const seccionSubtitulo: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: 12,
  opacity: 0.9,
  fontWeight: 400,
};
const permisosContenedor: React.CSSProperties = {
  background: '#fdfaf2',
  padding: '12px 18px',
  borderBottom: '1px solid #e8dfc6',
};
const permisosTitulo: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#7d5b2f',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 8,
};
const permisosLista: React.CSSProperties = {
  margin: 0,
  paddingLeft: 0,
  listStyle: 'none',
};
const permisosItem: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.6,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
};
const seccionBody: React.CSSProperties = { padding: 18 };
const bloqueContenedor: React.CSSProperties = { marginBottom: 18 };
const bloqueTitulo: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: 15,
  fontWeight: 700,
};
const listaPasos: React.CSSProperties = {
  margin: 0,
  paddingLeft: 22,
  color: '#265C4E',
};
const pasoItem: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.55,
  marginBottom: 6,
};
const pieFooter: React.CSSProperties = {
  marginTop: 24,
  padding: 18,
  textAlign: 'center',
  fontSize: 11,
  color: '#888',
  borderTop: '1px solid #e8dfc6',
};
