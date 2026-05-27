// src/pages/components/ModalEditarDx.tsx
// Modal pequeño para editar el diagnóstico médico de un paciente ya ingresado.
// El Dx puede cambiar después del ingreso (p.ej. de "Apendicitis" a
// "Postoperado de apendicectomía"), y antes solo se podía cambiar
// re-ingresando al paciente. Ahora es un click.
import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';

interface Props {
  pacienteId: string;
  nombrePaciente: string;
  numeroCama: string;
  dxActual: string;
  onClose: () => void;
  onGuardado: () => void;
}

export const ModalEditarDx: React.FC<Props> = ({
  pacienteId,
  nombrePaciente,
  numeroCama,
  dxActual,
  onClose,
  onGuardado,
}) => {
  const [dx, setDx] = useState(dxActual || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const nuevo = dx.trim();
    if (!nuevo) {
      setError('El diagnóstico no puede quedar vacío.');
      return;
    }
    if (nuevo === (dxActual || '').trim()) {
      onClose();
      return;
    }
    setGuardando(true);
    setError(null);
    const { error } = await supabase
      .from('pacientes')
      .update({ diagnostico_ingreso: nuevo })
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
        <div style={header}>📝 Editar diagnóstico médico</div>
        <form onSubmit={guardar} style={{ padding: 16 }}>
          <div style={infoBox}>
            <div style={{ fontWeight: 700, color: '#0E6755' }}>{nombrePaciente}</div>
            <div style={{ fontSize: 12, color: '#888' }}>Cama {numeroCama}</div>
          </div>

          <label style={lbl}>Nuevo diagnóstico médico *</label>
          <textarea
            value={dx}
            onChange={(e) => setDx(e.target.value.toUpperCase())}
            style={textarea}
            autoFocus
            required
            maxLength={500}
            placeholder="Ej. POSTOPERADO DE COLECISTECTOMÍA"
          />
          <div style={hint}>
            El cambio queda registrado en el historial del paciente. Si el paciente
            pasa a postoperado, oncológico, etc., actualice el diagnóstico aquí.
          </div>

          {error && <div style={errorBox}>⚠️ {error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="button" style={btnCancel} onClick={onClose} disabled={guardando}>
              Cancelar
            </button>
            <button type="submit" style={btnPrimario} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar diagnóstico'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 };
const modal: React.CSSProperties = { background: '#fff', borderRadius: 8, maxWidth: 520, width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' };
const header: React.CSSProperties = { background: '#0E6755', color: '#fff', padding: '12px 16px', fontWeight: 700, borderRadius: '8px 8px 0 0' };
const infoBox: React.CSSProperties = { background: '#fdfaf2', border: '1px solid #e8dfc6', borderRadius: 4, padding: 10, marginBottom: 12 };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, color: '#265C4E', marginBottom: 4, fontWeight: 600 };
const textarea: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #C39C59', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#265C4E', boxSizing: 'border-box', minHeight: 70, resize: 'vertical', textTransform: 'uppercase' };
const hint: React.CSSProperties = { fontSize: 11, color: '#7d5b2f', marginTop: 6, fontStyle: 'italic' };
const errorBox: React.CSSProperties = { background: '#fdecea', color: '#A32D2D', padding: '10px 12px', borderRadius: 4, marginTop: 10, fontSize: 12 };
const btnCancel: React.CSSProperties = { padding: '8px 16px', background: '#e9e3d3', color: '#265C4E', border: '1px solid #C39C59', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const btnPrimario: React.CSSProperties = { padding: '8px 18px', background: '#0E6755', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontSize: 13 };
