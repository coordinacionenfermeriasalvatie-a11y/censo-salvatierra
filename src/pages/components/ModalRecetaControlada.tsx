// Modal para crear receta de medicamento controlado.
// Datos del paciente: snapshot (no editables).
// Datos del médico: texto libre (nombre, cédula, especialidad).
// Medicamento: solo del catálogo filtrado por grupo_control IS NOT NULL.
// Al guardar, abre la vista de impresión en pestaña nueva.

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { formatearTitulo } from '../../types';

interface Paciente {
  paciente_id: string;
  nombre_paciente: string;
  edad: number | null;
  edad_unidad: string | null;
  genero: string | null;
  nss_curp: string | null;
  diagnostico_ingreso: string | null;
  numero_cama: string | null;
  subservicio: string | null;
}

interface MedicamentoControlado {
  id: number;
  nombre: string;
  grupo_control: 'I' | 'II' | 'III' | 'IV' | 'V';
}

interface MedicoAdscrito {
  id: string;
  nombre: string;
  cedula: string | null;
  especialidad: string | null;
}

// Mismas listas que el recetario general (VistaRecetario / ModalRecetarioMayoreo).
const VIAS_COMUNES = ['IV', 'IM', 'SC', 'VO', 'SL', 'INH', 'TOP', 'OFT', 'OTICO', 'RECTAL'];
const FRECUENCIAS_COMUNES = [
  'CADA 1 HR', 'CADA 2 HRS', 'CADA 4 HRS', 'CADA 6 HRS', 'CADA 8 HRS',
  'CADA 12 HRS', 'CADA 24 HRS', 'CADA 48 HRS', 'CADA 72 HRS',
];
const MEDICO_MANUAL = '__manual__';

// Receta existente a editar (snapshot del paciente = solo lectura).
// Solo jefe/admin del sistema abre el modal en este modo (gate en VistaRecetario).
export interface RecetaEditar {
  id: string;
  folio: string;
  estado_aprobacion: string;
  // snapshot del paciente (no editable)
  paciente_nombre: string;
  paciente_edad: number | null;
  paciente_edad_unidad: string | null;
  paciente_genero: string | null;
  paciente_nss_curp: string | null;
  paciente_diagnostico: string | null;
  paciente_cama: string | null;
  paciente_subservicio: string | null;
  // editables
  medicamento_id: number | null;
  medicamento_nombre: string;
  medicamento_grupo: 'I' | 'II' | 'III' | 'IV' | 'V';
  dosis: string | null;
  via: string | null;
  frecuencia: string | null;
  duracion: string | null;
  cantidad_numero: string | null;
  cantidad_letra: string | null;
  indicaciones: string | null;
  medico_nombre: string | null;
  medico_cedula: string | null;
  medico_especialidad: string | null;
}

interface Props {
  servicioId: number;
  pacientes: Paciente[];          // de la VistaRecetario, ya filtrados al servicio
  pacienteInicialId?: string;     // opcional pre-selección
  recetaEditar?: RecetaEditar;    // si viene, el modal abre en MODO EDICIÓN (jefe/admin)
  onCerrar: () => void;
}

const GRUPO_LABEL: Record<string, string> = {
  'I':   'Grupo I (estupefacientes)',
  'II':  'Grupo II (psicotrópicos potentes)',
  'III': 'Grupo III (psicotrópicos)',
  'IV':  'Grupo IV',
  'V':   'Grupo V',
};

