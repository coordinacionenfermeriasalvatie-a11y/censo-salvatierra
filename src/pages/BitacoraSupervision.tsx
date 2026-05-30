// Bitácora de Supervisión — concentrado de vales controlados del día.
// Tres turnos: Matutino (08:00-14:29), Vespertino (14:30-20:29), Nocturno (20:30-07:59).
// Visible para supervisor+, gestor solo ve sus propios vales.
//
// Workflow:
//   - Gestor crea vale → estado='pendiente'
//   - Supervisor da visto bueno → estado='aprobada' → puede canjearse
//   - Cuando se entrega físicamente el medicamento → estado='canjeada'
//   - Rechazar con motivo si hay problema.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { ROLES_ADMIN_GLOBAL, supervisionDeScope } from '../types';

type Turno = 'M' | 'V' | 'N';
type Estado = 'pendiente' | 'aprobada' | 'rechazada' | 'canjeada';

interface BitacoraRow {
  id: string;
  folio: string;
  creado_en: string;
  fecha_dia: string;
  turno: Turno;
  estado_aprobacion: Estado;
  aprobado_en: string | null;
  aprobado_nombre: string | null;
  canjeado_en: string | null;
  rechazo_motivo: string | null;
  observaciones: string | null;
  paciente_cama: string | null;
  paciente_nombre: string;
  paciente_edad: number | null;
  paciente_edad_unidad: string | null;
  paciente_genero: string | null;
  paciente_nss_curp: string | null;
  paciente_diagnostico: string | null;
  paciente_subservicio: string | null;
  servicio_codigo: string | null;
  servicio_nombre: string | null;
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
  cancelada_en: string | null;
  cancelada_motivo: string | null;
  cancelada_nombre: string | null;
}

const TURNO_INFO: Record<Turno, { label: string; horario: string; color: string }> = {
  M: { label: 'Matutino', horario: '08:00 — 14:29', color: '#2c5fa3' },
  V: { label: 'Vespertino', horario: '14:30 — 20:29', color: '#5CAB34' },
  N: { label: 'Nocturno', horario: '20:30 — 07:59', color: '#A32D2D' },
};

const ESTADO_INFO: Record<Estado, { label: string; color: string; fg: string }> = {
  pendiente: { label: 'Pendiente',  color: '#fff7e0', fg: '#7d5b2f' },
  aprobada:  { label: 'Aprobada',   color: '#dff5e6', fg: '#0E6755' },
  canjeada:  { label: 'Canjeada',   color: '#e0e8ff', fg: '#2c5fa3' },
  rechazada: { label: 'Rechazada',  color: '#fbeaea', fg: '#A32D2D' },
};

