// src/pages/components/EventCardGroup.tsx
// Grupo de tarjetas-evento para un (paciente, tipo). Muestra:
//   * Header con label + contador (Realizadas/Total)
//   * Lista de EventCard (no canceladas arriba, canceladas al fondo)
//   * Selector "+ Nuevo evento" para crear nueva fila
//
// Acepta:
//   - opciones del catalogo (codigo + nombre) para el selector y para el lookup
//     de nombre dentro de cada card
//   - estadoInicial: 'Solicitada' (default) o 'Realizada'. Para campos que
//     antes eran fechas (CampoFecha), creamos directo en Realizada con NOW.

import React, { useMemo, useState } from 'react';
import { EventCard } from './EventCard';
import type { Evento, EstadoEvento, TipoEvento } from '../../hooks/useEventosApoyo';

interface OpcionCatalogo {
  codigo: string;
  nombre: string;
}

interface Props {
  pacienteId: string;
  tipo: TipoEvento;
  label: string;                          // visible al usuario ("Interconsultas", "Sondas y cateteres", ...)
  eventos: Evento[];                      // ya filtrados por (paciente, tipo)
  opciones: OpcionCatalogo[];             // catalogo del que se elige codigo
  estadoInicial?: EstadoEvento;           // default 'Solicitada'
  permitirCodigoLibre?: boolean;          // ej. para interconsulta donde el codigo es texto libre
  permitirDuplicados?: boolean;           // ej. glucemia capilar: cada toma es un evento separado
  maxEventos?: number;                    // opcional limite (default: sin limite)
  estadosCreacion?: EstadoEvento[];       // si se define, muestra dropdown de estado al crear (default: usa estadoInicial)

  // Forward a EventCard
  estadosPermitidos?: EstadoEvento[];
  etiquetasEstado?: Partial<Record<EstadoEvento, string>>;
  mostrarEstado?: boolean;
  mostrarSolicitud?: boolean;
  mostrarObservaciones?: boolean;

  onCrear: (
    paciente_id: string,
    tipo: TipoEvento,
    codigo: string,
    opts?: { estado?: EstadoEvento; observaciones?: string | null }
  ) => Promise<{ ok: boolean; error?: string }>;
  onActualizar: (id: string, cambios: Partial<Evento>) => Promise<{ ok: boolean; error?: string }>;
  onCambiarEstado: (id: string, nuevo: EstadoEvento) => Promise<{ ok: boolean; error?: string }>;
  onCancelar: (id: string) => Promise<{ ok: boolean; error?: string }>;
  disabled?: boolean;
}

