// src/pages/components/VistaERC.tsx
// Censo de pacientes con Enfermedad Renal Crónica que reciben Terapia
// de Sustitución Renal. Pestaña dedicada del servicio HEMODIALISIS.
//
// Tabla independiente: pacientes_erc (no usa la de pacientes/cama porque
// muchos ERC no están hospitalizados, solo asisten a sus sesiones).
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

interface PacienteERC {
  id: string;
  numero: number | null;
  nombre_paciente: string;
  curp: string | null;
  fecha_nacimiento: string | null;
  terapia: string | null;
  fecha_alta: string | null;
  estatus: string | null;
  cama: string | null;
  observaciones: string | null;
}

export const VistaERC: React.FC = () => {
  const { perfil } = useAuth();
  const [pacientes, setPacientes] = useState<PacienteERC[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  const [filtroTerapia, setFiltroTerapia] = useState<string>('');
  const [filtroEstatus, setFiltroEstatus] = useState<string>('todos');

  const puedeEditar = !!perfil && ['jefe', 'subjefe', 'supervisor'].includes(perfil.rol);

  const cargar = async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from('pacientes_erc')
      .select('*')
      .order('numero', { ascending: true, nullsFirst: false });
    if (error) { setError(error.message); }
    else { setPacientes((data || []) as PacienteERC[]); }
    setCargando(false);
  };

  useEffect(() => { cargar(); }, []);

  const filtrados = useMemo(() => {
    const term = filtro.trim().toLowerCase();
    return pacientes.filter(p => {
      if (filtroTerapia && p.terapia !== filtroTerapia) return false;
      const esActivo = !(p.estatus && /EGRESO|BAJA|DEFUNCION/i.test(p.estatus));
      if (filtroEstatus === 'activos' && !esActivo) return false;
      if (filtroEstatus === 'egresados' && esActivo) return false;
      if (!term) return true;
      return (
        p.nombre_paciente.toLowerCase().includes(term) ||
        (p.curp || '').toLowerCase().includes(term) ||
        (p.cama || '').toLowerCase().includes(term)
      );
    });
  }, [pacientes, filtro, filtroTerapia, filtroEstatus]);

  const total = pacientes.length;
  const activos = pacientes.filter(p => !(p.estatus && /EGRESO|BAJA|DEFUNCION/i.test(p.estatus))).length;
  const hd = pacientes.filter(p => p.terapia === 'Hemodiálisis').length;
  const dp = pacientes.filter(p => p.terapia && /DP/.test(p.terapia)).length;

  return (
    <div>
      <div style={cabeceraBanda}>
        CENSO PACIENTES ERC — HOSPITAL GENERAL CON ESPECIALIDADES "JUAN MARÍA DE SALVATIERRA"
      </div>

      <div style={kpisRow}>
        <Kpi etiqueta="Total" valor={total} color="#0E6755" />
        <Kpi etiqueta="Activos" valor={activos} color="#0E6755" />
        <Kpi etiqueta="Hemodiálisis" valor={hd} color="#1a5f8a" />
        <Kpi etiqueta="Diálisis peritoneal (DP)" valor={dp} color="#7d5b2f" />
      </div>

      <div style={filtros}>
        <input
          type="text"
          placeholder="🔎 Buscar por nombre, CURP o cama"
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          style={inputFiltro}
        />
        <select value={filtroTerapia} onChange={e => setFiltroTerapia(e.target.value)} style={inputFiltro}>
          <option value="">Todas las terapias</option>
          <option value="Hemodiálisis">Hemodiálisis</option>
          <option value="DPCA">DPCA</option>
          <option value="DPA">DPA</option>
          <option value="DPI">DPI</option>
        </select>
        <select value={filtroEstatus} onChange={e => setFiltroEstatus(e.target.value)} style={inputFiltro}>
          <option value="todos">Todos los estatus</option>
          <option value="activos">Solo activos</option>
          <option value="egresados">Solo egresados</option>
        </select>
      </div>

      {error && <div style={errorBox}>⚠️ {error}</div>}

      {cargando ? (
        <div style={vacio}>Cargando pacientes ERC...</div>
      ) : filtrados.length === 0 ? (
        <div style={vacio}>No hay pacientes que coincidan con el filtro.</div>
      ) : (
        <div style={tablaWrap}>
          <table style={tabla}>
            <thead>
              <tr style={headerRow}>
                <th style={th}>#</th>
                <th style={th}>Nombre del paciente</th>
                <th style={th}>CURP</th>
                <th style={th}>Fecha nacimiento</th>
                <th style={th}>Terapia</th>
                <th style={th}>Fecha alta a programa</th>
                <th style={th}>Estatus</th>
                <th style={th}>Cama</th>
                <th style={th}>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p, i) => {
                const esActivo = !(p.estatus && /EGRESO|BAJA|DEFUNCION/i.test(p.estatus));
                return (
                  <tr key={p.id} style={i % 2 === 0 ? trPar : trImpar}>
                    <td style={tdNum}>{p.numero ?? ''}</td>
                    <td style={tdNombre}>{p.nombre_paciente}</td>
                    <td style={tdCurp}>{p.curp || ''}</td>
                    <td style={tdNum}>{p.fecha_nacimiento || ''}</td>
                    <td style={tdTerapia(p.terapia)}>{p.terapia || ''}</td>
                    <td style={tdNum}>{p.fecha_alta || ''}</td>
                    <td style={tdEstatus(esActivo)}>{p.estatus || (esActivo ? 'ACTIVO' : '')}</td>
                    <td style={tdNum}>{p.cama || ''}</td>
                    <td style={tdObs}>{p.observaciones || ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={pie}>
        Mostrando {filtrados.length} de {total} pacientes
        {!puedeEditar && <span style={{ marginLeft: 16, color: '#888' }}>· Vista de solo lectura</span>}
      </div>
    </div>
  );
};

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
const filtros: React.CSSProperties = { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' };
const inputFiltro: React.CSSProperties = { flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid #C39C59', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#265C4E' };
const tablaWrap: React.CSSProperties = { overflowX: 'auto', border: '1px solid #C39C59', borderRadius: 4, background: '#fff' };
const tabla: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
const headerRow: React.CSSProperties = { background: '#265C4E' };
const th: React.CSSProperties = { padding: '10px 8px', color: '#fff', textAlign: 'left', fontWeight: 700, fontSize: 11, letterSpacing: 0.3, borderBottom: '1px solid #555' };
const trPar: React.CSSProperties = { background: '#fff' };
const trImpar: React.CSSProperties = { background: '#fdfaf2' };
const tdNum: React.CSSProperties = { padding: '8px', borderBottom: '1px solid #e8dfc6', color: '#265C4E', fontSize: 12 };
const tdNombre: React.CSSProperties = { ...tdNum, fontWeight: 700, color: '#0E6755' };
const tdCurp: React.CSSProperties = { ...tdNum, fontFamily: 'monospace', fontSize: 11 };
const tdObs: React.CSSProperties = { ...tdNum, fontSize: 11, color: '#7d5b2f', fontStyle: 'italic', maxWidth: 280 };
const tdTerapia = (t: string | null): React.CSSProperties => ({
  ...tdNum,
  fontWeight: 700,
  color: t === 'Hemodiálisis' ? '#1a5f8a' : t && /DP/.test(t) ? '#7d5b2f' : '#888',
});
const tdEstatus = (activo: boolean): React.CSSProperties => ({
  ...tdNum,
  fontWeight: 700,
  color: activo ? '#0E6755' : '#A32D2D',
  fontSize: 11,
});
const pie: React.CSSProperties = { padding: '8px 4px', fontSize: 12, color: '#888' };
const errorBox: React.CSSProperties = { background: '#fdecea', color: '#A32D2D', padding: '10px 12px', borderRadius: 4, marginBottom: 12 };
const vacio: React.CSSProperties = { padding: 40, textAlign: 'center', color: '#888', background: '#fff', border: '1px solid #C39C59', borderRadius: 4 };