const hoyMazatlan = (): string => {
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'America/Mazatlan', year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

export const BitacoraSupervision: React.FC = () => {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Supervisión que se concentra. Supervisor con grupo manda; jefe/subjefe usan
  // ?sup= de la URL (1 por defecto).
  const supUrlRaw = searchParams.get('sup');
  const supUrl: 1 | 2 | null = supUrlRaw === '1' ? 1 : supUrlRaw === '2' ? 2 : null;
  const supEfectiva: 1 | 2 = supervisionDeScope(perfil) ?? supUrl ?? 1;
  // Modo principal (suplencia): cuando se activa desde la carpeta de Supervisión,
  // Sup 1 concentra TODOS los vales (Sup 1 + Sup 2). Solo aplica a la principal (1).
  const consolidado = supEfectiva === 1 && searchParams.get('consol') === '1';

  const [fecha, setFecha] = useState(hoyMazatlan());
  const [filas, setFilas] = useState<BitacoraRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<Estado | ''>('');
  const [filtroServicio, setFiltroServicio] = useState('');
  const [exportando, setExportando] = useState(false);

  const puedeAprobar = perfil && ROLES_ADMIN_GLOBAL.includes(perfil.rol);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    // Servicios a concentrar (trazabilidad: cada vale pertenece al servicio del
    // paciente, y el servicio pertenece a una supervisión). En modo principal
    // (consolidado) traemos TODOS para que Supervisión 1 absorba a Supervisión 2.
    let svcQ = supabase.from('servicios').select('codigo');
    if (!consolidado) svcQ = svcQ.eq('supervision', supEfectiva);
    const { data: svc } = await svcQ;
    const codigos = (svc || []).map((r: any) => r.codigo);
    // Sin servicios en esta supervisión: no mostramos nada. Evita que un filtro
    // `.in()` vacío degenere en "todos los vales" (vales mezclados entre sup.).
    if (codigos.length === 0) {
      setFilas([]);
      setCargando(false);
      return;
    }
    let q = supabase.from('v_bitacora_supervision')
      .select('*')
      .eq('fecha_dia', fecha)
      .in('servicio_codigo', codigos)
      .order('creado_en', { ascending: true });
    if (filtroEstado) q = q.eq('estado_aprobacion', filtroEstado);
    if (filtroServicio) q = q.eq('servicio_codigo', filtroServicio);
    const { data, error: err } = await q;
    if (err) setError(err.message);
    else setFilas((data || []) as BitacoraRow[]);
    setCargando(false);
  }, [fecha, filtroEstado, filtroServicio, supEfectiva, consolidado]);

  useEffect(() => { cargar(); }, [cargar]);

  const porTurno = useMemo(() => {
    const grupo: Record<Turno, BitacoraRow[]> = { M: [], V: [], N: [] };
    for (const f of filas) grupo[f.turno].push(f);
    return grupo;
  }, [filas]);

  const conteoEstado = useMemo(() => {
    const c = { pendiente: 0, aprobada: 0, canjeada: 0, rechazada: 0, anulada: 0 };
    for (const f of filas) {
      if (f.cancelada_en) c.anulada++;
      else c[f.estado_aprobacion]++;
    }
    return c;
  }, [filas]);

  const serviciosUnicos = useMemo(() => {
    const set = new Set<string>();
    for (const f of filas) if (f.servicio_codigo) set.add(f.servicio_codigo);
    return Array.from(set).sort();
  }, [filas]);

  const aprobar = async (id: string) => {
    if (!perfil) return;
    const { error: err } = await supabase
      .from('recetas_controladas')
      .update({
        estado_aprobacion: 'aprobada',
        aprobado_en: new Date().toISOString(),
        aprobado_por: perfil.id,
        aprobado_nombre: perfil.nombre_completo,
      })
      .eq('id', id);
    if (err) { alert('Error al aprobar: ' + err.message); return; }
    cargar();
  };

  const rechazar = async (id: string) => {
    if (!perfil) return;
    const motivo = window.prompt('Motivo del rechazo:');
    if (!motivo) return;
    const { error: err } = await supabase
      .from('recetas_controladas')
      .update({
        estado_aprobacion: 'rechazada',
        aprobado_en: new Date().toISOString(),
        aprobado_por: perfil.id,
        aprobado_nombre: perfil.nombre_completo,
        rechazo_motivo: motivo,
      })
      .eq('id', id);
    if (err) { alert('Error al rechazar: ' + err.message); return; }
    cargar();
  };

  const marcarCanjeada = async (id: string) => {
    if (!perfil) return;
    const { error: err } = await supabase
      .from('recetas_controladas')
      .update({
        estado_aprobacion: 'canjeada',
        canjeado_en: new Date().toISOString(),
        canjeado_por: perfil.id,
        canjeado_nombre: perfil.nombre_completo,
      })
      .eq('id', id);
    if (err) { alert('Error: ' + err.message); return; }
    cargar();
  };

  // Anular un vale (libro de controlados: no se borra, se marca anulado con
  // motivo; si estaba canjeado, el RPC revierte el movimiento de stock).
  const anular = async (id: string, folio: string, estaCanjeada: boolean) => {
    if (!perfil) return;
    const aviso = estaCanjeada
      ? `Anular el vale ${folio}. Estaba CANJEADA: se revertirá el medicamento utilizado al stock.\n\nMotivo de la anulación:`
      : `Anular el vale ${folio} (queda en el historial).\n\nMotivo de la anulación:`;
    const motivo = window.prompt(aviso);
    if (motivo === null) return;
    if (!motivo.trim()) { alert('Debes indicar un motivo para anular.'); return; }
    const { error: err } = await supabase.rpc('fn_anular_receta_controlada', {
      p_id: id, p_motivo: motivo.trim(),
    });
    if (err) { alert('Error al anular: ' + err.message); return; }
    cargar();
  };

  const exportarExcel = async () => {
    setExportando(true);
    try {
      const { exportarBitacoraDia } = await import('../utils/exportarBitacora');
      await exportarBitacoraDia(fecha, filas, perfil?.nombre_completo || 'Supervisión');
    } catch (e: any) {
      alert('Error al exportar: ' + (e.message || e));
    } finally {
      setExportando(false);
    }
  };

  if (!perfil) return <div style={cargandoStyle}>Verificando perfil...</div>;

  return (
    <div style={pagina}>
      <div style={header}>
        <div>
          <h1 style={titulo}>📋 Bitácora de Supervisión {consolidado ? '1 · consolidada' : supEfectiva} — Medicamentos Controlados</h1>
          <p style={subt}>
            Concentrado diario · turnos Matutino, Vespertino y Nocturno ·
            {consolidado ? ' MODO PRINCIPAL: concentra Supervisión 1 + 2' : ` servicios de Supervisión ${supEfectiva}`}
          </p>
        </div>
        <button onClick={() => navigate('/')} style={btnVolver}>← Dashboard</button>
      </div>

      <div style={controles}>
        <div>
          <label style={lbl}>Fecha</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={input} />
        </div>
        <div>
          <label style={lbl}>Servicio</label>
          <select value={filtroServicio} onChange={e => setFiltroServicio(e.target.value)} style={input}>
            <option value="">Todos</option>
            {serviciosUnicos.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Estado</label>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value as Estado | '')} style={input}>
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="aprobada">Aprobada</option>
            <option value="canjeada">Canjeada</option>
            <option value="rechazada">Rechazada</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button onClick={exportarExcel} disabled={exportando || filas.length === 0} style={btnExportar}>
            {exportando ? 'Exportando...' : '📊 Exportar a Excel'}
          </button>
        </div>
      </div>

      {/* CONTEOS */}
      <div style={kpis}>
        <Kpi label="Pendiente"  valor={conteoEstado.pendiente} color="#7d5b2f" />
        <Kpi label="Aprobadas"  valor={conteoEstado.aprobada}  color="#0E6755" />
        <Kpi label="Canjeadas"  valor={conteoEstado.canjeada}  color="#2c5fa3" />
        <Kpi label="Rechazadas" valor={conteoEstado.rechazada} color="#A32D2D" />
        <Kpi label="Anuladas"   valor={conteoEstado.anulada}   color="#666" />
        <Kpi label="Total"      valor={filas.length}           color="#000" />
      </div>

      {error && <div style={errBanner}>⚠️ {error}</div>}

      {cargando ? (
        <div style={cargandoStyle}>Cargando bitácora...</div>
      ) : (
        (['M','V','N'] as Turno[]).map(t => (
          <SeccionTurno
            key={t}
            turno={t}
            filas={porTurno[t]}
            puedeAprobar={!!puedeAprobar}
            onAprobar={aprobar}
            onRechazar={rechazar}
            onCanjear={marcarCanjeada}
            onAnular={anular}
          />
        ))
      )}
    </div>
  );
};

