// src/pages/components/VistaRecetario.tsx
// v3.2: Recetario de medicamentos por paciente.
// Vista doble: lista resumida arriba + paciente expandido abajo con N filas de medicamentos.
// Cambios v3.2:
//   - Quitada columna PEND. de ambas tablas (a peticion del usuario)
// Cambios v3.1:
//   - FRECUENCIA: dropdown con valores estandar (CADA 1/2/4/6/8/12/24/48/72 HRS)
// Cada medicamento es una fila en la tabla recetario_medicamentos.
// Permite agregar, editar inline y borrar (con confirmacion).
import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

interface RecetarioRow {
  paciente_id: string;
  servicio_id: number;
  servicio_codigo: string;
  subservicio: string;
  numero_cama: string;
  nombre_paciente: string;
  edad: number;
  genero: string;
  nss_curp: string | null;
  diagnostico_ingreso: string;
  paciente_estado: string;
  medicamento_id: string | null;
  orden: number | null;
  medicamento: string | null;
  dosis: string | null;
  via: string | null;
  frecuencia: string | null;
  solicitada: number | null;
  dispensada: number | null;
  creado_en: string | null;
  actualizado_en: string | null;
}

interface PacienteAgrupado {
  paciente_id: string;
  subservicio: string;
  numero_cama: string;
  nombre_paciente: string;
  edad: number;
  genero: string;
  nss_curp: string | null;
  diagnostico_ingreso: string;
  medicamentos: MedicamentoFila[];
}

interface MedicamentoFila {
  id: string;
  orden: number;
  medicamento: string;
  dosis: string;
  via: string;
  frecuencia: string;
  solicitada: number;
  dispensada: number;
}

interface Props {
  servicioId: number;
}

const VIAS_COMUNES = ['IV', 'IM', 'SC', 'VO', 'SL', 'INH', 'TOP', 'OFT', 'OTICO', 'RECTAL'];
const CANTIDADES_RECETARIO = [0, 1, 2, 3, 4, 5];
const FRECUENCIAS_COMUNES = [
  'CADA 1 HR',
  'CADA 2 HRS',
  'CADA 4 HRS',
  'CADA 6 HRS',
  'CADA 8 HRS',
  'CADA 12 HRS',
  'CADA 24 HRS',
  'CADA 48 HRS',
  'CADA 72 HRS',
];

