// Modal para crear receta de medicamento controlado.
// Datos del paciente: snapshot (no editables).
// Datos del médico: texto libre (nombre, cédula, especialidad).
// Medicamento: solo del catálogo filtrado por grupo_control IS NOT NULL.
// Al guardar, abre la vista de impresión en pestaña nueva.

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

interface Paciente {
  paciente_id: string;
  nombre_paciente: string;
  edad: number | null;
  edad_unidad: string | null;
  genero: string | null;
  nss_curp: string | null;
  diagnostico_ingreso: string | null;
  numero_cama: string | null;
  subservicio: string | null;
}

interface MedicamentoControlado {
  id: number;
  nombre: string;
  grupo_control: 'I' | 'II' | 'III' | 'IV' | 'V';
}

interface Props {
  servicioId: number;
  pacientes: Paciente[];          // de la VistaRecetario, ya filtrados al servicio
  pacienteInicialId?: string;     // opcional pre-selección
  onCerrar: () => void;
}

const GRUPO_LABEL: Record<string, string> = {
  'I':   'Grupo I (estupefacientes)',
  'II':  'Grupo II (psicotrópicos potentes)',
  'III': 'Grupo III (psicotrópicos)',
  'IV':  'Grupo IV',
  'V':   'Grupo V',
};

