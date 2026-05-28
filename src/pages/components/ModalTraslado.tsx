// src/pages/components/ModalTraslado.tsx
// Modal para trasladar paciente a otra cama del hospital.
//
// 2 escenarios manejados por la función fn_trasladar_paciente en BD:
//
//   A) Cama destino en OTRO subservicio → egreso del subservicio
//      origen con motivo TRASLADO (cuenta C04 +1) + ingreso al
//      subservicio destino (cuenta C02 +1). Los datos del paciente
//      se copian automáticamente (nombre, dx, especialidad, grupo,
//      alergias, riesgos UPP/caídas).
//
//   B) Cama destino en el MISMO subservicio → solo cambia cama_id.
//      NO cuenta como egreso/ingreso (sería doble conteo).
//
// La función es SECURITY DEFINER en BD así que puede mover pacientes
// a servicios donde el usuario normalmente no tendría permisos de
// INSERT — el flujo de traslado interno trasciende la RLS habitual.
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface CamaDisponible {
  cama_id: number;
  servicio: string;
  servicio_id: number;
  servicio_codigo: string;
  subservicio: string;
  subservicio_id: number;
  numero_cama: string;
}

interface Props {
  pacienteId: string;
  nombrePaciente: string;
  edad: number | null;
  edadUnidad?: string | null;
  genero: string | null;
  camaActualId: number;
  numeroCamaActual: string;
  subservicioActualId: number;
  servicioActual: string;
  perfilId: string;
  onClose: () => void;
  onGuardado: () => void;
}

