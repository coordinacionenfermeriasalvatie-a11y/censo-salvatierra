// Bitácora de Stock de Medicamentos Psicotrópicos.
// Una hoja por día. Visible para jefe + subjefe + supervisor.
//
// Muestra:
//   - 12 medicamentos del fondo fijo
//   - Stock actual (calculado: fondo + recibido - utilizado - surtido)
//   - Detalle por turno M/V/N con utilizado y # de vales
//   - Botones rápidos para registrar Recibido y Surtido (entradas/salidas no-vale)
//   - Histórico: cambiar fecha
//
// Los "utilizado" se generan AUTOMÁTICAMENTE cuando una receta_controlada
// pasa a estado='canjeada' (trigger fn_registrar_canje_psicotropico).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { ROLES_ADMIN_GLOBAL, esJefeOAdmin } from '../types';

interface StockRow {
  id: number;
  orden: number;
  nombre: string;
  presentacion: string | null;
  unidad: string;
  fondo_fijo: number;
  fecha_caducidad: string | null;
  recibido_total: number;
  surtido_total: number;
  utilizado_total: number;
  vales_total: number;
  utilizado_m: number;
  utilizado_v: number;
  utilizado_n: number;
  vales_m: number;
  vales_v: number;
  vales_n: number;
  stock_actual: number;
}

interface InventarioRow {
  id: number;
  nombre: string;
  presentacion: string | null;
  unidad: string;
  fondo_fijo: number;
}

interface DetalleRow {
  receta_id: string;
  folio: string;
  folio_salida: string | null;
  turno: 'M' | 'V' | 'N';
  paciente_cama: string | null;
  paciente_nombre: string;
  paciente_genero: string | null;
  no_expediente: string | null;
  paciente_diagnostico: string | null;
  servicio_codigo: string | null;
  medicamento_nombre: string;
  cantidad_numero: string | null;
  medico_nombre: string | null;
  enfermero_solicita: string;
  supervisora: string | null;
  observaciones: string | null;
  estado_aprobacion: string;
}

