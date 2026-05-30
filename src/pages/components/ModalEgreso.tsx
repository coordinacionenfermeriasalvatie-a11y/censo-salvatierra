// src/pages/components/ModalEgreso.tsx
// Modal para registrar el EGRESO de un paciente activo.
// Cambia estado='ACTIVO' -> 'EGRESADO' y sella fecha/hora/motivo/destino/observaciones.
// El trigger SQL trg_calcular_dias_estancia se encarga de poblar dias_estancia automáticamente.
// Hereda patrón visual de ModalIngreso.tsx (overlay, modal, grid, footer).
import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface MotivoEgreso {
  id: number;
  nombre: string;
}

interface Props {
  pacienteId: string;
  numeroCama: string;
  nombrePaciente: string;
  fechaIngreso: string;
  capturadoPor: string;
  onClose: () => void;
  onGuardado: () => void;
  // Si está presente, muestra un botón alternativo "Trasladar" arriba que
  // cierra este modal y abre el de traslado. El paciente no se egresa,
  // solo cambia de cama (mismo o distinto subservicio).
  onTrasladar?: () => void;
}

export const ModalEgreso: React.FC<Props> = ({
  pacienteId, numeroCama, nombrePaciente, fechaIngreso, capturadoPor,
  onClose, onGuardado, onTrasladar,
}) => {
  const [motivos, setMotivos] = useState<MotivoEgreso[]>([]);
  const [cargandoMotivos, setCargandoMotivos] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ahora = new Date();
  // Fecha LOCAL (no UTC): toISOString() devuelve UTC y de noche (Central UTC-6)
  // marcaba el día siguiente en el egreso. Se arma con componentes locales.
  const hoyISO  = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  const horaISO = ahora.toTimeString().substring(0, 5);

  const [motivoId, setMotivoId] = useState<number | null>(null);
  const [destino, setDestino] = useState('');
  const [nota, setNota] = useState('');
  const [fecha, setFecha] = useState(hoyISO);
  const [hora, setHora] = useState(horaISO);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('catalogo_motivos_egreso')
          .select('id, nombre')
          .order('nombre');
        if (err) throw err;
        setMotivos(data || []);
      } catch (e: any) {
        setError('No se pudo cargar motivos: ' + e.message);
      } finally {
        setCargandoMotivos(false);
      }
    })();
  }, []);

  const calcularDiasEstancia = (): number | null => {
    if (!fechaIngreso || !fecha) return null;
    const ingreso = new Date(fechaIngreso);
    const egreso = new Date(fecha);
    const diffMs = egreso.getTime() - ingreso.getTime();
    const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return dias >= 0 ? dias : null;
  };
  const diasEstanciaPrevista = calcularDiasEstancia();

  const guardar = async () => {
    if (!motivoId) {
      setError('Selecciona un motivo de egreso (obligatorio)');
      return;
    }
    if (diasEstanciaPrevista !== null && diasEstanciaPrevista < 0) {
      setError('La fecha de egreso no puede ser anterior a la de ingreso');
      return;
    }

    const motivoNombre = motivos.find(m => m.id === motivoId)?.nombre || 'el paciente';
    const confirmacion = confirm(
      '¿Confirmas el egreso de ' + nombrePaciente + ' (Cama ' + numeroCama + ') ' +
      'por motivo "' + motivoNombre + '"?\n\n' +
      'Esta acción cambiará el estado a EGRESADO y liberará la cama.'
    );
    if (!confirmacion) return;

    setGuardando(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('pacientes')
        .update({
          estado: 'EGRESADO',
          fecha_egreso: fecha,
          hora_egreso: hora,
          motivo_egreso_id: motivoId,
          destino_egreso: destino.trim() || null,
          observaciones: nota.trim() || null,
          egresado_por: capturadoPor,
        })
        .eq('id', pacienteId);

      if (err) throw err;
      onGuardado();
    } catch (e: any) {
      setError(e.message || 'Error al guardar el egreso');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={titulo}>
          <span>🚪 EGRESO DE PACIENTE</span>
          <span style={camaBadge}>CAMA {numeroCama}</span>
        </div>

        <div style={pacienteBox}>
          <div style={pacienteNombre}>{nombrePaciente}</div>
          <div style={pacienteSub}>
            Ingreso: {fechaIngreso || '--'}
            {diasEstanciaPrevista !== null && (
              <> · Estancia prevista: <b>{diasEstanciaPrevista} día{diasEstanciaPrevista === 1 ? '' : 's'}</b></>
            )}
          </div>
        </div>

        {/* Atajo: si el paciente no se va de alta sino que cambia de cama
            (mismo o distinto subservicio), abre el modal de traslado en
            lugar de capturar un egreso manual. */}
        {onTrasladar && (
          <button
            type="button"
            onClick={() => { onClose(); onTrasladar(); }}
            style={btnTrasladar}
            disabled={guardando}
            title="No es un egreso. El paciente solo cambia de cama (mismo o distinto subservicio)."
          >
            🔀 ¿No es egreso? Trasladar / cambiar de cama
          </button>
        )}

        {error && <div style={errorBox}>⚠️ {error}</div>}

        <div style={grid}>
          <div style={{ ...campo, gridColumn: 'span 2' }}>
            <label style={label}>MOTIVO DE EGRESO *</label>
            <select
              value={motivoId ?? ''}
              onChange={e => setMotivoId(e.target.value ? parseInt(e.target.value, 10) : null)}
              style={input}
              disabled={cargandoMotivos || guardando}
            >
              <option value="">
                {cargandoMotivos ? 'Cargando motivos...' : '-- Selecciona motivo --'}
              </option>
              {motivos.map(m => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          </div>

          <div style={{ ...campo, gridColumn: 'span 2' }}>
            <label style={label}>DESTINO (opcional)</label>
            <input
              value={destino}
              onChange={e => setDestino(e.target.value.toUpperCase())}
              style={input}
              placeholder="DOMICILIO / HGZ LA PAZ / SANATORIO X / --"
              disabled={guardando}
            />
          </div>

          <div style={campo}>
            <label style={label}>FECHA EGRESO</label>
            <input
              type="date"
              value={fecha}
              min={fechaIngreso || undefined}
              onChange={e => setFecha(e.target.value)}
              style={input}
              disabled={guardando}
            />
          </div>

          <div style={campo}>
            <label style={label}>HORA EGRESO</label>
            <input
              type="time"
              value={hora}
              onChange={e => setHora(e.target.value)}
              style={input}
              disabled={guardando}
            />
          </div>

          <div style={{ ...campo, gridColumn: 'span 2' }}>
            <label style={label}>NOTA DE EGRESO (opcional)</label>
            <textarea
              value={nota}
              onChange={e => setNota(e.target.value)}
              style={{ ...input, minHeight: 60, resize: 'vertical' }}
              placeholder="Condiciones al egreso, recomendaciones, indicaciones..."
              disabled={guardando}
            />
          </div>
        </div>

        <div style={avisoLegal}>
          ℹ️ El sellado digital (firma NOM-151) se realizará en sesión dedicada futura.
          Por ahora se registra usuario y fecha/hora como trazabilidad básica.
        </div>

        <div style={botones}>
          <button onClick={onClose} style={botonCancelar} disabled={guardando}>Cancelar</button>
          <button onClick={guardar} style={botonGuardar} disabled={guardando || cargandoMotivos}>
            {guardando ? 'Guardando...' : '🚪 Registrar egreso'}
          </button>
        </div>
      </div>
    </div>
  );
};

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 };
const modal: React.CSSProperties = { background: '#fff', border: '3px solid #C39C59', borderRadius: 10, padding: 24, maxWidth: 700, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' };
const titulo: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #A32D2D', paddingBottom: 12, marginBottom: 16, fontSize: 18, fontWeight: 700, color: '#A32D2D' };
const camaBadge: React.CSSProperties = { background: '#A32D2D', color: '#fff', padding: '4px 12px', borderRadius: 6, fontSize: 14 };
const pacienteBox: React.CSSProperties = { background: '#F5F1E8', border: '1px solid #C39C59', borderRadius: 6, padding: '10px 14px', marginBottom: 14 };
const pacienteNombre: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#265C4E', marginBottom: 2 };
const pacienteSub: React.CSSProperties = { fontSize: 12, color: '#7d5b2f' };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 };
const campo: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const label: React.CSSProperties = { fontSize: 11, color: '#265C4E', fontWeight: 700, textTransform: 'uppercase' };
const input: React.CSSProperties = { padding: '8px 10px', border: '1px solid #C39C59', borderRadius: 4, fontSize: 13, color: '#265C4E', background: '#fff', fontFamily: 'inherit' };
const avisoLegal: React.CSSProperties = { fontSize: 11, color: '#7d5b2f', fontStyle: 'italic', background: '#fdfaf2', padding: '8px 10px', borderRadius: 4, marginBottom: 14, border: '1px dashed #C39C59' };
const botones: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 16, borderTop: '1px solid #e8dfc6' };
const botonCancelar: React.CSSProperties = { padding: '10px 18px', background: '#fff', border: '1px solid #888', color: '#888', borderRadius: 6, cursor: 'pointer', fontSize: 13 };
const botonGuardar: React.CSSProperties = { padding: '10px 18px', background: '#A32D2D', border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700 };
const btnTrasladar: React.CSSProperties = { width: '100%', padding: '10px 14px', background: '#fff', border: '2px solid #0E6755', color: '#0E6755', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700, marginBottom: 14, fontFamily: 'inherit' };
const errorBox: React.CSSProperties = { background: '#fdecea', color: '#A32D2D', padding: '10px 12px', borderRadius: 4, marginBottom: 12, fontSize: 13 };
