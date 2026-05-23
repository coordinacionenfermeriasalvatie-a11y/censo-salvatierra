// src/pages/components/VistaDietas.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

interface DietaRenglon {
  paciente_id: string;
  subservicio: string;
  numero_cama: string;
  nombre_paciente: string;
  edad: number;
  genero: string;
  nss_curp: string | null;
  dieta_id: string;
  tipo_dieta: string | null;
  consistencia: string | null;
  restricciones: string | null;
  observaciones: string | null;
  actualizado_en: string;
}

interface Props {
  servicioId: number;
}

const TIPOS_DIETA_FALLBACK = ['NORMAL', 'BLANDA', 'LIQUIDA CLARA', 'LIQUIDA COMPLETA', 'PAPILLA', 'HIPOCALORICA', 'HIPOSODICA', 'DIABETICA', 'HIPERPROTEICA', 'AYUNO', 'NPT'];
const CONSISTENCIAS_FALLBACK = ['NORMAL', 'PICADA', 'PAPILLA', 'LIQUIDA', 'PURES'];

export const VistaDietas: React.FC<Props> = ({ servicioId }) => {
  const { perfil } = useAuth();
  // Enfermeria de piso solo tiene acceso de LECTURA a dietas
  const soloLectura = perfil?.rol === 'enfermera';
  const [renglones, setRenglones] = useState<DietaRenglon[]>([]);
  const [tiposDieta, setTiposDieta] = useState<string[]>(TIPOS_DIETA_FALLBACK);
  const [consistencias, setConsistencias] = useState<string[]>(CONSISTENCIAS_FALLBACK);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [{ data: tipos }, { data: consis }] = await Promise.all([
        supabase.from('catalogo_tipos_dieta').select('nombre').order('orden'),
        supabase.from('catalogo_consistencias').select('nombre').order('orden'),
      ]);
      if (tipos && tipos.length) setTiposDieta(tipos.map((t: any) => t.nombre));
      if (consis && consis.length) setConsistencias(consis.map((c: any) => c.nombre));

      const { data, error: err } = await supabase
        .from('v_dietas_servicio')
        .select('*')
        .eq('servicio_id', servicioId)
        .order('subservicio')
        .order('numero_cama');

      if (err) throw err;
      setRenglones((data || []) as DietaRenglon[]);
    } catch (e: any) {
      setError(e.message || 'Error al cargar dietas');
    } finally {
      setCargando(false);
    }
  }, [servicioId]);

  useEffect(() => { cargar(); }, [cargar]);

  const guardarCampo = async (pacienteId: string, campo: keyof DietaRenglon, valor: string) => {
    setGuardando(pacienteId);
    setError(null);
    try {
      const update: any = {
        [campo]: valor || null,
        actualizado_por: perfil?.id,
      };
      const { error: err } = await supabase
        .from('dietas_paciente')
        .update(update)
        .eq('paciente_id', pacienteId);

      if (err) throw err;

      setRenglones(rs => rs.map(r =>
        r.paciente_id === pacienteId
          ? { ...r, [campo]: valor || null, actualizado_en: new Date().toISOString() }
          : r
      ));
    } catch (e: any) {
      setError(`No se pudo guardar: ${e.message}`);
    } finally {
      setGuardando(null);
    }
  };

  if (cargando) return <div style={{ padding: 40, textAlign: 'center', color: '#265C4E' }}>Cargando dietas...</div>;

  return (
    <div>
<div style={{ ...cabeceraBanda, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ flex: 1, textAlign: 'center' }}>
          DIETAS — REGISTRO POR TURNO
        </span>
        <button
          onClick={() => window.open(`/imprimir/dietas/${servicioId}?auto=0`, '_blank', 'noopener,noreferrer')}
          title="Abrir vista de impresión de la solicitud de dietas (Carta vertical)"
          style={{ background: '#fff', color: '#0E6755', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          🖨️ Imprimir Dietas
        </button>
      </div>
      {soloLectura && (
        <div style={{ background: '#fff7e0', color: '#7d5b2f', padding: '8px 14px', borderRadius: 4, marginBottom: 10, fontSize: 12, border: '1px solid #C39C59' }}>
          📖 Modo solo lectura — Las dietas las captura/edita el gestor o jefe de servicio.
        </div>
      )}
      {error && <div style={errorBanner}>⚠️ {error}</div>}

      {renglones.length === 0 ? (
        <div style={vacio}>No hay pacientes activos en este servicio.</div>
      ) : (
        <div style={tablaContenedor}>
          <table style={tabla}>
            <thead>
              <tr style={headerRow}>
                <th style={{ ...th, width: '8%' }}>SUBSERVICIO</th>
                <th style={{ ...th, width: '5%' }}>CAMA</th>
                <th style={{ ...th, width: '20%' }}>NOMBRE</th>
                <th style={{ ...th, width: '15%' }}>TIPO DE DIETA</th>
                <th style={{ ...th, width: '12%' }}>CONSISTENCIA</th>
                <th style={{ ...th, width: '15%' }}>RESTRICCIONES</th>
                <th style={{ ...th, width: '25%' }}>OBSERVACIONES</th>
              </tr>
            </thead>
            <tbody>
              {renglones.map((r, i) => (
                <tr key={r.paciente_id} style={i % 2 === 0 ? rowPar : rowImpar}>
                  <td style={tdAuto}>{r.subservicio}</td>
                  <td style={{ ...tdAuto, textAlign: 'center', fontWeight: 700 }}>{r.numero_cama}</td>
                  <td style={{ ...tdAuto, fontWeight: 600 }}>{r.nombre_paciente}</td>
                  <td style={tdEditable}>
                    <select
                      defaultValue={r.tipo_dieta || ''}
                      onChange={e => guardarCampo(r.paciente_id, 'tipo_dieta', e.target.value)}
                      style={input}
                      disabled={soloLectura || guardando === r.paciente_id}
                    >
                      <option value="">--</option>
                      {tiposDieta.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td style={tdEditable}>
                    <select
                      defaultValue={r.consistencia || ''}
                      onChange={e => guardarCampo(r.paciente_id, 'consistencia', e.target.value)}
                      style={input}
                      disabled={soloLectura || guardando === r.paciente_id}
                    >
                      <option value="">--</option>
                      {consistencias.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td style={tdEditable}>
                    <input type="text" defaultValue={r.restricciones || ''}
                      onBlur={e => { if (e.target.value !== (r.restricciones || '')) guardarCampo(r.paciente_id, 'restricciones', e.target.value); }}
                      style={input} disabled={soloLectura || guardando === r.paciente_id} placeholder="--" />
                  </td>
                  <td style={tdEditable}>
                    <input type="text" defaultValue={r.observaciones || ''}
                      onBlur={e => { if (e.target.value !== (r.observaciones || '')) guardarCampo(r.paciente_id, 'observaciones', e.target.value); }}
                      style={input} disabled={soloLectura || guardando === r.paciente_id} placeholder="--" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={piePagina}>
        {renglones.length} paciente{renglones.length === 1 ? '' : 's'} activo{renglones.length === 1 ? '' : 's'}
        {guardando && <span style={{ marginLeft: 16, color: '#C39C59' }}>💾 Guardando...</span>}
      </div>
    </div>
  );
};

const cabeceraBanda: React.CSSProperties = { background: '#0E6755', color: '#fff', padding: '8px 16px', fontWeight: 700, fontSize: 14, letterSpacing: 1, borderRadius: '4px 4px 0 0', textAlign: 'center' };
const tablaContenedor: React.CSSProperties = { border: '1px solid #C39C59', borderTop: 'none', overflowX: 'auto', background: '#fff' };
const tabla: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const headerRow: React.CSSProperties = { background: '#265C4E' };
const th: React.CSSProperties = { padding: '10px 8px', color: '#fff', fontWeight: 700, fontSize: 12, textAlign: 'left', border: '1px solid #1a4639' };
const tdAuto: React.CSSProperties = { padding: '8px', borderBottom: '1px solid #e8dfc6', background: '#F5F1E8', color: '#265C4E' };
const tdEditable: React.CSSProperties = { padding: '4px', borderBottom: '1px solid #e8dfc6' };
const rowPar: React.CSSProperties = { background: '#fff' };
const rowImpar: React.CSSProperties = { background: '#fdfaf2' };
const input: React.CSSProperties = { width: '100%', padding: '6px 8px', border: '1px solid #C39C59', borderRadius: 4, fontSize: 13, background: '#fff', color: '#265C4E', fontFamily: 'inherit' };
const errorBanner: React.CSSProperties = { background: '#fdecea', color: '#A32D2D', padding: '10px 16px', borderRadius: 4, marginBottom: 12, fontSize: 13 };
const vacio: React.CSSProperties = { padding: 40, textAlign: 'center', color: '#888', background: '#fff', border: '1px solid #C39C59', borderTop: 'none' };
const piePagina: React.CSSProperties = { padding: '8px 16px', fontSize: 12, color: '#888', textAlign: 'right' };
