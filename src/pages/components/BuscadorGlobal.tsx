// src/pages/components/BuscadorGlobal.tsx
// Buscador global del tablero (visible para todos los roles). Busca:
//   - Servicios por nombre (filtrado en cliente sobre los visibles).
//   - Pacientes activos por nombre (query a v_camas_estado; RLS limita el
//     alcance por rol, igual que el resto del tablero).
// Al elegir un resultado navega al servicio correspondiente.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

interface ServicioRef {
  id: number;
  nombre: string;
  codigo: string;
}

interface PacienteHit {
  paciente_id: string;
  nombre_paciente: string;
  servicio_id: number;
  servicio: string;
  subservicio: string | null;
  numero_cama: string | null;
}

interface Props {
  servicios: ServicioRef[];
  onClose: () => void;
}

// Limpia el término para no romper la sintaxis de filtro de PostgREST.
const limpiar = (s: string) => s.replace(/[%,()*]/g, ' ').replace(/\s+/g, ' ').trim();

export const BuscadorGlobal: React.FC<Props> = ({ servicios, onClose }) => {
  const navigate = useNavigate();
  const [termino, setTermino] = useState('');
  const [pacientes, setPacientes] = useState<PacienteHit[]>([]);
  const [buscando, setBuscando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const serviciosIds = useMemo(() => new Set(servicios.map(s => s.id)), [servicios]);

  // Servicios que coinciden (cliente).
  const serviciosHit = useMemo(() => {
    const q = limpiar(termino).toLowerCase();
    if (q.length < 2) return [];
    return servicios
      .filter(s => s.nombre.toLowerCase().includes(q) || s.codigo.toLowerCase().includes(q))
      .slice(0, 8);
  }, [termino, servicios]);

  // Pacientes activos que coinciden (servidor, debounced).
  useEffect(() => {
    const q = limpiar(termino);
    if (q.length < 2) { setPacientes([]); setBuscando(false); return; }
    setBuscando(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from('v_camas_estado')
        .select('paciente_id, nombre_paciente, servicio_id, servicio, subservicio, numero_cama')
        .not('paciente_id', 'is', null)
        .ilike('nombre_paciente', `%${q}%`)
        .limit(40);
      if (!error && data) {
        const hits = (data as PacienteHit[]).filter(p => serviciosIds.has(p.servicio_id));
        setPacientes(hits);
      }
      setBuscando(false);
    }, 300);
    return () => clearTimeout(t);
  }, [termino, serviciosIds]);

  const irAServicio = (servicioId: number) => {
    navigate(`/servicio/${servicioId}`);
    onClose();
  };

  const q = limpiar(termino);
  const sinResultados = q.length >= 2 && !buscando && serviciosHit.length === 0 && pacientes.length === 0;

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={cabecera}>
          <input
            ref={inputRef}
            value={termino}
            onChange={e => setTermino(e.target.value)}
            placeholder="Buscar paciente o servicio..."
            style={input}
          />
          <button onClick={onClose} style={botonCerrar} aria-label="Cerrar">✕</button>
        </div>

        <div style={resultados}>
          {q.length < 2 && (
            <div style={ayuda}>Escribe al menos 2 letras del nombre del paciente o del servicio.</div>
          )}

          {serviciosHit.length > 0 && (
            <>
              <div style={seccion}>Servicios</div>
              {serviciosHit.map(s => (
                <button key={`srv-${s.id}`} style={fila} onClick={() => irAServicio(s.id)}>
                  <span style={filaIcono}>🏥</span>
                  <span style={filaNombre}>{s.nombre}</span>
                  <span style={filaMeta}>{s.codigo}</span>
                </button>
              ))}
            </>
          )}

          {(buscando || pacientes.length > 0) && (
            <div style={seccion}>Pacientes {buscando && <span style={cargandoTxt}>buscando…</span>}</div>
          )}
          {pacientes.map(p => (
            <button key={`pac-${p.paciente_id}`} style={fila} onClick={() => irAServicio(p.servicio_id)}>
              <span style={filaIcono}>🛏️</span>
              <span style={filaNombre}>{p.nombre_paciente}</span>
              <span style={filaMeta}>
                {p.servicio}{p.numero_cama ? ` · cama ${p.numero_cama}` : ''}
              </span>
            </button>
          ))}

          {sinResultados && (
            <div style={ayuda}>Sin coincidencias para “{q}”.</div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---- estilos ----
const backdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(38,92,78,0.35)', zIndex: 1000,
  display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '12vh 16px 16px',
};
const modal: React.CSSProperties = {
  width: 520, maxWidth: '100%', background: '#fdfaf2', border: '2px solid #C39C59',
  borderRadius: 10, boxShadow: '0 16px 50px rgba(0,0,0,0.3)', display: 'flex',
  flexDirection: 'column', maxHeight: '70vh', overflow: 'hidden',
};
const cabecera: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderBottom: '1px solid #C39C59',
};
const input: React.CSSProperties = {
  flex: 1, border: '1px solid #C39C59', borderRadius: 6, padding: '10px 12px',
  fontSize: 15, fontFamily: 'inherit', background: '#fff', color: '#265C4E',
};
const botonCerrar: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#265C4E', cursor: 'pointer', fontSize: 18,
};
const resultados: React.CSSProperties = { overflowY: 'auto', padding: 8 };
const ayuda: React.CSSProperties = { padding: 24, textAlign: 'center', color: '#888', fontSize: 13 };
const seccion: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#265C4E', textTransform: 'uppercase',
  letterSpacing: 0.5, padding: '8px 8px 4px',
};
const cargandoTxt: React.CSSProperties = { fontWeight: 400, color: '#888', textTransform: 'none', letterSpacing: 0 };
const fila: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
  background: '#fff', border: '1px solid #e7dcc2', borderRadius: 6, padding: '8px 10px',
  marginBottom: 4, cursor: 'pointer', fontFamily: 'inherit',
};
const filaIcono: React.CSSProperties = { fontSize: 16, flex: '0 0 auto' };
const filaNombre: React.CSSProperties = { flex: 1, fontSize: 13, color: '#0E6755', fontWeight: 600 };
const filaMeta: React.CSSProperties = { fontSize: 11, color: '#888780', flex: '0 0 auto' };