export const ModalRecetaControlada: React.FC<Props> = ({ servicioId, pacientes, pacienteInicialId, onCerrar }) => {
  const { perfil } = useAuth();
  const [medicamentos, setMedicamentos] = useState<MedicamentoControlado[]>([]);
  const [pacienteId, setPacienteId] = useState(pacienteInicialId ?? '');
  const [medicamentoId, setMedicamentoId] = useState<number | ''>('');
  const [dosis, setDosis] = useState('');
  const [via, setVia] = useState('');
  const [frecuencia, setFrecuencia] = useState('');
  const [duracion, setDuracion] = useState('');
  const [cantidadNumero, setCantidadNumero] = useState('');
  const [cantidadLetra, setCantidadLetra] = useState('');
  const [indicaciones, setIndicaciones] = useState('');
  const [medicoNombre, setMedicoNombre] = useState('');
  const [medicoCedula, setMedicoCedula] = useState('');
  const [medicoEspecialidad, setMedicoEspecialidad] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('catalogo_medicamentos')
        .select('id, nombre, grupo_control')
        .not('grupo_control', 'is', null)
        .eq('activo', true)
        .order('grupo_control')
        .order('nombre');
      setMedicamentos((data || []) as MedicamentoControlado[]);
    })();
  }, []);

  const paciente = useMemo(
    () => pacientes.find(p => p.paciente_id === pacienteId),
    [pacientes, pacienteId]
  );

  const medicamento = useMemo(
    () => medicamentos.find(m => m.id === medicamentoId),
    [medicamentos, medicamentoId]
  );

  const guardar = async () => {
    if (!perfil) { setError('Sin sesión activa'); return; }
    if (!paciente) { setError('Selecciona un paciente'); return; }
    if (!medicamento) { setError('Selecciona un medicamento controlado'); return; }
    if (!medicoNombre.trim() || !medicoCedula.trim()) {
      setError('Nombre y cédula del médico son obligatorios');
      return;
    }
    if (!dosis.trim() || !via.trim() || !frecuencia.trim()) {
      setError('Dosis, vía y frecuencia son obligatorios');
      return;
    }
    setGuardando(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('recetas_controladas')
      .insert({
        paciente_id: paciente.paciente_id,
        paciente_nombre: paciente.nombre_paciente,
        paciente_edad: paciente.edad,
        paciente_edad_unidad: paciente.edad_unidad,
        paciente_genero: paciente.genero,
        paciente_nss_curp: paciente.nss_curp,
        paciente_diagnostico: paciente.diagnostico_ingreso,
        paciente_cama: paciente.numero_cama,
        paciente_subservicio: paciente.subservicio,
        servicio_id: servicioId,
        medicamento_id: medicamento.id,
        medicamento_nombre: medicamento.nombre,
        medicamento_grupo: medicamento.grupo_control,
        dosis, via, frecuencia, duracion,
        cantidad_numero: cantidadNumero,
        cantidad_letra: cantidadLetra,
        indicaciones,
        medico_nombre: medicoNombre.trim(),
        medico_cedula: medicoCedula.trim(),
        medico_especialidad: medicoEspecialidad.trim() || null,
        enfermera_id: perfil.id,
        enfermera_nombre: perfil.nombre_completo,
        enfermera_matricula: perfil.matricula,
        enfermera_rol: perfil.rol,
      })
      .select('id, folio')
      .single();

    setGuardando(false);
    if (err) { setError(err.message); return; }

    // Abrir vista de impresión y cerrar modal
    window.open(`/imprimir/receta-controlada/${data.id}`, '_blank', 'noopener,noreferrer');
    onCerrar();
  };

  return (
    <div style={overlay} onClick={onCerrar}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={tituloChip}>💊 RECETA DE MEDICAMENTO CONTROLADO</div>
            <div style={subt}>Grupos I-V (Ley General de Salud)</div>
          </div>
          <button onClick={onCerrar} style={btnCerrar}>✕</button>
        </div>

        <div style={body}>
          {/* PACIENTE */}
          <div style={seccion}>
            <div style={seccionTit}>1. Paciente</div>
            <select
              value={pacienteId}
              onChange={e => setPacienteId(e.target.value)}
              style={input}
            >
              <option value="">-- elige paciente --</option>
              {pacientes.map(p => (
                <option key={p.paciente_id} value={p.paciente_id}>
                  Cama {p.numero_cama} · {p.nombre_paciente}
                </option>
              ))}
            </select>
            {paciente && (
              <div style={pacienteCard}>
                <div><strong>Nombre:</strong> {paciente.nombre_paciente}</div>
                <div><strong>Edad:</strong> {paciente.edad ?? '—'} {paciente.edad_unidad ?? ''} · <strong>Sexo:</strong> {paciente.genero ?? '—'}</div>
                <div><strong>NSS/Exp:</strong> {paciente.nss_curp ?? '—'}</div>
                <div><strong>Cama:</strong> {paciente.numero_cama} · <strong>Subservicio:</strong> {paciente.subservicio}</div>
                <div><strong>Dx ingreso:</strong> {paciente.diagnostico_ingreso ?? '—'}</div>
              </div>
            )}
          </div>

          {/* MEDICAMENTO */}
          <div style={seccion}>
            <div style={seccionTit}>2. Medicamento controlado</div>
            <select
              value={medicamentoId}
              onChange={e => setMedicamentoId(e.target.value ? parseInt(e.target.value, 10) : '')}
              style={input}
            >
              <option value="">-- elige medicamento --</option>
              {medicamentos.map(m => (
                <option key={m.id} value={m.id}>
                  [{m.grupo_control}] {m.nombre}
                </option>
              ))}
            </select>
            {medicamento && (
              <div style={chipGrupo}>{GRUPO_LABEL[medicamento.grupo_control]}</div>
            )}
            <div style={gridCampos}>
              <div>
                <label style={lbl}>Dosis *</label>
                <input value={dosis} onChange={e => setDosis(e.target.value)} placeholder="ej. 10 mg" style={input} />
              </div>
              <div>
                <label style={lbl}>Vía *</label>
                <input value={via} onChange={e => setVia(e.target.value)} placeholder="IV, oral, SC..." style={input} />
              </div>
              <div>
                <label style={lbl}>Frecuencia *</label>
                <input value={frecuencia} onChange={e => setFrecuencia(e.target.value)} placeholder="c/8 h, una vez..." style={input} />
              </div>
              <div>
                <label style={lbl}>Duración</label>
                <input value={duracion} onChange={e => setDuracion(e.target.value)} placeholder="3 días, 5 dosis..." style={input} />
              </div>
              <div>
                <label style={lbl}>Cantidad (número)</label>
                <input value={cantidadNumero} onChange={e => setCantidadNumero(e.target.value)} placeholder="ej. 12" style={input} />
              </div>
              <div>
                <label style={lbl}>Cantidad (letra)</label>
                <input value={cantidadLetra} onChange={e => setCantidadLetra(e.target.value)} placeholder="ej. doce" style={input} />
              </div>
            </div>
            <label style={lbl}>Indicaciones adicionales</label>
            <textarea
              value={indicaciones}
              onChange={e => setIndicaciones(e.target.value)}
              rows={2}
              style={{ ...input, resize: 'vertical' as const }}
              placeholder="Diluir en SF, administrar lento..."
            />
          </div>

          {/* MÉDICO */}
          <div style={seccion}>
            <div style={seccionTit}>3. Médico prescriptor</div>
            <div style={gridCampos}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lbl}>Nombre completo *</label>
                <input value={medicoNombre} onChange={e => setMedicoNombre(e.target.value)} style={input} />
              </div>
              <div>
                <label style={lbl}>Cédula profesional *</label>
                <input value={medicoCedula} onChange={e => setMedicoCedula(e.target.value)} style={input} />
              </div>
              <div>
                <label style={lbl}>Especialidad</label>
                <input value={medicoEspecialidad} onChange={e => setMedicoEspecialidad(e.target.value)} style={input} />
              </div>
            </div>
          </div>

          {/* ENFERMERA (info, no editable) */}
          {perfil && (
            <div style={seccion}>
              <div style={seccionTit}>4. Personal de enfermería (auto)</div>
              <div style={pacienteCard}>
                <div><strong>{perfil.nombre_completo}</strong> · Matrícula {perfil.matricula} · {perfil.rol.toUpperCase()}</div>
                <div style={{ fontSize: 11, color: '#666' }}>Este registro queda asociado a tu sesión y se guarda en la bitácora de auditoría.</div>
              </div>
            </div>
          )}

          {error && <div style={errBanner}>⚠️ {error}</div>}
        </div>

        <div style={footer}>
          <button onClick={onCerrar} disabled={guardando} style={btnSecundario}>Cancelar</button>
          <button onClick={guardar} disabled={guardando} style={btnPrincipal}>
            {guardando ? 'Guardando...' : '💾 Guardar e imprimir'}
          </button>
        </div>
      </div>
    </div>
  );
};