export const ModalRecetaControlada: React.FC<Props> = ({ servicioId, pacientes, pacienteInicialId, recetaEditar, onCerrar }) => {
  const { perfil } = useAuth();
  const esEdicion = !!recetaEditar;
  const [medicamentos, setMedicamentos] = useState<MedicamentoControlado[]>([]);
  const [medicos, setMedicos] = useState<MedicoAdscrito[]>([]);
  // En edición el médico viene como texto del snapshot → arrancar en captura manual.
  const [medicoSel, setMedicoSel] = useState(recetaEditar ? MEDICO_MANUAL : '');
  const [pacienteId, setPacienteId] = useState(pacienteInicialId ?? '');
  const [medicamentoId, setMedicamentoId] = useState<number | ''>(recetaEditar?.medicamento_id ?? '');
  const [dosis, setDosis] = useState(recetaEditar?.dosis ?? '');
  const [via, setVia] = useState(recetaEditar?.via ?? '');
  const [frecuencia, setFrecuencia] = useState(recetaEditar?.frecuencia ?? '');
  const [duracion, setDuracion] = useState(recetaEditar?.duracion ?? '');
  const [cantidadNumero, setCantidadNumero] = useState(recetaEditar?.cantidad_numero ?? '');
  const [cantidadLetra, setCantidadLetra] = useState(recetaEditar?.cantidad_letra ?? '');
  const [indicaciones, setIndicaciones] = useState(recetaEditar?.indicaciones ?? '');
  const [medicoNombre, setMedicoNombre] = useState(recetaEditar?.medico_nombre ?? '');
  const [medicoCedula, setMedicoCedula] = useState(recetaEditar?.medico_cedula ?? '');
  const [medicoEspecialidad, setMedicoEspecialidad] = useState(recetaEditar?.medico_especialidad ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<{ id: string; folio: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('catalogo_medicamentos')
        .select('id, nombre, grupo_control')
        .not('grupo_control', 'is', null)
        .eq('activo', true)
        .order('grupo_control')
        .order('nombre');
      setMedicamentos((data || []) as MedicamentoControlado[]);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('medicos_adscritos')
        .select('id, nombre, cedula, especialidad')
        .eq('activo', true)
        .order('nombre');
      const lista = (data || []) as MedicoAdscrito[];
      setMedicos(lista);
      // Catálogo vacío → arrancar en captura manual para no bloquear la receta.
      if (lista.length === 0) setMedicoSel(MEDICO_MANUAL);
    })();
  }, []);

  const onElegirMedico = (val: string) => {
    setMedicoSel(val);
    if (val === '' || val === MEDICO_MANUAL) {
      if (val === '') { setMedicoNombre(''); setMedicoCedula(''); setMedicoEspecialidad(''); }
      return;
    }
    const m = medicos.find(x => x.id === val);
    if (m) {
      setMedicoNombre(m.nombre);
      setMedicoCedula(m.cedula ?? '');
      setMedicoEspecialidad(m.especialidad ?? '');
    }
  };

  const paciente = useMemo(
    () => pacientes.find(p => p.paciente_id === pacienteId),
    [pacientes, pacienteId]
  );

  const medicamento = useMemo(
    () => medicamentos.find(m => m.id === medicamentoId),
    [medicamentos, medicamentoId]
  );

  const guardar = async () => {
    if (!perfil) { setError('Sin sesión activa'); return; }

    // ---- MODO EDICIÓN (jefe/admin): UPDATE de datos médicos. El snapshot del
    //      paciente y la enfermera que la creó NO se tocan. El folio se conserva. ----
    if (esEdicion && recetaEditar) {
      if (!medicoNombre.trim() || !medicoCedula.trim()) {
        setError('Nombre y cédula del médico son obligatorios'); return;
      }
      if (!dosis.trim() || !via.trim() || !frecuencia.trim()) {
        setError('Dosis, vía y frecuencia son obligatorios'); return;
      }
      // Si el medicamento elegido sigue en el catálogo úsalo; si fue dado de baja,
      // conserva el original para no perder el registro.
      const medId     = medicamento ? medicamento.id : recetaEditar.medicamento_id;
      const medNombre = medicamento ? medicamento.nombre : recetaEditar.medicamento_nombre;
      const medGrupo  = medicamento ? medicamento.grupo_control : recetaEditar.medicamento_grupo;
      setGuardando(true);
      setError(null);
      const { error: upErr } = await supabase.from('recetas_controladas').update({
        medicamento_id: medId,
        medicamento_nombre: medNombre,
        medicamento_grupo: medGrupo,
        dosis, via, frecuencia, duracion,
        cantidad_numero: cantidadNumero,
        cantidad_letra: cantidadLetra,
        indicaciones,
        medico_nombre: medicoNombre.trim(),
        medico_cedula: medicoCedula.trim(),
        medico_especialidad: medicoEspecialidad.trim() || null,
      }).eq('id', recetaEditar.id);
      setGuardando(false);
      if (upErr) { setError(upErr.message); return; }
      setExito({ id: recetaEditar.id, folio: recetaEditar.folio });
      return;
    }

    if (!paciente) { setError('Selecciona un paciente'); return; }
    if (!medicamento) { setError('Selecciona un medicamento controlado'); return; }
    if (!medicoNombre.trim() || !medicoCedula.trim()) {
      setError('Nombre y cédula del médico son obligatorios');
      return;
    }
    if (!dosis.trim() || !via.trim() || !frecuencia.trim()) {
      setError('Dosis, vía y frecuencia son obligatorios');
      return;
    }
    setGuardando(true);
    setError(null);

    const payload = {
      paciente_id: paciente.paciente_id,
      paciente_nombre: paciente.nombre_paciente,
      paciente_edad: paciente.edad,
      paciente_edad_unidad: paciente.edad_unidad,
      paciente_genero: paciente.genero,
      paciente_nss_curp: paciente.nss_curp,
      paciente_diagnostico: paciente.diagnostico_ingreso,
      paciente_cama: paciente.numero_cama,
      paciente_subservicio: paciente.subservicio,
      servicio_id: servicioId,
      medicamento_id: medicamento.id,
      medicamento_nombre: medicamento.nombre,
      medicamento_grupo: medicamento.grupo_control,
      dosis, via, frecuencia, duracion,
      cantidad_numero: cantidadNumero,
      cantidad_letra: cantidadLetra,
      indicaciones,
      medico_nombre: medicoNombre.trim(),
      medico_cedula: medicoCedula.trim(),
      medico_especialidad: medicoEspecialidad.trim() || null,
      enfermera_id: perfil.id,
      enfermera_nombre: perfil.nombre_completo,
      enfermera_matricula: perfil.matricula,
      enfermera_rol: perfil.rol,
    };

    // Reintentar hasta 3 veces si falla por race condition del folio.
    let data: any = null;
    let err: any = null;
    for (let intento = 1; intento <= 3; intento++) {
      const r = await supabase.from('recetas_controladas').insert(payload).select('id, folio').single();
      data = r.data; err = r.error;
      if (!err) break;
      // Solo reintentar si es un duplicate del folio (race condition)
      if (!/duplicate key|folio_key|recetas_controladas_folio/i.test(err.message)) break;
      await new Promise(res => setTimeout(res, 80 * intento));  // backoff 80/160/240 ms
    }

    setGuardando(false);
    if (err) { setError(err.message); return; }

    // Mostrar pantalla de confirmación con VISTA PREVIA del documento guardado
    // (para que el gestor se cerciore de que la solicitud se guardó bien) y el
    // aviso de acudir a Supervisión para el canje, el vale y las firmas. La
    // impresión se hace desde ahí o en la Jefatura de Supervisión de Enfermería.
    setExito({ id: data.id, folio: data.folio });
  };

  // Pantalla de confirmación con VISTA PREVIA del documento: el gestor ve la
  // solicitud tal como se imprimirá (se cerciora de que se guardó bien) y recibe
  // el aviso de acudir a Supervisión para el canje, el vale y las firmas.
  if (exito) {
    return (
      <div style={overlay} onClick={onCerrar}>
        <div style={{ ...modal, maxWidth: 880 }} onClick={e => e.stopPropagation()}>
          <div style={headerExito}>
            <div style={tituloChip}>{esEdicion ? '✓ RECETA ACTUALIZADA' : '✓ SOLICITUD GUARDADA'}</div>
          </div>
          <div style={{ ...body, gap: 14 }}>
            <div style={exitoCheck}>
              <div style={exitoIcono}>✓</div>
              <div>
                <div style={exitoTitulo}>
                  {esEdicion
                    ? 'Los cambios de la receta controlada se guardaron correctamente.'
                    : 'La solicitud de medicamento controlado se guardó correctamente.'}
                </div>
                <div style={exitoFolio}>Folio: <strong>{exito.folio}</strong></div>
              </div>
            </div>

            {/* VISTA PREVIA — el documento real tal como se imprimirá */}
            <div style={previewWrap}>
              <div style={previewLabel}>👁 Vista previa — así se imprimirá la solicitud (desplázate para ver ambas boletas)</div>
              <iframe
                src={`/imprimir/receta-controlada/${exito.id}?preview=1`}
                title="Vista previa de la solicitud de medicamento controlado"
                style={previewFrame}
              />
            </div>

            {esEdicion ? (
              <div style={avisoBox}>
                <div style={avisoTit}>✏️ Corrección aplicada</div>
                <div style={avisoTexto}>
                  Verifica la vista previa de arriba. El folio y los datos del paciente
                  se conservan; solo se actualizaron los datos médicos.
                </div>
              </div>
            ) : (
              <div style={avisoBox}>
                <div style={avisoTit}>⚠️ Acción pendiente del gestor del cuidado</div>
                <div style={avisoTexto}>
                  Acude a <strong>Supervisión de Enfermería</strong> para el <strong>canje del medicamento</strong>,
                  la <strong>recaudación del vale</strong> de la receta controlada y la <strong>impresión</strong>,
                  donde se recabarán las <strong>firmas correspondientes</strong>.
                </div>
              </div>
            )}
          </div>
          <div style={footer}>
            <button
              onClick={() => window.open(`/imprimir/receta-controlada/${exito.id}`, '_blank', 'noopener,noreferrer')}
              style={btnSecundario}
            >
              🖨️ Imprimir
            </button>
            <button onClick={onCerrar} style={btnPrincipal}>Entendido</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlay} onClick={onCerrar}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={tituloChip}>
              {esEdicion ? '✏️ EDITAR RECETA CONTROLADA' : '💊 RECETA DE MEDICAMENTO CONTROLADO'}
            </div>
            <div style={subt}>
              {esEdicion ? `Folio ${recetaEditar?.folio} · corrección por jefe/admin` : 'Grupos I-V (Ley General de Salud)'}
            </div>
          </div>
          <button onClick={onCerrar} style={btnCerrar}>✕</button>
        </div>

        <div style={body}>
          {/* PACIENTE */}
          <div style={seccion}>
            <div style={seccionTit}>1. Paciente {esEdicion && <span style={{ fontWeight: 400, color: '#888' }}>(snapshot, no editable)</span>}</div>
            {esEdicion && recetaEditar ? (
              <div style={pacienteCard}>
                <div><strong>Nombre:</strong> {recetaEditar.paciente_nombre}</div>
                <div><strong>Edad:</strong> {recetaEditar.paciente_edad ?? '—'} {recetaEditar.paciente_edad_unidad ?? ''} · <strong>Sexo:</strong> {recetaEditar.paciente_genero ?? '—'}</div>
                <div><strong>NSS/Exp:</strong> {recetaEditar.paciente_nss_curp ?? '—'}</div>
                <div><strong>Cama:</strong> {recetaEditar.paciente_cama ?? '—'} · <strong>Subservicio:</strong> {recetaEditar.paciente_subservicio ?? '—'}</div>
                <div><strong>Dx ingreso:</strong> {recetaEditar.paciente_diagnostico ?? '—'}</div>
              </div>
            ) : (
              <>
                <select
                  value={pacienteId}
                  onChange={e => setPacienteId(e.target.value)}
                  style={input}
                >
                  <option value="">-- elige paciente --</option>
                  {pacientes.map(p => (
                    <option key={p.paciente_id} value={p.paciente_id}>
                      Cama {p.numero_cama} · {p.nombre_paciente}
                    </option>
                  ))}
                </select>
                {paciente && (
                  <div style={pacienteCard}>
                    <div><strong>Nombre:</strong> {paciente.nombre_paciente}</div>
                    <div><strong>Edad:</strong> {paciente.edad ?? '—'} {paciente.edad_unidad ?? ''} · <strong>Sexo:</strong> {paciente.genero ?? '—'}</div>
                    <div><strong>NSS/Exp:</strong> {paciente.nss_curp ?? '—'}</div>
                    <div><strong>Cama:</strong> {paciente.numero_cama} · <strong>Subservicio:</strong> {paciente.subservicio}</div>
                    <div><strong>Dx ingreso:</strong> {paciente.diagnostico_ingreso ?? '—'}</div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* MEDICAMENTO */}
          <div style={seccion}>
            <div style={seccionTit}>2. Medicamento controlado</div>
            <select
              value={medicamentoId}
              onChange={e => setMedicamentoId(e.target.value ? parseInt(e.target.value, 10) : '')}
              style={input}
            >
              <option value="">-- elige medicamento --</option>
              {medicamentos.map(m => (
                <option key={m.id} value={m.id}>
                  [{m.grupo_control}] {m.nombre}
                </option>
              ))}
            </select>
            {medicamento && (
              <div style={chipGrupo}>{GRUPO_LABEL[medicamento.grupo_control]}</div>
            )}
            <div style={gridCampos}>
              <div>
                <label style={lbl}>Dosis *</label>
                <input value={dosis} onChange={e => setDosis(e.target.value)} placeholder="ej. 10 mg" style={input} />
              </div>
              <div>
                <label style={lbl}>Vía *</label>
                <select value={via} onChange={e => setVia(e.target.value)} style={input}>
                  <option value="">-- elige --</option>
                  {VIAS_COMUNES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Frecuencia *</label>
                <select value={frecuencia} onChange={e => setFrecuencia(e.target.value)} style={input}>
                  <option value="">-- elige --</option>
                  {FRECUENCIAS_COMUNES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Duración</label>
                <input value={duracion} onChange={e => setDuracion(e.target.value)} placeholder="3 días, 5 dosis..." style={input} />
              </div>
              <div>
                <label style={lbl}>Cantidad (número)</label>
                <input value={cantidadNumero} onChange={e => setCantidadNumero(e.target.value)} placeholder="ej. 12" style={input} />
              </div>
              <div>
                <label style={lbl}>Cantidad (letra)</label>
                <input value={cantidadLetra} onChange={e => setCantidadLetra(e.target.value)} placeholder="ej. doce" style={input} />
              </div>
            </div>
            <label style={lbl}>Indicaciones adicionales</label>
            <textarea
              value={indicaciones}
              onChange={e => setIndicaciones(e.target.value)}
              rows={2}
              style={{ ...input, resize: 'vertical' as const }}
              placeholder="Diluir en SF, administrar lento..."
            />
          </div>

          {/* MÉDICO */}
          <div style={seccion}>
            <div style={seccionTit}>3. Médico prescriptor</div>
            <div style={gridCampos}>
              <div style={{ gridColumn: 'span 3' }}>
                <label style={lbl}>Médico *</label>
                <select value={medicoSel} onChange={e => onElegirMedico(e.target.value)} style={input}>
                  <option value="">-- elige médico del catálogo --</option>
                  {medicos.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}{m.especialidad ? ` · ${m.especialidad}` : ''}
                    </option>
                  ))}
                  <option value={MEDICO_MANUAL}>✍️ Escribir médico manualmente</option>
                </select>
                {medicoSel !== MEDICO_MANUAL && medicoSel !== '' && (
                  <div style={ayuda}>Cédula y especialidad se autocompletaron; puedes ajustarlas abajo.</div>
                )}
              </div>
              {medicoSel === MEDICO_MANUAL && (
                <div style={{ gridColumn: 'span 3' }}>
                  <label style={lbl}>Nombre completo *</label>
                  <input value={medicoNombre} onChange={e => setMedicoNombre(e.target.value)} placeholder="Dra. ..." style={input} />
                </div>
              )}
              <div>
                <label style={lbl}>Cédula profesional *</label>
                <input value={medicoCedula} onChange={e => setMedicoCedula(e.target.value)} style={input} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lbl}>Especialidad</label>
                <input value={medicoEspecialidad} onChange={e => setMedicoEspecialidad(e.target.value)} style={input} />
              </div>
            </div>
          </div>

          {/* ENFERMERA (info, no editable) */}
          {perfil && (
            <div style={seccion}>
              <div style={seccionTit}>4. Personal de enfermería (auto)</div>
              <div style={pacienteCard}>
                <div><strong>{perfil.nombre_completo}</strong> · Matrícula {perfil.matricula} · {formatearTitulo(perfil)}</div>
                <div style={{ fontSize: 11, color: '#666' }}>Este registro queda asociado a tu sesión y se guarda en la bitácora de auditoría.</div>
              </div>
            </div>
          )}

          {error && <div style={errBanner}>⚠️ {error}</div>}
        </div>

        <div style={footer}>
          <button onClick={onCerrar} disabled={guardando} style={btnSecundario}>Cancelar</button>
          <button onClick={guardar} disabled={guardando} style={btnPrincipal}>
            {guardando ? 'Guardando...' : (esEdicion ? '💾 Guardar cambios' : '💾 Guardar e imprimir')}
          </button>
        </div>
      </div>
    </div>
  );
};

