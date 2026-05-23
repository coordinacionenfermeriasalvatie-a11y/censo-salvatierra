// src/pages/components/ModalIngreso.tsx
// Modal para registrar el INGRESO de un paciente a una cama disponible.
// Inserta en la tabla `pacientes` con estado='ACTIVO'.
// El trigger SQL fn_crear_hojas_paciente() se encarga automáticamente
// de crear los renglones en dietas_paciente, recetario_paciente y formato_control_paciente.
import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface Especialidad {
  id: number;
  nombre: string;
}

interface Props {
  camaId: number;
  subservicioId: number;
  servicioId: number;
  numeroCama: string;
  capturadoPor: string; // uuid del perfil
  onClose: () => void;
  onGuardado: () => void;
}

export const ModalIngreso: React.FC<Props> = ({
  camaId, numeroCama, capturadoPor, onClose, onGuardado,
}) => {
  const [especialidades, setEspecialidades] = useState<Especialidad[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado del formulario
  const ahora = new Date();
  const hoyISO  = ahora.toISOString().substring(0, 10);
  const horaISO = ahora.toTimeString().substring(0, 5);

  const [nombre, setNombre] = useState('');
  const [edad, setEdad] = useState('');
  const [genero, setGenero] = useState<'MASCULINO' | 'FEMENINO'>('MASCULINO');
  const [nssCurp, setNssCurp] = useState('');
  const [dx, setDx] = useState('');
  const [especialidadId, setEspecialidadId] = useState<number | null>(null);
  const [fecha, setFecha] = useState(hoyISO);
  const [hora, setHora] = useState(horaISO);
  const [observaciones, setObservaciones] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('catalogo_especialidades')
        .select('id, nombre')
        .order('nombre');
      setEspecialidades(data || []);
    })();
  }, []);

  const guardar = async () => {
    if (!nombre.trim() || !edad || !dx.trim()) {
      setError('Nombre, edad y diagnóstico son obligatorios');
      return;
    }
    if (!especialidadId) {
      setError('Selecciona una especialidad');
      return;
    }

    setGuardando(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('pacientes')
        .insert({
          cama_id: camaId,
          nombre_paciente: nombre.trim().toUpperCase(),
          edad: parseInt(edad, 10),
          genero,
          nss_curp: nssCurp.trim() || null,
          diagnostico_ingreso: dx.trim().toUpperCase(),
          especialidad_id: especialidadId,
          fecha_ingreso: fecha,
          hora_ingreso: hora,
          observaciones: observaciones.trim() || null,
          estado: 'ACTIVO',
          capturado_por: capturadoPor,
        });

      if (err) throw err;
      onGuardado();
    } catch (e: any) {
      setError(e.message || 'Error al guardar el ingreso');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={titulo}>
          <span>📝 INGRESO DE PACIENTE</span>
          <span style={camaBadge}>CAMA {numeroCama}</span>
        </div>

        {error && <div style={errorBox}>⚠️ {error}</div>}

        <div style={grid}>
          <div style={{ ...campo, gridColumn: 'span 2' }}>
            <label style={label}>NOMBRE COMPLETO *</label>
            <input value={nombre} onChange={e => setNombre(e.target.value.toUpperCase())}
              style={input} placeholder="APELLIDO PATERNO MATERNO NOMBRES" />
          </div>

          <div style={campo}>
            <label style={label}>EDAD *</label>
            <input type="number" min="0" max="130" value={edad} onChange={e => setEdad(e.target.value)} style={input} />
          </div>

          <div style={campo}>
            <label style={label}>SEXO *</label>
            <select value={genero} onChange={e => setGenero(e.target.value as any)} style={input}>
              <option value="MASCULINO">MASCULINO</option>
              <option value="FEMENINO">FEMENINO</option>
            </select>
          </div>

          <div style={{ ...campo, gridColumn: 'span 2' }}>
            <label style={label}>NSS / CURP / EXPEDIENTE</label>
            <input value={nssCurp} onChange={e => setNssCurp(e.target.value)} style={input} placeholder="141741" />
          </div>

          <div style={{ ...campo, gridColumn: 'span 2' }}>
            <label style={label}>DIAGNÓSTICO DE INGRESO *</label>
            <input value={dx} onChange={e => setDx(e.target.value.toUpperCase())} style={input} placeholder="CHOQUE SEPTICO" />
          </div>

          <div style={{ ...campo, gridColumn: 'span 2' }}>
            <label style={label}>ESPECIALIDAD *</label>
            <select value={especialidadId ?? ''} onChange={e => setEspecialidadId(e.target.value ? parseInt(e.target.value, 10) : null)} style={input}>
              <option value="">-- Selecciona --</option>
              {especialidades.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>

          <div style={campo}>
            <label style={label}>FECHA INGRESO</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={input} />
          </div>

          <div style={campo}>
            <label style={label}>HORA INGRESO</label>
            <input type="time" value={hora} onChange={e => setHora(e.target.value)} style={input} />
          </div>

          <div style={{ ...campo, gridColumn: 'span 2' }}>
            <label style={label}>OBSERVACIONES</label>
            <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)}
              style={{ ...input, minHeight: 50, resize: 'vertical' }} />
          </div>
        </div>

        <div style={botones}>
          <button onClick={onClose} style={botonCancelar} disabled={guardando}>Cancelar</button>
          <button onClick={guardar} style={botonGuardar} disabled={guardando}>
            {guardando ? 'Guardando...' : '✓ Registrar ingreso'}
          </button>
        </div>
      </div>
    </div>
  );
};

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 };
const modal: React.CSSProperties = { background: '#fff', border: '3px solid #C39C59', borderRadius: 10, padding: 24, maxWidth: 700, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' };
const titulo: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0E6755', paddingBottom: 12, marginBottom: 16, fontSize: 18, fontWeight: 700, color: '#0E6755' };
const camaBadge: React.CSSProperties = { background: '#0E6755', color: '#fff', padding: '4px 12px', borderRadius: 6, fontSize: 14 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 };
const campo: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const label: React.CSSProperties = { fontSize: 11, color: '#265C4E', fontWeight: 700, textTransform: 'uppercase' };
const input: React.CSSProperties = { padding: '8px 10px', border: '1px solid #C39C59', borderRadius: 4, fontSize: 13, color: '#265C4E', background: '#fff', fontFamily: 'inherit' };
const botones: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 16, borderTop: '1px solid #e8dfc6' };
const botonCancelar: React.CSSProperties = { padding: '10px 18px', background: '#fff', border: '1px solid #888', color: '#888', borderRadius: 6, cursor: 'pointer', fontSize: 13 };
const botonGuardar: React.CSSProperties = { padding: '10px 18px', background: '#0E6755', border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700 };
const errorBox: React.CSSProperties = { background: '#fdecea', color: '#A32D2D', padding: '10px 12px', borderRadius: 4, marginBottom: 12, fontSize: 13 };