export const VistaRecetario: React.FC<Props> = ({ servicioId }) => {
  const { perfil } = useAuth();

  const [pacientes, setPacientes] = useState<PacienteAgrupado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pacienteExpandido, setPacienteExpandido] = useState<string | null>(null);
  // Catálogo de medicamentos (593 items) para autocompletar el input
  const [medicamentosCatalogo, setMedicamentosCatalogo] = useState<string[]>([]);

  const agruparRows = (rows: RecetarioRow[]): PacienteAgrupado[] => {
    const mapa = new Map<string, PacienteAgrupado>();
    for (const r of rows) {
      if (!mapa.has(r.paciente_id)) {
        mapa.set(r.paciente_id, {
          paciente_id: r.paciente_id,
          subservicio: r.subservicio,
          numero_cama: r.numero_cama,
          nombre_paciente: r.nombre_paciente,
          edad: r.edad,
          genero: r.genero,
          nss_curp: r.nss_curp,
          diagnostico_ingreso: r.diagnostico_ingreso,
          medicamentos: [],
        });
      }
      if (r.medicamento_id) {
        mapa.get(r.paciente_id)!.medicamentos.push({
          id: r.medicamento_id,
          orden: r.orden || 1,
          medicamento: r.medicamento || '',
          dosis: r.dosis || '',
          via: r.via || '',
          frecuencia: r.frecuencia || '',
          solicitada: r.solicitada || 0,
          dispensada: r.dispensada || 0,
        });
      }
    }
    for (const p of mapa.values()) {
      p.medicamentos.sort((a, b) => a.orden - b.orden);
    }
    return Array.from(mapa.values()).sort((a, b) => {
      if (a.subservicio !== b.subservicio) return a.subservicio.localeCompare(b.subservicio);
      return (a.numero_cama || '').localeCompare(b.numero_cama || '', undefined, { numeric: true });
    });
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      // PERF — paralelo: datos del recetario + catálogo de medicamentos
      const [recRes, catRes] = await Promise.all([
        supabase
          .from('v_recetario_servicio')
          .select('*')
          .eq('servicio_id', servicioId),
        supabase
          .from('catalogo_medicamentos')
          .select('nombre')
          .eq('activo', true)
          .order('nombre'),
      ]);

      if (recRes.error) throw recRes.error;
      if (catRes.error) {
        console.warn('No se pudo cargar catálogo de medicamentos:', catRes.error.message);
      } else {
        setMedicamentosCatalogo((catRes.data || []).map((r: any) => r.nombre));
      }
      const agrupados = agruparRows((recRes.data || []) as RecetarioRow[]);
      setPacientes(agrupados);

      if (agrupados.length > 0 && !pacienteExpandido) {
        setPacienteExpandido(agrupados[0].paciente_id);
      }
    } catch (e: any) {
      setError(e.message || 'Error al cargar recetario');
    } finally {
      setCargando(false);
    }
  }, [servicioId, pacienteExpandido]);

  useEffect(() => { cargar(); }, [cargar]);

  const agregarMedicamento = async (pacienteId: string) => {
    setGuardando(pacienteId);
    setError(null);
    try {
      const paciente = pacientes.find(p => p.paciente_id === pacienteId);
      const nuevoOrden = paciente ? (paciente.medicamentos.length + 1) : 1;

      const { data, error: err } = await supabase
        .from('recetario_medicamentos')
        .insert({
          paciente_id: pacienteId,
          orden: nuevoOrden,
          medicamento: '',
          dosis: '',
          via: '',
          frecuencia: '',
          solicitada: 0,
          dispensada: 0,
          capturado_por: perfil?.id,
          actualizado_por: perfil?.id,
        })
        .select()
        .single();

      if (err) throw err;

      setPacientes(ps => ps.map(p =>
        p.paciente_id === pacienteId
          ? {
              ...p,
              medicamentos: [...p.medicamentos, {
                id: data.id,
                orden: data.orden,
                medicamento: data.medicamento || '',
                dosis: data.dosis || '',
                via: data.via || '',
                frecuencia: data.frecuencia || '',
                solicitada: data.solicitada || 0,
                dispensada: data.dispensada || 0,
              }],
            }
          : p
      ));
    } catch (e: any) {
      setError(`No se pudo agregar medicamento: ${e.message}`);
    } finally {
      setGuardando(null);
    }
  };

  const actualizarMedicamento = async (
    pacienteId: string,
    medicamentoId: string,
    campo: keyof MedicamentoFila,
    valor: string | number
  ) => {
    setGuardando(medicamentoId);
    setError(null);
    try {
      const update: any = { [campo]: valor, actualizado_por: perfil?.id };
      const { error: err } = await supabase
        .from('recetario_medicamentos')
        .update(update)
        .eq('id', medicamentoId);

      if (err) throw err;

      setPacientes(ps => ps.map(p =>
        p.paciente_id === pacienteId
          ? {
              ...p,
              medicamentos: p.medicamentos.map(m =>
                m.id === medicamentoId ? { ...m, [campo]: valor } : m
              ),
            }
          : p
      ));
    } catch (e: any) {
      setError(`No se pudo guardar: ${e.message}`);
    } finally {
      setGuardando(null);
    }
  };

  const borrarMedicamento = async (pacienteId: string, medicamentoId: string, medicamentoNombre: string) => {
    const confirmacion = confirm(
      `¿Borrar este medicamento?\n\n"${medicamentoNombre || '(sin nombre)'}"\n\nEsta acción no se puede deshacer.`
    );
    if (!confirmacion) return;

    setGuardando(medicamentoId);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('recetario_medicamentos')
        .delete()
        .eq('id', medicamentoId);

      if (err) throw err;

      setPacientes(ps => ps.map(p =>
        p.paciente_id === pacienteId
          ? { ...p, medicamentos: p.medicamentos.filter(m => m.id !== medicamentoId) }
          : p
      ));
    } catch (e: any) {
      setError(`No se pudo borrar: ${e.message}`);
    } finally {
      setGuardando(null);
    }
  };

  if (cargando) return <div style={{ padding: 40, textAlign: 'center', color: '#265C4E' }}>Cargando recetario...</div>;

  const FilaMedicamento: React.FC<{ pacienteId: string; med: MedicamentoFila; numero: number }> = ({ pacienteId, med, numero }) => (
    <tr style={numero % 2 === 0 ? rowImpar : rowPar}>
      <td style={tdNumero}>{numero}</td>
      <td style={tdEditableSm}>
        <input
          type="search"
          list="catalogo-medicamentos"
          defaultValue={med.medicamento}
          onBlur={e => { if (e.target.value !== med.medicamento) actualizarMedicamento(pacienteId, med.id, 'medicamento', e.target.value); }}
          style={inputMed}
          placeholder="Escribe para buscar..."
          disabled={guardando === med.id}
          aria-label="Medicamento (escribe para buscar, ❌ para borrar)"
        />
      </td>
      <td style={tdEditableSm}>
        <select
          value={med.via}
          onChange={e => actualizarMedicamento(pacienteId, med.id, 'via', e.target.value)}
          style={inputSm}
          disabled={guardando === med.id}
        >
          <option value="">--</option>
          {VIAS_COMUNES.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </td>
      <td style={tdEditableSm}>
        <select
          value={med.frecuencia}
          onChange={e => actualizarMedicamento(pacienteId, med.id, 'frecuencia', e.target.value)}
          style={inputSm}
          disabled={guardando === med.id}
        >
          <option value="">--</option>
          {FRECUENCIAS_COMUNES.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </td>
      <td style={tdEditableSm}>
        <select
          value={med.solicitada}
          onChange={e => actualizarMedicamento(pacienteId, med.id, 'solicitada', parseInt(e.target.value))}
          style={{ ...inputSm, textAlign: 'center' }}
          disabled={guardando === med.id}
        >
          {CANTIDADES_RECETARIO.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </td>
      <td style={tdEditableSm}>
        <select
          value={med.dispensada}
          onChange={e => actualizarMedicamento(pacienteId, med.id, 'dispensada', parseInt(e.target.value))}
          style={{ ...inputSm, textAlign: 'center' }}
          disabled={guardando === med.id}
        >
          {CANTIDADES_RECETARIO.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </td>
      <td style={tdEditableSm}>
        <button
          onClick={() => borrarMedicamento(pacienteId, med.id, med.medicamento)}
          style={btnBorrar}
          disabled={guardando === med.id}
          title="Borrar medicamento"
        >✕</button>
      </td>
    </tr>
  );

  return (
    <div>
      {/* Datalist global del catálogo de medicamentos — autocompletado en cada fila */}
      <datalist id="catalogo-medicamentos">
        {medicamentosCatalogo.map(nombre => <option key={nombre} value={nombre} />)}
      </datalist>
<div style={{ ...cabeceraBanda, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ flex: 1, textAlign: 'center' }}>
          RECETARIO COLECTIVO — MEDICAMENTOS POR PACIENTE
        </span>
        <button
          onClick={() => window.open(`/imprimir/recetario/${servicioId}?auto=0`, '_blank', 'noopener,noreferrer')}
          title="Abrir vista de impresión del recetario completo (Oficio horizontal)"
          style={{ background: '#fff', color: '#0E6755', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          🖨️ Imprimir Recetario
        </button>
      </div>      {error && <div style={errorBanner}>⚠️ {error}</div>}

      {pacientes.length === 0 ? (
        <div style={vacio}>No hay pacientes activos en este servicio.</div>
      ) : (
        <>
          <div style={tablaContenedor}>
            <table style={tabla}>
              <thead>
                <tr style={headerRow}>
                  <th style={{ ...th, width: '8%' }}>SUBSERV.</th>
                  <th style={{ ...th, width: '6%' }}>CAMA</th>
                  <th style={{ ...th, width: '28%' }}>NOMBRE</th>
                  <th style={{ ...th, width: '6%' }}>EDAD</th>
                  <th style={{ ...th, width: '6%' }}>GÉN</th>
                  <th style={{ ...th, width: '12%' }}>NSS/CURP</th>
                  <th style={{ ...th, width: '8%', textAlign: 'center' }}># MED</th>
                  <th style={{ ...th, width: '10%', textAlign: 'center' }}>SOL/DISP</th>
                  <th style={{ ...th, width: '16%', textAlign: 'center' }}>ACCIÓN</th>
                </tr>
              </thead>
              <tbody>
                {pacientes.map((p, i) => {
                  const totalSol = p.medicamentos.reduce((s, m) => s + m.solicitada, 0);
                  const totalDisp = p.medicamentos.reduce((s, m) => s + m.dispensada, 0);
                  const expandido = pacienteExpandido === p.paciente_id;
                  return (
                    <tr key={p.paciente_id} style={i % 2 === 0 ? rowPar : rowImpar}>
                      <td style={tdAuto}>{p.subservicio}</td>
                      <td style={{ ...tdAuto, textAlign: 'center', fontWeight: 700 }}>{p.numero_cama}</td>
                      <td style={{ ...tdAuto, fontWeight: 600 }}>{p.nombre_paciente}</td>
                      <td style={{ ...tdAuto, textAlign: 'center' }}>{p.edad}</td>
                      <td style={{ ...tdAuto, textAlign: 'center' }}>{p.genero?.substring(0, 4) || ''}</td>
                      <td style={{ ...tdAuto, fontSize: 11 }}>{p.nss_curp || '--'}</td>
                      <td style={{ ...tdAuto, textAlign: 'center', fontWeight: 700, color: p.medicamentos.length > 0 ? '#0E6755' : '#888' }}>
                        {p.medicamentos.length}
                      </td>
                      <td style={{ ...tdAuto, textAlign: 'center', fontSize: 12, color: '#265C4E' }}>
                        {totalSol} / {totalDisp}
                      </td>
                      <td style={{ ...tdAuto, textAlign: 'center' }}>
                        <button
                          onClick={() => setPacienteExpandido(expandido ? null : p.paciente_id)}
                          style={expandido ? btnExpandirActivo : btnExpandir}
                        >
                          {expandido ? '▲ Cerrar' : '▼ Ver/Editar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pacienteExpandido && (() => {
            const p = pacientes.find(x => x.paciente_id === pacienteExpandido);
            if (!p) return null;
            return (
              <div style={panelExpandido}>
                <div style={panelHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={camaNumero}>{p.numero_cama}</div>
                    <div>
                      <div style={pacienteNombre}>{p.nombre_paciente}</div>
                      <div style={pacienteSub}>
                        {p.subservicio} · {p.edad} años · {p.genero?.substring(0, 4)} · Exp {p.nss_curp || '--'}
                        <br />
                        <span style={{ color: '#7d5b2f' }}>Dx: {p.diagnostico_ingreso}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setPacienteExpandido(null)} style={btnCerrar}>✕ Cerrar</button>
                </div>

                <div style={medTablaContenedor}>
                  <table style={medTabla}>
                    <thead>
                      <tr style={medHeaderRow}>
                        <th style={{ ...thMed, width: '4%', textAlign: 'center' }}>#</th>
                        <th style={{ ...thMed, width: '50%' }}>MEDICAMENTO</th>
                        <th style={{ ...thMed, width: '10%' }}>VÍA</th>
                        <th style={{ ...thMed, width: '16%' }}>FRECUENCIA</th>
                        <th style={{ ...thMed, width: '7%', textAlign: 'center' }}>SOLICITADA</th>
                        <th style={{ ...thMed, width: '7%', textAlign: 'center' }}>DISPENSADA</th>
                        <th style={{ ...thMed, width: '6%', textAlign: 'center' }}>⚙</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.medicamentos.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#888', background: '#fdfaf2' }}>
                            Sin medicamentos. Usa "+ Agregar medicamento" para registrar el primero.
                          </td>
                        </tr>
                      ) : (
                        p.medicamentos.map((med, idx) => (
                          <FilaMedicamento key={med.id} pacienteId={p.paciente_id} med={med} numero={idx + 1} />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={panelFooter}>
                  <button
                    onClick={() => agregarMedicamento(p.paciente_id)}
                    style={btnAgregar}
                    disabled={guardando === p.paciente_id}
                  >
                    + Agregar medicamento
                  </button>
                  <div style={{ fontSize: 11, color: '#888' }}>
                    {p.medicamentos.length} medicamento{p.medicamentos.length === 1 ? '' : 's'} registrado{p.medicamentos.length === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      <div style={piePagina}>
        {pacientes.length} paciente{pacientes.length === 1 ? '' : 's'} activo{pacientes.length === 1 ? '' : 's'}
        {guardando && <span style={{ marginLeft: 16, color: '#C39C59' }}>💾 Guardando...</span>}
      </div>
    </div>
  );
};

const cabeceraBanda: React.CSSProperties = { background: '#0E6755', color: '#fff', padding: '8px 16px', fontWeight: 700, fontSize: 14, letterSpacing: 1, borderRadius: '4px 4px 0 0', textAlign: 'center' };
const tablaContenedor: React.CSSProperties = { border: '1px solid #C39C59', borderTop: 'none', overflowX: 'auto', background: '#fff', marginBottom: 16 };
const tabla: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const headerRow: React.CSSProperties = { background: '#265C4E' };
const th: React.CSSProperties = { padding: '10px 8px', color: '#fff', fontWeight: 700, fontSize: 12, textAlign: 'left', border: '1px solid #1a4639' };
const tdAuto: React.CSSProperties = { padding: '8px', borderBottom: '1px solid #e8dfc6', background: '#F5F1E8', color: '#265C4E' };
const rowPar: React.CSSProperties = { background: '#fff' };
const rowImpar: React.CSSProperties = { background: '#fdfaf2' };
const btnExpandir: React.CSSProperties = { padding: '6px 12px', background: '#0E6755', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' };
const btnExpandirActivo: React.CSSProperties = { padding: '6px 12px', background: '#C39C59', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' };
const panelExpandido: React.CSSProperties = { border: '2px solid #C39C59', borderRadius: 6, background: '#fffef9', marginBottom: 12, overflow: 'hidden' };
const panelHeader: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#F5F1E8', borderBottom: '1px solid #C39C59' };
const panelFooter: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: '#F5F1E8', borderTop: '1px solid #C39C59' };
const camaNumero: React.CSSProperties = { width: 50, height: 50, background: '#0E6755', color: '#fff', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700 };
const pacienteNombre: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: '#265C4E', marginBottom: 2 };
const pacienteSub: React.CSSProperties = { fontSize: 11, color: '#888', lineHeight: 1.4 };
const btnCerrar: React.CSSProperties = { padding: '6px 12px', background: '#A32D2D', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' };
const medTablaContenedor: React.CSSProperties = { overflowX: 'auto', background: '#fff' };
const medTabla: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
const medHeaderRow: React.CSSProperties = { background: '#5a4a8a' };
const thMed: React.CSSProperties = { padding: '8px 6px', color: '#fff', fontWeight: 700, fontSize: 11, textAlign: 'left', border: '1px solid #463a6e', letterSpacing: 0.5 };
const tdNumero: React.CSSProperties = { padding: '4px', textAlign: 'center', fontWeight: 700, color: '#5a4a8a', background: '#F5F1E8', borderBottom: '1px solid #e8dfc6', fontSize: 13 };
const tdPendiente: React.CSSProperties = { padding: '4px', textAlign: 'center', background: '#fff8ec', borderBottom: '1px solid #e8dfc6', borderLeft: '2px solid #7d5b2f' };
const tdEditableSm: React.CSSProperties = { padding: '3px', borderBottom: '1px solid #e8dfc6' };
const inputMed: React.CSSProperties = { width: '100%', padding: '5px 8px', border: '1px solid #C39C59', borderRadius: 3, fontSize: 12, background: '#fff', color: '#265C4E', fontFamily: 'inherit', fontWeight: 600, textTransform: 'uppercase' };
const inputSm: React.CSSProperties = { width: '100%', padding: '5px 6px', border: '1px solid #C39C59', borderRadius: 3, fontSize: 12, background: '#fff', color: '#265C4E', fontFamily: 'inherit' };
const btnBorrar: React.CSSProperties = { width: '100%', padding: '4px', background: '#A32D2D', color: '#fff', border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const btnAgregar: React.CSSProperties = { padding: '8px 16px', background: '#0E6755', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const errorBanner: React.CSSProperties = { background: '#fdecea', color: '#A32D2D', padding: '10px 16px', borderRadius: 4, marginBottom: 12, fontSize: 13 };
const vacio: React.CSSProperties = { padding: 40, textAlign: 'center', color: '#888', background: '#fff', border: '1px solid #C39C59', borderTop: 'none' };
const piePagina: React.CSSProperties = { padding: '8px 16px', fontSize: 12, color: '#888', textAlign: 'right' };