export const EventCardGroup: React.FC<Props> = ({
  pacienteId, tipo, label, eventos, opciones, estadoInicial = 'Solicitada',
  permitirCodigoLibre = false, permitirDuplicados = false, maxEventos,
  estadosCreacion,
  estadosPermitidos, etiquetasEstado, mostrarEstado, mostrarSolicitud, mostrarObservaciones,
  onCrear, onActualizar, onCambiarEstado, onCancelar, disabled,
}) => {
  const [agregando, setAgregando] = useState(false);
  const [codigoNuevo, setCodigoNuevo] = useState('');
  const [estadoNuevo, setEstadoNuevo] = useState<EstadoEvento>(estadoInicial);
  const [trabajando, setTrabajando] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const labelEstadoCreacion = (s: EstadoEvento) => etiquetasEstado?.[s] ?? s;

  const nombrePorCodigo = useMemo(() => {
    const m = new Map(opciones.map(o => [o.codigo, o.nombre]));
    return (c: string) => m.get(c) || '';
  }, [opciones]);

  // 'Retirada' y 'Cancelada' son terminales: el evento ya no está activo, así
  // que no cuenta para el cupo (maxEventos) ni bloquea reinstalar el código.
  // Ej.: retiras un CVP y puedes instalar uno nuevo del mismo tipo; retiras la
  // ventilación (cupo 1) y el botón "+ Nuevo evento" vuelve a aparecer.
  const esTerminal = (e: Evento) => e.estado === 'Cancelada' || e.estado === 'Retirada';

  // Activos arriba, terminales (retirados/cancelados) al fondo. Así el área
  // activa queda limpia y se ve claro que retirar libera el cupo para una
  // vía nueva. Dentro de cada grupo, mas reciente primero.
  const ordenados = useMemo(() => {
    const activos = eventos.filter(e => !esTerminal(e));
    const terminales = eventos.filter(e => esTerminal(e));
    const byFecha = (a: Evento, b: Evento) => +new Date(b.fecha_solicitud) - +new Date(a.fecha_solicitud);
    return [...activos.sort(byFecha), ...terminales.sort(byFecha)];
  }, [eventos]); // eslint-disable-line react-hooks/exhaustive-deps

  const realizados = ordenados.filter(e => e.estado === 'Realizada').length;
  const activosCount = ordenados.filter(e => !esTerminal(e)).length;
  const lleno = maxEventos != null && activosCount >= maxEventos;

  const codigosUsados = new Set(eventos.filter(e => !esTerminal(e)).map(e => e.codigo));
  const opcionesDisponibles = permitirDuplicados ? opciones : opciones.filter(o => !codigosUsados.has(o.codigo));

  const confirmarCrear = async () => {
    const c = codigoNuevo.trim();
    if (!c) { setErrorLocal('Selecciona o escribe un código'); return; }
    if (!permitirDuplicados && codigosUsados.has(c)) {
      setErrorLocal('Ya existe un evento activo con ese código');
      return;
    }
    setErrorLocal(null);
    setTrabajando(true);
    const estado = estadosCreacion ? estadoNuevo : estadoInicial;
    const r = await onCrear(pacienteId, tipo, c, { estado });
    setTrabajando(false);
    if (!r.ok) {
      setErrorLocal(r.error || 'No se pudo crear el evento');
      return;
    }
    setCodigoNuevo('');
    setEstadoNuevo(estadoInicial);
    setAgregando(false);
  };

  return (
    <div style={contenedor}>
      <div style={cabecera}>
        <span style={labelStyle}>{label}</span>
        <span style={contador}>
          {realizados}/{activosCount}
        </span>
      </div>

      {ordenados.length > 0 && (
        <div style={cardsContainer}>
          {ordenados.map(e => (
            <EventCard
              key={e.id}
              evento={e}
              nombrePorCodigo={nombrePorCodigo}
              onCambiarEstado={onCambiarEstado}
              onActualizar={onActualizar}
              onCancelar={onCancelar}
              disabled={disabled}
              estadosPermitidos={estadosPermitidos}
              etiquetasEstado={etiquetasEstado}
              mostrarEstado={mostrarEstado}
              mostrarSolicitud={mostrarSolicitud}
              mostrarObservaciones={mostrarObservaciones}
            />
          ))}
        </div>
      )}

      {/* Bloque "+ Nuevo" */}
      {agregando ? (
        <div style={agregarFilaCol}>
          <div style={agregarFila}>
            {permitirCodigoLibre ? (
              <input
                type="text"
                value={codigoNuevo}
                onChange={e => setCodigoNuevo(e.target.value)}
                placeholder="Escribe nombre/código"
                style={inputAgregar}
                disabled={trabajando}
                autoFocus
              />
            ) : (
              <select
                value={codigoNuevo}
                onChange={e => setCodigoNuevo(e.target.value)}
                style={inputAgregar}
                disabled={trabajando}
                autoFocus
              >
                <option value="">-- elige --</option>
                {opcionesDisponibles.map(o => (
                  <option key={o.codigo} value={o.codigo}>{o.codigo} — {o.nombre}</option>
                ))}
              </select>
            )}
            <button
              onClick={confirmarCrear}
              disabled={trabajando || !codigoNuevo.trim()}
              style={btnConfirmar}
            >✓</button>
            <button
              onClick={() => { setAgregando(false); setCodigoNuevo(''); setEstadoNuevo(estadoInicial); setErrorLocal(null); }}
              disabled={trabajando}
              style={btnCancelar}
            >✕</button>
          </div>
          {estadosCreacion && (
            <select
              value={estadoNuevo}
              onChange={e => setEstadoNuevo(e.target.value as EstadoEvento)}
              style={inputAgregar}
              disabled={trabajando}
            >
              {estadosCreacion.map(s => (
                <option key={s} value={s}>{labelEstadoCreacion(s)}</option>
              ))}
            </select>
          )}
        </div>
      ) : !lleno && (
        <button
          onClick={() => setAgregando(true)}
          disabled={disabled}
          style={btnAgregar}
        >+ Nuevo evento</button>
      )}

      {lleno && (
        <div style={mensajeLleno}>Maximo {maxEventos} eventos activos</div>
      )}

      {errorLocal && (
        <div style={errorStyle}>{errorLocal}</div>
      )}
    </div>
  );
};

// ---- estilos ----
const contenedor: React.CSSProperties = {
  border: '1px solid #C39C59',
  borderRadius: 4,
  background: '#fff',
  padding: 6,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const cabecera: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  paddingBottom: 4, borderBottom: '1px dashed #ddd',
};
const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: '#265C4E', textTransform: 'uppercase', letterSpacing: 0.5,
};
const contador: React.CSSProperties = {
  fontSize: 9, color: '#888', fontWeight: 600,
};
const cardsContainer: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
};
const agregarFila: React.CSSProperties = {
  display: 'flex', gap: 4, alignItems: 'center',
};
const agregarFilaCol: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
};
const inputAgregar: React.CSSProperties = {
  flex: 1, padding: '4px 6px', border: '1px solid #C39C59', borderRadius: 3, fontSize: 11, background: '#fff',
};
const btnConfirmar: React.CSSProperties = {
  background: '#0E6755', color: '#fff', border: 'none', borderRadius: 3, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
};
const btnCancelar: React.CSSProperties = {
  background: '#A32D2D', color: '#fff', border: 'none', borderRadius: 3, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
};
const btnAgregar: React.CSSProperties = {
  background: '#fff', color: '#0E6755', border: '1px dashed #0E6755', borderRadius: 3, padding: '4px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
};
const mensajeLleno: React.CSSProperties = {
  fontSize: 10, color: '#7d5b2f', fontStyle: 'italic', textAlign: 'center', padding: '2px 0',
};
const errorStyle: React.CSSProperties = {
  fontSize: 10, color: '#A32D2D', fontWeight: 600, padding: '2px 4px',
};