const overlay: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, padding: 16,
};
const modal: React.CSSProperties = {
  background: '#fff', borderRadius: 8, width: '100%', maxWidth: 720,
  maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
};
const header: React.CSSProperties = {
  background: '#A32D2D', color: '#fff', padding: '12px 18px', borderRadius: '8px 8px 0 0',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
};
const tituloChip: React.CSSProperties = { fontSize: 14, fontWeight: 700, letterSpacing: 0.5 };
const subt: React.CSSProperties = { fontSize: 11, opacity: 0.9, marginTop: 2 };
const btnCerrar: React.CSSProperties = {
  background: 'transparent', border: '1px solid #fff', color: '#fff', borderRadius: 4,
  width: 32, height: 32, cursor: 'pointer', fontSize: 16,
};
const body: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 };
const seccion: React.CSSProperties = { border: '1px solid #eee', borderRadius: 6, padding: 12 };
const seccionTit: React.CSSProperties = { fontWeight: 700, color: '#0E6755', fontSize: 13, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #eee' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: '#7d5b2f', fontWeight: 600, marginBottom: 3 };
const ayuda: React.CSSProperties = { fontSize: 10.5, color: '#0E6755', marginTop: 3 };
const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '6px 10px',
  border: '1px solid #C39C59', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', background: '#fff',
};
const gridCampos: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8,
};
const pacienteCard: React.CSSProperties = {
  background: '#fff7e0', border: '1px solid #C39C59', borderRadius: 4, padding: 8, fontSize: 12, lineHeight: 1.6, marginTop: 6,
};
const chipGrupo: React.CSSProperties = {
  display: 'inline-block', background: '#A32D2D', color: '#fff', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, margin: '6px 0',
};
const errBanner: React.CSSProperties = {
  background: '#fbeaea', border: '1px solid #A32D2D', color: '#A32D2D', padding: 8, borderRadius: 4, fontSize: 12,
};
const footer: React.CSSProperties = {
  padding: 12, borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: 8,
};
const btnSecundario: React.CSSProperties = {
  padding: '8px 16px', background: '#fff', color: '#7d5b2f', border: '1px solid #C39C59', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
};
const btnPrincipal: React.CSSProperties = {
  padding: '8px 16px', background: '#A32D2D', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700,
};
const headerExito: React.CSSProperties = {
  background: '#0E6755', color: '#fff', padding: '12px 18px', borderRadius: '8px 8px 0 0',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const exitoCheck: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
};
const exitoIcono: React.CSSProperties = {
  flexShrink: 0, width: 44, height: 44, borderRadius: '50%', background: '#0E6755', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700,
};
const exitoTitulo: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: '#0E6755' };
const exitoFolio: React.CSSProperties = { fontSize: 13, color: '#444', marginTop: 2 };
const avisoBox: React.CSSProperties = {
  background: '#fff7e0', border: '1.5px solid #C39C59', borderRadius: 6, padding: 12,
};
const avisoTit: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: '#7d5b2f', marginBottom: 6,
};
const avisoTexto: React.CSSProperties = { fontSize: 13, lineHeight: 1.55, color: '#3a3a3a' };
const previewWrap: React.CSSProperties = {
  border: '1px solid #C39C59', borderRadius: 6, overflow: 'hidden', background: '#e9e9e9',
};
const previewLabel: React.CSSProperties = {
  background: '#0E6755', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 10px', letterSpacing: 0.3,
};
// Documento carta-vertical (~816px de ancho). El iframe lo muestra a tamaño real
// con scroll vertical para alcanzar ambas boletas (original + copia).
const previewFrame: React.CSSProperties = {
  width: '100%', height: 440, border: 'none', display: 'block', background: '#fff',
};
