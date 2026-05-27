// src/pages/components/ModalEditarPaciente.tsx
// Edita los datos de un paciente YA INGRESADO. Antes solo el Dx era
// editable (ModalEditarDx). Si la enfermera de admisión teclea un
// nombre mal, una edad equivocada, o se quiere actualizar el Dx /
// alergias / riesgos después del ingreso, este modal lo permite.
import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface Props {
  pacienteId: string;
  numeroCama: string;
  onClose: () => void;
  onGuardado: () => void;
}

interface Especialidad { id: number; nombre: string; }

interface PacienteData {
  nombre_paciente: string;
  edad: number | null;
  edad_unidad: 'AÑOS' | 'MESES' | 'DIAS';
  genero: string;
  nss_curp: string | null;
  fecha_nacimiento: string | null;
  diagnostico_ingreso: string;
  especialidad_id: number | null;
  grupo_sanguineo: string | null;
  alergias: string | null;
  observaciones: string | null;
}

export const ModalEditarPaciente: React.FC<Props> = ({
  pacienteId,
  numeroCama,
  onClose,
  onGuardado,
}) => {
  const [datos, setDatos] = useState<PacienteData | null>(null);
  const [especialidades, setEspecialidades] = useState<Especialidad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar datos del paciente + catálogo de especialidades
  useEffect(() => {
    (async () => {
      const [resPac, resEsp] = await Promise.all([
        supabase
          .from('pacientes')
          .select('nombre_paciente, edad, edad_unidad, genero, nss_curp, fecha_nacimiento, diagnostico_ingreso, especialidad_id, grupo_sanguineo, alergias, observaciones')
          .eq('id', pacienteId)
          .single(),
        supabase
          .from('catalogo_especialidades')
          .select('id, nombre')
          .order('nombre'),
      ]);
      if (resPac.error) {
        setError(resPac.error.message);
      } else {
        setDatos(resPac.data as PacienteData);
      }
      if (!resEsp.error && resEsp.data) {
        setEspecialidades(resEsp.data as Especialidad[]);
      }
      setCargando(false);
    })();
  }, [pacienteId]);

  const upd = <K extends keyof PacienteData>(k: K, v: PacienteData[K]) => {
    if (!datos) return;
    setDatos({ ...datos, [k]: v });
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!datos) return;
    if (!datos.nombre_paciente.trim()) {
      setError('El nombre del paciente es obligatorio.');
      return;
    }
    if (!datos.diagnostico_ingreso.trim()) {
      setError('El diagnóstico médico es obligatorio.');
      return;
    }
    setGuardando(true);
    setError(null);
    const { error } = await supabase
      .from('pacientes')
      .update({
        nombre_paciente: datos.nombre_paciente.trim().toUpperCase(),
        edad: datos.edad,
        edad_unidad: datos.edad_unidad,
        genero: datos.genero,
        nss_curp: datos.nss_curp?.trim() || null,
        fecha_nacimiento: datos.fecha_nacimiento || null,
        diagnostico_ingreso: datos.diagnostico_ingreso.trim().toUpperCase(),
        especialidad_id: datos.especialidad_id,
        grupo_sanguineo: datos.grupo_sanguineo || null,
        alergias: datos.alergias?.trim() || null,
        observaciones: datos.observaciones?.trim() || null,
      })
      .eq('id', pacienteId);
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    onGuardado();
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={header}>📝 Editar paciente · Cama {numeroCama}</div>

        {cargando || !datos ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#888' }}>
            {error ? `⚠️ ${error}` : 'Cargando datos del paciente…'}
          </div>
        ) : (
          <form onSubmit={guardar} style={{ padding: 16, maxHeight: '80vh', overflowY: 'auto' }}>
            <Campo label="Nombre completo *">
              <input
                type="text"
                value={datos.nombre_paciente}
                onChange={(e) => upd('nombre_paciente', e.target.value.toUpperCase())}
                style={input}
                required
                autoFocus
              />
            </Campo>

            <div style={grid2}>
              <Campo label="Edad *">
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    type="number"
                    min={0}
                    max={130}
                    value={datos.edad ?? ''}
                    onChange={(e) => upd('edad', e.target.value === '' ? null : Number(e.target.value))}
                    style={{ ...input, flex: 1 }}
                    required
                  />
                  <select
                    value={datos.edad_unidad}
                    onChange={(e) => upd('edad_unidad', e.target.value as any)}
                    style={{ ...input, width: 90, flex: 'none' }}
                  >
                    <option value="AÑOS">AÑOS</option>
                    <option value="MESES">MESES</option>
                    <option value="DIAS">DÍAS</option>
                  </select>
                </div>
              </Campo>
              <Campo label="Sexo *">
                <select value={datos.genero} onChange={(e) => upd('genero', e.target.value)} style={input}>
                  <option value="MASCULINO">MASCULINO</option>
                  <option value="FEMENINO">FEMENINO</option>
                </select>
              </Campo>
            </div>

            <div style={grid2}>
              <Campo label="NSS / Expediente">
                <input
                  type="text"
                  value={datos.nss_curp ?? ''}
                  onChange={(e) => upd('nss_curp', e.target.value)}
                  style={input}
                />
              </Campo>
              <Campo label="Fecha de nacimiento">
                <input
                  type="date"
                  value={datos.fecha_nacimiento ?? ''}
                  onChange={(e) => upd('fecha_nacimiento', e.target.value || null)}
                  style={input}
                />
              </Campo>
            </div>

            <Campo label="Diagnóstico médico *">
              <textarea
                value={datos.diagnostico_ingreso}
                onChange={(e) => upd('diagnostico_ingreso', e.target.value.toUpperCase())}
                style={{ ...input, minHeight: 60, resize: 'vertical', textTransform: 'uppercase' }}
                required
              />
            </Campo>

            <Campo label="Especialidad">
              <select
                value={datos.especialidad_id ?? ''}
                onChange={(e) => upd('especialidad_id', e.target.value ? Number(e.target.value) : null)}
                style={input}
              >
                <option value="">— Sin especialidad —</option>
                {especialidades.map((es) => (
                  <option key={es.id} value={es.id}>{es.nombre}</option>
                ))}
              </select>
            </Campo>

            <div style={grid2}>
              <Campo label="Grupo sanguíneo">
                <select
                  value={datos.grupo_sanguineo ?? ''}
                  onChange={(e) => upd('grupo_sanguineo', e.target.value || null)}
                  style={input}
                >
                  <option value="">— Sin dato —</option>
                  {['O+','O-','A+','A-','B+','B-','AB+','AB-'].map(gs => (
                    <option key={gs} value={gs}>{gs}</option>
                  ))}
                </select>
              </Campo>
              <Campo label="Alergias">
                <input
                  type="text"
                  value={datos.alergias ?? ''}
                  onChange={(e) => upd('alergias', e.target.value)}
                  placeholder="Ej. PENICILINA, AINES"
                  style={input}
                />
              </Campo>
            </div>

            <Campo label="Observaciones del ingreso">
              <textarea
                value={datos.observaciones ?? ''}
                onChange={(e) => upd('observaciones', e.target.value)}
                style={{ ...input, minHeight: 40, resize: 'vertical' }}
              />
            </Campo>

            {error && <div style={errorBox}>⚠️ {error}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="button" style={btnCancel} onClick={onClose} disabled={guardando}>
                Cancelar
              </button>
              <button type="submit" style={btnPrimario} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        )}
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

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 };
const modal: React.CSSProperties = { background: '#fff', borderRadius: 8, maxWidth: 640, width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' };
const header: React.CSSProperties = { background: '#0E6755', color: '#fff', padding: '12px 16px', fontWeight: 700, borderRadius: '8px 8px 0 0' };
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #C39C59', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#265C4E', boxSizing: 'border-box' };
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };
const errorBox: React.CSSProperties = { background: '#fdecea', color: '#A32D2D', padding: '10px 12px', borderRadius: 4, marginTop: 10, fontSize: 12 };
const btnCancel: React.CSSProperties = { padding: '8px 16px', background: '#e9e3d3', color: '#265C4E', border: '1px solid #C39C59', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const btnPrimario: React.CSSProperties = { padding: '8px 18px', background: '#0E6755', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontSize: 13 };
