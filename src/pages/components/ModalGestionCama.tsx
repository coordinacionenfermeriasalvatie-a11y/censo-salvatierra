// src/pages/components/ModalGestionCama.tsx
// Selector intermedio cuando se hace clic en una cama vacía. Permite:
//   1. Registrar el ingreso de un paciente (flujo normal → ModalIngreso)
//   2. Marcar la cama como NO OCUPABLE con una causa (descompuesta,
//      sin colchón, etc.), sin tener que crear un paciente fantasma.
//
// Si la cama YA está bloqueada, en lugar de ofrecer ambas opciones,
// muestra la causa actual y un botón para liberarla.
import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';

const CAUSAS = ['SIN CAMA', 'DESCOMPUESTA', 'SIN COLCHÓN', 'EN REPARACIÓN', 'AISLAMIENTO', 'OTRA'] as const;

interface Props {
  camaId: number;
  numeroCama: string;
  bloqueada: boolean;
  causaActual: string | null;
  notaActual: string | null;
  bloqueadaDesde: string | null;
  perfilId: string;
  onIngresar: () => void;     // → abre ModalIngreso
  onClose: () => void;
  onGuardado: () => void;     // refrescar censo tras bloquear/liberar
}

export const ModalGestionCama: React.FC<Props> = ({
  camaId, numeroCama, bloqueada, causaActual, notaActual, bloqueadaDesde,
  perfilId, onIngresar, onClose, onGuardado,
}) => {
  // Si la cama ya está bloqueada, la UI arranca en modo "ver/liberar".
  // Si no, arranca en modo "elegir" (ingreso o bloqueo).
  const [modo, setModo] = useState<'elegir' | 'bloquear' | 'bloqueada'>(
    bloqueada ? 'bloqueada' : 'elegir'
  );
  const [causa, setCausa] = useState<string>(causaActual || '');
  const [nota, setNota] = useState<string>(notaActual || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bloquear = async () => {
    if (!causa) {
      setError('Selecciona una causa de no ocupación');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('camas')
        .update({
          bloqueada: true,
          causa_no_ocupacion: causa,
          nota_no_ocupacion: nota.trim() || null,
          bloqueada_desde: new Date().toISOString(),
          bloqueada_por: perfilId,
        })
        .eq('id', camaId);
      if (err) throw err;
      onGuardado();
    } catch (e: any) {
      setError(e.message || 'Error al bloquear la cama');
    } finally {
      setGuardando(false);
    }
  };

  const liberar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('camas')
        .update({
          bloqueada: false,
          causa_no_ocupacion: null,
          nota_no_ocupacion: null,
          bloqueada_desde: null,
          bloqueada_por: null,
        })
        .eq('id', camaId);
      if (err) throw err;
      onGuardado();
    } catch (e: any) {
      setError(e.message || 'Error al liberar la cama');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={titulo}>
          <span>🛏️ GESTIÓN DE CAMA</span>
          <span style={camaBadge}>CAMA {numeroCama}</span>
        </div>

        {error && <div style={errorBox}>⚠️ {error}</div>}

        {modo === 'elegir' && (
          <>
            <p style={pregunta}>¿Qué quieres hacer con esta cama?</p>
            <button onClick={onIngresar} style={btnPrincipal} disabled={guardando}>
              📝 Registrar ingreso de paciente
            </button>
            <button onClick={() => setModo('bloquear')} style={btnSecundario} disabled={guardando}>
              🚫 Marcar como no ocupable
            </button>
            <button onClick={onClose} style={btnCancelar} disabled={guardando}>
              Cancelar
            </button>
          </>
        )}

        {modo === 'bloquear' && (
          <>
            <p style={pregunta}>Causa por la que la cama no se puede ocupar:</p>
            <label style={label}>CAUSA *</label>
            <select value={causa} onChange={e => setCausa(e.target.value)} style={input}>
              <option value="">-- Selecciona --</option>
              {CAUSAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <label style={{ ...label, marginTop: 12 }}>NOTAS (opcional)</label>
            <textarea
              value={nota}
              onChange={e => setNota(e.target.value)}
              style={{ ...input, minHeight: 60, resize: 'vertical' }}
              placeholder="Ej. Motor del respaldo no enciende, reportado a biomédica"
            />

            <div style={botones}>
              <button
                onClick={() => bloqueada ? setModo('bloqueada') : setModo('elegir')}
                style={btnCancelar}
                disabled={guardando}
              >
                ← Volver
              </button>
              <button onClick={bloquear} style={btnPrincipal} disabled={guardando || !causa}>
                {guardando ? 'Guardando...' : '🚫 Marcar no ocupable'}
              </button>
            </div>
          </>
        )}

        {modo === 'bloqueada' && (
          <>
            <div style={infoBloqueo}>
              <div style={infoLabel}>ESTADO ACTUAL</div>
              <div style={infoCausa}>🚫 NO OCUPABLE</div>
              <div style={infoCausa2}>{causaActual}</div>
              {notaActual && <div style={infoNota}>{notaActual}</div>}
              {bloqueadaDesde && (
                <div style={infoFecha}>
                  Desde: {new Date(bloqueadaDesde).toLocaleString('es-MX', { timeZone: 'America/Mazatlan' })}
                </div>
              )}
            </div>

            <button onClick={() => setModo('bloquear')} style={btnSecundario} disabled={guardando}>
              ✏️ Cambiar causa / nota
            </button>
            <button onClick={liberar} style={btnLiberar} disabled={guardando}>
              {guardando ? 'Liberando...' : '✓ Liberar cama (ya disponible)'}
            </button>
            <button onClick={onClose} style={btnCancelar} disabled={guardando}>
              Cerrar
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 };
const modal: React.CSSProperties = { background: '#fff', border: '3px solid #C39C59', borderRadius: 10, padding: 24, maxWidth: 500, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' };
const titulo: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0E6755', paddingBottom: 12, marginBottom: 16, fontSize: 17, fontWeight: 700, color: '#0E6755' };
const camaBadge: React.CSSProperties = { background: '#0E6755', color: '#fff', padding: '4px 12px', borderRadius: 6, fontSize: 14 };
const pregunta: React.CSSProperties = { fontSize: 14, color: '#265C4E', margin: '8px 0 16px', textAlign: 'center' };
const label: React.CSSProperties = { display: 'block', fontSize: 11, color: '#265C4E', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 };
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #C39C59', borderRadius: 4, fontSize: 13, color: '#265C4E', background: '#fff', fontFamily: 'inherit', boxSizing: 'border-box' };
const botones: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 16 };
const btnPrincipal: React.CSSProperties = { width: '100%', padding: '12px 18px', background: '#0E6755', border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', marginBottom: 10 };
const btnSecundario: React.CSSProperties = { width: '100%', padding: '12px 18px', background: '#fff', border: '2px solid #A32D2D', color: '#A32D2D', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', marginBottom: 10 };
const btnLiberar: React.CSSProperties = { width: '100%', padding: '12px 18px', background: '#0E6755', border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', marginBottom: 10 };
const btnCancelar: React.CSSProperties = { width: '100%', padding: '10px 18px', background: '#fff', border: '1px solid #888', color: '#888', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' };
const errorBox: React.CSSProperties = { background: '#fdecea', color: '#A32D2D', padding: '10px 12px', borderRadius: 4, marginBottom: 12, fontSize: 13 };
const infoBloqueo: React.CSSProperties = { background: '#fdecea', border: '2px solid #A32D2D', borderRadius: 6, padding: 14, marginBottom: 16, textAlign: 'center' };
const infoLabel: React.CSSProperties = { fontSize: 10, color: '#7d1f1f', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 };
const infoCausa: React.CSSProperties = { fontSize: 18, color: '#A32D2D', fontWeight: 800, marginBottom: 4 };
const infoCausa2: React.CSSProperties = { fontSize: 14, color: '#7d1f1f', fontWeight: 700, marginBottom: 8 };
const infoNota: React.CSSProperties = { fontSize: 12, color: '#265C4E', fontStyle: 'italic', marginBottom: 6, padding: '6px 10px', background: '#fff', borderRadius: 4 };
const infoFecha: React.CSSProperties = { fontSize: 11, color: '#888' };
