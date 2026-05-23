// src/hooks/useEventosApoyo.ts
// Carga y mutacion de evento_apoyo_paciente para un set de pacientes.
// La UI (VistaFormatoControl) pasa los paciente_ids del servicio activo.
//
// Diseno:
//   - eventos: Map<paciente_id, Map<tipo, Evento[]>>  (acceso O(1) por par)
//   - Mutaciones devuelven { ok, error } y aplican optimistic update;
//     si la query falla, recarga desde DB y devuelve error.
//
// No hay DELETE: el log es inmutable. "Borrar" = actualizar estado='Cancelada'.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export type TipoEvento =
  | 'interconsulta'
  | 'hemoderivado'
  | 'laboratorio'
  | 'estudio_gabinete'
  | 'sonda'
  | 'dispositivo'
  | 'procedimiento'
  | 'curacion'
  | 'acceso_vascular'
  | 'oxigeno'
  | 'higiene'
  | 'glucemia'
  | 'precaucion_aislamiento';

export type EstadoEvento =
  | 'Solicitada'
  | 'Pendiente'
  | 'Realizada'
  | 'Retirada'
  | 'Cancelada';

export interface Evento {
  id: string;
  paciente_id: string;
  tipo: TipoEvento;
  codigo: string;
  estado: EstadoEvento;
  fecha_solicitud: string;            // ISO timestamptz
  fecha_realizacion: string | null;
  fecha_retiro: string | null;
  observaciones: string | null;
  capturado_por: string;
  capturado_en: string;
  actualizado_por: string | null;
  actualizado_en: string | null;
}

// Mapa indexado: eventos[paciente_id][tipo] -> Evento[]
export type EventosIndex = Record<string, Record<string, Evento[]>>;

interface MutationResult {
  ok: boolean;
  error?: string;
}

export function useEventosApoyo(pacienteIds: string[]) {
  const { perfil } = useAuth();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Para evitar fetch duplicado en re-renders cuando pacienteIds es la misma lista pero array nueva
  const lastKeyRef = useRef<string>('');

  const idsKey = useMemo(() => [...pacienteIds].sort().join(','), [pacienteIds]);

  const cargar = useCallback(async () => {
    if (pacienteIds.length === 0) {
      setEventos([]);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('evento_apoyo_paciente')
        .select('*')
        .in('paciente_id', pacienteIds)
        .order('fecha_solicitud', { ascending: false });

      if (err) throw err;
      setEventos((data || []) as Evento[]);
    } catch (e: any) {
      setError(e.message || 'Error al cargar eventos');
    } finally {
      setCargando(false);
    }
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (lastKeyRef.current === idsKey) return;
    lastKeyRef.current = idsKey;
    cargar();
  }, [idsKey, cargar]);

  // Indice por paciente y tipo (calculado en memoria, barato)
  const indice: EventosIndex = useMemo(() => {
    const out: EventosIndex = {};
    for (const e of eventos) {
      if (!out[e.paciente_id]) out[e.paciente_id] = {};
      if (!out[e.paciente_id][e.tipo]) out[e.paciente_id][e.tipo] = [];
      out[e.paciente_id][e.tipo].push(e);
    }
    return out;
  }, [eventos]);

  // ---- MUTACIONES ----

  const crear = useCallback(async (
    paciente_id: string,
    tipo: TipoEvento,
    codigo: string,
    opts?: { estado?: EstadoEvento; observaciones?: string | null }
  ): Promise<MutationResult> => {
    if (!perfil) return { ok: false, error: 'Sin sesion activa' };
    if (!codigo || !codigo.trim()) return { ok: false, error: 'codigo vacio' };

    const estado = opts?.estado ?? 'Solicitada';
    const fila: Partial<Evento> & { capturado_por: string } = {
      paciente_id,
      tipo,
      codigo: codigo.trim(),
      estado,
      fecha_realizacion: estado === 'Realizada' ? new Date().toISOString() : null,
      observaciones: opts?.observaciones ?? null,
      capturado_por: perfil.id,
    };

    const { data, error: err } = await supabase
      .from('evento_apoyo_paciente')
      .insert(fila)
      .select()
      .single();

    if (err) {
      return { ok: false, error: err.message };
    }
    setEventos(prev => [data as Evento, ...prev]);
    return { ok: true };
  }, [perfil]);

  const actualizar = useCallback(async (
    id: string,
    cambios: Partial<Pick<Evento, 'estado' | 'fecha_realizacion' | 'fecha_retiro' | 'observaciones' | 'codigo'>>
  ): Promise<MutationResult> => {
    if (!perfil) return { ok: false, error: 'Sin sesion activa' };

    const prevSnapshot = eventos;
    setEventos(prev =>
      prev.map(e => (e.id === id ? { ...e, ...cambios, actualizado_en: new Date().toISOString() } as Evento : e))
    );

    const update = {
      ...cambios,
      actualizado_por: perfil.id,
      actualizado_en: new Date().toISOString(),
    };
    const { error: err } = await supabase
      .from('evento_apoyo_paciente')
      .update(update)
      .eq('id', id);

    if (err) {
      setEventos(prevSnapshot); // rollback
      return { ok: false, error: err.message };
    }
    return { ok: true };
  }, [perfil, eventos]);

  const cambiarEstado = useCallback((id: string, nuevoEstado: EstadoEvento): Promise<MutationResult> => {
    const cambios: Partial<Evento> = { estado: nuevoEstado };
    if (nuevoEstado === 'Realizada') {
      const ev = eventos.find(e => e.id === id);
      if (!ev?.fecha_realizacion) cambios.fecha_realizacion = new Date().toISOString();
    } else if (nuevoEstado === 'Retirada') {
      cambios.fecha_retiro = new Date().toISOString();
    } else if (nuevoEstado === 'Cancelada') {
      cambios.fecha_realizacion = null;
      cambios.fecha_retiro = null;
    }
    return actualizar(id, cambios);
  }, [actualizar, eventos]);

  const cancelar = useCallback((id: string) => cambiarEstado(id, 'Cancelada'), [cambiarEstado]);

  return {
    eventos,
    indice,
    cargando,
    error,
    recargar: cargar,
    crear,
    actualizar,
    cambiarEstado,
    cancelar,
  };
}
