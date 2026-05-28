// src/pages/components/ModalAsignarEnfermero.tsx
// BLOQUE 8 — Modal para asignar enfermero operativo a paciente por turno
// Acceso restringido: solo perfiles con rol IN ('subjefe', 'supervisor', 'gestor')
// Benemérito Hospital General con Especialidades IMSS-Bienestar "Juan María de Salvatierra"
import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

interface Enfermero {
  id: string;
  matricula: string;
  nombre_completo: string;
  turno_principal: string | null;
  categoria_codigo: string;
  categoria_descripcion: string;
}

interface AsignacionActual {
  id: number;
  perfil_id: string;
  enfermero_nombre: string;
  categoria_codigo: string;
  notas: string | null;
  asignado_por_nombre: string;
  asignado_en: string;
}

interface Props {
  pacienteId: string;
  pacienteNombre: string;
  numeroCama: string;
  servicioId: number;
  capturadoPor: string;       // UUID del jefe/subjefe que asigna
  onClose: () => void;
  onGuardado: () => void;
}

const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

export function ModalAsignarEnfermero({
  pacienteId,
  pacienteNombre,
  numeroCama,
  servicioId,
  capturadoPor,
  onClose,
  onGuardado
}: Props) {
  // Estado
  const [enfermeros, setEnfermeros] = useState<Enfermero[]>([]);
  const [turnoActual, setTurnoActual] = useState<string>('M');
  const [turnoSeleccionado, setTurnoSeleccionado] = useState<string>('M');
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>('');
  const [enfermeroSeleccionado, setEnfermeroSeleccionado] = useState<string>('');
  const [notas, setNotas] = useState<string>('');
  const [asignacionExistente, setAsignacionExistente] = useState<AsignacionActual | null>(null);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ====== Cargar turno actual y fecha local desde la BD ======
  const cargarTurnoActual = useCallback(async () => {
    const { data, error } = await supabase.rpc('fn_turno_actual');
    if (!error && data) {
      setTurnoActual(data as string);
      setTurnoSeleccionado(data as string);
    }
    // Fecha local de BCS
    const hoy = new Date();
    const offsetMin = hoy.getTimezoneOffset();
    const tzBcs = -7 * 60; // UTC-7
    const ajuste = (offsetMin - tzBcs) * 60 * 1000;
    const fechaLocal = new Date(hoy.getTime() - ajuste);
    setFechaSeleccionada(fechaLocal.toISOString().split('T')[0]);
  }, []);

  // ====== Cargar enfermeros del servicio (categorías 5,6,7) ======
  const cargarEnfermeros = useCallback(async () => {
    const { data, error } = await supabase
      .from('perfiles')
      .select(`
        id, 
        matricula, 
        nombre_completo, 
        turno_principal,
        categoria_enfermeria_id,
        catalogo_categorias_enfermeria!inner(codigo, descripcion, orden)
      `)
      .eq('rol', 'enfermera')
      .eq('servicio_id', servicioId)
      .eq('activo', true)
      .in('categoria_enfermeria_id', [5, 6, 7])
      .order('categoria_enfermeria_id')
      .order('turno_principal')
      .order('nombre_completo');

    if (error) {
      setError('Error al cargar enfermeros: ' + error.message);
      return;
    }

    // Mapear a estructura plana
    const mapeado: Enfermero[] = (data || []).map((row: any) => ({
      id: row.id,
      matricula: row.matricula,
      nombre_completo: row.nombre_completo,
      turno_principal: row.turno_principal,
      categoria_codigo: row.catalogo_categorias_enfermeria?.codigo || '',
      categoria_descripcion: row.catalogo_categorias_enfermeria?.descripcion || ''
    }));

    setEnfermeros(mapeado);
  }, [servicioId]);

  // ====== Cargar asignación existente del paciente para el turno seleccionado ======
  const cargarAsignacionExistente = useCallback(async () => {
    if (!fechaSeleccionada) return;

    const { data, error } = await supabase
      .from('asignaciones_enfermero_turno')
      .select(`
        id,
        perfil_id,
        notas,
        asignado_en,
        perfiles!asignaciones_enfermero_turno_perfil_id_fkey(
          nombre_completo,
          categoria_enfermeria_id,
          catalogo_categorias_enfermeria(codigo)
        ),
        asignador:perfiles!asignaciones_enfermero_turno_asignado_por_fkey(
          nombre_completo
        )
      `)
      .eq('paciente_id', pacienteId)
      .eq('fecha', fechaSeleccionada)
      .eq('turno', turnoSeleccionado)
      .maybeSingle();

    if (error) {
      console.warn('Sin asignación previa:', error.message);
      setAsignacionExistente(null);
      setEnfermeroSeleccionado('');
      setNotas('');
      return;
    }

    if (data) {
      const enf: any = data.perfiles;
      const asig: any = (data as any).asignador;
      setAsignacionExistente({
        id: data.id,
        perfil_id: data.perfil_id,
        enfermero_nombre: enf?.nombre_completo || '',
        categoria_codigo: enf?.catalogo_categorias_enfermeria?.codigo || '',
        notas: data.notas,
        asignado_por_nombre: asig?.nombre_completo || '',
        asignado_en: data.asignado_en
      });
      setEnfermeroSeleccionado(data.perfil_id);
      setNotas(data.notas || '');
    } else {
      setAsignacionExistente(null);
      setEnfermeroSeleccionado('');
      setNotas('');
    }
  }, [pacienteId, fechaSeleccionada, turnoSeleccionado]);

  // ====== Cargar todo al montar y cuando cambia turno ======
  useEffect(() => {
    (async () => {
      setCargando(true);
      await cargarTurnoActual();
      await cargarEnfermeros();
      setCargando(false);
    })();
  }, [cargarTurnoActual, cargarEnfermeros]);

  useEffect(() => {
    if (fechaSeleccionada) cargarAsignacionExistente();
  }, [cargarAsignacionExistente, fechaSeleccionada]);

  // ====== Guardar asignación (UPSERT manual) ======
  const guardar = async () => {
    if (!enfermeroSeleccionado) {
      setError('Selecciona un enfermero');
      return;
    }
    setGuardando(true);
    setError(null);

    try {
      if (asignacionExistente) {
        // UPDATE
        const { error: errUpd } = await supabase
          .from('asignaciones_enfermero_turno')
          .update({
            perfil_id: enfermeroSeleccionado,
            asignado_por: capturadoPor,
            asignado_en: new Date().toISOString(),
            notas: notas || null
          })
          .eq('id', asignacionExistente.id);
        if (errUpd) throw errUpd;
      } else {
        // INSERT
        const { error: errIns } = await supabase
          .from('asignaciones_enfermero_turno')
          .insert({
            paciente_id: pacienteId,
            perfil_id: enfermeroSeleccionado,
            fecha: fechaSeleccionada,
            turno: turnoSeleccionado,
            asignado_por: capturadoPor,
            notas: notas || null
          });
        if (errIns) throw errIns;
      }
      onGuardado();
    } catch (e: any) {
      setError('Error al guardar: ' + (e.message || 'desconocido'));
    } finally {
      setGuardando(false);
    }
  };

  // ====== Eliminar asignación ======
  const eliminar = async () => {
    if (!asignacionExistente) return;
    if (!window.confirm('¿Eliminar esta asignación? La acción se registra en auditoría.')) return;
    
    setGuardando(true);
    setError(null);

    try {
      const { error: errDel } = await supabase
        .from('asignaciones_enfermero_turno')
        .delete()
        .eq('id', asignacionExistente.id);
      if (errDel) throw errDel;
      onGuardado();
    } catch (e: any) {
      setError('Error al eliminar: ' + (e.message || 'desconocido'));
    } finally {
      setGuardando(false);
    }
  };

  // ====== Agrupar enfermeros por categoría para mostrar en optgroups ======
  const ee = enfermeros.filter(e => e.categoria_codigo === 'EE');
  const eac = enfermeros.filter(e => e.categoria_codigo === 'EAC');
  const ae = enfermeros.filter(e => e.categoria_codigo === 'AE');

  // ====== Render ======
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        {/* HEADER */}
        <div style={headerModal}>
          <div>
            <h2 style={tituloModal}>👤 ASIGNAR ENFERMERO</h2>
            <div style={subtituloModal}>
              <strong>{pacienteNombre}</strong> · Cama {numeroCama}
            </div>
          </div>
          <button onClick={onClose} style={btnCerrar}>✕</button>
        </div>

        {/* BODY */}
        {cargando ? (
          <div style={mensaje}>Cargando enfermeros del servicio...</div>
        ) : (
          <div style={body}>
            {/* SELECTORES TURNO Y FECHA */}
            <div style={fila}>
              <label style={lbl}>FECHA</label>
              <input
                type="date"
                value={fechaSeleccionada}
                onChange={e => setFechaSeleccionada(e.target.value)}
                style={input}
              />
            </div>

            <div style={fila}>
              <label style={lbl}>TURNO</label>
              <div style={turnosGroup}>
                {['M','V','N'].map(t => (
                  <button
                    key={t}
                    onClick={() => setTurnoSeleccionado(t)}
                    style={{
                      ...btnTurno,
                      ...(turnoSeleccionado === t ? btnTurnoActivo : {})
                    }}
                  >
                    {t} {t === turnoActual && '· AHORA'}
                  </button>
                ))}
              </div>
            </div>

            {/* AVISO de asignación existente */}
            {asignacionExistente && (
              <div style={avisoExistente}>
                ℹ️ Ya hay una asignación para este turno:&nbsp;
                <strong>{asignacionExistente.enfermero_nombre}</strong>
                {' '}({asignacionExistente.categoria_codigo})
                <br />
                <small>
                  Asignado por: {asignacionExistente.asignado_por_nombre}
                </small>
              </div>
            )}

            {/* DROPDOWN ENFERMERO */}
            <div style={fila}>
              <label style={lbl}>ENFERMERO A CARGO</label>
              <select
                value={enfermeroSeleccionado}
                onChange={e => setEnfermeroSeleccionado(e.target.value)}
                style={input}
              >
                <option value="">— Selecciona un enfermero —</option>
                
                {ee.length > 0 && (
                  <optgroup label="🟢 ESPECIALISTAS (EE)">
                    {ee.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.nombre_completo}
                        {e.turno_principal === turnoSeleccionado ? ' ★' : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                
                {eac.length > 0 && (
                  <optgroup label="🔵 ATENCIÓN CLÍNICA (EAC)">
                    {eac.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.nombre_completo}
                        {e.turno_principal === turnoSeleccionado ? ' ★' : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                
                {ae.length > 0 && (
                  <optgroup label="🟡 AUXILIARES (AE)">
                    {ae.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.nombre_completo}
                        {e.turno_principal === turnoSeleccionado ? ' ★' : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <small style={{ color: '#888', fontSize: 10, marginTop: 4, display: 'block' }}>
                ★ = enfermero con turno principal coincidente
              </small>
            </div>

            {/* NOTAS */}
            <div style={fila}>
              <label style={lbl}>NOTAS (opcional)</label>
              <textarea
                value={notas}
                onChange={e => setNotas(e.target.value)}
                placeholder="Observaciones específicas para este cuidado..."
                style={textarea}
                rows={2}
              />
            </div>

            {/* ERROR */}
            {error && <div style={errorBox}>{error}</div>}

            {/* BOTONES */}
            <div style={botones}>
              {asignacionExistente && (
                <button
                  onClick={eliminar}
                  disabled={guardando}
                  style={btnEliminar}
                >
                  🗑 Eliminar
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button onClick={onClose} disabled={guardando} style={btnCancelar}>
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={guardando || !enfermeroSeleccionado}
                style={btnGuardar}
              >
                {guardando ? 'Guardando...' : asignacionExistente ? 'Actualizar' : 'Asignar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ ESTILOS ============
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 };
const modal: React.CSSProperties = { background: '#fff', borderRadius: 8, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', border: '2px solid #C39C59' };
const headerModal: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 18px', background: '#0E6755', color: '#fff' };
const tituloModal: React.CSSProperties = { fontSize: 16, margin: 0, fontWeight: 700 };
const subtituloModal: React.CSSProperties = { fontSize: 12, marginTop: 4, color: '#C39C59' };
const btnCerrar: React.CSSProperties = { background: 'transparent', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 };
const body: React.CSSProperties = { padding: 18 };
const fila: React.CSSProperties = { marginBottom: 14 };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#265C4E', marginBottom: 6, letterSpacing: 0.4, textTransform: 'uppercase' };
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #C39C59', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' };
const textarea: React.CSSProperties = { ...input, resize: 'vertical', minHeight: 50 };
const turnosGroup: React.CSSProperties = { display: 'flex', gap: 6 };
const btnTurno: React.CSSProperties = { flex: 1, padding: '8px', border: '1px solid #C39C59', background: '#fff', color: '#265C4E', cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit', fontSize: 12, fontWeight: 600 };
const btnTurnoActivo: React.CSSProperties = { background: '#0E6755', color: '#fff', borderColor: '#0E6755' };
const avisoExistente: React.CSSProperties = { background: '#FAF5EA', border: '1px solid #C39C59', padding: '8px 10px', borderRadius: 4, fontSize: 12, color: '#265C4E', marginBottom: 14 };
const mensaje: React.CSSProperties = { padding: 40, textAlign: 'center', color: '#265C4E' };
const errorBox: React.CSSProperties = { background: '#FCEBEB', border: '1px solid #A32D2D', color: '#A32D2D', padding: '8px 10px', borderRadius: 4, fontSize: 12, marginBottom: 12 };
const botones: React.CSSProperties = { display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' };
const btnGuardar: React.CSSProperties = { background: '#0E6755', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 };
const btnCancelar: React.CSSProperties = { background: 'transparent', color: '#265C4E', border: '1px solid #265C4E', padding: '9px 18px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 };
const btnEliminar: React.CSSProperties = { background: 'transparent', color: '#A32D2D', border: '1px solid #A32D2D', padding: '8px 12px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 };
