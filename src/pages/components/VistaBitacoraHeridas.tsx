// src/pages/components/VistaBitacoraHeridas.tsx
// Bitácora del servicio "CLÍNICA DE HERIDAS" (CDH).
// Tabla independiente: bitacora_heridas (cada fila = una atención).
// Al INSERTAR una atención, el trigger SQL suma a productividad:
//   - H01 (Clínica Heridas - Ambulatorio)     si es_hospitalizado = FALSE
//   - H02 (Clínica Heridas - Hospitalización) si es_hospitalizado = TRUE
//   - H04 (Pacientes atendidos por Sutura)    += suturas (si > 0)
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { hoyMazatlan, turnoActualMazatlan } from '../../utils/fechaHora';

interface Atencion {
  id: string;
  fecha: string;
  turno: 'M' | 'V' | 'N';
  nombre_paciente: string;
  nss_curp: string | null;
  tipo_lesion: number | null;
  pie_diabetico_programado: boolean;
  pie_diabetico_realizado: boolean;
  motivo_no_realizado: string | null;
  inyecciones: number;
  sondas: number;
  yeso_ferula: number;
  suturas: number;
  es_hospitalizado: boolean;
  responsable: string | null;
  observaciones: string | null;
  creado_en: string;
}

// Catálogo 1..10 del formato impreso institucional
const TIPOS_LESION: Record<number, string> = {
  1: 'Lesión por presión',
  2: 'Úlcera venosa',
  3: 'Úlcera arterial',
  4: 'Úlcera neoplásica',
  5: 'Quemaduras',
  6: 'Lesión relacionada con humedad',
  7: 'Dehiscencias',
  8: 'Herida traumática',
  9: 'Estomas',
  10: 'Otra',
};

const turnoColor = (t: string) =>
  t === 'M' ? '#1a5f8a' : t === 'V' ? '#0E6755' : t === 'N' ? '#7d3b8a' : '#888';