const hoyMazatlan = (): string => {
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'America/Mazatlan', year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const turnoActual = (): 'M' | 'V' | 'N' => {
  const h = new Date().toLocaleString('en-US', { timeZone: 'America/Mazatlan', hour: '2-digit', hour12: false });
  const hora = parseInt(h, 10);
  if (hora >= 7 && hora <= 13) return 'M';
  if (hora >= 14 && hora <= 19) return 'V';
  return 'N';
};

export const BitacoraPsicotropicos: React.FC = () => {
  const { perfil } = useAuth();
  const navigate = useNavigate();

  const [fecha, setFecha] = useState(hoyMazatlan());
  const [filas, setFilas] = useState<StockRow[]>([]);
  const [filasHistorico, setFilasHistorico] = useState<StockRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registrandoEn, setRegistrandoEn] = useState<{ inv: InventarioRow; tipo: 'recibido' | 'surtido' } | null>(null);
  const [detalle, setDetalle] = useState<DetalleRow[]>([]);
  const [guardandoSnapshot, setGuardandoSnapshot] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);

  const esHoy = fecha === hoyMazatlan();
  const puedeRegistrar = perfil != null && ROLES_ADMIN_GLOBAL.includes(perfil.rol);
  const puedeHistoricoYSemanal = esJefeOAdmin(perfil);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      // Detalle de vales del día (siempre)
      const { data: det } = await supabase.from('v_bitacora_psicotropicos_detalle')
        .select('*').eq('fecha_dia', fecha)
        .order('canjeado_en', { nullsFirst: false });
      setDetalle((det || []) as DetalleRow[]);

      if (esHoy) {
        const { data, error: err } = await supabase.from('v_stock_psicotropicos_hoy').select('*');
        if (err) throw err;
        setFilas((data || []) as StockRow[]);
      } else {
        // Para fechas pasadas, reconstruir desde movimientos
        const { data: inv } = await supabase.from('inventario_psicotropicos').select('*').eq('activo', true).order('orden');
        const { data: movs, error: err } = await supabase.from('movimientos_psicotropicos').select('*').eq('fecha', fecha);
        if (err) throw err;

        const map = new Map<number, StockRow>();
        (inv || []).forEach((i: any) => {
          map.set(i.id, {
            id: i.id, orden: i.orden, nombre: i.nombre, presentacion: i.presentacion,
            unidad: i.unidad, fondo_fijo: i.fondo_fijo, fecha_caducidad: i.fecha_caducidad,
            recibido_total: 0, surtido_total: 0, utilizado_total: 0, vales_total: 0,
            utilizado_m: 0, utilizado_v: 0, utilizado_n: 0,
            vales_m: 0, vales_v: 0, vales_n: 0,
            stock_actual: i.fondo_fijo,
          });
        });
        (movs || []).forEach((m: any) => {
          const f = map.get(m.inventario_id);
          if (!f) return;
          const turnoKey = m.turno.toLowerCase() as 'm' | 'v' | 'n';
          if (m.tipo === 'recibido') {
            f.recibido_total += m.cantidad;
            f.stock_actual += m.cantidad;
          } else if (m.tipo === 'utilizado') {
            f.utilizado_total += m.cantidad;
            (f as any)[`utilizado_${turnoKey}`] += m.cantidad;
            f.stock_actual -= m.cantidad;
          } else if (m.tipo === 'surtido') {
            f.surtido_total += m.cantidad;
            f.stock_actual -= m.cantidad;
          } else if (m.tipo === 'vale') {
            f.vales_total += m.cantidad;
            (f as any)[`vales_${turnoKey}`] += m.cantidad;
          }
        });
        setFilasHistorico(Array.from(map.values()).sort((a, b) => a.orden - b.orden));
      }
    } catch (e: any) {
      setError(e.message || 'Error al cargar bitácora');
    } finally {
      setCargando(false);
    }
  }, [fecha, esHoy]);

  useEffect(() => { cargar(); }, [cargar]);

  // Auto-snapshot al cargar la fecha (idempotente). Asegura archivo histórico.
  useEffect(() => {
    if (!perfil) return;
    supabase.rpc('fn_generar_snapshot_bitacora', { _fecha: fecha }).then(() => {});
  }, [fecha, perfil]);

  const guardarSnapshot = async () => {
    setGuardandoSnapshot(true);
    setSnapshotMsg(null);
    const { error } = await supabase.rpc('fn_generar_snapshot_bitacora', { _fecha: fecha });
    setGuardandoSnapshot(false);
    if (error) setSnapshotMsg(`⚠️ Error: ${error.message}`);
    else setSnapshotMsg(`✅ Histórico del ${fecha} guardado correctamente.`);
    setTimeout(() => setSnapshotMsg(null), 4000);
  };

  const lunesDeSemana = (iso: string): string => {
    const d = new Date(iso + 'T12:00:00');
    const dow = d.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  };

  const datos = esHoy ? filas : filasHistorico;

  const totales = useMemo(() => ({
    fondo: datos.reduce((s, f) => s + f.fondo_fijo, 0),
    stock: datos.reduce((s, f) => s + f.stock_actual, 0),
    utilizado: datos.reduce((s, f) => s + f.utilizado_total, 0),
    recibido: datos.reduce((s, f) => s + f.recibido_total, 0),
  }), [datos]);

  if (!perfil) return <div style={cargandoStyle}>Verificando perfil...</div>;

  if (!puedeRegistrar) {
    return (
      <div style={bloqueado}>
        🚫 Esta bitácora solo es visible para jefatura, subjefatura y supervisores.
        <button onClick={() => navigate('/')} style={btnVolver}>Volver al inicio</button>
      </div>
    );
  }

  return (
    <div style={pagina}>
      <div style={header}>
        <div>
          <h1 style={titulo}>💊 Bitácora · Control de Medicamentos Psicotrópicos</h1>
          <p style={subt}>Stock con fondo fijo · entradas y salidas por turno · CLUES BSIMB000672</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
          <button onClick={() => window.print()} style={btnImprimir}>🖨️ Hoja del día</button>
          {puedeHistoricoYSemanal && (
            <>
              <button onClick={() => window.open(`/imprimir/bitacora-semana?desde=${lunesDeSemana(fecha)}`, '_blank')} style={btnImprimir}>📅 Imprimir Semana</button>
              <button onClick={guardarSnapshot} disabled={guardandoSnapshot} style={btnSnapshot}>
                {guardandoSnapshot ? 'Guardando...' : '💾 Guardar histórico'}
              </button>
            </>
          )}
          <button onClick={() => navigate('/')} style={btnVolver}>← Dashboard</button>
        </div>
      </div>

      {snapshotMsg && <div style={snapshotBanner}>{snapshotMsg}</div>}

      <div style={controles}>
        {puedeHistoricoYSemanal ? (
          <div>
            <label style={lbl}>Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} max={hoyMazatlan()} style={input} />
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#7d5b2f' }}>
            <strong>Fecha:</strong> {hoyMazatlan()} <span style={{ color: '#888', fontSize: 11 }}>(solo hoy — el histórico lo consulta la jefatura)</span>
          </div>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#7d5b2f', alignSelf: 'center' }}>
          {esHoy ? <span style={{ background: '#dff5e6', color: '#0E6755', padding: '4px 10px', borderRadius: 10, fontWeight: 700 }}>📍 HOY · Turno actual: {turnoActual()}</span>
                 : <span style={{ background: '#fff7e0', color: '#7d5b2f', padding: '4px 10px', borderRadius: 10, fontWeight: 700 }}>📚 Histórico · {fecha}</span>}
        </div>
      </div>

      <div style={kpis}>
        <Kpi label="Fondo fijo" valor={totales.fondo} color="#7d5b2f" />
        <Kpi label="Stock actual" valor={totales.stock} color="#0E6755" />
        <Kpi label="Recibido hoy" valor={totales.recibido} color="#2c5fa3" />
        <Kpi label="Utilizado hoy" valor={totales.utilizado} color="#A32D2D" />
      </div>

      {error && <div style={errBanner}>⚠️ {error}</div>}

      {cargando ? (
        <div style={cargandoStyle}>Cargando...</div>
      ) : (
        <div style={tablaWrap}>
          <table style={tabla}>
            <thead>
              <tr style={trHeader}>
                <th rowSpan={2} style={{ ...th, textAlign: 'left' as const }}>Medicamento Psicotrópico</th>
                <th rowSpan={2} style={th}>Unidad</th>
                <th rowSpan={2} style={th}>Fondo<br />fijo</th>
                <th rowSpan={2} style={{ ...th, background: '#2c5fa3', color: '#fff' }}>Recibido</th>
                <th colSpan={2} style={{ ...th, background: '#5CAB34', color: '#fff' }}>Matutino</th>
                <th colSpan={2} style={{ ...th, background: '#C39C59', color: '#fff' }}>Vespertino</th>
                <th colSpan={2} style={{ ...th, background: '#A32D2D', color: '#fff' }}>Nocturno</th>
                <th rowSpan={2} style={{ ...th, background: '#0E6755', color: '#fff' }}>STOCK<br />ACTUAL</th>
                <th rowSpan={2} style={th}>Acciones</th>
              </tr>
              <tr style={trHeader}>
                <th style={thSm}>Util.</th><th style={thSm}>Vales</th>
                <th style={thSm}>Util.</th><th style={thSm}>Vales</th>
                <th style={thSm}>Util.</th><th style={thSm}>Vales</th>
              </tr>
            </thead>
            <tbody>
              {datos.map((f, i) => (
                <tr key={f.id} style={i % 2 === 0 ? trAlt : undefined}>
                  <td style={tdNombre}>
                    <strong>{f.nombre}</strong>
                    {f.presentacion && <div style={{ fontSize: 10, color: '#888' }}>{f.presentacion}</div>}
                  </td>
                  <td style={tdC}>{f.unidad}</td>
                  <td style={{ ...tdC, fontWeight: 700 }}>{f.fondo_fijo}</td>
                  <td style={tdC}>
                    {f.recibido_total > 0 ? <strong style={{ color: '#2c5fa3' }}>+{f.recibido_total}</strong> : '—'}
                  </td>
                  <td style={tdC}>{f.utilizado_m || '—'}</td>
                  <td style={tdC}>{f.vales_m || '—'}</td>
                  <td style={tdC}>{f.utilizado_v || '—'}</td>
                  <td style={tdC}>{f.vales_v || '—'}</td>
                  <td style={tdC}>{f.utilizado_n || '—'}</td>
                  <td style={tdC}>{f.vales_n || '—'}</td>
                  <td style={{ ...tdC, background: f.stock_actual <= 0 ? '#fbeaea' : f.stock_actual < f.fondo_fijo * 0.3 ? '#fff7e0' : '#dff5e6', fontWeight: 700, fontSize: 14 }}>
                    {f.stock_actual}
                  </td>
                  <td style={tdC}>
                    {esHoy && (
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
                        <button onClick={() => setRegistrandoEn({ inv: { id: f.id, nombre: f.nombre, presentacion: f.presentacion, unidad: f.unidad, fondo_fijo: f.fondo_fijo }, tipo: 'recibido' })} style={btnRecibido}>+ Recibido</button>
                        <button onClick={() => setRegistrandoEn({ inv: { id: f.id, nombre: f.nombre, presentacion: f.presentacion, unidad: f.unidad, fondo_fijo: f.fondo_fijo }, tipo: 'surtido' })} style={btnSurtido}>− Surtido</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={notaPie}>
        <strong>Utilizado:</strong> generado automáticamente cuando un vale se marca como <em>canjeada</em> en la Bitácora de Supervisión. ·
        <strong> Vales:</strong> conteo de vales aprobados pendientes de canje. ·
        <strong> Recibido / Surtido:</strong> entradas y salidas manuales (botones a la derecha de cada renglón).
      </div>

      {/* DETALLE DE VALES DEL DÍA (autollenado) */}
      <div style={subSeccion}>
        <div style={subSeccionTit}>📋 Detalle de vales del día — {fecha}</div>
        {detalle.length === 0 ? (
          <div style={vacioDetalle}>Aún no hay vales aprobados o canjeados para esta fecha.</div>
        ) : (
          <div style={tablaWrap}>
            <table style={tabla}>
              <thead>
                <tr style={trHeader}>
                  <th style={thSm}>Folio entrada</th>
                  <th style={thSm}>Folio salida</th>
                  <th style={thSm}>Turno</th>
                  <th style={thSm}>Cama</th>
                  <th style={{ ...thSm, textAlign: 'left' as const }}>Paciente</th>
                  <th style={thSm}>Género</th>
                  <th style={thSm}>No. Exp</th>
                  <th style={{ ...thSm, textAlign: 'left' as const }}>Diagnóstico</th>
                  <th style={thSm}>Servicio</th>
                  <th style={{ ...thSm, textAlign: 'left' as const }}>Medicamento</th>
                  <th style={thSm}>Cantidad</th>
                  <th style={thSm}>Médico</th>
                  <th style={thSm}>Enfermero solicita</th>
                  <th style={thSm}>Supervisora</th>
                  <th style={thSm}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {detalle.map((d, i) => (
                  <tr key={d.receta_id} style={i % 2 === 0 ? trAlt : undefined}>
                    <td style={tdC}><strong>{d.folio}</strong></td>
                    <td style={tdC}>{d.folio_salida || '—'}</td>
                    <td style={tdC}>{d.turno}</td>
                    <td style={tdC}>{d.paciente_cama}</td>
                    <td style={tdNombre}>{d.paciente_nombre}</td>
                    <td style={tdC}>{d.paciente_genero}</td>
                    <td style={tdC}>{d.no_expediente || '—'}</td>
                    <td style={tdNombre}>{d.paciente_diagnostico}</td>
                    <td style={tdC}>{d.servicio_codigo}</td>
                    <td style={tdNombre}>{d.medicamento_nombre}</td>
                    <td style={tdC}>{d.cantidad_numero}</td>
                    <td style={tdC}>{d.medico_nombre}</td>
                    <td style={tdC}>{d.enfermero_solicita}</td>
                    <td style={tdC}>{d.supervisora || '—'}</td>
                    <td style={tdC}>
                      <span style={{
                        background: d.estado_aprobacion === 'canjeada' ? '#dff5e6' : '#fff7e0',
                        color: d.estado_aprobacion === 'canjeada' ? '#0E6755' : '#7d5b2f',
                        padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                      }}>{d.estado_aprobacion}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {registrandoEn && (
        <ModalRegistro
          inv={registrandoEn.inv}
          tipo={registrandoEn.tipo}
          fecha={fecha}
          onCerrar={() => setRegistrandoEn(null)}
          onGuardado={() => { setRegistrandoEn(null); cargar(); }}
        />
      )}
    </div>
  );
};

// ============================================================
const ModalRegistro: React.FC<{
  inv: InventarioRow;
  tipo: 'recibido' | 'surtido';
  fecha: string;
  onCerrar: () => void;
  onGuardado: () => void;
}> = ({ inv, tipo, onCerrar, onGuardado }) => {
  const { perfil } = useAuth();
  const [cantidad, setCantidad] = useState('1');
  const [observaciones, setObservaciones] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const guardar = async () => {
    if (!perfil) return;
    const q = parseInt(cantidad, 10);
    if (isNaN(q) || q <= 0) { setErr('Cantidad inválida'); return; }
    setGuardando(true);
    setErr(null);
    const { error } = await supabase.from('movimientos_psicotropicos').insert({
      turno: turnoActual(),
      inventario_id: inv.id,
      tipo,
      cantidad: q,
      observaciones: observaciones || null,
      capturado_por: perfil.id,
      capturado_nombre: perfil.nombre_completo,
    });
    setGuardando(false);
    if (error) { setErr(error.message); return; }
    onGuardado();
  };

  return (
    <div style={overlay} onClick={onCerrar}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={modalHeader}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>
            {tipo === 'recibido' ? '➕ Registrar RECIBIDO' : '➖ Registrar SURTIDO'}
          </div>
          <button onClick={onCerrar} style={btnCerrarModal}>✕</button>
        </div>
        <div style={modalBody}>
          <div style={{ marginBottom: 10 }}>
            <strong>{inv.nombre}</strong>
            {inv.presentacion && <div style={{ fontSize: 11, color: '#888' }}>{inv.presentacion}</div>}
          </div>
          <label style={lbl}>Cantidad ({inv.unidad})</label>
          <input type="number" min={1} value={cantidad} onChange={e => setCantidad(e.target.value)} style={input} autoFocus />
          <label style={lbl}>Observaciones (opcional)</label>
          <input type="text" value={observaciones} onChange={e => setObservaciones(e.target.value)} placeholder="Folio de recepción, motivo..." style={input} />
          {err && <div style={errBanner}>⚠️ {err}</div>}
        </div>
        <div style={modalFooter}>
          <button onClick={onCerrar} disabled={guardando} style={btnVolver}>Cancelar</button>
          <button onClick={guardar} disabled={guardando} style={tipo === 'recibido' ? btnRecibido : btnSurtido}>
            {guardando ? 'Guardando...' : '✓ Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Kpi: React.FC<{ label: string; valor: number; color: string }> = ({ label, valor, color }) => (
  <div style={kpiCard}>
    <div style={{ ...kpiValor, color }}>{valor}</div>
    <div style={kpiLabel}>{label}</div>
  </div>
);

// ============================================================
const pagina: React.CSSProperties = { padding: 16, background: '#F2EBE4', minHeight: '100vh' };
const header: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 };
const titulo: React.CSSProperties = { color: '#0E6755', fontSize: 22, fontWeight: 700, margin: 0 };
const subt: React.CSSProperties = { color: '#7d5b2f', fontSize: 12, margin: '4px 0 0' };
const controles: React.CSSProperties = { display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-end', background: '#fff', border: '1px solid #C39C59', borderRadius: 6, padding: 10 };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: '#7d5b2f', fontWeight: 600, marginBottom: 3 };
const input: React.CSSProperties = { padding: '6px 10px', border: '1px solid #C39C59', borderRadius: 4, fontSize: 13, background: '#fff', width: '100%', boxSizing: 'border-box' };
const btnImprimir: React.CSSProperties = { background: '#0E6755', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 4, cursor: 'pointer', fontWeight: 700 };
const btnVolver: React.CSSProperties = { background: '#fff', border: '1px solid #C39C59', color: '#0E6755', padding: '8px 14px', borderRadius: 4, cursor: 'pointer', fontWeight: 600 };
const kpis: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 };
const kpiCard: React.CSSProperties = { background: '#fff', border: '1px solid #C39C59', borderRadius: 6, padding: 10, textAlign: 'center' as const };
const kpiValor: React.CSSProperties = { fontSize: 28, fontWeight: 800, lineHeight: 1 };
const kpiLabel: React.CSSProperties = { fontSize: 10, color: '#888', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginTop: 4 };
const tablaWrap: React.CSSProperties = { background: '#fff', border: '1px solid #C39C59', borderRadius: 6, overflow: 'auto' };
const tabla: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 };
const trHeader: React.CSSProperties = { background: '#f5f1e8' };
const th: React.CSSProperties = { padding: '6px 8px', textAlign: 'center' as const, fontWeight: 700, fontSize: 11, borderBottom: '2px solid #C39C59', borderRight: '1px solid #eee', color: '#7d5b2f' };
const thSm: React.CSSProperties = { ...th, fontSize: 10 };
const tdNombre: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #eee', textAlign: 'left' as const, verticalAlign: 'top' as const };
const tdC: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #eee', textAlign: 'center' as const, verticalAlign: 'middle' as const };
const trAlt: React.CSSProperties = { background: '#fafafa' };
const btnRecibido: React.CSSProperties = { background: '#2c5fa3', color: '#fff', border: 'none', borderRadius: 3, padding: '3px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const };
const btnSurtido: React.CSSProperties = { background: '#A32D2D', color: '#fff', border: 'none', borderRadius: 3, padding: '3px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const };
const errBanner: React.CSSProperties = { background: '#fbeaea', border: '1px solid #A32D2D', color: '#A32D2D', padding: 10, borderRadius: 4, fontSize: 13, marginTop: 8 };
const cargandoStyle: React.CSSProperties = { padding: 40, textAlign: 'center' as const, color: '#888', fontStyle: 'italic' as const };
const bloqueado: React.CSSProperties = { padding: 40, textAlign: 'center' as const, color: '#A32D2D', fontSize: 16 };
const notaPie: React.CSSProperties = { marginTop: 10, padding: 8, fontSize: 11, color: '#666', lineHeight: 1.5, background: '#fafafa', borderRadius: 4 };
const btnSnapshot: React.CSSProperties = { background: '#7d5b2f', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 4, cursor: 'pointer', fontWeight: 700 };
const snapshotBanner: React.CSSProperties = { background: '#dff5e6', border: '1px solid #0E6755', color: '#0E6755', padding: '8px 12px', borderRadius: 4, marginBottom: 8, fontSize: 12 };
const subSeccion: React.CSSProperties = { marginTop: 16, background: '#fff', border: '1px solid #C39C59', borderRadius: 6, overflow: 'hidden' as const };
const subSeccionTit: React.CSSProperties = { background: '#7d5b2f', color: '#fff', padding: '8px 14px', fontWeight: 700, fontSize: 13 };
const vacioDetalle: React.CSSProperties = { padding: 16, textAlign: 'center' as const, color: '#888', fontStyle: 'italic' as const, fontSize: 12 };
const thSm2: React.CSSProperties = { padding: '5px 8px', fontSize: 10, fontWeight: 700, textAlign: 'center' as const, background: '#f5f1e8', color: '#7d5b2f', borderBottom: '1px solid #C39C59' };

const overlay: React.CSSProperties = { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 };
const modal: React.CSSProperties = { background: '#fff', borderRadius: 8, width: '100%', maxWidth: 420 };
const modalHeader: React.CSSProperties = { background: '#0E6755', color: '#fff', padding: '10px 14px', borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const modalBody: React.CSSProperties = { padding: 14 };
const modalFooter: React.CSSProperties = { padding: 12, borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: 8 };
const btnCerrarModal: React.CSSProperties = { background: 'transparent', border: '1px solid #fff', color: '#fff', borderRadius: 4, width: 26, height: 26, cursor: 'pointer' };
