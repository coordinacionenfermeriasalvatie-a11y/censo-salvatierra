// src/pages/components/EventCard.tsx
// Una tarjeta-evento: estado dropdown + 2 fechas hibridas + observaciones + cancelar.
//
// Fechas en modo hibrido:
//   * Display compacto "23-may 14:00".
//   * Click en lapiz (boton ✎) -> input datetime-local en linea para editar.
//   * Si no hay fecha_realizacion y estado != Realizada: boton "⏱️ Ahora" que
//     pone NOW() y cambia estado a Realizada.
//
// Estados con color:
//   Solicitada amber / Pendiente naranja / Realizada verde / Retirada gris / Cancelada gris tachado.

import React, { useEffect, useState } from 'react';
import type { Evento, EstadoEvento } from '../../hooks/useEventosApoyo';

interface Props {
  evento: Evento;
  nombrePorCodigo?: (codigo: string) => string;  // opcional lookup catalogo
  onCambiarEstado: (id: string, nuevo: EstadoEvento) => Promise<{ ok: boolean; error?: string }>;
  onActualizar: (id: string, cambios: Partial<Evento>) => Promise<{ ok: boolean; error?: string }>;
  onCancelar: (id: string) => Promise<{ ok: boolean; error?: string }>;
  disabled?: boolean;

  // Personalizacion por tipo (default = comportamiento clasico evento)
  estadosPermitidos?: EstadoEvento[];                            // restringe el dropdown
  etiquetasEstado?: Partial<Record<EstadoEvento, string>>;       // relabel del dropdown (ej. Realizada -> Instalado)
  mostrarEstado?: boolean;                                       // esconde el dropdown completo (siempre Realizada)
  mostrarSolicitud?: boolean;                                    // esconde linea "Sol:"
  mostrarObservaciones?: boolean;                                // esconde la linea de observaciones
}

const ESTADOS_DEFAULT: EstadoEvento[] = ['Solicitada', 'Pendiente', 'Realizada', 'Retirada', 'Cancelada'];

const ESTADO_COLOR: Record<EstadoEvento, { bg: string; fg: string; border: string }> = {
  Solicitada: { bg: '#fff7e0', fg: '#7d5b2f', border: '#C39C59' },
  Pendiente:  { bg: '#ffe8d0', fg: '#a04a1a', border: '#d97a3a' },
  Realizada:  { bg: '#dff5e6', fg: '#0E6755', border: '#0E6755' },
  Retirada:   { bg: '#eaeaea', fg: '#555',    border: '#999'    },
  Cancelada:  { bg: '#f5f5f5', fg: '#aaa',    border: '#ccc'    },
};

