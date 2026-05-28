// Tablero de Auditoría — solo jefes.
// 4 sub-pestañas: Timeline cronológico, Ranking por usuario,
// Ranking por sección, Detalle por paciente.
//
// La RLS de v_auditoria_legible (heredada de auditoria) restringe lectura
// a rol='jefe' — sin defensa adicional en cliente.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { formatearRol } from '../types';

type Sub = 'timeline' | 'usuario' | 'seccion' | 'paciente';

interface FilaTimeline {
  id: string;
  registrado_en: string;
  tabla: string;
  seccion: string;
  operacion: 'INSERT' | 'UPDATE' | 'DELETE';
  campo: string | null;
  valor_anterior: any;
  valor_nuevo: any;
  motivo: string | null;
  usuario_nombre: string;
  usuario_rol: string | null;
  usuario_servicio_codigo: string | null;
}

interface FilaRankingUsuario {
  usuario_id: string;
  usuario_nombre: string;
  usuario_rol: string | null;
  usuario_servicio_codigo: string | null;
  inserts: number;
  updates: number;
  deletes: number;
  total_cambios: number;
  ultimo_cambio: string;
}

interface FilaRankingSeccion {
  seccion: string;
  inserts: number;
  updates: number;
  deletes: number;
  total_cambios: number;
  usuarios_distintos: number;
}

interface FilaPaciente {
  id: string;
  registrado_en: string;
  tabla: string;
  seccion: string;
  operacion: string;
  campo: string | null;
  valor_anterior: any;
  valor_nuevo: any;
  usuario_nombre: string;
  paciente_id: string | null;
}

const SECCION_COLOR: Record<string, string> = {
  Censo: '#0E6755',
  Control: '#5a4a8a',
  Dietas: '#1a5f8a',
  Recetario: '#7d5b2f',
  Productividad: '#A32D2D',
  Asignaciones: '#265C4E',
  'Clínica de Heridas': '#d97a3a',
};

const OPER_COLOR: Record<string, string> = {
  INSERT: '#0E6755',
  UPDATE: '#7d5b2f',
  DELETE: '#A32D2D',
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('es-MX', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
};

export const Auditoria: React.FC = () => {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const [sub, setSub] = useState<Sub>('timeline');

  if (!perfil || !['jefe','subjefe','supervisor'].includes(perfil.rol)) {
    return (
      <div style={styles.bloqueado}>
        🚫 Solo administradores globales pueden ver este tablero.
        <button onClick={() => navigate('/')} style={styles.btnVolver}>Volver al inicio</button>
      </div>
    );
  }

  const accesoCompleto = perfil.rol === 'jefe' || perfil.es_admin_sistema === true;

  return (
    <div style={styles.pagina}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.titulo}>🔍 Tablero de Auditoría</h1>
          <p style={styles.subtitulo}>
            {accesoCompleto
              ? 'Quién hace qué cambios en el sistema · últimos 30 días'
              : 'Vista limitada: hoy y solo tu turno actual. La vista histórica completa la ve la jefatura y administrador del sistema.'}
          </p>
        </div>
        <button onClick={() => navigate('/')} style={styles.btnVolver}>← Dashboard</button>
      </div>

      {!accesoCompleto && (
        <div style={styles.avisoLimitado}>
          ⚠️ Estás viendo solo los movimientos de tu turno actual de hoy. Para auditoría histórica completa contacta a la jefatura de enfermería.
        </div>
      )}

      <div style={styles.tabs}>
        {([
          ['timeline', '📜 Cronológico'],
          ['usuario',  '👥 Por usuario'],
          ['seccion',  '🗂️ Por sección'],
          ['paciente', '🩺 Por paciente'],
        ] as [Sub, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSub(key)}
            style={{ ...styles.tab, ...(sub === key ? styles.tabActivo : {}) }}
          >{label}</button>
        ))}
      </div>

      <div style={styles.contenido}>
        {sub === 'timeline'  && <Timeline />}
        {sub === 'usuario'   && <RankingUsuario />}
        {sub === 'seccion'   && <RankingSeccion />}
        {sub === 'paciente'  && <PorPaciente />}
      </div>
    </div>
  );
};