export const ModalTraslado: React.FC<Props> = ({
  pacienteId, nombrePaciente, edad, edadUnidad, genero,
  camaActualId, numeroCamaActual,
  subservicioActualId, servicioActual,
  perfilId, onClose, onGuardado,
}) => {
  const [camasDisponibles, setCamasDisponibles] = useState<CamaDisponible[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [camaSeleccionada, setCamaSeleccionada] = useState<CamaDisponible | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      // Camas disponibles en TODO el hospital, excluyendo la actual y
      // excluyendo las que tienen paciente activo o están bloqueadas.
      const { data, error } = await supabase
        .from('v_camas_estado')
        .select('cama_id, servicio, servicio_id, servicio_codigo, subservicio, subservicio_id, numero_cama, paciente_id, cama_bloqueada, es_censable')
        .order('servicio')
        .order('subservicio')
        .order('numero_cama_sort');
      if (error) {
        setError(error.message);
        setCargando(false);
        return;
      }
      const libres = (data || [])
        .filter((c: any) => c.cama_id !== camaActualId && !c.paciente_id && !c.cama_bloqueada)
        .map((c: any) => ({
          cama_id: c.cama_id,
          servicio: c.servicio,
          servicio_id: c.servicio_id,
          servicio_codigo: c.servicio_codigo || '',
          subservicio: c.subservicio,
          subservicio_id: c.subservicio_id,
          numero_cama: c.numero_cama,
        }));
      setCamasDisponibles(libres);
      setCargando(false);
    })();
  }, [camaActualId]);

  // Agrupar por servicio → subservicio
  const camasFiltradas = useMemo(() => {
    const term = filtroTexto.trim().toLowerCase();
    if (!term) return camasDisponibles;
    return camasDisponibles.filter(c =>
      c.servicio.toLowerCase().includes(term) ||
      c.subservicio.toLowerCase().includes(term) ||
      c.numero_cama.toLowerCase().includes(term)
    );
  }, [camasDisponibles, filtroTexto]);

  const grupos = useMemo(() => {
    const map = new Map<string, CamaDisponible[]>();
    for (const c of camasFiltradas) {
      const key = `${c.servicio} · ${c.subservicio}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries());
  }, [camasFiltradas]);

  // ── Restricciones clínicas de traslado (edad / sexo) ───────────────
  // • Adulto → cama de Pediatría: NO permitido.
  // • Pediátrico → cama de adultos: NO permitido (solo Pediatría).
  // • Hombre → cama de Tococirugía: NO permitido.
  // Pediatría = códigos que contienen "PED" (PED, ONC-PED, UPED).
  // Tococirugía = código TOC.
  const esPediatrico = useMemo(() => {
    const u = (edadUnidad || '').toUpperCase();
    if (u === 'DIAS' || u === 'MESES') return true;            // neonatos/lactantes
    if (edad != null && (u === 'AÑOS' || u === '')) return edad < 18;
    return false;
  }, [edad, edadUnidad]);

  const esAdulto = useMemo(() => {
    const u = (edadUnidad || '').toUpperCase();
    if (u === 'DIAS' || u === 'MESES') return false;
    if (edad != null && (u === 'AÑOS' || u === '')) return edad >= 18;
    return false;
  }, [edad, edadUnidad]);

  const esHombre = useMemo(() => {
    const g = (genero || '').toUpperCase().trim();
    return g === 'MASCULINO' || g === 'M' || g === 'H' || g === 'HOMBRE';
  }, [genero]);

  // Devuelve el motivo por el que una cama destino NO es válida, o null.
  const bloqueoDe = (c: CamaDisponible): string | null => {
    const cod = (c.servicio_codigo || '').toUpperCase();
    const destinoPediatrico = cod.includes('PED');
    const destinoToco = cod === 'TOC' || cod.startsWith('TOC');
    if (esHombre && destinoToco) return 'Tococirugía: solo pacientes femeninas';
    if (esPediatrico && !destinoPediatrico) return 'Paciente pediátrico: solo camas de Pediatría';
    if (esAdulto && destinoPediatrico) return 'Cama de Pediatría: solo pacientes menores de edad';
    return null;
  };

  const hayRestricciones = esPediatrico || esAdulto || esHombre;

  const esCambioCama = !!camaSeleccionada && camaSeleccionada.subservicio_id === subservicioActualId;

  const trasladar = async () => {
    if (!camaSeleccionada) return;
    setGuardando(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.rpc('fn_trasladar_paciente', {
        _paciente_id_actual: pacienteId,
        _cama_destino_id: camaSeleccionada.cama_id,
        _capturado_por: perfilId,
      });
      if (e) throw e;
      console.log('Traslado:', data);
      onGuardado();
    } catch (e: any) {
      setError(e.message || 'Error al trasladar el paciente');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={titulo}>
          <span>🔀 TRASLADAR PACIENTE</span>
          <span style={camaBadge}>{nombrePaciente}</span>
        </div>

        <div style={origenInfo}>
          Cama actual: <strong>{servicioActual} · CAMA {numeroCamaActual}</strong>
        </div>

        {error && <div style={errorBox}>⚠️ {error}</div>}

        {hayRestricciones && (
          <div style={infoRestriccion}>
            {esPediatrico && <div>👶 Paciente pediátrico — solo puede trasladarse a camas de Pediatría.</div>}
            {esAdulto && <div>🧑 Paciente adulto — no puede ocupar camas de Pediatría.</div>}
            {esHombre && <div>♂ Paciente masculino — no puede ocupar camas de Tococirugía.</div>}
          </div>
        )}

        <input
          type="text"
          placeholder="🔎 Filtrar por servicio, subservicio o número de cama"
          value={filtroTexto}
          onChange={e => setFiltroTexto(e.target.value)}
          style={inputFiltro}
          autoFocus
        />

        <div style={lista}>
          {cargando ? (
            <div style={vacio}>Cargando camas disponibles...</div>
          ) : grupos.length === 0 ? (
            <div style={vacio}>No hay camas disponibles que coincidan.</div>
          ) : (
            grupos.map(([grupo, camas]) => {
              // Las camas de un grupo comparten servicio → mismo motivo de bloqueo.
              const motivoGrupo = camas.length > 0 ? bloqueoDe(camas[0]) : null;
              return (
                <div key={grupo} style={grupoBox}>
                  <div style={grupoLabel}>
                    {grupo}
                    {motivoGrupo && <span style={grupoBloqueoTag}> · 🚫 {motivoGrupo}</span>}
                  </div>
                  <div style={camasGrid}>
                    {camas.map(c => {
                      const sel = camaSeleccionada?.cama_id === c.cama_id;
                      const motivo = bloqueoDe(c);
                      if (motivo) {
                        return (
                          <button key={c.cama_id} disabled title={motivo} style={camaBtnBloqueado}>
                            {c.numero_cama}
                          </button>
                        );
                      }
                      return (
                        <button
                          key={c.cama_id}
                          onClick={() => setCamaSeleccionada(c)}
                          style={sel ? camaBtnActivo : camaBtn}
                        >
                          {c.numero_cama}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {camaSeleccionada && (
          <div style={previewBox}>
            <div style={previewTitulo}>Destino seleccionado:</div>
            <div style={previewLinea}>
              {camaSeleccionada.servicio} · {camaSeleccionada.subservicio} · CAMA {camaSeleccionada.numero_cama}
            </div>
            <div style={esCambioCama ? avisoOk : avisoMover}>
              {esCambioCama
                ? '✓ Cambio de cama en mismo subservicio (no cuenta como egreso/ingreso)'
                : '🔀 Traslado entre subservicios — cuenta como egreso del origen + ingreso al destino. Datos del paciente se copian.'}
            </div>
          </div>
        )}

        <div style={botones}>
          <button onClick={onClose} style={btnCancelar} disabled={guardando}>Cancelar</button>
          <button onClick={trasladar} style={btnPrincipal} disabled={!camaSeleccionada || guardando}>
            {guardando ? 'Trasladando...' : (esCambioCama ? '✓ Cambiar de cama' : '🔀 Trasladar')}
          </button>
        </div>
      </div>
    </div>
  );
};

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 };
const modal: React.CSSProperties = { background: '#fff', border: '3px solid #C39C59', borderRadius: 10, padding: 22, maxWidth: 720, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column' };
const titulo: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0E6755', paddingBottom: 10, marginBottom: 12, fontSize: 16, fontWeight: 700, color: '#0E6755', gap: 12 };
const camaBadge: React.CSSProperties = { background: '#0E6755', color: '#fff', padding: '4px 12px', borderRadius: 6, fontSize: 12, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const origenInfo: React.CSSProperties = { fontSize: 12, color: '#7d5b2f', marginBottom: 10, padding: '6px 10px', background: '#FAF5EA', borderRadius: 4, border: '1px solid #C39C59' };
const inputFiltro: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #C39C59', borderRadius: 4, fontSize: 13, marginBottom: 10, fontFamily: 'inherit', boxSizing: 'border-box' };
const lista: React.CSSProperties = { flex: 1, overflowY: 'auto', maxHeight: 320, border: '1px solid #e8dfc6', borderRadius: 6, padding: 8, background: '#fdfaf2' };
const grupoBox: React.CSSProperties = { marginBottom: 10 };
const grupoLabel: React.CSSProperties = { fontSize: 11, color: '#265C4E', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.3 };
const camasGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: 4 };
const camaBtn: React.CSSProperties = { padding: '8px 6px', border: '1px solid #C39C59', background: '#fff', color: '#265C4E', borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' };
const camaBtnActivo: React.CSSProperties = { ...camaBtn, background: '#0E6755', color: '#fff', borderColor: '#0E6755', boxShadow: '0 0 0 2px rgba(14,103,85,0.3)' };
const camaBtnBloqueado: React.CSSProperties = { ...camaBtn, background: '#f1f1f1', color: '#bbb', borderColor: '#e0e0e0', cursor: 'not-allowed', textDecoration: 'line-through' };
const infoRestriccion: React.CSSProperties = { fontSize: 11.5, color: '#7d5b2f', background: '#fff7e0', border: '1px solid #e8d18a', borderRadius: 4, padding: '7px 10px', marginBottom: 10, lineHeight: 1.5, fontWeight: 600 };
const grupoBloqueoTag: React.CSSProperties = { color: '#A32D2D', fontWeight: 700, textTransform: 'none' };
const vacio: React.CSSProperties = { padding: 24, textAlign: 'center', color: '#888', fontStyle: 'italic', fontSize: 13 };
const previewBox: React.CSSProperties = { marginTop: 12, padding: 10, background: '#F5F1E8', border: '1px solid #C39C59', borderRadius: 4 };
const previewTitulo: React.CSSProperties = { fontSize: 10, color: '#7d5b2f', fontWeight: 700, letterSpacing: 0.3, marginBottom: 2 };
const previewLinea: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#0E6755', marginBottom: 6 };
const avisoOk: React.CSSProperties = { fontSize: 11, color: '#0E6755', fontWeight: 600, padding: '4px 8px', background: '#e0f0e9', borderRadius: 4 };
const avisoMover: React.CSSProperties = { fontSize: 11, color: '#7d5b2f', fontWeight: 600, padding: '4px 8px', background: '#fff7e0', borderRadius: 4 };
const botones: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 };
const btnCancelar: React.CSSProperties = { padding: '10px 18px', background: '#fff', border: '1px solid #888', color: '#888', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' };
const btnPrincipal: React.CSSProperties = { padding: '10px 22px', background: '#0E6755', border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' };
const errorBox: React.CSSProperties = { background: '#fdecea', color: '#A32D2D', padding: '10px 12px', borderRadius: 4, marginBottom: 12, fontSize: 13 };
