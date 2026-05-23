// src/pages/Instructivo.tsx
// Instructivo de uso del sistema Censo Salvatierra, dividido por jerarquía.
// Accesible desde Dashboard. Imprimible. Mobile-friendly.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { Rol } from '../types';

type RolKey = 'comun' | 'enfermera' | 'gestor' | 'supervisor' | 'jefe';

interface Seccion {
  key: RolKey;
  titulo: string;
  subtitulo: string;
  color: string;
  contenido: { titulo: string; pasos: (string | { titulo: string; texto: string })[] }[];
}

const SECCIONES: Seccion[] = [
  {
    key: 'comun',
    titulo: 'Para todos los usuarios',
    subtitulo: 'Pasos básicos que aplican a cualquier rol',
    color: '#0E6755',
    contenido: [
      {
        titulo: '1. Iniciar sesión',
        pasos: [
          'Abre la app en tu navegador (Safari en iPhone/iPad, Chrome en Android o computadora).',
          'URL: censo-salvatierra.vercel.app',
          'Captura tu correo institucional y la contraseña que recibiste por invitación.',
          'Si olvidaste tu contraseña, contacta al subjefe de enfermería para que te envíe el restablecimiento.',
        ],
      },
      {
        titulo: '2. Instalar como app (recomendado)',
        pasos: [
          'iPhone/iPad (Safari): toca el ícono compartir → "Agregar a pantalla de inicio".',
          'Android (Chrome): menú de 3 puntos → "Instalar app" o "Agregar a pantalla principal".',
          'La app abre en pantalla completa, sin barra del navegador, con el ícono del hospital.',
        ],
      },
      {
        titulo: '3. Cerrar sesión',
        pasos: [
          'Click/toca el botón "Cerrar sesión" arriba a la derecha de cualquier pantalla.',
          'IMPORTANTE: al terminar tu turno, siempre cierra sesión si compartes la tablet con otra enfermera.',
        ],
      },
    ],
  },
  {
    key: 'enfermera',
    titulo: 'Enfermera de piso',
    subtitulo: 'Captura de censo, dietas, recetario, control y productividad del turno',
    color: '#5a4a8a',
    contenido: [
      {
        titulo: '1. Acceder a tu servicio',
        pasos: [
          'En el Dashboard verás tu servicio asignado (solo el tuyo). Toca la tarjeta para entrar.',
          'Una vez dentro, verás 5 pestañas: Censo, Dietas, Recetario, Control, Productividad.',
        ],
      },
      {
        titulo: '2. Ingresar un paciente nuevo',
        pasos: [
          'Pestaña "Censo" → toca el botón "+ Ingresar paciente".',
          'Llena: nombre completo, edad, género, NSS/CURP, diagnóstico de ingreso, especialidad.',
          'Selecciona la cama disponible donde quedará el paciente.',
          'Al guardar, el sistema registra fecha y hora automáticas y le asigna la cama.',
        ],
      },
      {
        titulo: '3. Llenar Dietas',
        pasos: [
          'Pestaña "Dietas" → cada paciente aparece como tarjeta.',
          'Selecciona tipo de dieta del catálogo (normal, blanda, líquidos, etc.).',
          'Marca restricciones si aplican.',
          'Los cambios se guardan automáticamente.',
        ],
      },
      {
        titulo: '4. Llenar Recetario (medicamentos)',
        pasos: [
          'Pestaña "Recetario" → busca el medicamento por nombre (594 medicamentos en catálogo).',
          'Captura: dosis, vía, horario, número de aplicaciones del día (0-5 con dropdown).',
          'Para borrar una entrada incorrecta, usa el botón ❌.',
        ],
      },
      {
        titulo: '5. Llenar Control (eventos clínicos)',
        pasos: [
          'Pestaña "Control" → toca un paciente para expandir su tarjeta.',
          'Cada tipo de evento (sondas, accesos vasculares, curaciones, etc.) muestra tarjetas individuales con estado y fecha.',
          'Para AGREGAR un evento: toca "+ Nuevo evento" → selecciona código → confirma.',
          'Para MARCAR REALIZADO: en la tarjeta del evento, toca "⏱️ Ahora" o cambia el estado a "Realizada".',
          'Para EDITAR FECHA: toca el ícono ✎ junto a la fecha → ajusta con el picker.',
          'Para RETIRAR un evento (ej. sonda): cambia estado a "Retirada".',
          'Para CANCELAR un evento creado por error: toca la ✕ y confirma.',
        ],
      },
      {
        titulo: '6. Productividad del turno',
        pasos: [
          'Pestaña "Productividad" → ves la matriz de indicadores × días del mes.',
          'Las celdas se llenan automáticamente cuando: ingresas un paciente, marcas un evento como Realizada, o cambia el turno (sondas/accesos siguen contando cada turno mientras estén instalados).',
          'Las celdas en AMARILLO son captura manual: tócalas para editar el número directamente.',
          'Las celdas en VERDE/AZUL/LAVANDA/DURAZNO son automáticas y no son editables: para modificarlas, ajusta el evento que las generó.',
        ],
      },
      {
        titulo: '7. Egresar un paciente',
        pasos: [
          'Pestaña "Censo" → toca el paciente que va a egresar.',
          'Toca "Egresar" → selecciona motivo (alta, traslado, defunción, voluntario, fuga).',
          'Captura observaciones de egreso si aplica.',
          'Al confirmar, la cama queda disponible y el paciente se archiva en históricos.',
        ],
      },
    ],
  },
  {
    key: 'gestor',
    titulo: 'Jefe de servicio / Gestor / Encargado de servicio',
    subtitulo: 'Coordina su servicio: supervisa enfermeras, valida capturas, gestiona indicadores',
    color: '#7d5b2f',
    contenido: [
      {
        titulo: '1. Acceso completo a su servicio',
        pasos: [
          'En el Dashboard verás solo tu servicio asignado.',
          'Puedes hacer todo lo que hace una enfermera (ver pasos arriba): editar censo, dietas, recetario, control y productividad de cualquier paciente del servicio.',
        ],
      },
      {
        titulo: '2. Tablero Maestro de tu servicio',
        pasos: [
          'Toca el botón "📊 Tablero Maestro" arriba a la derecha.',
          'Verás un tablero solo de tu servicio (no del hospital completo).',
          'Solo dispones de la vista del DÍA seleccionado (selecciona fecha con el picker).',
          'Las pestañas Semana y Mes están reservadas a Jefe/Subjefe.',
        ],
      },
      {
        titulo: '3. Imprimir hojas del turno',
        pasos: [
          'Dentro del servicio, pestaña "Control" → botón "🖨️ Imprimir Censo" abre vista oficio horizontal con todos los pacientes activos.',
          'Pestañas Dietas y Recetario también tienen botones de impresión propios.',
          'Usa la impresión para pase de visita médica o entrega de turno.',
        ],
      },
      {
        titulo: '4. Validar productividad antes del cierre',
        pasos: [
          'Al final del turno, revisa la pestaña Productividad del servicio.',
          'Verifica que las celdas automáticas (verdes/azules/lavanda/durazno) cuadren con los eventos realizados.',
          'Si una enfermera olvidó marcar un evento como Realizada, edita el evento desde Control y se reflejará automáticamente.',
        ],
      },
    ],
  },
  {
    key: 'supervisor',
    titulo: 'Supervisor de enfermería',
    subtitulo: 'Vista de todo el hospital con foco en el día — coordina entre servicios',
    color: '#1F4E79',
    contenido: [
      {
        titulo: '1. Vista global del hospital',
        pasos: [
          'En el Dashboard verás todos los 10 servicios con sus porcentajes de ocupación en tiempo real.',
          'Puedes entrar a cualquier servicio y realizar capturas o correcciones.',
        ],
      },
      {
        titulo: '2. Tablero Maestro — solo Día',
        pasos: [
          'Botón "📊 Tablero Maestro" arriba a la derecha.',
          'Tienes acceso a la vista DÍA del hospital completo con desglose por turno M/V/N.',
          'Las vistas Semana y Mes están reservadas a Jefe/Subjefe.',
          'Útil para detectar a tiempo: servicios con sobrecarga, ausencia de capturas, indicadores en cero que deberían estar arriba.',
        ],
      },
      {
        titulo: '3. Recorrido virtual',
        pasos: [
          'Tu rol típico: cada turno entras al Tablero, identificas servicios con alertas o capturas faltantes, y bajas al servicio específico a corregir.',
          'Asegúrate de que cada servicio tenga al menos su Control y Productividad al día.',
        ],
      },
      {
        titulo: '4. Cierre de turno',
        pasos: [
          'Antes de entregar el turno, valida que todos los servicios tengan capturas completas.',
          'Si encuentras errores, edita directamente desde Control o Productividad.',
          'Las modificaciones quedan registradas en auditoría con tu matrícula.',
        ],
      },
    ],
  },
  {
    key: 'jefe',
    titulo: 'Jefe / Subjefe de Enfermería',
    subtitulo: 'Acceso total · Tablero Día/Semana/Mes · Reportes oficiales · Gestión de usuarios',
    color: '#A32D2D',
    contenido: [
      {
        titulo: '1. Todos los privilegios',
        pasos: [
          'Tienes acceso a todo: ver y editar cualquier servicio, paciente, evento, indicador.',
          'Eres responsable institucional del sistema y de los reportes mensuales.',
        ],
      },
      {
        titulo: '2. Tablero Maestro completo',
        pasos: [
          'Tabs Día / Semana / Mes — los 3 visibles solo para ti.',
          'Día: análisis fino de un día específico con turnos M/V/N.',
          'Semana: lunes a domingo de la fecha seleccionada.',
          'Mes: vista mensual completa con botón "📊 Exportar Excel + PDF" para reportes oficiales BCS.',
        ],
      },
      {
        titulo: '3. Exportar reporte mensual',
        pasos: [
          'En Tablero Maestro, selecciona pestaña "Mes" → mes y año.',
          'Toca "📊 Exportar Excel + PDF".',
          'Descarga el archivo .xlsx y abre el PDF auto-imprimible.',
          'El Excel incluye: hoja CONSOLIDADO (matriz indicadores × servicios), una hoja por servicio, y hoja METADATA con auditoría por origen de captura.',
        ],
      },
      {
        titulo: '4. Gestión de usuarios',
        pasos: [
          'Para dar de alta un nuevo colaborador, comparte el link del formulario de alta (forms.gle).',
          'Cuando llegan respuestas, en Supabase Dashboard → Authentication → Users → Add user (con email + password + Auto Confirm).',
          'Después corre el INSERT en perfiles con su matrícula, rol y servicio_id.',
          'Para resetear contraseña: Authentication → Users → ... → Reset password.',
        ],
      },
      {
        titulo: '5. Mantenimiento periódico',
        pasos: [
          'Al inicio de cada mes, verifica que pg_cron esté activo (recompute continuidad cada turno).',
          'Revisa logs de Supabase si hay errores frecuentes.',
          'Si necesitas archivar pacientes egresados, su snapshot ya está en historicos_egresos.',
        ],
      },
    ],
  },
];