const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function fmtCorto(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--';
  const dd = String(d.getDate()).padStart(2, '0');
  const m = MESES_CORTOS[d.getMonth()];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dd}-${m} ${hh}:${mm}`;
}

// 'YYYY-MM-DDTHH:MM' para <input type="datetime-local">
function isoAInputLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const EventCard: React.FC<Props> = ({
  evento, nombrePorCodigo, onCambiarEstado, onActualizar, onCancelar, disabled,
  estadosPermitidos, etiquetasEstado,
  mostrarEstado = true, mostrarSolicitud = true, mostrarObservaciones = true,
}) => {
  const estadosVisibles = estadosPermitidos ?? ESTADOS_DEFAULT;
  const labelEstado = (s: EstadoEvento) => etiquetasEstado?.[s] ?? s;
  const [editSol, setEditSol] = useState(false);
  const [editReal, setEditReal] = useState(false);
  const [editObs, setEditObs] = useState(false);
  const [obsTexto, setObsTexto] = useState(evento.observaciones ?? '');
  const [trabajando, setTrabajando] = useState(false);

  // Sincronizar obsTexto con el prop cuando evento.observaciones cambia desde
  // fuera (ej. recarga de la lista). Solo sincronizamos cuando NO estamos
  // editando, para no pisar lo que el usuario esta escribiendo.
  useEffect(() => {
    if (!editObs) setObsTexto(evento.observaciones ?? '');
  }, [evento.observaciones, editObs]);

  const colores = ESTADO_COLOR[evento.estado];
  const cancelada = evento.estado === 'Cancelada';
  const nombreCodigo = nombrePorCodigo ? nombrePorCodigo(evento.codigo) : '';

  const wrap = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    if (disabled || trabajando) return;
    setTrabajando(true);
    const r = await fn();
    setTrabajando(false);
    if (!r.ok && r.error) alert('No se pudo guardar: ' + r.error);
  };

  const onPickSolicitud = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!v) return;
    wrap(() => onActualizar(evento.id, { fecha_solicitud: new Date(v).toISOString() }));
    setEditSol(false);
  };

  const onPickRealizacion = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!v) return;
    wrap(() => onActualizar(evento.id, {
      fecha_realizacion: new Date(v).toISOString(),
      estado: 'Realizada',
    }));
    setEditReal(false);
  };

  const marcarRealizadoAhora = () => {
    wrap(() => onCambiarEstado(evento.id, 'Realizada'));
  };

  const guardarObs = () => {
    if (obsTexto === (evento.observaciones ?? '')) {
      setEditObs(false);
      return;
    }
    wrap(() => onActualizar(evento.id, { observaciones: obsTexto || null }));
    setEditObs(false);
  };

  return (
    <div style={{
      border: `1px solid ${colores.border}`,
      background: colores.bg,
      borderRadius: 6,
      padding: 6,
      opacity: cancelada ? 0.55 : 1,
      textDecoration: cancelada ? 'line-through' : 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      {/* Linea 1: codigo + nombre + cancelar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          background: colores.fg,
          color: '#fff',
          padding: '1px 6px',
          borderRadius: 8,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.5,
        }}>{evento.codigo}</span>
        {nombreCodigo && (
          <span style={{ fontSize: 11, color: colores.fg, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nombreCodigo}
          </span>
        )}
        {!cancelada && (
          <button
            onClick={() => {
              if (confirm('¿Cancelar este evento?')) wrap(() => onCancelar(evento.id));
            }}
            disabled={disabled || trabajando}
            title="Cancelar evento (queda registrado)"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#A32D2D',
              cursor: 'pointer',
              fontSize: 14,
              padding: '4px 8px',
              minWidth: 32,
              minHeight: 32,
              lineHeight: 1,
            }}
          >✕</button>
        )}
      </div>

      {/* Linea 2: estado (opcional) */}
      {mostrarEstado && (
        <select
          value={evento.estado}
          onChange={e => wrap(() => onCambiarEstado(evento.id, e.target.value as EstadoEvento))}
          disabled={disabled || trabajando || cancelada}
          style={{
            padding: '3px 6px',
            border: `1px solid ${colores.border}`,
            borderRadius: 4,
            background: '#fff',
            color: colores.fg,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {estadosVisibles.map(s => <option key={s} value={s}>{labelEstado(s)}</option>)}
        </select>
      )}

      {/* Linea 3: fecha_solicitud (opcional) */}
      {mostrarSolicitud && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: colores.fg }}>
          <span style={{ minWidth: 30 }}>Sol:</span>
          {editSol ? (
            <input
              type="datetime-local"
              defaultValue={isoAInputLocal(evento.fecha_solicitud)}
              onChange={onPickSolicitud}
              onBlur={() => setEditSol(false)}
              autoFocus
              style={{ fontSize: 10, padding: '1px 3px', border: `1px solid ${colores.border}`, borderRadius: 3 }}
            />
          ) : (
            <>
              <span style={{ fontWeight: 600 }}>{fmtCorto(evento.fecha_solicitud)}</span>
              <button
                onClick={() => setEditSol(true)}
                disabled={disabled || trabajando || cancelada}
                title="Editar fecha de solicitud"
                style={{ background: 'transparent', border: 'none', color: colores.fg, cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1 }}
              >✎</button>
            </>
          )}
        </div>
      )}

      {/* Linea 4: fecha_realizacion */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: colores.fg }}>
        <span style={{ minWidth: 30 }}>Real:</span>
        {editReal ? (
          <input
            type="datetime-local"
            defaultValue={isoAInputLocal(evento.fecha_realizacion)}
            onChange={onPickRealizacion}
            onBlur={() => setEditReal(false)}
            autoFocus
            style={{ fontSize: 10, padding: '1px 3px', border: `1px solid ${colores.border}`, borderRadius: 3 }}
          />
        ) : evento.fecha_realizacion ? (
          <>
            <span style={{ fontWeight: 600 }}>{fmtCorto(evento.fecha_realizacion)}</span>
            <button
              onClick={() => setEditReal(true)}
              disabled={disabled || trabajando || cancelada}
              title="Editar fecha de realizacion"
              style={{ background: 'transparent', border: 'none', color: colores.fg, cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1 }}
            >✎</button>
          </>
        ) : (
          <button
            onClick={marcarRealizadoAhora}
            disabled={disabled || trabajando || cancelada}
            title="Marcar realizado con fecha y hora actual"
            style={{
              background: '#0E6755',
              border: 'none',
              color: '#fff',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >⏱️ Ahora</button>
        )}
      </div>

      {/* Linea 5: observaciones (opcional)
          Si la obs empieza con 'Migrado' la consideramos meta-info y la
          mostramos como icono pequeño con tooltip, en lugar de texto. */}
      {mostrarObservaciones && (() => {
        const obs = evento.observaciones ?? '';
        const esMigrada = obs.startsWith('Migrado');
        if (editObs) {
          return (
            <input
              type="text"
              value={obsTexto}
              onChange={e => setObsTexto(e.target.value)}
              onBlur={guardarObs}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              autoFocus
              placeholder="Observacion..."
              style={{
                fontSize: 10,
                padding: '2px 4px',
                border: `1px solid ${colores.border}`,
                borderRadius: 3,
                background: '#fff',
                color: colores.fg,
              }}
            />
          );
        }
        if (esMigrada) {
          // Para aislamiento extraemos solo el label real (despues del ": ")
          const labelExtraido = (obs.match(/:\s*(.+)$/)?.[1] || '').trim();
          if (labelExtraido) {
            return (
              <div
                onClick={() => !cancelada && setEditObs(true)}
                title={`Datos migrados. Click para editar. Original: ${obs}`}
                style={{ fontSize: 10, color: colores.fg, fontStyle: 'italic', cursor: cancelada ? 'default' : 'text', padding: '0 2px' }}
              >
                {labelExtraido}
              </div>
            );
          }
          // Sin label extraible: solo icono pequenio
          return (
            <span
              title={obs}
              onClick={() => !cancelada && setEditObs(true)}
              style={{ fontSize: 10, color: colores.fg, opacity: 0.4, cursor: cancelada ? 'default' : 'pointer', alignSelf: 'flex-start' }}
            >ⓘ migrado</span>
          );
        }
        if (obs) {
          return (
            <div
              onClick={() => !cancelada && setEditObs(true)}
              title="Click para editar"
              style={{ fontSize: 10, color: colores.fg, fontStyle: 'italic', cursor: cancelada ? 'default' : 'text', padding: '0 2px' }}
            >
              {obs}
            </div>
          );
        }
        if (!cancelada) {
          return (
            <button
              onClick={() => setEditObs(true)}
              disabled={disabled || trabajando}
              style={{ background: 'transparent', border: 'none', color: colores.fg, fontSize: 9, padding: 0, cursor: 'pointer', textAlign: 'left', fontStyle: 'italic', opacity: 0.7 }}
            >+ obs</button>
          );
        }
        return null;
      })()}
    </div>
  );
};
