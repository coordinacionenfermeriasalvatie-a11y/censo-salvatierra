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
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { ROLES_ADMIN_GLOBAL, esJefeOAdmin, supervisionDeScope } from '../types';

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

// Fila del historico de recetas SURTIDAS (canjeadas). Misma vista
// v_bitacora_psicotropicos_detalle, ahora con supervision (migracion 71).
interface SurtidaRow {
  receta_id: string;
  fecha_dia: string;
  canjeado_en: string | null;
  turno: 'M' | 'V' | 'N';
  folio: string;
  folio_salida: string | null;
  servicio_codigo: string | null;
  supervision: number | null;
  paciente_nombre: string;
  paciente_cama: string | null;
  medicamento_nombre: string;
  medicamento_grupo: string | null;
  cantidad_numero: string | null;
  medico_nombre: string | null;
  enfermero_solicita: string;
  supervisora: string | null;
}

// Scope de supervision que se ve en la hoja: una sola o ambas lado a lado.
type SupSel = 1 | 2 | 'ambas';

const hoyMazatlan = (): string => {
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'America/Mazatlan', year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

// Primer dia del mes actual (Mazatlan), para el rango por defecto del historico.
const primerDiaMes = (): string => hoyMazatlan().slice(0, 8) + '01';

// Reconstruye el stock de un día pasado para AMBAS supervisiones desde el
// fondo fijo por supervisión + los movimientos de esa fecha.
const reconstruirStock = (
  inv: any[],
  ff: any[],
  movs: any[],
): Record<1 | 2, StockRow[]> => {
  const out: Record<1 | 2, StockRow[]> = { 1: [], 2: [] };
  ([1, 2] as const).forEach(sup => {
    const ffMap = new Map<number, { fondo_fijo: number; fecha_caducidad: string | null }>();
    ff.filter(r => r.supervision === sup).forEach(r =>
      ffMap.set(r.inventario_id, { fondo_fijo: r.fondo_fijo, fecha_caducidad: r.fecha_caducidad }));

    const map = new Map<number, StockRow>();
    inv.forEach(i => {
      const fondo = ffMap.get(i.id)?.fondo_fijo ?? 0;
      map.set(i.id, {
        id: i.id, orden: i.orden, nombre: i.nombre, presentacion: i.presentacion,
        unidad: i.unidad, fondo_fijo: fondo, fecha_caducidad: ffMap.get(i.id)?.fecha_caducidad ?? null,
        recibido_total: 0, surtido_total: 0, utilizado_total: 0, vales_total: 0,
        utilizado_m: 0, utilizado_v: 0, utilizado_n: 0,
        vales_m: 0, vales_v: 0, vales_n: 0,
        stock_actual: fondo,
      });
    });
    movs.filter(m => m.supervision === sup).forEach(m => {
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
    out[sup] = Array.from(map.values()).sort((a, b) => a.orden - b.orden);
  });
  return out;
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
  const [searchParams] = useSearchParams();

  // Supervisión que se está viendo. Un supervisor con grupo manda (no puede ver
  // la otra ni 'ambas'); jefe/subjefe pueden elegir Sup 1 / Sup 2 / Ambas.
  const supUrlRaw = searchParams.get('sup');
  const supUrl: 1 | 2 | null = supUrlRaw === '1' ? 1 : supUrlRaw === '2' ? 2 : null;
  const grupoFijo = supervisionDeScope(perfil); // 1 | 2 | null
  const puedeElegirSup = grupoFijo == null;     // jefe/subjefe/admin sin grupo
  const [supSel, setSupSel] = useState<SupSel>(supUrl ?? 1);
  // Scope efectivo: un supervisor con grupo queda fijo a su grupo.
  const scope: SupSel = grupoFijo ?? supSel;

  const [fecha, setFecha] = useState(hoyMazatlan());
  // Stock por supervisión (siempre se cargan ambas; el render elige cuál mostrar).
  const [stock, setStock] = useState<Record<1 | 2, StockRow[]>>({ 1: [], 2: [] });
  const [stockHist, setStockHist] = useState<Record<1 | 2, StockRow[]>>({ 1: [], 2: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registrandoEn, setRegistrandoEn] = useState<{ inv: InventarioRow; tipo: 'recibido' | 'surtido'; supervision: 1 | 2 } | null>(null);
  const [detalle, setDetalle] = useState<DetalleRow[]>([]);
  const [guardandoSnapshot, setGuardandoSnapshot] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);

  // ---- Histórico de recetas surtidas (canjeadas) por rango de fechas ----
  const [histAbierto, setHistAbierto] = useState(false);
  const [histDesde, setHistDesde] = useState(primerDiaMes());
  const [histHasta, setHistHasta] = useState(hoyMazatlan());
  const [histSup, setHistSup] = useState<SupSel>('ambas');
  const [histMed, setHistMed] = useState('');
  const [surtidas, setSurtidas] = useState<SurtidaRow[]>([]);
  const [histCargando, setHistCargando] = useState(false);
  const [medsCatalogo, setMedsCatalogo] = useState<string[]>([]);

  const esHoy = fecha === hoyMazatlan();
  const puedeRegistrar = perfil != null && ROLES_ADMIN_GLOBAL.includes(perfil.rol);
  const puedeHistoricoYSemanal = esJefeOAdmin(perfil);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      // Detalle de vales del día. Si el scope es una supervisión concreta,
      // se filtra por ella; en 'ambas' (o supervisor de su grupo) se muestra
      // lo que corresponde.
      let detQ = supabase.from('v_bitacora_psicotropicos_detalle')
        .select('*').eq('fecha_dia', fecha)
        .order('canjeado_en', { nullsFirst: false });
      if (scope !== 'ambas') detQ = detQ.eq('supervision', scope);
      const { data: det } = await detQ;
      setDetalle((det || []) as DetalleRow[]);

      if (esHoy) {
        // La vista trae 1 fila por (supervisión × medicamento): se cargan
        // ambas y el render elige cuál(es) mostrar.
        const { data, error: err } = await supabase.from('v_stock_psicotropicos_hoy').select('*');
        if (err) throw err;
        const out: Record<1 | 2, StockRow[]> = { 1: [], 2: [] };
        (data || []).forEach((r: any) => {
          if (r.supervision === 1 || r.supervision === 2) out[r.supervision as 1 | 2].push(r as StockRow);
        });
        out[1].sort((a, b) => a.orden - b.orden);
        out[2].sort((a, b) => a.orden - b.orden);
        setStock(out);
      } else {
        // Fechas pasadas: reconstruir desde movimientos, para AMBAS supervisiones.
        const { data: inv } = await supabase.from('inventario_psicotropicos').select('*').eq('activo', true).order('orden');
        const { data: ff } = await supabase.from('fondo_fijo_psicotropicos')
          .select('inventario_id, supervision, fondo_fijo, fecha_caducidad');
        const { data: movs, error: err } = await supabase.from('movimientos_psicotropicos')
          .select('*').eq('fecha', fecha);
        if (err) throw err;
        setStockHist(reconstruirStock(inv || [], ff || [], movs || []));
      }
    } catch (e: any) {
      setError(e.message || 'Error al cargar bitácora');
    } finally {
      setCargando(false);
    }
  }, [fecha, esHoy, scope]);

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

  // ---- Carga del histórico de recetas surtidas (canjeadas) ----
  const cargarSurtidas = useCallback(async () => {
    setHistCargando(true);
    setError(null);
    try {
      let q = supabase.from('v_bitacora_psicotropicos_detalle')
        .select('receta_id, fecha_dia, canjeado_en, turno, folio, folio_salida, servicio_codigo, supervision, paciente_nombre, paciente_cama, medicamento_nombre, medicamento_grupo, cantidad_numero, medico_nombre, enfermero_solicita, supervisora')
        .eq('estado_aprobacion', 'canjeada')
        .gte('fecha_dia', histDesde)
        .lte('fecha_dia', histHasta)
        .order('canjeado_en', { ascending: false, nullsFirst: false });
      // Supervisor con grupo fijo manda; jefe/subjefe usan el filtro del reporte.
      const supEff: SupSel = grupoFijo ?? histSup;
      if (supEff !== 'ambas') q = q.eq('supervision', supEff);
      // recetas guardan el nombre largo del catálogo; el inventario el corto.
      if (histMed) q = q.ilike('medicamento_nombre', `%${histMed}%`);
      const { data, error: err } = await q;
      if (err) throw err;
      setSurtidas((data || []) as SurtidaRow[]);
    } catch (e: any) {
      setError(e.message || 'Error al cargar recetas surtidas');
    } finally {
      setHistCargando(false);
    }
  }, [histDesde, histHasta, histSup, histMed, grupoFijo]);

  // Carga perezosa: solo al abrir o cambiar filtros con la sección abierta.
  useEffect(() => { if (histAbierto) cargarSurtidas(); }, [histAbierto, cargarSurtidas]);

  // Catálogo de medicamentos (nombre corto) para el filtro del histórico.
  useEffect(() => {
    supabase.from('inventario_psicotropicos').select('nombre').eq('activo', true).order('orden')
      .then(({ data }) => setMedsCatalogo((data || []).map((r: any) => r.nombre as string)));
  }, []);

  const escapeHtml = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const imprimirSurtidas = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const supEff: SupSel = grupoFijo ?? histSup;
    const supTxt = supEff === 'ambas' ? 'Ambas supervisiones' : `Supervisión ${supEff}`;
    const medTxt = histMed || 'Todos';
    const rows = surtidas.map(s => `
      <tr>
        <td>${escapeHtml(s.folio || '')}</td>
        <td>${escapeHtml(s.folio_salida || '')}</td>
        <td>${escapeHtml(s.fecha_dia || '')}</td>
        <td style="text-align:center">${s.supervision ?? ''}</td>
        <td style="text-align:left">${escapeHtml(s.paciente_nombre || '')}</td>
        <td style="text-align:center">${escapeHtml(s.paciente_cama || '')}</td>
        <td style="text-align:left">${escapeHtml(s.medicamento_nombre || '')}</td>
        <td style="text-align:center">${escapeHtml(s.cantidad_numero || '')}</td>
        <td style="text-align:center">${escapeHtml(s.servicio_codigo || '')}</td>
      </tr>`).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8">
      <title>Recetas surtidas ${escapeHtml(histDesde)} a ${escapeHtml(histHasta)}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#222;margin:20px;font-size:12px}
        h1{color:#0E6755;font-size:18px;margin:0 0 4px}
        .meta{color:#7d5b2f;font-size:12px;margin:0 0 12px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #999;padding:4px 6px;text-align:center}
        th{background:#f5f1e8;color:#7d5b2f}
        @media print{button{display:none}}
      </style></head><body>
      <h1>Bitácora de Psicotrópicos — Histórico de recetas surtidas</h1>
      <p class="meta">Rango: ${escapeHtml(histDesde)} a ${escapeHtml(histHasta)} · ${escapeHtml(supTxt)} · Medicamento: ${escapeHtml(medTxt)} · Total: ${surtidas.length} · CLUES BSIMB000672</p>
      <table>
        <thead><tr>
          <th>Folio</th><th>Folio salida</th><th>Fecha canje</th><th>Sup.</th>
          <th>Paciente</th><th>Cama</th><th>Medicamento</th><th>Cant.</th><th>Servicio</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const datosActivos = esHoy ? stock : stockHist;     // Record<1|2, StockRow[]>
  const datosVisibles = useMemo<StockRow[]>(
    () => (scope === 'ambas' ? [...datosActivos[1], ...datosActivos[2]] : datosActivos[scope]),
    [datosActivos, scope],
  );

  const totales = useMemo(() => ({
    fondo: datosVisibles.reduce((s, f) => s + f.fondo_fijo, 0),
    stock: datosVisibles.reduce((s, f) => s + f.stock_actual, 0),
    utilizado: datosVisibles.reduce((s, f) => s + f.utilizado_total, 0),
    recibido: datosVisibles.reduce((s, f) => s + f.recibido_total, 0),
  }), [datosVisibles]);

  // Supervisiones a renderizar: una sola o ambas (lado a lado).
  const supsVisibles: (1 | 2)[] = scope === 'ambas' ? [1, 2] : [scope];
  const scopeLabel = scope === 'ambas' ? '1 y 2' : String(scope);
  // La vista combinada "Ambas" solo para jefe/admin; subjefe y supervisor
  // sin grupo eligen una sola supervisión.
  const opcionesSup: SupSel[] = puedeHistoricoYSemanal ? [1, 2, 'ambas'] : [1, 2];

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
          <h1 style={titulo}>💊 Bitácora · Psicotrópicos — Supervisión {scopeLabel}</h1>
          <p style={subt}>Fondo fijo de Supervisión {scopeLabel} · entradas y salidas por turno · CLUES BSIMB000672</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
          {supsVisibles.map(sup => (
            <button key={sup} onClick={() => window.open(`/imprimir/fondo-fijo?fecha=${fecha}&supervision=${sup}`, '_blank')} style={btnImprimir}>🖨️ Imprimir hoja (Sup. {sup})</button>
          ))}
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
        {puedeElegirSup && (
          <div>
            <label style={lbl}>Supervisión</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {opcionesSup.map(s => (
                <button key={String(s)} onClick={() => setSupSel(s)} style={supSel === s ? supBtnActivo : supBtn}>
                  {s === 'ambas' ? 'Ambas' : `Sup ${s}`}
                </button>
              ))}
            </div>
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
        <div style={scope === 'ambas' ? tablasAmbas : undefined}>
          {supsVisibles.map(sup => (
            <div key={sup} style={scope === 'ambas' ? colAmbas : undefined}>
              {scope === 'ambas' && <div style={tablaTitulo}>Supervisión {sup}</div>}
              <TablaStock
                datos={datosActivos[sup]}
                esHoy={esHoy}
                onRegistrar={(inv, tipo) => setRegistrandoEn({ inv, tipo, supervision: sup })}
              />
            </div>
          ))}
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

      {/* HISTÓRICO DE RECETAS SURTIDAS (CANJEADAS) por rango de fechas.
          Solo jefe/admin (igual que la vista combinada de ambas supervisiones). */}
      {puedeHistoricoYSemanal && (
      <div style={subSeccion}>
        <div
          style={{ ...subSeccionTit, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setHistAbierto(o => !o)}
        >
          <span>📈 Histórico de recetas surtidas (canjeadas)</span>
          <span>{histAbierto ? '▲' : '▼'}</span>
        </div>
        {histAbierto && (
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, alignItems: 'flex-end', marginBottom: 10 }}>
              <div>
                <label style={lbl}>Desde</label>
                <input type="date" value={histDesde} max={hoyMazatlan()} onChange={e => setHistDesde(e.target.value)} style={input} />
              </div>
              <div>
                <label style={lbl}>Hasta</label>
                <input type="date" value={histHasta} max={hoyMazatlan()} onChange={e => setHistHasta(e.target.value)} style={input} />
              </div>
              {puedeElegirSup && (
                <div>
                  <label style={lbl}>Supervisión</label>
                  <select
                    value={String(histSup)}
                    onChange={e => setHistSup(e.target.value === 'ambas' ? 'ambas' : (Number(e.target.value) as 1 | 2))}
                    style={input}
                  >
                    <option value="ambas">Ambas</option>
                    <option value="1">Sup 1</option>
                    <option value="2">Sup 2</option>
                  </select>
                </div>
              )}
              <div>
                <label style={lbl}>Medicamento</label>
                <select value={histMed} onChange={e => setHistMed(e.target.value)} style={input}>
                  <option value="">Todos</option>
                  {medsCatalogo.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <button onClick={cargarSurtidas} style={btnImprimir}>🔎 Buscar</button>
              <button onClick={imprimirSurtidas} disabled={surtidas.length === 0} style={btnVolver}>🖨️ Imprimir</button>
            </div>
            {histCargando ? (
              <div style={cargandoStyle}>Cargando...</div>
            ) : surtidas.length === 0 ? (
              <div style={vacioDetalle}>Sin recetas surtidas en el rango seleccionado.</div>
            ) : (
              <div style={tablaWrap}>
                <table style={tabla}>
                  <thead>
                    <tr style={trHeader}>
                      <th style={thSm}>Folio</th>
                      <th style={thSm}>Folio salida</th>
                      <th style={thSm}>Fecha canje</th>
                      <th style={thSm}>Sup.</th>
                      <th style={{ ...thSm, textAlign: 'left' as const }}>Paciente</th>
                      <th style={thSm}>Cama</th>
                      <th style={{ ...thSm, textAlign: 'left' as const }}>Medicamento</th>
                      <th style={thSm}>Cant.</th>
                      <th style={thSm}>Servicio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {surtidas.map((s, i) => (
                      <tr key={s.receta_id} style={i % 2 === 0 ? trAlt : undefined}>
                        <td style={tdC}><strong>{s.folio}</strong></td>
                        <td style={tdC}>{s.folio_salida || '—'}</td>
                        <td style={tdC}>{s.fecha_dia}</td>
                        <td style={tdC}>{s.supervision ?? '—'}</td>
                        <td style={tdNombre}>{s.paciente_nombre}</td>
                        <td style={tdC}>{s.paciente_cama || '—'}</td>
                        <td style={tdNombre}>{s.medicamento_nombre}</td>
                        <td style={tdC}>{s.cantidad_numero || '—'}</td>
                        <td style={tdC}>{s.servicio_codigo || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: '6px 10px', fontSize: 11, color: '#7d5b2f' }}>
                  Total: <strong>{surtidas.length}</strong> recetas surtidas
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {registrandoEn && (
        <ModalRegistro
          inv={registrandoEn.inv}
          tipo={registrandoEn.tipo}
          fecha={fecha}
          supervision={registrandoEn.supervision}
          onCerrar={() => setRegistrandoEn(null)}
          onGuardado={() => { setRegistrandoEn(null); cargar(); }}
        />
      )}
    </div>
  );
};

// ============================================================
// Tabla de stock de una sola supervisión.
const TablaStock: React.FC<{
  datos: StockRow[];
  esHoy: boolean;
  onRegistrar: (inv: InventarioRow, tipo: 'recibido' | 'surtido') => void;
}> = ({ datos, esHoy, onRegistrar }) => (
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
                  <button onClick={() => onRegistrar({ id: f.id, nombre: f.nombre, presentacion: f.presentacion, unidad: f.unidad, fondo_fijo: f.fondo_fijo }, 'recibido')} style={btnRecibido}>+ Recibido</button>
                  <button onClick={() => onRegistrar({ id: f.id, nombre: f.nombre, presentacion: f.presentacion, unidad: f.unidad, fondo_fijo: f.fondo_fijo }, 'surtido')} style={btnSurtido}>− Surtido</button>
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ============================================================
const ModalRegistro: React.FC<{
  inv: InventarioRow;
  tipo: 'recibido' | 'surtido';
  fecha: string;
  supervision: 1 | 2;
  onCerrar: () => void;
  onGuardado: () => void;
}> = ({ inv, tipo, supervision, onCerrar, onGuardado }) => {
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
      supervision,
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
const tablasAmbas: React.CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap' as const };
const colAmbas: React.CSSProperties = { flex: '1 1 480px', minWidth: 0 };
const tablaTitulo: React.CSSProperties = { background: '#0E6755', color: '#fff', padding: '6px 12px', fontWeight: 700, fontSize: 13, borderRadius: '6px 6px 0 0' };
const supBtn: React.CSSProperties = { background: '#fff', border: '1px solid #C39C59', color: '#7d5b2f', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 12 };
const supBtnActivo: React.CSSProperties = { ...supBtn, background: '#0E6755', color: '#fff', borderColor: '#0E6755' };
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