const overlay: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, padding: 16,
};
const modal: React.CSSProperties = {
  background: '#fff', borderRadius: 8, width: '100%', maxWidth: 720,
  maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
};
const header: React.CSSProperties = {
  background: '#A32D2D', color: '#fff', padding: '12px 18px', borderRadius: '8px 8px 0 0',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
};
const tituloChip: React.CSSProperties = { fontSize: 14, fontWeight: 700, letterSpacing: 0.5 };
const subt: React.CSSProperties = { fontSize: 11, opacity: 0.9, marginTop: 2 };
const btnCerrar: React.CSSProperties = {
  background: 'transparent', border: '1px solid #fff', color: '#fff', borderRadius: 4,
  width: 32, height: 32, cursor: 'pointer', fontSize: 16,
};
const body: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 };
const seccion: React.CSSProperties = { border: '1px solid #eee', borderRadius: 6, padding: 12 };
const seccionTit: React.CSSProperties = { fontWeight: 700, color: '#0E6755', fontSize: 13, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #eee' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: '#7d5b2f', fontWeight: 600, marginBottom: 3 };
const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '6px 10px',
  border: '1px solid #C39C59', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', background: '#fff',
};
const gridCampos: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8,
};
const pacienteCard: React.CSSProperties = {
  background: '#fff7e0', border: '1px solid #C39C59', borderRadius: 4, padding: 8, fontSize: 12, lineHeight: 1.6, marginTop: 6,
};
const chipGrupo: React.CSSProperties = {
  display: 'inline-block', background: '#A32D2D', color: '#fff', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, margin: '6px 0',
};
const errBanner: React.CSSProperties = {
  background: '#fbeaea', border: '1px solid #A32D2D', color: '#A32D2D', padding: 8, borderRadius: 4, fontSize: 12,
};
const footer: React.CSSProperties = {
  padding: 12, borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: 8,
};
const btnSecundario: React.CSSProperties = {
  padding: '8px 16px', background: '#fff', color: '#7d5b2f', border: '1px solid #C39C59', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
};
const btnPrincipal: React.CSSProperties = {
  padding: '8px 16px', background: '#A32D2D', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700,
};
