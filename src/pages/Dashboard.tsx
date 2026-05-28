import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { OcupacionServicio, Perfil } from '../types'
import {
  ROLES_VEN_TABLERO,
  ROLES_ADMIN_GLOBAL,
  esAdminGlobal,
  tieneScopeDeServicio,
  formatearTitulo,
  formatearRol,
  esJefeOAdmin,
} from '../types'
import { usePresence } from '../contexts/PresenceContext'

interface Props {
  perfil: Perfil
  onCerrarSesion: () => void
}

export function Dashboard({ perfil, onCerrarSesion }: Props) {
  const navigate = useNavigate()
  const [servicios, setServicios] = useState<OcupacionServicio[]>([])
  const [cargando, setCargando] = useState(true)

  // Presencia en tiempo real (vía Supabase Realtime, sin polling)
  const usuariosOnline = usePresence()

  useEffect(() => {
    cargarOcupacion()
    const interval = setInterval(cargarOcupacion, 30000)
    return () => clearInterval(interval)
  }, [])

  async function cargarOcupacion() {
    const { data, error } = await supabase
      .from('v_ocupacion_servicios')
      .select('*')
      .order('orden')

    if (!error && data) {
      setServicios(data as OcupacionServicio[])
    }
    setCargando(false)
  }

  // Filtrar servicios por scope del rol.
  // - jefe/subjefe/supervisor: ven todos
  // - gestor/enfermera: solo el suyo
  const serviciosVisibles = useMemo(() => {
    if (tieneScopeDeServicio(perfil.rol) && perfil.servicio_id != null) {
      return servicios.filter(s => s.servicio_id === perfil.servicio_id)
    }
    return servicios
  }, [servicios, perfil.rol, perfil.servicio_id])

  const totalCamas = serviciosVisibles.reduce((s, srv) => s + srv.total_camas, 0)
  const totalOcupadas = serviciosVisibles.reduce((s, srv) => s + Number(srv.camas_ocupadas), 0)
  const totalExtrasTotales = serviciosVisibles.reduce((s, srv) => s + Number(srv.extras_totales || 0), 0)
  const totalExtrasOcupados = serviciosVisibles.reduce((s, srv) => s + Number(srv.extras_ocupados || 0), 0)
  const porcentajeGlobal =
    totalCamas > 0 ? Math.round((totalOcupadas / totalCamas) * 100) : 0
  const esAdmin = esAdminGlobal(perfil.rol)

  function colorOcupacion(pct: number): string {
    if (pct >= 80) return '#A32D2D'
    if (pct >= 60) return '#C39C59'
    if (pct > 0) return '#5CAB34'
    return '#888780'
  }

  return (
    <div style={styles.contenedor}>
      <header style={styles.header}>
        <div style={styles.headerLogos}>
          <img
            src="/logos/imss_bienestar.png"
            alt="IMSS Bienestar"
            style={styles.logoChico}
          />
          <img
            src="/logos/LOGO_HOSPITAL.jpg"
            alt="Benemérito Hospital General con Especialidades del IMSS-Bienestar Juan María de Salvatierra"
            style={styles.logoChico}
          />
        </div>

        <div style={styles.headerUsuario}>
          <div style={{ textAlign: 'right' }}>
            <p style={styles.nombreUsuario}>{perfil.nombre_completo}</p>
            <p style={styles.matricula}>
              Matrícula {perfil.matricula} — {formatearTitulo(perfil)}
            </p>
          </div>
          {ROLES_VEN_TABLERO.includes(perfil.rol) && (
            <button onClick={() => navigate('/tablero')} style={styles.botonTablero}>
              📊 Tablero Maestro
            </button>
          )}
          {ROLES_ADMIN_GLOBAL.includes(perfil.rol) && (
            <button onClick={() => navigate('/supervision')} style={styles.botonTablero}>
              🗂️ Supervisión
            </button>
          )}
          <button onClick={() => navigate('/instructivo')} style={styles.botonInstructivo}>
            📖 Instructivo
          </button>
          <button onClick={() => navigate('/cambiar-contrasena')} style={styles.botonInstructivo}>
            🔑 Contrasena
          </button>
          <button onClick={onCerrarSesion} style={styles.botonSalir}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <main style={styles.main}>
        <h2 style={styles.tituloPagina}>
          {esAdmin ? 'Tablero general del hospital' : `Tablero de tu servicio`}
        </h2>
        <p style={styles.fecha}>
          {new Date().toLocaleDateString('es-MX', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </p>

        <div style={styles.kpisGrid}>
          <KpiCard etiqueta="Camas totales" valor={totalCamas} color="#0E6755" />
          <KpiCard etiqueta="Ocupadas" valor={totalOcupadas} color="#5CAB34" />
          <KpiCard
            etiqueta="Disponibles"
            valor={totalCamas - totalOcupadas}
            color="#5978BB"
          />
          <KpiCard
            etiqueta="% Ocupacion"
            valor={`${porcentajeGlobal}%`}
            color="#C39C59"
          />
          {totalExtrasTotales > 0 && (
            <KpiCard
              etiqueta="Camillas/Sillas"
              valor={`${totalExtrasOcupados}/${totalExtrasTotales}`}
              color="#7d5b2f"
            />
          )}
        </div>

        {esJefeOAdmin(perfil) && (() => {
          // Defense in depth: dedup adicional en el Dashboard por id, por si el
          // contexto regresa duplicados (varias pestañas del mismo usuario).
          const unicos = Array.from(
            new Map(usuariosOnline.map(u => [u.id, u])).values()
          ).sort((a, b) => a.nombre.localeCompare(b.nombre));
          if (unicos.length === 0) return null;
          return (
            <div style={styles.online}>
              <div style={styles.onlineTitulo}>
                🟢 En línea ahora ({unicos.length})
              </div>
              <div style={styles.onlineLista}>
                {unicos.map(u => (
                  <span key={u.id} style={styles.onlineChip}>
                    <span style={styles.onlineDot} />
                    {u.nombre}
                    <span style={styles.onlineRol}>· {formatearRol(u.rol)}</span>
                  </span>
                ))}
              </div>
            </div>
          );
        })()}

        <h3 style={styles.tituloSeccion}>
          {esAdmin ? 'Servicios del hospital' : 'Mi servicio'}
        </h3>

        {cargando ? (
          <p style={styles.cargando}>Cargando ocupación...</p>
        ) : (
          <div style={styles.serviciosGrid}>
            {serviciosVisibles.map(s => {
              // Servicio sin camas censables (ej. URPA con solo camillas):
              // no aplica el % ni el conteo de "X de Y camas". Mostramos
              // las camillas en su lugar.
              const soloCamillas = s.total_camas === 0 && Number(s.extras_totales || 0) > 0;
              const pctNum = Number(s.porcentaje_ocupacion);
              const pctValido = !soloCamillas && !isNaN(pctNum);
              return (
              <button
                key={s.servicio_id}
                onClick={() => navigate(`/servicio/${s.servicio_id}`)}
                style={styles.tarjetaServicio}
              >
                <div style={styles.tarjetaCabecera}>
                  <span style={styles.tarjetaNombre}>{s.servicio}</span>
                  <span
                    style={{
                      ...styles.tarjetaPct,
                      color: pctValido ? colorOcupacion(pctNum) : '#888',
                      fontSize: soloCamillas ? 11 : undefined,
                    }}
                  >
                    {soloCamillas
                      ? `${Number(s.extras_ocupados || 0)} / ${Number(s.extras_totales || 0)}`
                      : `${Math.round(pctNum)}%`}
                  </span>
                </div>
                <p style={styles.tarjetaDetalle}>
                  {soloCamillas
                    ? `${Number(s.extras_ocupados || 0)} de ${Number(s.extras_totales || 0)} camillas (no censable)`
                    : `${s.camas_ocupadas} de ${s.total_camas} camas`}
                </p>
                <div style={styles.barra}>
                  <div
                    style={{
                      ...styles.barraInterna,
                      width: soloCamillas
                        ? `${Math.min(100, (Number(s.extras_ocupados || 0) / Math.max(1, Number(s.extras_totales || 1))) * 100)}%`
                        : `${s.porcentaje_ocupacion}%`,
                      background: pctValido ? colorOcupacion(pctNum) : '#C39C59',
                    }}
                  />
                </div>
              </button>
              );
            })}
          </div>
        )}
      </main>
      {/* Badge de versión: permite verificar a distancia si un usuario tiene
          la versión más reciente. Cambia automáticamente en cada deploy. */}
      <div style={versionBadgeStyle} title="Versión del bundle desplegado">
        v{import.meta.env.VITE_BUILD_ID || 'dev'}
      </div>
    </div>
  )
}

const versionBadgeStyle: React.CSSProperties = {
  position: 'fixed', bottom: 6, right: 8, fontSize: 10,
  color: '#888', background: 'rgba(255,255,255,0.7)',
  padding: '2px 6px', borderRadius: 4, zIndex: 1,
  fontFamily: 'monospace', pointerEvents: 'none',
}

function KpiCard({
  etiqueta,
  valor,
  color
}: {
  etiqueta: string
  valor: number | string
  color: string
}) {
  return (
    <div style={{ ...styles.kpi, borderLeftColor: color }}>
      <p style={styles.kpiEtiqueta}>{etiqueta}</p>
      <p style={{ ...styles.kpiValor, color }}>{valor}</p>
    </div>
  )
}

const COLOR_VERDE_IMSS = '#0E6755'
const COLOR_DORADO = '#C39C59'
const COLOR_FONDO = '#F5F1E8'
const COLOR_VERDE_OSCURO = '#265C4E'

const styles: Record<string, React.CSSProperties> = {
  contenedor: {
    minHeight: '100vh',
    background: COLOR_FONDO
  },
  header: {
    background: '#FFFFFF',
    borderBottom: `3px solid ${COLOR_DORADO}`,
    padding: '12px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap'
  },
  headerLogos: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap'
  },
  logoChico: {
    height: 40,
    width: 'auto',
    objectFit: 'contain'
  },
  headerUsuario: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'flex-end'
  },
  nombreUsuario: {
    margin: 0,
    fontSize: 13,
    color: COLOR_VERDE_IMSS,
    fontWeight: 500
  },
  matricula: {
    margin: 0,
    fontSize: 11,
    color: COLOR_VERDE_OSCURO
  },
  botonTablero: {
    background: '#C39C59',
    border: '1px solid #C39C59',
    color: '#fff',
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 4,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginRight: 8
  },
  botonInstructivo: {
    background: '#fff',
    border: '1px solid #0E6755',
    color: '#0E6755',
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 4,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginRight: 8
  },
  botonSalir: {
    background: 'transparent',
    border: `1px solid ${COLOR_VERDE_OSCURO}`,
    color: COLOR_VERDE_OSCURO,
    padding: '6px 12px',
    fontSize: 12,
    borderRadius: 4,
    cursor: 'pointer'
  },
  main: {
    padding: 'clamp(12px, 3vw, 24px)',
    maxWidth: 1280,
    margin: '0 auto'
  },
  tituloPagina: {
    margin: 0,
    fontSize: 22,
    color: COLOR_VERDE_IMSS,
    fontWeight: 500
  },
  fecha: {
    margin: '4px 0 24px',
    fontSize: 13,
    color: COLOR_VERDE_OSCURO,
    textTransform: 'capitalize'
  },
  kpisGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: 12,
    marginBottom: 32
  },
  kpi: {
    background: '#FFFFFF',
    borderLeft: '4px solid',
    borderRadius: '0 6px 6px 0',
    padding: 16
  },
  kpiEtiqueta: {
    margin: 0,
    fontSize: 12,
    color: COLOR_VERDE_OSCURO
  },
  kpiValor: {
    margin: '6px 0 0',
    fontSize: 28,
    fontWeight: 500
  },
  tituloSeccion: {
    margin: '0 0 12px',
    fontSize: 16,
    color: COLOR_VERDE_IMSS,
    fontWeight: 500
  },
  cargando: {
    color: COLOR_VERDE_OSCURO,
    fontSize: 14
  },
  online: {
    background: '#FFFFFF',
    border: '1px solid #5CAB34',
    borderLeft: '4px solid #5CAB34',
    borderRadius: 6,
    padding: '10px 14px',
    marginBottom: 16,
  },
  onlineTitulo: {
    fontSize: 12,
    fontWeight: 600,
    color: '#265C4E',
    marginBottom: 6,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  onlineLista: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  onlineChip: {
    fontSize: 11,
    background: '#E8F4EA',
    color: '#265C4E',
    padding: '4px 10px',
    borderRadius: 12,
    border: '1px solid #5CAB34',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#5CAB34',
    boxShadow: '0 0 0 2px rgba(92,171,52,0.25)',
    display: 'inline-block' as const,
  },
  onlineRol: {
    fontSize: 10,
    color: '#888780',
    textTransform: 'lowercase' as const,
  },
  onlinePantalla: {
    fontSize: 10,
    color: '#0E6755',
    background: '#FFFFFF',
    border: '1px solid #D5C49C',
    padding: '1px 6px',
    borderRadius: 8,
  },
  serviciosGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 10
  },
  tarjetaServicio: {
    background: '#FFFFFF',
    border: `1px solid ${COLOR_DORADO}`,
    borderRadius: 6,
    padding: 14,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    transition: 'transform 0.1s'
  },
  tarjetaCabecera: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  tarjetaNombre: {
    fontSize: 14,
    fontWeight: 500,
    color: COLOR_VERDE_IMSS
  },
  tarjetaPct: {
    fontSize: 14,
    fontWeight: 500
  },
  tarjetaDetalle: {
    margin: 0,
    fontSize: 12,
    color: COLOR_VERDE_OSCURO
  },
  barra: {
    marginTop: 8,
    background: COLOR_FONDO,
    height: 5,
    borderRadius: 3,
    overflow: 'hidden'
  },
  barraInterna: {
    height: '100%',
    transition: 'width 0.3s'
  }
}
