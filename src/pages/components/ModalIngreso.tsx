// src/pages/components/ModalIngreso.tsx
// Modal para registrar el INGRESO de un paciente a una cama disponible.
// Inserta en la tabla `pacientes` con estado='ACTIVO'.
// El trigger SQL fn_crear_hojas_paciente() se encarga automáticamente
// de crear los renglones en dietas_paciente, recetario_paciente y formato_control_paciente.
import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface Especialidad {
  id: number;
  nombre: string;
}

interface Props {
  camaId: number;
  subservicioId: number;
  servicioId: number;
  numeroCama: string;
  capturadoPor: string; // uuid del perfil
  onClose: () => void;
  onGuardado: () => void;
}

export const ModalIngreso: React.FC<Props> = ({
  camaId, numeroCama, capturadoPor, onClose, onGuardado,
}) => {
  const [especialidades, setEspecialidades] = useState<Especialidad[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado del formulario
  const ahora = new Date();
  const hoyISO  = ahora.toISOString().substring(0, 10);
  const horaISO = ahora.toTimeString().substring(0, 5);

  const [nombre, setNombre] = useState('');
  const [edad, setEdad] = useState('');
  const [genero, setGenero] = useState<'MASCULINO' | 'FEMENINO'>('MASCULINO');
  // Identidad del paciente: SOLO se pide UNA cosa, fecha de nacimiento
  // o CURP. Ambos formatos se guardan en pacientes.nss_curp:
  //   - Fecha → "DD/MM/AAAA" (formato que la Tarjeta de Identificación 🪪
  //     reconoce y descompone automáticamente al imprimir)
  //   - CURP  → 18 caracteres alfanuméricos en mayúsculas
  const [tipoIdent, setTipoIdent] = useState<'fnac' | 'curp'>('fnac');
  const [fnac, setFnac] = useState(''); // yyyy-mm-dd del input type=date
  const [curp, setCurp] = useState('');
  const [dx, setDx] = useState('');
  const [especialidadId, setEspecialidadId] = useState<number | null>(null);
  const [fecha, setFecha] = useState(hoyISO);
  const [hora, setHora] = useState(horaISO);
  const [observaciones, setObservaciones] = useState('');
  // Datos clínicos persistentes para la Tarjeta de Identificación 🪪
  // Se guardan en pacientes.grupo_sanguineo / pacientes.alergias y se leen
  // automáticamente en /imprimir/ficha/:pacienteId.
  const [grupoSanguineo, setGrupoSanguineo] = useState('');
  const [alergias, setAlergias] = useState('');
  // Riesgos: trazabilidad de Caídas y UPP se inicia en el Censo (al ingreso)
  // y corre automáticamente a Control (formato_control_paciente). Después se
  // puede reevaluar desde la pestaña Control.
  const [riesgoCaidas, setRiesgoCaidas] = useState<'' | 'ALTO' | 'MEDIANO' | 'BAJO'>('');
  const [riesgoUpp, setRiesgoUpp] = useState<'' | 'ALTO' | 'MEDIANO' | 'BAJO'>('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('catalogo_especialidades')
        .select('id, nombre')
        .order('nombre');
      setEspecialidades(data || []);
    })();
  }, []);

  // Normaliza la identidad capturada al formato que vive en pacientes.nss_curp.
  // Fecha → "DD/MM/AAAA" (la ficha de identificación lo descompone solo).
  // CURP  → 18 chars en mayúsculas validados (4 letras + 6 dígitos + 8 chars).
  const construirIdent = (): string | null => {
    if (tipoIdent === 'fnac') {
      if (!fnac) return null;
      const [y, m, d] = fnac.split('-');
      if (!y || !m || !d) return null;
      return `${d}/${m}/${y}`;
    }
    const c = curp.trim().toUpperCase();
    return c.length === 0 ? null : c;
  };

  const guardar = async () => {
    if (!nombre.trim() || !edad || !dx.trim()) {
      setError('Nombre, edad y diagnóstico son obligatorios');
      return;
    }
    if (!especialidadId) {
      setError('Selecciona una especialidad');
      return;
    }
    if (tipoIdent === 'curp' && curp.trim().length > 0 && curp.trim().length !== 18) {
      setError('La CURP debe tener 18 caracteres (o déjala vacía si no la conoces)');
      return;
    }
    const identGuardar = construirIdent();

    setGuardando(true);
    setError(null);
    try {
      // Pre-flight: validar que la sesión sigue viva. Si el JWT expiró
      // sin que la app se diera cuenta (típico tras >1h sin actividad),
      // los INSERTs fallan con error de RLS aunque el perfil sea válido,
      // porque auth.uid() devuelve NULL en la policy.
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        throw new Error('Tu sesión expiró. Por favor cierra sesión y vuelve a iniciar para registrar el ingreso.');
      }

      // 1) Crear el paciente. El trigger tr_crear_hojas_paciente creará
      //    automáticamente la fila en formato_control_paciente con riesgos
      //    en NULL. Necesitamos el id devuelto para actualizar los riesgos
      //    capturados en este modal.
      const { data: nuevoPaciente, error: err } = await supabase
        .from('pacientes')
        .insert({
          cama_id: camaId,
          nombre_paciente: nombre.trim().toUpperCase(),
          edad: parseInt(edad, 10),
          genero,
          nss_curp: identGuardar,
          diagnostico_ingreso: dx.trim().toUpperCase(),
          especialidad_id: especialidadId,
          fecha_ingreso: fecha,
          hora_ingreso: hora,
          observaciones: observaciones.trim() || null,
          grupo_sanguineo: grupoSanguineo || null,
          alergias: alergias.trim() || null,
          estado: 'ACTIVO',
          capturado_por: capturadoPor,
        })
        .select('id')
        .single();

      if (err) {
        // Detectar el caso clásico de RLS por sesión expirada o perfil
        // sin servicio asignado, para dar un mensaje accionable.
        const m = (err.message || '').toLowerCase();
        if (m.includes('row-level security') || m.includes('row level security')) {
          throw new Error(
            'No tienes permiso para ingresar en esta cama. ' +
            'Verifica que: (1) Tu sesión esté activa — cierra y vuelve a iniciar sesión. ' +
            '(2) Estés asignado al servicio correcto. ' +
            'Si el problema persiste, contacta a la subjefatura.'
          );
        }
        throw err;
      }

      // 2) Si se capturó riesgo de caídas o UPP en el censo, los propagamos
      //    al formato de control. Esto es la trazabilidad que arranca en el
      //    censo y corre automáticamente a control.
      if (nuevoPaciente && (riesgoCaidas || riesgoUpp)) {
        const updateRiesgos: any = { actualizado_por: capturadoPor };
        if (riesgoCaidas) updateRiesgos.riesgo_caidas = riesgoCaidas;
        if (riesgoUpp)    updateRiesgos.riesgo_upp = riesgoUpp;
        const { error: errR } = await supabase
          .from('formato_control_paciente')
          .update(updateRiesgos)
          .eq('paciente_id', nuevoPaciente.id);
        if (errR) {
          // El paciente ya quedó admitido; solo registramos el error de
          // riesgos para no perder el ingreso.
          console.warn('Paciente admitido pero no se pudieron guardar riesgos:', errR.message);
        }
      }

      onGuardado();
    } catch (e: any) {
      setError(e.message || 'Error al guardar el ingreso');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={titulo}>
          <span>📝 INGRESO DE PACIENTE</span>
          <span style={camaBadge}>CAMA {numeroCama}</span>
        </div>

        {error && <div style={errorBox}>⚠️ {error}</div>}

        <div style={grid}>
          <div style={{ ...campo, gridColumn: 'span 2' }}>
            <label style={label}>NOMBRE COMPLETO *</label>
            <input value={nombre} onChange={e => setNombre(e.target.value.toUpperCase())}
              style={input} placeholder="APELLIDO PATERNO MATERNO NOMBRES" />
          </div>

          <div style={campo}>
            <label style={label}>EDAD *</label>
            <input type="number" min="0" max="130" value={edad} onChange={e => setEdad(e.target.value)} style={input} />
          </div>

          <div style={campo}>
            <label style={label}>SEXO *</label>
            <select value={genero} onChange={e => setGenero(e.target.value as any)} style={input}>
              <option value="MASCULINO">MASCULINO</option>
              <option value="FEMENINO">FEMENINO</option>
            </select>
          </div>

          {/* Identidad: pedimos UNA sola cosa, fecha de nacimiento o CURP.
              El toggle cambia el input que se muestra. Ambos se persisten
              en pacientes.nss_curp (formato distinguible para la ficha). */}
          <div style={{ ...campo, gridColumn: 'span 2' }}>
            <label style={label}>IDENTIFICACIÓN DEL PACIENTE</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <button
                type="button"
                onClick={() => setTipoIdent('fnac')}
                style={tipoIdent === 'fnac' ? togglePillActivo : togglePill}
              >📅 Fecha de nacimiento</button>
              <button
                type="button"
                onClick={() => setTipoIdent('curp')}
                style={tipoIdent === 'curp' ? togglePillActivo : togglePill}
              >🪪 CURP</button>
            </div>
            {tipoIdent === 'fnac' ? (
              <input
                type="date"
                value={fnac}
                onChange={e => setFnac(e.target.value)}
                style={input}
                max={new Date().toISOString().substring(0, 10)}
              />
            ) : (
              <input
                value={curp}
                onChange={e => setCurp(e.target.value.toUpperCase().slice(0, 18))}
                style={input}
                placeholder="GAHF800523HBSXXX01"
                maxLength={18}
              />
            )}
          </div>

          <div style={{ ...campo, gridColumn: 'span 2' }}>
            <label style={label}>DIAGNÓSTICO DE INGRESO *</label>
            <input value={dx} onChange={e => setDx(e.target.value.toUpperCase())} style={input} placeholder="CHOQUE SEPTICO" />
          </div>

          <div style={{ ...campo, gridColumn: 'span 2' }}>
            <label style={label}>ESPECIALIDAD *</label>
            <select value={especialidadId ?? ''} onChange={e => setEspecialidadId(e.target.value ? parseInt(e.target.value, 10) : null)} style={input}>
              <option value="">-- Selecciona --</option>
              {especialidades.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>

          <div style={campo}>
            <label style={label}>FECHA INGRESO</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={input} />
          </div>

          <div style={campo}>
            <label style={label}>HORA INGRESO</label>
            <input type="time" value={hora} onChange={e => setHora(e.target.value)} style={input} />
          </div>

          {/* Datos clínicos para la Tarjeta de Identificación 🪪 — opcionales,
              se pueden editar después en la pestaña Control si no se conocen
              al momento del ingreso. */}
          <div style={{ ...campo, gridColumn: 'span 2', borderTop: '1px dashed #C39C59', paddingTop: 10, marginTop: 4 }}>
            <div style={{ fontSize: 10, color: '#7d5b2f', fontWeight: 700, letterSpacing: 0.3, marginBottom: 2 }}>
              🪪 DATOS PARA LA TARJETA DE IDENTIFICACIÓN
            </div>
          </div>

          <div style={campo}>
            <label style={label}>GRUPO Y RH</label>
            <select value={grupoSanguineo} onChange={e => setGrupoSanguineo(e.target.value)} style={input}>
              <option value="">-- Selecciona --</option>
              <option value="O+">O Rh+</option>
              <option value="O-">O Rh−</option>
              <option value="A+">A Rh+</option>
              <option value="A-">A Rh−</option>
              <option value="B+">B Rh+</option>
              <option value="B-">B Rh−</option>
              <option value="AB+">AB Rh+</option>
              <option value="AB-">AB Rh−</option>
              <option value="DESCONOCIDO">Desconocido</option>
            </select>
          </div>

          <div style={campo}>
            <label style={label}>ALERGIAS</label>
            <input
              value={alergias}
              onChange={e => setAlergias(e.target.value.toUpperCase())}
              style={input}
              placeholder="Vacío = NO. Ej. PENICILINA"
            />
          </div>

          {/* Trazabilidad clínica: la evaluación inicial de riesgos arranca
              aquí (Censo) y corre automáticamente a la pestaña Control. La
              enfermería puede reevaluar luego desde ahí. */}
          <div style={{ ...campo, gridColumn: 'span 2', borderTop: '1px dashed #A32D2D', paddingTop: 10, marginTop: 4 }}>
            <div style={{ fontSize: 10, color: '#A32D2D', fontWeight: 700, letterSpacing: 0.3, marginBottom: 2 }}>
              ⚠️ EVALUACIÓN INICIAL DE RIESGOS (se traza a CONTROL)
            </div>
          </div>

          <div style={campo}>
            <label style={label}>RIESGO DE CAÍDAS</label>
            <select value={riesgoCaidas} onChange={e => setRiesgoCaidas(e.target.value as any)} style={input}>
              <option value="">-- Selecciona --</option>
              <option value="ALTO">🔴 ALTO</option>
              <option value="MEDIANO">🟡 MEDIANO</option>
              <option value="BAJO">🟢 BAJO</option>
            </select>
          </div>

          <div style={campo}>
            <label style={label}>RIESGO ÚLCERA POR PRESIÓN (UPP)</label>
            <select value={riesgoUpp} onChange={e => setRiesgoUpp(e.target.value as any)} style={input}>
              <option value="">-- Selecciona --</option>
              <option value="ALTO">🔴 ALTO</option>
              <option value="MEDIANO">🟡 MEDIANO</option>
              <option value="BAJO">🟢 BAJO</option>
            </select>
          </div>

          <div style={{ ...campo, gridColumn: 'span 2' }}>
            <label style={label}>OBSERVACIONES</label>
            <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)}
              style={{ ...input, minHeight: 50, resize: 'vertical' }} />
          </div>
        </div>

        <div style={botones}>
          <button onClick={onClose} style={botonCancelar} disabled={guardando}>Cancelar</button>
          <button onClick={guardar} style={botonGuardar} disabled={guardando}>
            {guardando ? 'Guardando...' : '✓ Registrar ingreso'}
          </button>
        </div>
      </div>
    </div>
  );
};

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 };
const modal: React.CSSProperties = { background: '#fff', border: '3px solid #C39C59', borderRadius: 10, padding: 24, maxWidth: 700, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' };
const titulo: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0E6755', paddingBottom: 12, marginBottom: 16, fontSize: 18, fontWeight: 700, color: '#0E6755' };
const camaBadge: React.CSSProperties = { background: '#0E6755', color: '#fff', padding: '4px 12px', borderRadius: 6, fontSize: 14 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 };
const campo: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const label: React.CSSProperties = { fontSize: 11, color: '#265C4E', fontWeight: 700, textTransform: 'uppercase' };
const input: React.CSSProperties = { padding: '8px 10px', border: '1px solid #C39C59', borderRadius: 4, fontSize: 13, color: '#265C4E', background: '#fff', fontFamily: 'inherit' };
const botones: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 16, borderTop: '1px solid #e8dfc6' };
const botonCancelar: React.CSSProperties = { padding: '10px 18px', background: '#fff', border: '1px solid #888', color: '#888', borderRadius: 6, cursor: 'pointer', fontSize: 13 };
const botonGuardar: React.CSSProperties = { padding: '10px 18px', background: '#0E6755', border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700 };
const errorBox: React.CSSProperties = { background: '#fdecea', color: '#A32D2D', padding: '10px 12px', borderRadius: 4, marginBottom: 12, fontSize: 13 };
const togglePill: React.CSSProperties = { flex: 1, padding: '6px 10px', background: '#fff', border: '1px solid #C39C59', color: '#7d5b2f', borderRadius: 14, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' };
const togglePillActivo: React.CSSProperties = { ...togglePill, background: '#0E6755', borderColor: '#0E6755', color: '#fff', fontWeight: 700 };