export const VistaBitacoraHeridas: React.FC<{ servicioId: number }> = ({ servicioId }) => {
  const { perfil } = useAuth();
  const [atenciones, setAtenciones] = useState<Atencion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroFecha, setFiltroFecha] = useState<string>(hoyMazatlan());
  const [filtroTurno, setFiltroTurno] = useState<string>('');
  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [filtroTexto, setFiltroTexto] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const puedeCapturar =
    !!perfil && ['jefe', 'subjefe', 'supervisor', 'gestor'].includes(perfil.rol);

  const cargar = async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from('bitacora_heridas')
      .select('*')
      .order('fecha', { ascending: false })
      .order('creado_en', { ascending: false })
      .limit(500);
    if (error) setError(error.message);
    else setAtenciones((data || []) as Atencion[]);
    setCargando(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const filtradas = useMemo(() => {
    const term = filtroTexto.trim().toLowerCase();
    return atenciones.filter((a) => {
      if (filtroFecha && a.fecha !== filtroFecha) return false;
      if (filtroTurno && a.turno !== filtroTurno) return false;
      if (filtroTipo && String(a.tipo_lesion ?? '') !== filtroTipo) return false;
      if (!term) return true;
      return (
        a.nombre_paciente.toLowerCase().includes(term) ||
        (a.nss_curp || '').toLowerCase().includes(term) ||
        (a.responsable || '').toLowerCase().includes(term)
      );
    });
  }, [atenciones, filtroFecha, filtroTurno, filtroTipo, filtroTexto]);

  // KPIs del periodo filtrado por fecha (o del total si filtroFecha = '')
  const baseKpi = filtroFecha ? atenciones.filter((a) => a.fecha === filtroFecha) : atenciones;
  const total = baseKpi.length;
  const ambulatorios = baseKpi.filter((a) => !a.es_hospitalizado).length;
  const hospitalizados = baseKpi.filter((a) => a.es_hospitalizado).length;
  const totalSuturas = baseKpi.reduce((s, a) => s + (a.suturas || 0), 0);

  const guardar = async (form: AtencionFormData) => {
    setGuardando(true);
    setError(null);
    const payload = {
      servicio_id: servicioId,
      fecha: form.fecha,
      turno: form.turno,
      nombre_paciente: form.nombre_paciente.trim(),
      nss_curp: form.nss_curp.trim() || null,
      tipo_lesion: form.tipo_lesion || null,
      pie_diabetico_programado: form.pie_diabetico_programado,
      pie_diabetico_realizado: form.pie_diabetico_realizado,
      motivo_no_realizado: form.motivo_no_realizado.trim() || null,
      inyecciones: form.inyecciones,
      sondas: form.sondas,
      yeso_ferula: form.yeso_ferula,
      suturas: form.suturas,
      es_hospitalizado: form.es_hospitalizado,
      responsable: form.responsable.trim() || null,
      observaciones: form.observaciones.trim() || null,
      capturado_por: perfil?.id ?? null,
    };
    const { error } = await supabase.from('bitacora_heridas').insert([payload]);
    setGuardando(false);
    if (error) {
      setError(error.message);
      return false;
    }
    setModalAbierto(false);
    await cargar();
    return true;
  };

  return (
    <div>
      <div style={cabeceraBanda}>
        BITÁCORA CLÍNICA DE HERIDAS — HOSPITAL GENERAL CON ESPECIALIDADES "JUAN MARÍA DE SALVATIERRA"
      </div>

      <div style={kpisRow}>
        <Kpi etiqueta={filtroFecha ? 'Total del día' : 'Total'} valor={total} color="#0E6755" />
        <Kpi etiqueta="Ambulatorias" valor={ambulatorios} color="#1a5f8a" />
        <Kpi etiqueta="Hospitalarias" valor={hospitalizados} color="#A32D2D" />
        <Kpi etiqueta="Suturas" valor={totalSuturas} color="#7d5b2f" />
      </div>

      <div style={filtros}>
        <input
          type="date"
          value={filtroFecha}
          onChange={(e) => setFiltroFecha(e.target.value)}
          style={inputFiltro}
          title="Filtrar por fecha (vacío = todas)"
        />
        <select value={filtroTurno} onChange={(e) => setFiltroTurno(e.target.value)} style={inputFiltro}>
          <option value="">Todos los turnos</option>
          <option value="M">Matutino</option>
          <option value="V">Vespertino</option>
          <option value="N">Nocturno</option>
        </select>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={inputFiltro}>
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS_LESION).map(([n, lbl]) => (
            <option key={n} value={n}>
              {n}. {lbl}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="🔎 Buscar nombre / NSS / responsable"
          value={filtroTexto}
          onChange={(e) => setFiltroTexto(e.target.value)}
          style={inputFiltro}
        />
        {puedeCapturar && (
          <button style={botonNueva} onClick={() => setModalAbierto(true)}>
            + Nueva atención
          </button>
        )}
      </div>

      {error && <div style={errorBox}>⚠️ {error}</div>}

      {cargando ? (
        <div style={vacio}>Cargando bitácora…</div>
      ) : filtradas.length === 0 ? (
        <div style={vacio}>
          No hay atenciones para los filtros seleccionados.
          {puedeCapturar && (
            <>
              <br />
              <button style={{ ...botonNueva, marginTop: 12 }} onClick={() => setModalAbierto(true)}>
                + Registrar primera atención
              </button>
            </>
          )}
        </div>
      ) : (
        <div style={tablaWrap}>
          <table style={tabla}>
            <thead>
              <tr style={headerRow}>
                <th style={th}>#</th>
                <th style={th}>Fecha</th>
                <th style={th}>Turno</th>
                <th style={th}>Paciente</th>
                <th style={th}>NSS / Expediente</th>
                <th style={th}>Tipo lesión</th>
                <th style={th} title="Pie diabético: programado / realizado">PD P/R</th>
                <th style={th} title="Inyecciones">Iny</th>
                <th style={th} title="Sondas">Son</th>
                <th style={th} title="Yeso/Férula">Y/F</th>
                <th style={th} title="Suturas">Sut</th>
                <th style={th}>Ámbito</th>
                <th style={th}>Responsable</th>
                <th style={th}>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((a, i) => (
                <tr key={a.id} style={i % 2 === 0 ? trPar : trImpar}>
                  <td style={tdNum}>{i + 1}</td>
                  <td style={tdNum}>{a.fecha}</td>
                  <td style={{ ...tdNum, color: turnoColor(a.turno), fontWeight: 800 }}>
                    {a.turno}
                  </td>
                  <td style={tdNombre}>{a.nombre_paciente}</td>
                  <td style={tdMono}>{a.nss_curp || ''}</td>
                  <td style={tdNum} title={a.tipo_lesion ? TIPOS_LESION[a.tipo_lesion] : ''}>
                    {a.tipo_lesion
                      ? `${a.tipo_lesion}. ${TIPOS_LESION[a.tipo_lesion] || ''}`
                      : ''}
                  </td>
                  <td style={tdNum}>
                    {a.pie_diabetico_programado ? '✓' : '·'}/
                    {a.pie_diabetico_realizado ? '✓' : '·'}
                  </td>
                  <td style={tdNum}>{a.inyecciones || ''}</td>
                  <td style={tdNum}>{a.sondas || ''}</td>
                  <td style={tdNum}>{a.yeso_ferula || ''}</td>
                  <td style={{ ...tdNum, fontWeight: a.suturas ? 800 : 400 }}>
                    {a.suturas || ''}
                  </td>
                  <td
                    style={{
                      ...tdNum,
                      fontWeight: 700,
                      color: a.es_hospitalizado ? '#A32D2D' : '#1a5f8a',
                    }}
                  >
                    {a.es_hospitalizado ? 'Hosp.' : 'Amb.'}
                  </td>
                  <td style={tdNum}>{a.responsable || ''}</td>
                  <td style={tdObs}>{a.observaciones || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={pie}>
        Mostrando {filtradas.length} {filtradas.length === 1 ? 'atención' : 'atenciones'}
        {filtroFecha && ` del ${filtroFecha}`}
        {!puedeCapturar && (
          <span style={{ marginLeft: 16, color: '#888' }}>· Vista de solo lectura</span>
        )}
        <span style={{ marginLeft: 16, color: '#7d5b2f' }}>
          ℹ️ Las atenciones se suman automáticamente a productividad (H01/H02/H04).
        </span>
      </div>

      {modalAbierto && (
        <ModalNuevaAtencion
          guardando={guardando}
          onCancel={() => setModalAbierto(false)}
          onGuardar={guardar}
        />
      )}
    </div>
  );
};

// ============================================================
// Modal de captura
// ============================================================
interface AtencionFormData {
  fecha: string;
  turno: 'M' | 'V' | 'N';
  nombre_paciente: string;
  nss_curp: string;
  tipo_lesion: number | 0;
  pie_diabetico_programado: boolean;
  pie_diabetico_realizado: boolean;
  motivo_no_realizado: string;
  inyecciones: number;
  sondas: number;
  yeso_ferula: number;
  suturas: number;
  es_hospitalizado: boolean;
  responsable: string;
  observaciones: string;
}

const ModalNuevaAtencion: React.FC<{
  guardando: boolean;
  onCancel: () => void;
  onGuardar: (data: AtencionFormData) => Promise<boolean>;
}> = ({ guardando, onCancel, onGuardar }) => {
  const [form, setForm] = useState<AtencionFormData>({
    fecha: hoyMazatlan(),
    turno: turnoActualMazatlan(),
    nombre_paciente: '',
    nss_curp: '',
    tipo_lesion: 0,
    pie_diabetico_programado: false,
    pie_diabetico_realizado: false,
    motivo_no_realizado: '',
    inyecciones: 0,
    sondas: 0,
    yeso_ferula: 0,
    suturas: 0,
    es_hospitalizado: false,
    responsable: '',
    observaciones: '',
  });
  const [errLocal, setErrLocal] = useState<string | null>(null);

  const upd = <K extends keyof AtencionFormData>(k: K, v: AtencionFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre_paciente.trim()) {
      setErrLocal('El nombre del paciente es obligatorio.');
      return;
    }
    setErrLocal(null);
    await onGuardar(form);
  };

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeader}>🩹 Nueva atención — Clínica de Heridas</div>

        <form onSubmit={submit} style={{ padding: 16 }}>
          <div style={grid2}>
            <Campo label="Fecha *">
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => upd('fecha', e.target.value)}
                style={input}
                required
              />
            </Campo>
            <Campo label="Turno *">
              <select
                value={form.turno}
                onChange={(e) => upd('turno', e.target.value as 'M' | 'V' | 'N')}
                style={input}
                required
              >
                <option value="M">Matutino</option>
                <option value="V">Vespertino</option>
                <option value="N">Nocturno</option>
              </select>
            </Campo>
          </div>

          <Campo label="Nombre del paciente *">
            <input
              type="text"
              value={form.nombre_paciente}
              onChange={(e) => upd('nombre_paciente', e.target.value)}
              style={input}
              required
              autoFocus
            />
          </Campo>

          <div style={grid2}>
            <Campo label="NSS / Expediente">
              <input
                type="text"
                value={form.nss_curp}
                onChange={(e) => upd('nss_curp', e.target.value)}
                style={input}
              />
            </Campo>
            <Campo label="Tipo de lesión">
              <select
                value={form.tipo_lesion}
                onChange={(e) => upd('tipo_lesion', Number(e.target.value))}
                style={input}
              >
                <option value={0}>— Seleccione —</option>
                {Object.entries(TIPOS_LESION).map(([n, lbl]) => (
                  <option key={n} value={n}>
                    {n}. {lbl}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <div style={bloqueDestacado}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: '#7d5b2f' }}>Pie diabético</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <label style={chk}>
                <input
                  type="checkbox"
                  checked={form.pie_diabetico_programado}
                  onChange={(e) => upd('pie_diabetico_programado', e.target.checked)}
                />
                Programado
              </label>
              <label style={chk}>
                <input
                  type="checkbox"
                  checked={form.pie_diabetico_realizado}
                  onChange={(e) => upd('pie_diabetico_realizado', e.target.checked)}
                />
                Realizado
              </label>
            </div>
            {form.pie_diabetico_programado && !form.pie_diabetico_realizado && (
              <Campo label="Motivo no realizado">
                <input
                  type="text"
                  value={form.motivo_no_realizado}
                  onChange={(e) => upd('motivo_no_realizado', e.target.value)}
                  style={input}
                />
              </Campo>
            )}
          </div>

          <div style={grid4}>
            <Campo label="Inyecciones">
              <input
                type="number"
                min={0}
                value={form.inyecciones}
                onChange={(e) => upd('inyecciones', Number(e.target.value) || 0)}
                style={input}
              />
            </Campo>
            <Campo label="Sondas">
              <input
                type="number"
                min={0}
                value={form.sondas}
                onChange={(e) => upd('sondas', Number(e.target.value) || 0)}
                style={input}
              />
            </Campo>
            <Campo label="Yeso / Férula">
              <input
                type="number"
                min={0}
                value={form.yeso_ferula}
                onChange={(e) => upd('yeso_ferula', Number(e.target.value) || 0)}
                style={input}
              />
            </Campo>
            <Campo label="Suturas">
              <input
                type="number"
                min={0}
                value={form.suturas}
                onChange={(e) => upd('suturas', Number(e.target.value) || 0)}
                style={input}
              />
            </Campo>
          </div>

          <div style={bloqueDestacado}>
            <label style={chk}>
              <input
                type="checkbox"
                checked={form.es_hospitalizado}
                onChange={(e) => upd('es_hospitalizado', e.target.checked)}
              />
              <strong>Hospitalizado</strong> (usa la cama censable HOSP-1)
            </label>
            <div style={{ fontSize: 11, color: '#7d5b2f', marginTop: 4 }}>
              {form.es_hospitalizado
                ? 'Sumará a H02 (Clínica Heridas – Hospitalización).'
                : 'Sumará a H01 (Clínica Heridas – Ambulatorio).'}
              {form.suturas > 0 && ` Además, sumará ${form.suturas} a H04 (Suturas).`}
            </div>
          </div>

          <Campo label="Responsable">
            <input
              type="text"
              value={form.responsable}
              onChange={(e) => upd('responsable', e.target.value)}
              style={input}
            />
          </Campo>

          <Campo label="Observaciones">
            <textarea
              value={form.observaciones}
              onChange={(e) => upd('observaciones', e.target.value)}
              style={{ ...input, minHeight: 60, resize: 'vertical' }}
            />
          </Campo>

          {errLocal && <div style={errorBox}>⚠️ {errLocal}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="button" style={btnCancel} onClick={onCancel} disabled={guardando}>
              Cancelar
            </button>
            <button type="submit" style={btnPrimario} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar atención'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const Campo: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginBottom: 10 }}>
    <label style={{ display: 'block', fontSize: 12, color: '#265C4E', marginBottom: 4, fontWeight: 600 }}>
      {label}
    </label>
    {children}
  </div>
);

const Kpi: React.FC<{ etiqueta: string; valor: number; color: string }> = ({ etiqueta, valor, color }) => (
  <div style={{ ...kpi, borderLeftColor: color }}>
    <div style={kpiEtiq}>{etiqueta}</div>
    <div style={{ ...kpiValor, color }}>{valor}</div>
  </div>
);

// ---- estilos ----
const cabeceraBanda: React.CSSProperties = { background: '#0E6755', color: '#fff', padding: '10px 16px', fontWeight: 700, fontSize: 13, letterSpacing: 0.5, borderRadius: '4px 4px 0 0', textAlign: 'center', marginBottom: 0 };
const kpisRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, padding: '12px 0' };
const kpi: React.CSSProperties = { background: '#fff', border: '1px solid #C39C59', borderLeft: '4px solid', borderRadius: 4, padding: '10px 14px' };
const kpiEtiq: React.CSSProperties = { fontSize: 11, color: '#888', letterSpacing: 0.3, textTransform: 'uppercase' };
const kpiValor: React.CSSProperties = { fontSize: 24, fontWeight: 800 };
const filtros: React.CSSProperties = { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' };
const inputFiltro: React.CSSProperties = { padding: '8px 12px', border: '1px solid #C39C59', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#265C4E' };
const botonNueva: React.CSSProperties = { padding: '8px 16px', background: '#0E6755', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontSize: 13, marginLeft: 'auto' };
const tablaWrap: React.CSSProperties = { overflowX: 'auto', border: '1px solid #C39C59', borderRadius: 4, background: '#fff' };
const tabla: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
const headerRow: React.CSSProperties = { background: '#265C4E' };
const th: React.CSSProperties = { padding: '10px 8px', color: '#fff', textAlign: 'left', fontWeight: 700, fontSize: 11, letterSpacing: 0.3, borderBottom: '1px solid #555' };
const trPar: React.CSSProperties = { background: '#fff' };
const trImpar: React.CSSProperties = { background: '#fdfaf2' };
const tdNum: React.CSSProperties = { padding: '8px', borderBottom: '1px solid #e8dfc6', color: '#265C4E', fontSize: 12 };
const tdNombre: React.CSSProperties = { ...tdNum, fontWeight: 700, color: '#0E6755' };
const tdMono: React.CSSProperties = { ...tdNum, fontFamily: 'monospace', fontSize: 11 };
const tdObs: React.CSSProperties = { ...tdNum, fontSize: 11, color: '#7d5b2f', fontStyle: 'italic', maxWidth: 220 };
const pie: React.CSSProperties = { padding: '8px 4px', fontSize: 12, color: '#888', display: 'flex', flexWrap: 'wrap', alignItems: 'center' };
const errorBox: React.CSSProperties = { background: '#fdecea', color: '#A32D2D', padding: '10px 12px', borderRadius: 4, marginBottom: 12 };
const vacio: React.CSSProperties = { padding: 40, textAlign: 'center', color: '#888', background: '#fff', border: '1px solid #C39C59', borderRadius: 4 };

// Modal styles
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 };
const modal: React.CSSProperties = { background: '#fff', borderRadius: 8, maxWidth: 720, width: '100%', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' };
const modalHeader: React.CSSProperties = { background: '#0E6755', color: '#fff', padding: '12px 16px', fontWeight: 700, borderRadius: '8px 8px 0 0' };
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #C39C59', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#265C4E', boxSizing: 'border-box' };
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };
const grid4: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 };
const bloqueDestacado: React.CSSProperties = { background: '#fdfaf2', border: '1px solid #e8dfc6', borderRadius: 4, padding: 10, marginBottom: 10 };
const chk: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#265C4E', cursor: 'pointer' };
const btnCancel: React.CSSProperties = { padding: '8px 16px', background: '#e9e3d3', color: '#265C4E', border: '1px solid #C39C59', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const btnPrimario: React.CSSProperties = { padding: '8px 18px', background: '#0E6755', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontSize: 13 };