// ============================================================
const Kpi: React.FC<{ label: string; valor: number; color: string }> = ({ label, valor, color }) => (
  <div style={kpiCard}>
    <div style={{ ...kpiValor, color }}>{valor}</div>
    <div style={kpiLabel}>{label}</div>
  </div>
);

const SeccionTurno: React.FC<{
  turno: Turno;
  filas: BitacoraRow[];
  puedeAprobar: boolean;
  onAprobar: (id: string) => void;
  onRechazar: (id: string) => void;
  onCanjear: (id: string) => void;
  onAnular: (id: string, folio: string, estaCanjeada: boolean) => void;
}> = ({ turno, filas, puedeAprobar, onAprobar, onRechazar, onCanjear, onAnular }) => {
  const info = TURNO_INFO[turno];
  return (
    <div style={seccion}>
      <div style={{ ...seccionHeader, background: info.color }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>Turno {info.label}</span>
        <span style={{ fontSize: 12, opacity: 0.9 }}>{info.horario}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.9 }}>{filas.length} vale{filas.length !== 1 ? 's' : ''}</span>
      </div>
      {filas.length === 0 ? (
        <div style={vacio}>Sin vales en este turno.</div>
      ) : (
        <table style={tabla}>
          <thead>
            <tr>
              <th style={th}>Folio</th>
              <th style={th}>Hora</th>
              <th style={th}>Servicio</th>
              <th style={th}>Cama</th>
              <th style={th}>Paciente</th>
              <th style={th}>NSS / Exp</th>
              <th style={th}>Diagnóstico</th>
              <th style={th}>Medicamento</th>
              <th style={th}>Cantidad</th>
              <th style={th}>Médico</th>
              <th style={th}>Enfermería solicita</th>
              <th style={th}>Estado</th>
              <th style={th}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const anulada = !!f.cancelada_en;
              return (
              <tr key={f.id} style={{ ...(i % 2 === 0 ? trAlt : {}), ...(anulada ? trAnulada : {}) }}>
                <td style={td}><strong>{f.folio}</strong></td>
                <td style={tdSm}>{new Date(f.creado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mazatlan' })}</td>
                <td style={tdSm}>{f.servicio_codigo}<br /><span style={{ color: '#888', fontSize: 10 }}>{f.paciente_subservicio}</span></td>
                <td style={td}>{f.paciente_cama}</td>
                <td style={td}>{f.paciente_nombre}<br /><span style={{ color: '#888', fontSize: 10 }}>{f.paciente_edad}{f.paciente_edad_unidad ? ' ' + f.paciente_edad_unidad : ''} · {f.paciente_genero}</span></td>
                <td style={tdSm}>{f.paciente_nss_curp || '—'}</td>
                <td style={tdSm}>{f.paciente_diagnostico}</td>
                <td style={td}><strong>{f.medicamento_nombre}</strong><br /><span style={{ color: '#888', fontSize: 10 }}>{f.dosis} · {f.via} · {f.frecuencia}</span></td>
                <td style={tdSm}>{f.cantidad_numero}<br /><span style={{ color: '#888', fontSize: 10 }}>{f.cantidad_letra}</span></td>
                <td style={tdSm}>{f.medico_nombre}<br /><span style={{ color: '#888', fontSize: 10 }}>Céd. {f.medico_cedula}</span></td>
                <td style={tdSm}>{f.enfermera_nombre}<br /><span style={{ color: '#888', fontSize: 10 }}>Mat. {f.enfermera_matricula}</span></td>
                <td style={td}>
                  {anulada ? (
                    <span style={{ ...chipEstado, background: '#eee', color: '#666' }}>Anulada</span>
                  ) : (
                    <span style={{
                      ...chipEstado,
                      background: ESTADO_INFO[f.estado_aprobacion].color,
                      color: ESTADO_INFO[f.estado_aprobacion].fg,
                    }}>
                      {ESTADO_INFO[f.estado_aprobacion].label}
                    </span>
                  )}
                  {f.aprobado_nombre && !anulada && (
                    <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                      {f.aprobado_nombre}
                    </div>
                  )}
                  {f.rechazo_motivo && (
                    <div style={{ fontSize: 10, color: '#A32D2D', marginTop: 2 }}>
                      Motivo: {f.rechazo_motivo}
                    </div>
                  )}
                  {anulada && (
                    <div style={{ fontSize: 10, color: '#A32D2D', marginTop: 2 }}>
                      Anulada{f.cancelada_nombre ? ` por ${f.cancelada_nombre}` : ''}
                      {f.cancelada_motivo ? ` — ${f.cancelada_motivo}` : ''}
                    </div>
                  )}
                </td>
                <td style={tdAcciones}>
                  {puedeAprobar && !anulada && f.estado_aprobacion === 'pendiente' && (
                    <>
                      <button onClick={() => onAprobar(f.id)} style={btnAprobar} title="Dar visto bueno">✓ Aprobar</button>
                      <button onClick={() => onRechazar(f.id)} style={btnRechazar} title="Rechazar con motivo">✕ Rechazar</button>
                    </>
                  )}
                  {puedeAprobar && !anulada && f.estado_aprobacion === 'aprobada' && (
                    <button onClick={() => onCanjear(f.id)} style={btnCanjear} title="Marcar como canjeada (medicamento entregado)">📦 Canjeada</button>
                  )}
                  <button
                    onClick={() => window.open(`/imprimir/receta-controlada/${f.id}`, '_blank')}
                    style={btnImprimir}
                    title="Ver/imprimir receta"
                  >🖨️</button>
                  {puedeAprobar && !anulada && (
                    <button
                      onClick={() => onAnular(f.id, f.folio, f.estado_aprobacion === 'canjeada')}
                      style={btnAnular}
                      title="Anular vale (queda en el historial)"
                    >✕ Anular</button>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

// ============================================================
const pagina: React.CSSProperties = { padding: 16, background: '#F2EBE4', minHeight: '100vh' };
const header: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 };
const titulo: React.CSSProperties = { color: '#0E6755', fontSize: 22, fontWeight: 700, margin: 0 };
const subt: React.CSSProperties = { color: '#7d5b2f', fontSize: 12, margin: '4px 0 0' };
const btnVolver: React.CSSProperties = { background: '#fff', border: '1px solid #C39C59', color: '#0E6755', padding: '8px 14px', borderRadius: 4, cursor: 'pointer', fontWeight: 600 };
const controles: React.CSSProperties = { display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-end', background: '#fff', border: '1px solid #C39C59', borderRadius: 6, padding: 10 };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: '#7d5b2f', fontWeight: 600, marginBottom: 3 };
const input: React.CSSProperties = { padding: '6px 10px', border: '1px solid #C39C59', borderRadius: 4, fontSize: 13, background: '#fff' };
const btnExportar: React.CSSProperties = { padding: '8px 14px', background: '#0E6755', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 700, cursor: 'pointer' };
const kpis: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 12 };
const kpiCard: React.CSSProperties = { background: '#fff', border: '1px solid #C39C59', borderRadius: 6, padding: 10, textAlign: 'center' };
const kpiValor: React.CSSProperties = { fontSize: 24, fontWeight: 800, lineHeight: 1 };
const kpiLabel: React.CSSProperties = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 };
const seccion: React.CSSProperties = { background: '#fff', border: '1px solid #C39C59', borderRadius: 6, marginBottom: 12, overflow: 'hidden' };
const seccionHeader: React.CSSProperties = { color: '#fff', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 12 };
const vacio: React.CSSProperties = { padding: 24, textAlign: 'center', color: '#888', fontStyle: 'italic' };
const tabla: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 11 };
const th: React.CSSProperties = { background: '#f5f1e8', color: '#7d5b2f', padding: '6px 8px', textAlign: 'left', fontWeight: 700, fontSize: 10, borderBottom: '2px solid #C39C59' };
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #eee', verticalAlign: 'top' };
const tdSm: React.CSSProperties = { ...td, fontSize: 10 };
const tdAcciones: React.CSSProperties = { ...td, whiteSpace: 'nowrap', display: 'flex', flexDirection: 'column', gap: 2 };
const trAlt: React.CSSProperties = { background: '#fafafa' };
const trAnulada: React.CSSProperties = { background: '#f3f3f3', opacity: 0.6, textDecoration: 'line-through' };
const chipEstado: React.CSSProperties = { padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, display: 'inline-block' };
const btnAprobar: React.CSSProperties = { background: '#0E6755', color: '#fff', border: 'none', borderRadius: 3, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' };
const btnRechazar: React.CSSProperties = { background: '#A32D2D', color: '#fff', border: 'none', borderRadius: 3, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' };
const btnCanjear: React.CSSProperties = { background: '#2c5fa3', color: '#fff', border: 'none', borderRadius: 3, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' };
const btnImprimir: React.CSSProperties = { background: '#fff', color: '#7d5b2f', border: '1px solid #C39C59', borderRadius: 3, padding: '3px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer' };
const btnAnular: React.CSSProperties = { background: '#fff', color: '#A32D2D', border: '1px solid #A32D2D', borderRadius: 3, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' };
const errBanner: React.CSSProperties = { background: '#fbeaea', border: '1px solid #A32D2D', color: '#A32D2D', padding: 10, borderRadius: 4, marginBottom: 10 };
const cargandoStyle: React.CSSProperties = { padding: 40, textAlign: 'center', color: '#888', fontStyle: 'italic' };