function rolARolKey(rol: Rol | null | undefined): RolKey | null {
  if (rol === 'jefe' || rol === 'subjefe') return 'jefe';
  if (rol === 'supervisor') return 'supervisor';
  if (rol === 'gestor') return 'gestor';
  if (rol === 'enfermera') return 'enfermera';
  return null;
}

export function Instructivo() {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const rolUsuario = rolARolKey(perfil?.rol);

  // Filtro: por default muestra solo la sección del rol del usuario + común.
  // Si es jefe/subjefe puede ver todas (para capacitar a otros).
  const [verTodas, setVerTodas] = useState(rolUsuario === 'jefe');

  const seccionesVisibles = verTodas
    ? SECCIONES
    : SECCIONES.filter(s => s.key === 'comun' || s.key === rolUsuario);

  return (
    <div style={contenedor} className="instructivo-page">
      {/* HEADER */}
      <header style={header} className="no-print">
        <button onClick={() => navigate('/')} style={botonVolver}>← Tablero</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
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
            checked={verTodas}
            onChange={e => setVerTodas(e.target.checked)}
            style={{ marginRight: 8 }}
          />
          Ver instrucciones de todos los roles
          {rolUsuario && (
            <span style={{ marginLeft: 12, fontSize: 12, color: '#888' }}>
              (Tu rol: <strong>{perfil?.rol?.toUpperCase()}</strong>)
            </span>
          )}
        </label>
      </div>

      {/* SECCIONES */}
      <main style={main}>
        {seccionesVisibles.map(seccion => (
          <section key={seccion.key} style={seccionContenedor}>
            <div style={{ ...seccionHeader, background: seccion.color }}>
              <h2 style={seccionTitulo}>{seccion.titulo}</h2>
              <div style={seccionSubtitulo}>{seccion.subtitulo}</div>
            </div>
            <div style={seccionBody}>
              {seccion.contenido.map(bloque => (
                <div key={bloque.titulo} style={bloqueContenedor}>
                  <h3 style={{ ...bloqueTitulo, color: seccion.color }}>{bloque.titulo}</h3>
                  <ol style={listaPasos}>
                    {bloque.pasos.map((paso, i) => (
                      <li key={i} style={pasoItem}>
                        {typeof paso === 'string' ? paso : (
                          <>
                            <strong>{paso.titulo}:</strong> {paso.texto}
                          </>
                        )}
                      </li>
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
const seccionSubtitulo: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: 12,
  opacity: 0.9,
  fontWeight: 400,
};
const seccionBody: React.CSSProperties = { padding: 18 };
const bloqueContenedor: React.CSSProperties = { marginBottom: 20 };
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