// ============================================================
// Sub 1: Timeline cronológico
// ============================================================
const Timeline: React.FC = () => {
  const [filas, setFilas] = useState<FilaTimeline[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroSeccion, setFiltroSeccion] = useState('');
  const [filtroOper, setFiltroOper] = useState('');
  const [limite, setLimite] = useState(200);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    let q = supabase.from('v_auditoria_legible')
      .select('*')
      .order('registrado_en', { ascending: false })
      .limit(limite);
    if (filtroSeccion) q = q.eq('seccion', filtroSeccion);
    if (filtroOper) q = q.eq('operacion', filtroOper);
    if (filtroUsuario) q = q.ilike('usuario_nombre', `%${filtroUsuario}%`);
    const { data, error: err } = await q;
    if (err) setError(err.message);
    else setFilas((data || []) as FilaTimeline[]);
    setCargando(false);
  }, [filtroUsuario, filtroSeccion, filtroOper, limite]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div>
      <div style={styles.filtros}>
        <input
          type="text" placeholder="Filtrar por usuario..."
          value={filtroUsuario} onChange={e => setFiltroUsuario(e.target.value)}
          style={styles.input}
        />
        <select value={filtroSeccion} onChange={e => setFiltroSeccion(e.target.value)} style={styles.input}>
          <option value="">Todas las secciones</option>
          {Object.keys(SECCION_COLOR).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filtroOper} onChange={e => setFiltroOper(e.target.value)} style={styles.input}>
          <option value="">Todas las operaciones</option>
          <option value="INSERT">Crear</option>
          <option value="UPDATE">Editar</option>
          <option value="DELETE">Eliminar</option>
        </select>
        <select value={limite} onChange={e => setLimite(parseInt(e.target.value, 10))} style={styles.input}>
          <option value={100}>Últimos 100</option>
          <option value={200}>Últimos 200</option>
          <option value={500}>Últimos 500</option>
          <option value={1000}>Últimos 1000</option>
        </select>
      </div>

      {error && <div style={styles.error}>⚠️ {error}</div>}
      {cargando ? <div style={styles.vacio}>Cargando...</div> : (
        filas.length === 0 ? <div style={styles.vacio}>Sin resultados con esos filtros.</div> : (
          <div style={styles.timeline}>
            {filas.map(f => (
              <div key={f.id} style={styles.timelineFila}>
                <div style={{ ...styles.chip, background: SECCION_COLOR[f.seccion] || '#888' }}>{f.seccion}</div>
                <div style={{ ...styles.chipOper, background: OPER_COLOR[f.operacion] }}>
                  {f.operacion === 'INSERT' ? 'Crear' : f.operacion === 'UPDATE' ? 'Editar' : 'Eliminar'}
                </div>
                <div style={styles.timelineMid}>
                  <div style={styles.timelineUsuario}>
                    {f.usuario_nombre}
                    {f.usuario_rol && <span style={styles.rol}> · {formatearRol(f.usuario_rol)}</span>}
                    {f.usuario_servicio_codigo && <span style={styles.servicio}> · {f.usuario_servicio_codigo}</span>}
                  </div>
                  <div style={styles.timelineDetalle}>
                    {f.tabla}{f.campo ? ` · campo "${f.campo}"` : ''}
                    {f.motivo && <span style={styles.motivo}> — {f.motivo}</span>}
                  </div>
                  {f.campo && (f.valor_anterior !== null || f.valor_nuevo !== null) && (
                    <div style={styles.cambio}>
                      <span style={styles.antes}>{stringify(f.valor_anterior)}</span>
                      <span> → </span>
                      <span style={styles.despues}>{stringify(f.valor_nuevo)}</span>
                    </div>
                  )}
                </div>
                <div style={styles.timelineFecha}>{fmt(f.registrado_en)}</div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
};

// ============================================================
// Sub 2: Ranking por usuario
// ============================================================
const RankingUsuario: React.FC = () => {
  const [filas, setFilas] = useState<FilaRankingUsuario[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('v_auditoria_ranking_usuario')
        .select('*')
        .order('total_cambios', { ascending: false })
        .limit(100);
      setFilas((data || []) as FilaRankingUsuario[]);
      setCargando(false);
    })();
  }, []);

  const maxTotal = useMemo(() => Math.max(1, ...filas.map(f => f.total_cambios)), [filas]);

  if (cargando) return <div style={styles.vacio}>Cargando...</div>;
  if (filas.length === 0) return <div style={styles.vacio}>Sin actividad en últimos 30 días.</div>;

  return (
    <table style={styles.tabla}>
      <thead>
        <tr>
          <th style={styles.th}>#</th>
          <th style={styles.th}>Usuario</th>
          <th style={styles.th}>Rol</th>
          <th style={styles.th}>Servicio</th>
          <th style={{ ...styles.th, textAlign: 'right' }}>Crear</th>
          <th style={{ ...styles.th, textAlign: 'right' }}>Editar</th>
          <th style={{ ...styles.th, textAlign: 'right' }}>Eliminar</th>
          <th style={{ ...styles.th, textAlign: 'right' }}>Total</th>
          <th style={styles.th}>Volumen</th>
          <th style={styles.th}>Último</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={f.usuario_id} style={i % 2 === 0 ? styles.trAlt : undefined}>
            <td style={styles.td}>{i + 1}</td>
            <td style={styles.td}><strong>{f.usuario_nombre}</strong></td>
            <td style={styles.td}>{formatearRol(f.usuario_rol)}</td>
            <td style={styles.td}>{f.usuario_servicio_codigo || '—'}</td>
            <td style={{ ...styles.td, textAlign: 'right', color: '#0E6755' }}>{f.inserts}</td>
            <td style={{ ...styles.td, textAlign: 'right', color: '#7d5b2f' }}>{f.updates}</td>
            <td style={{ ...styles.td, textAlign: 'right', color: '#A32D2D' }}>{f.deletes}</td>
            <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700 }}>{f.total_cambios}</td>
            <td style={styles.td}>
              <div style={styles.barra}>
                <div style={{ ...styles.barraFill, width: `${(f.total_cambios / maxTotal) * 100}%` }} />
              </div>
            </td>
            <td style={{ ...styles.td, fontSize: 11, color: '#666' }}>{fmt(f.ultimo_cambio)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// ============================================================
// Sub 3: Ranking por sección
// ============================================================
const RankingSeccion: React.FC = () => {
  const [filas, setFilas] = useState<FilaRankingSeccion[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('v_auditoria_ranking_seccion')
        .select('*')
        .order('total_cambios', { ascending: false });
      setFilas((data || []) as FilaRankingSeccion[]);
      setCargando(false);
    })();
  }, []);

  const maxTotal = useMemo(() => Math.max(1, ...filas.map(f => f.total_cambios)), [filas]);

  if (cargando) return <div style={styles.vacio}>Cargando...</div>;

  return (
    <div style={styles.seccionGrid}>
      {filas.map(f => (
        <div key={f.seccion} style={styles.seccionCard}>
          <div style={{ ...styles.seccionHeader, background: SECCION_COLOR[f.seccion] || '#888' }}>
            {f.seccion}
          </div>
          <div style={styles.seccionTotal}>{f.total_cambios.toLocaleString('es-MX')}</div>
          <div style={styles.seccionLabel}>cambios totales</div>
          <div style={styles.barra}>
            <div style={{ ...styles.barraFill, width: `${(f.total_cambios / maxTotal) * 100}%`, background: SECCION_COLOR[f.seccion] || '#888' }} />
          </div>
          <div style={styles.seccionDetalles}>
            <div>➕ Crear: <strong>{f.inserts}</strong></div>
            <div>✏️ Editar: <strong>{f.updates}</strong></div>
            <div>🗑️ Eliminar: <strong>{f.deletes}</strong></div>
            <div>👥 {f.usuarios_distintos} usuario{f.usuarios_distintos !== 1 ? 's' : ''}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================================================
// Sub 4: Detalle por paciente
// ============================================================
const PorPaciente: React.FC = () => {
  const [busqueda, setBusqueda] = useState('');
  const [pacientes, setPacientes] = useState<{ id: string; nombre_paciente: string; nss_curp: string | null; subservicio: string | null }[]>([]);
  const [pacienteSel, setPacienteSel] = useState<string | null>(null);
  const [eventos, setEventos] = useState<FilaPaciente[]>([]);
  const [cargando, setCargando] = useState(false);

  // Buscar pacientes por nombre o NSS/CURP
  useEffect(() => {
    if (busqueda.length < 2) { setPacientes([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('pacientes')
        .select('id, nombre_paciente, nss_curp, subservicio_id, subservicios(nombre)')
        .or(`nombre_paciente.ilike.%${busqueda}%,nss_curp.ilike.%${busqueda}%`)
        .order('fecha_ingreso', { ascending: false })
        .limit(20);
      setPacientes((data || []).map((p: any) => ({
        id: p.id,
        nombre_paciente: p.nombre_paciente,
        nss_curp: p.nss_curp,
        subservicio: p.subservicios?.nombre ?? null,
      })));
    }, 250);
    return () => clearTimeout(t);
  }, [busqueda]);

  // Cargar historial al seleccionar paciente
  useEffect(() => {
    if (!pacienteSel) { setEventos([]); return; }
    setCargando(true);
    (async () => {
      const { data } = await supabase.from('v_auditoria_paciente')
        .select('*')
        .eq('paciente_id', pacienteSel)
        .order('registrado_en', { ascending: false })
        .limit(500);
      setEventos((data || []) as FilaPaciente[]);
      setCargando(false);
    })();
  }, [pacienteSel]);

  const pacienteNombre = pacientes.find(p => p.id === pacienteSel)?.nombre_paciente
    || (pacienteSel ? '(paciente seleccionado)' : '');

  return (
    <div>
      <div style={styles.filtros}>
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar paciente por nombre o NSS/CURP..."
          style={{ ...styles.input, flex: 1 }}
        />
      </div>

      {pacientes.length > 0 && !pacienteSel && (
        <div style={styles.pacienteLista}>
          {pacientes.map(p => (
            <div key={p.id} style={styles.pacienteItem} onClick={() => setPacienteSel(p.id)}>
              <div><strong>{p.nombre_paciente}</strong></div>
              <div style={styles.pacienteSub}>{p.subservicio || '—'} · NSS/CURP: {p.nss_curp || '—'}</div>
            </div>
          ))}
        </div>
      )}

      {pacienteSel && (
        <>
          <div style={styles.pacienteSelHeader}>
            <strong>Historial de: {pacienteNombre}</strong>
            <button onClick={() => { setPacienteSel(null); setEventos([]); setBusqueda(''); }} style={styles.btnSecundario}>Cambiar paciente</button>
          </div>
          {cargando ? <div style={styles.vacio}>Cargando historial...</div> : (
            eventos.length === 0 ? <div style={styles.vacio}>Sin cambios registrados para este paciente.</div> : (
              <div style={styles.timeline}>
                {eventos.map(e => (
                  <div key={e.id} style={styles.timelineFila}>
                    <div style={{ ...styles.chip, background: SECCION_COLOR[e.seccion] || '#888' }}>{e.seccion}</div>
                    <div style={{ ...styles.chipOper, background: OPER_COLOR[e.operacion] }}>
                      {e.operacion === 'INSERT' ? 'Crear' : e.operacion === 'UPDATE' ? 'Editar' : 'Eliminar'}
                    </div>
                    <div style={styles.timelineMid}>
                      <div style={styles.timelineUsuario}>{e.usuario_nombre}</div>
                      <div style={styles.timelineDetalle}>
                        {e.tabla}{e.campo ? ` · ${e.campo}` : ''}
                      </div>
                      {e.campo && (e.valor_anterior !== null || e.valor_nuevo !== null) && (
                        <div style={styles.cambio}>
                          <span style={styles.antes}>{stringify(e.valor_anterior)}</span>
                          <span> → </span>
                          <span style={styles.despues}>{stringify(e.valor_nuevo)}</span>
                        </div>
                      )}
                    </div>
                    <div style={styles.timelineFecha}>{fmt(e.registrado_en)}</div>
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
};

// ============================================================
function stringify(v: any): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'string') return v.length > 60 ? v.slice(0, 60) + '...' : v;
  const s = JSON.stringify(v);
  return s.length > 60 ? s.slice(0, 60) + '...' : s;
}

const styles: Record<string, React.CSSProperties> = {
  pagina: { padding: 16, background: '#F2EBE4', minHeight: '100vh' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  titulo: { color: '#0E6755', fontSize: 24, fontWeight: 700, margin: 0 },
  subtitulo: { color: '#7d5b2f', fontSize: 13, margin: '4px 0 0' },
  btnVolver: { background: '#fff', border: '1px solid #C39C59', color: '#0E6755', padding: '8px 14px', borderRadius: 4, cursor: 'pointer', fontWeight: 600 },
  btnSecundario: { background: '#fff', border: '1px solid #C39C59', color: '#7d5b2f', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11 },
  tabs: { display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' as const },
  tab: { background: '#fff', border: '1px solid #C39C59', color: '#7d5b2f', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  tabActivo: { background: '#0E6755', color: '#fff', borderColor: '#0E6755' },
  contenido: { background: '#fff', border: '1px solid #C39C59', borderRadius: 6, padding: 12 },
  filtros: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' as const },
  input: { padding: '6px 10px', border: '1px solid #C39C59', borderRadius: 4, fontSize: 13, background: '#fff' },
  error: { background: '#fbeaea', border: '1px solid #A32D2D', color: '#A32D2D', padding: 8, borderRadius: 4, marginBottom: 8 },
  vacio: { padding: 24, textAlign: 'center' as const, color: '#888', fontStyle: 'italic' },
  bloqueado: { padding: 40, textAlign: 'center' as const, color: '#A32D2D', fontSize: 16 },
  avisoLimitado: { background: '#fff7e0', border: '1px solid #C39C59', color: '#7d5b2f', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13 },
  timeline: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  timelineFila: { display: 'flex', alignItems: 'flex-start', gap: 8, padding: 8, borderBottom: '1px solid #eee', fontSize: 12 },
  chip: { color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' as const, minWidth: 80, textAlign: 'center' as const },
  chipOper: { color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' as const, minWidth: 50, textAlign: 'center' as const },
  timelineMid: { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 2 },
  timelineUsuario: { fontWeight: 600, color: '#0E6755', fontSize: 12 },
  rol: { color: '#7d5b2f', fontWeight: 500 },
  servicio: { color: '#5a4a8a', fontWeight: 500 },
  timelineDetalle: { color: '#555', fontSize: 11 },
  motivo: { fontStyle: 'italic' as const, color: '#888' },
  cambio: { fontSize: 11, color: '#444', display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' as const },
  antes: { background: '#fbeaea', padding: '1px 6px', borderRadius: 3, color: '#A32D2D', textDecoration: 'line-through' as const },
  despues: { background: '#dff5e6', padding: '1px 6px', borderRadius: 3, color: '#0E6755', fontWeight: 600 },
  timelineFecha: { fontSize: 10, color: '#888', whiteSpace: 'nowrap' as const, minWidth: 90, textAlign: 'right' as const },
  tabla: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 },
  th: { background: '#0E6755', color: '#fff', padding: '8px 10px', textAlign: 'left' as const, fontWeight: 700 },
  td: { padding: '6px 10px', borderBottom: '1px solid #eee' },
  trAlt: { background: '#fafafa' },
  barra: { height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' as const, minWidth: 80 },
  barraFill: { height: '100%', background: '#0E6755', borderRadius: 4 },
  seccionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
  seccionCard: { border: '1px solid #C39C59', borderRadius: 6, overflow: 'hidden' as const, background: '#fff' },
  seccionHeader: { color: '#fff', padding: '8px 12px', fontWeight: 700, fontSize: 13 },
  seccionTotal: { fontSize: 32, fontWeight: 700, color: '#0E6755', padding: '12px 12px 0', lineHeight: 1 },
  seccionLabel: { padding: '0 12px 12px', color: '#888', fontSize: 11, textTransform: 'uppercase' as const },
  seccionDetalles: { padding: '8px 12px', borderTop: '1px solid #eee', fontSize: 11, color: '#555', display: 'flex', flexDirection: 'column' as const, gap: 2 },
  pacienteLista: { display: 'flex', flexDirection: 'column' as const, gap: 4, marginTop: 8 },
  pacienteItem: { padding: 8, border: '1px solid #eee', borderRadius: 4, cursor: 'pointer', background: '#fafafa' },
  pacienteSub: { fontSize: 11, color: '#888' },
  pacienteSelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, background: '#fff7e0', border: '1px solid #C39C59', borderRadius: 4, marginBottom: 8 },
};
