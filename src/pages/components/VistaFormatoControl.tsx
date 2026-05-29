// src/pages/components/VistaFormatoControl.tsx
// v5.0 (Fase B+C): chips, fechas y dropdowns clinicos pasan a EventCardGroup
//   respaldados por evento_apoyo_paciente. Cada evento tiene estado dropdown,
//   2 fechas hibridas (boton + lapiz) y observaciones inline.
//
// Queda como esta (en formato_control_paciente):
//   - riesgo_upp, riesgo_caidas (evaluaciones)
//   - causa_no_ocupacion
//   - traslado (texto libre)
//   - observaciones
//
// Todo lo demas se migro a eventos por la migracion SQL 11.
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useEventosApoyo, type TipoEvento } from '../../hooks/useEventosApoyo';
import { EventCardGroup } from './EventCardGroup';

interface ControlRenglon {
  paciente_id: string;
  subservicio: string;
  numero_cama: string;
  nombre_paciente: string;
  edad: number;
  genero: string;
  nss_curp: string | null;
  fecha_nacimiento: string | null;
  edad_unidad?: 'AÑOS' | 'MESES' | 'DIAS' | string | null;
  diagnostico_ingreso: string;
  [key: string]: any;
}

// Formatea una fecha YYYY-MM-DD como DD/MM/AAAA (formato institucional).
function formatearFechaNac(f: string | null | undefined): string {
  if (!f) return '';
  const [y, m, d] = f.split('-');
  if (!y || !m || !d) return f;
  return `${d}/${m}/${y}`;
}

// Edad con unidad — para neonatos en UCIN se ven días/meses en vez de años.
function formatEdadInline(edad: number | null | undefined, unidad: any): string {
  if (edad == null) return '';
  const u = (unidad ?? 'AÑOS') as string;
  if (u === 'DIAS') return `${edad} ${edad === 1 ? 'día' : 'días'}`;
  if (u === 'MESES') return `${edad} ${edad === 1 ? 'mes' : 'meses'}`;
  return `${edad} ${edad === 1 ? 'año' : 'años'}`;
}

interface CatalogoItem {
  codigo: string;
  nombre: string;
  descripcion?: string;
  color?: string;
}

interface Especialidad { id: number; nombre: string; }

interface Props { servicioId: number; }

const FALLBACK_RIESGO: CatalogoItem[] = [
  { codigo: 'ALTO',    nombre: '🔴 ALTO',    color: '#A32D2D' },
  { codigo: 'MEDIANO', nombre: '🟡 MEDIANO', color: '#C39C59' },
  { codigo: 'BAJO',    nombre: '🟢 BAJO',    color: '#0E6755' },
];
const CAUSAS_NO_OCUPACION = ['SIN CAMA', 'DESCOMPUESTA', 'SIN COLCHÓN', 'EN REPARACIÓN'];

// Catalogos hardcoded para tipos sin tabla en DB
// Accesos vasculares que SE AUTOLLENAN en productividad:
//   CVP + neonato → AV1 + V05      CVP + adulto → AV1 + V09
//   CVC          → AV1 + V01      UMBILICAL    → AV1 + V25
//   LM           → AV1 + V13 (línea media)
const ACCESO_VASCULAR_OPCIONES: CatalogoItem[] = [
  { codigo: 'CVP',       nombre: 'Catéter venoso periférico' },
  { codigo: 'CVC',       nombre: 'Catéter venoso central' },
  { codigo: 'LM',        nombre: 'Línea media' },
  { codigo: 'UMBILICAL', nombre: 'Catéter umbilical' },
];
const DISPOSITIVO_OPCIONES: CatalogoItem[] = [
  { codigo: 'VM', nombre: 'Ventilación mecánica' },
];
const SONDA_OPCIONES: CatalogoItem[] = [
  { codigo: 'SG',  nombre: 'Sonda gástrica (NSG/OSG)' },
  { codigo: 'SPL', nombre: 'Sonda pleurostomía' },
  { codigo: 'CU',  nombre: 'Catéter urinario' },
];
// Curaciones que SE AUTOLLENAN a productividad (via trigger
// fn_evento_productividad → fn_codigo_prod_por_evento_paciente). El
// código mapea según edad del paciente:
//   CUR_CVP + neonato → V08, CUR_CVP + adulto → V12
//   REF_CVP + neonato → V07, REF_CVP + adulto → V11
//   CUR_CVC → V03, REF_CVC → V04 (sin distinción)
//   CUR_LM  → V15, REF_LM  → V16 (línea media, sin distinción)
const CURACION_OPCIONES: CatalogoItem[] = [
  { codigo: 'CUR_CVP', nombre: 'Curación sitio CVP' },
  { codigo: 'REF_CVP', nombre: 'Refijación CVP' },
  { codigo: 'CUR_CVC', nombre: 'Curación sitio CVC' },
  { codigo: 'REF_CVC', nombre: 'Refijación CVC' },
  { codigo: 'CUR_LM',  nombre: 'Curación sitio Línea Media' },
  { codigo: 'REF_LM',  nombre: 'Refijación Línea Media' },
  { codigo: 'HERIDA',  nombre: 'Curación de herida' },
];
const PROCEDIMIENTO_OPCIONES: CatalogoItem[] = [
  { codigo: 'EST', nombre: 'Estomas' },
  { codigo: 'SUT', nombre: 'Suturas realizadas' },
  { codigo: 'LIS', nombre: 'Lisis / lavado catéter' },
];
const GLUCEMIA_OPCIONES: CatalogoItem[] = [
  { codigo: 'GLUCEMIA', nombre: 'Glucemia capilar' },
];
const AISLAMIENTO_OPCIONES: CatalogoItem[] = [
  { codigo: 'ESTANDAR',      nombre: '🔴 Estándar' },
  { codigo: 'POR_GOTA',      nombre: '🟢 Por gota' },
  { codigo: 'POR_VIA_AEREA', nombre: '🔵 Por vía aérea' },
  { codigo: 'CONTACTO',      nombre: '🟡 Por contacto' },
  { codigo: 'PROTECTOR',     nombre: '⬜ Protector' },
  { codigo: 'CONTACTO_PLUS', nombre: '🟫 Por contacto plus' },
];

// Grupos sanguíneos: para Tarjeta de Identificación impresa.
// Persiste en pacientes.grupo_sanguineo (TEXT con CHECK).
const GRUPO_SANGUINEO_OPCIONES: CatalogoItem[] = [
  { codigo: 'O+',  nombre: 'O Rh+' },
  { codigo: 'O-',  nombre: 'O Rh−' },
  { codigo: 'A+',  nombre: 'A Rh+' },
  { codigo: 'A-',  nombre: 'A Rh−' },
  { codigo: 'B+',  nombre: 'B Rh+' },
  { codigo: 'B-',  nombre: 'B Rh−' },
  { codigo: 'AB+', nombre: 'AB Rh+' },
  { codigo: 'AB-', nombre: 'AB Rh−' },
  { codigo: 'DESCONOCIDO', nombre: 'Desconocido' },
];

export const VistaFormatoControl: React.FC<Props> = ({ servicioId }) => {
  const { perfil } = useAuth();

  const [renglones, setRenglones] = useState<ControlRenglon[]>([]);
  const [riesgos, setRiesgos] = useState<CatalogoItem[]>(FALLBACK_RIESGO);
  const [oxigenos, setOxigenos] = useState<CatalogoItem[]>([]);
  const [hemoderivados, setHemoderivados] = useState<CatalogoItem[]>([]);
  const [laboratorios, setLaboratorios] = useState<CatalogoItem[]>([]);
  const [estudios, setEstudios] = useState<CatalogoItem[]>([]);
  const [higienes, setHigienes] = useState<CatalogoItem[]>([]);
  const [especialidades, setEspecialidades] = useState<Especialidad[]>([]);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pacienteExpandido, setPacienteExpandido] = useState<string | null>(null);

  const pacienteIds = useMemo(() => renglones.map(r => r.paciente_id), [renglones]);
  const eventos = useEventosApoyo(pacienteIds);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [
        { data: dRiesgo },
        { data: dOxi },
        { data: dHemo },
        { data: dLab },
        { data: dEst },
        { data: dHig },
        { data: dEsp },
      ] = await Promise.all([
        supabase.from('catalogo_riesgo').select('codigo, nombre, color').order('orden'),
        supabase.from('catalogo_oxigeno').select('codigo, nombre').order('orden'),
        supabase.from('catalogo_hemoderivados').select('codigo, nombre').order('orden'),
        supabase.from('catalogo_laboratorios').select('codigo, nombre').order('orden'),
        supabase.from('catalogo_estudios_gabinete').select('codigo, nombre').order('orden'),
        supabase.from('catalogo_higiene').select('codigo, nombre').order('orden'),
        supabase.from('catalogo_especialidades').select('id, nombre').order('nombre'),
      ]);

      if (dRiesgo && dRiesgo.length) setRiesgos(dRiesgo as any);
      if (dOxi && dOxi.length)   setOxigenos(dOxi as any);
      if (dHemo && dHemo.length) setHemoderivados(dHemo as any);
      if (dLab && dLab.length)   setLaboratorios(dLab as any);
      if (dEst && dEst.length)   setEstudios(dEst as any);
      if (dHig && dHig.length)   setHigienes(dHig as any);
      if (dEsp && dEsp.length)   setEspecialidades(dEsp as any);

      const { data, error: err } = await supabase
        .from('v_control_servicio')
        .select('*')
        .eq('servicio_id', servicioId)
        // Orden clínico del subservicio (igual que el censo/PDF), no alfabético.
        .order('subservicio_orden', { nullsFirst: false })
        .order('numero_cama');

      if (err) throw err;
      setRenglones((data || []) as ControlRenglon[]);

      if (data && data.length > 0 && !pacienteExpandido) {
        setPacienteExpandido((data[0] as any).paciente_id);
      }
    } catch (e: any) {
      setError(e.message || 'Error al cargar formato de control');
    } finally {
      setCargando(false);
    }
  }, [servicioId, pacienteExpandido]);

  useEffect(() => { cargar(); }, [cargar]);

  // Guardado de campos legacy que SIGUEN en formato_control_paciente
  // (riesgos, causa_no_ocupacion, traslado, observaciones, dolor_escala)
  const guardarCampo = async (pacienteId: string, campo: string, valor: string | null) => {
    setGuardando(pacienteId);
    setError(null);
    try {
      const update: any = { [campo]: valor || null, actualizado_por: perfil?.id };

      // Caso especial: al cambiar la escala de dolor, también marcamos
      // cuándo se evaluó (para impresión y trazabilidad). Si se limpia,
      // limpiamos también la fecha.
      if (campo === 'dolor_escala') {
        update.dolor_escala = valor === null || valor === '' ? null : parseInt(valor, 10);
        update.dolor_evaluado_en = valor === null || valor === '' ? null : new Date().toISOString();
      }

      const { error: err } = await supabase
        .from('formato_control_paciente')
        .update(update)
        .eq('paciente_id', pacienteId);
      if (err) throw err;
      setRenglones(rs => rs.map(r =>
        r.paciente_id === pacienteId ? { ...r, ...update } as ControlRenglon : r
      ));
    } catch (e: any) {
      setError(`No se pudo guardar: ${e.message}`);
    } finally {
      setGuardando(null);
    }
  };

  // Guardado de campos que viven en la tabla pacientes (grupo_sanguineo,
  // alergias). Mantenemos la firma simétrica a guardarCampo para que los
  // componentes hijos no tengan que conocer el destino.
  const guardarCampoPaciente = async (pacienteId: string, campo: string, valor: string | null) => {
    setGuardando(pacienteId);
    setError(null);
    try {
      const update: any = { [campo]: valor || null };
      const { error: err } = await supabase
        .from('pacientes')
        .update(update)
        .eq('id', pacienteId);
      if (err) throw err;
      setRenglones(rs => rs.map(r =>
        r.paciente_id === pacienteId ? { ...r, [campo]: valor || null } as ControlRenglon : r
      ));
    } catch (e: any) {
      setError(`No se pudo guardar: ${e.message}`);
    } finally {
      setGuardando(null);
    }
  };

  if (cargando) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#265C4E' }}>Cargando formato de control...</div>;
  }

  // ---- Componentes mini para los campos no-evento ----
  // `onGuardar`: permite redirigir el update a otra tabla (p.ej. pacientes
  // en lugar de formato_control_paciente). Default = guardarCampo.
  // IMPORTANTE: estos NO son componentes (intencional). Son helpers que
  // devuelven JSX para inlinearlo en el render del padre. Antes eran
  // componentes declarados dentro del padre, lo que provocaba que React
  // los desmontara/remontara en cada render — el textarea perdía foco
  // cada vez que `guardando` o `pacienteExpandido` cambiaba, y a veces
  // se perdía el texto no-blurreado del usuario.
  const campoDropdownConColor = (
    r: ControlRenglon,
    campo: string,
    label: string,
    opciones: CatalogoItem[],
    onGuardar?: (pid: string, campo: string, valor: string | null) => void,
  ) => {
    const valor = r[campo] != null ? String(r[campo]) : '';
    const sel = opciones.find(o => o.codigo === valor);
    const styleColor: React.CSSProperties = sel?.color
      ? { backgroundColor: sel.color, color: '#fff', fontWeight: 700, borderColor: sel.color }
      : {};
    const save = onGuardar || guardarCampo;
    return (
      <div style={campoContenedor}>
        <label style={campoLabel}>{label}</label>
        <select
          value={valor}
          onChange={e => save(r.paciente_id, campo, e.target.value)}
          style={{ ...input, ...styleColor }}
          disabled={guardando === r.paciente_id}
        >
          <option value="">--</option>
          {opciones.map(o => <option key={o.codigo} value={o.codigo}>{o.codigo} — {o.nombre}</option>)}
        </select>
      </div>
    );
  };

  const campoCausaOcupacion = (r: ControlRenglon, campo: string, label: string) => (
    <div style={campoContenedor}>
      <label style={campoLabel}>{label}</label>
      <select value={r[campo] || ''} onChange={e => guardarCampo(r.paciente_id, campo, e.target.value)}
        style={input} disabled={guardando === r.paciente_id}>
        <option value="">--</option>
        {CAUSAS_NO_OCUPACION.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  const campoTextoLibre = (
    r: ControlRenglon,
    campo: string,
    label: string,
    onGuardar?: (pid: string, campo: string, valor: string | null) => void,
    placeholder?: string,
  ) => {
    const save = onGuardar || guardarCampo;
    return (
      <div style={campoContenedor}>
        <label style={campoLabel}>{label}</label>
        <input type="text" defaultValue={r[campo] || ''}
          onBlur={e => { if (e.target.value !== (r[campo] || '')) save(r.paciente_id, campo, e.target.value); }}
          style={input} disabled={guardando === r.paciente_id} placeholder={placeholder || '--'} />
      </div>
    );
  };

  const eventosDe = (pid: string, tipo: TipoEvento) => eventos.indice[pid]?.[tipo] ?? [];

  // ---- Configuracion UX por tipo de evento ----
  // Continuidad: estados Instalado/Retirado, sin solicitud
  // Done-event minimal: sin estado, sin solicitud (glucemia/higiene)
  // Done-event con obs: sin estado, sin solicitud, con obs (curacion/procedimiento)
  // Event clasico: dropdown completo + solicitud + realizacion (interconsulta/hemoderivado/lab/estudio)
  const PERFIL_CONTINUIDAD = {
    estadosPermitidos: ['Realizada', 'Retirada'] as const,
    etiquetasEstado: { Realizada: 'Instalado', Retirada: 'Retirado' } as const,
    mostrarSolicitud: false,
    mostrarObservaciones: true,
    estadoInicial: 'Realizada' as const,
  };
  const PERFIL_DONE_MINIMAL = {
    mostrarEstado: false,
    mostrarSolicitud: false,
    mostrarObservaciones: false,
    estadoInicial: 'Realizada' as const,
  };
  const PERFIL_DONE_CON_OBS = {
    mostrarEstado: false,
    mostrarSolicitud: false,
    mostrarObservaciones: true,
    estadoInicial: 'Realizada' as const,
  };
  const PERFIL_EVENTO_CLASICO = {
    mostrarEstado: true,
    mostrarSolicitud: true,
    mostrarObservaciones: true,
    estadoInicial: 'Solicitada' as const,
  };

  // Helper que genera las props comunes para EventCardGroup
  const grupoProps = (pid: string, tipo: TipoEvento) => ({
    pacienteId: pid,
    tipo,
    eventos: eventosDe(pid, tipo),
    onCrear: eventos.crear,
    onActualizar: eventos.actualizar,
    onCambiarEstado: eventos.cambiarEstado,
    onCancelar: eventos.cancelar,
    disabled: !perfil,
  });

  const interconsultaOpciones = especialidades.map(e => ({ codigo: e.nombre, nombre: e.nombre }));

  // Oxigenoterapia: VM (ventilacion mecanica) NO debe aparecer aqui — es un
  // dispositivo, no una modalidad de oxigeno. Pertenece a la seccion
  // VENTILACIÓN / DISPOSITIVOS.
  const oxigenoOpciones = oxigenos.filter(o => o.codigo !== 'VM');

  return (
    <div>
      <div style={{ ...cabeceraBanda, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ flex: 1, textAlign: 'center' }}>
          FORMATO DE CONTROL — INTERVENCIONES DE ENFERMERÍA
        </span>
        <button
          onClick={() => window.open(`/imprimir/control/${servicioId}?auto=0`, '_blank', 'noopener,noreferrer')}
          title="Abrir vista de impresión del Formato de Control"
          style={{ background: '#fff', color: '#0E6755', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >🖨️ Imprimir Control</button>
      </div>

      {error && <div style={errorBanner}>⚠️ {error}</div>}
      {eventos.error && <div style={errorBanner}>⚠️ Eventos: {eventos.error}</div>}

      {renglones.length === 0 ? (
        <div style={vacio}>No hay pacientes activos en este servicio.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {renglones.map(r => {
            const expandido = pacienteExpandido === r.paciente_id;
            return (
              <div key={r.paciente_id} style={tarjeta}>
                <div style={tarjetaHeader} onClick={() => setPacienteExpandido(expandido ? null : r.paciente_id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={camaNumero}>{r.numero_cama}</div>
                    <div>
                      <div style={pacienteNombre}>{r.nombre_paciente}</div>
                      <div style={pacienteSub}>
                        {r.subservicio} · {formatEdadInline(r.edad, r.edad_unidad)} · {r.genero?.substring(0, 4)}
                        {r.nss_curp && (
                          <> · <strong>NSS/CURP:</strong> {r.nss_curp}</>
                        )}
                        {r.fecha_nacimiento && (
                          <> · <strong>F. Nac:</strong> {formatearFechaNac(r.fecha_nacimiento)}</>
                        )}
                        {!r.nss_curp && !r.fecha_nacimiento && (
                          <> · <em style={{ color: '#A32D2D' }}>Sin NSS/CURP ni fecha de nacimiento — actualiza en Censo</em></>
                        )}
                        <br />
                        <span style={{ color: '#7d5b2f' }}>Dx: {r.diagnostico_ingreso}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 20, color: '#0E6755' }}>{expandido ? '▼' : '▶'}</div>
                </div>

                {expandido && (
                  <div style={tarjetaBody}>

                    {/* ACCESOS VASCULARES + VENTILACION */}
                    <div style={seccion}>
                      <div style={{ ...seccionTitulo, background: '#1a5f8a' }}>
                        ACCESOS VASCULARES Y VENTILACIÓN
                      </div>
                      <div style={gridGrupos}>
                        <EventCardGroup
                          {...grupoProps(r.paciente_id, 'acceso_vascular')}
                          {...PERFIL_CONTINUIDAD}
                          estadosPermitidos={[...PERFIL_CONTINUIDAD.estadosPermitidos]}
                          etiquetasEstado={{ ...PERFIL_CONTINUIDAD.etiquetasEstado }}
                          label="Accesos vasculares"
                          opciones={ACCESO_VASCULAR_OPCIONES}
                        />
                        <EventCardGroup
                          {...grupoProps(r.paciente_id, 'dispositivo')}
                          {...PERFIL_CONTINUIDAD}
                          estadosPermitidos={[...PERFIL_CONTINUIDAD.estadosPermitidos]}
                          etiquetasEstado={{ ...PERFIL_CONTINUIDAD.etiquetasEstado }}
                          label="Ventilación / dispositivos"
                          opciones={DISPOSITIVO_OPCIONES}
                        />
                      </div>
                    </div>

                    {/* SONDAS */}
                    <div style={seccion}>
                      <div style={{ ...seccionTitulo, background: '#0E6755' }}>SONDAS Y CATÉTERES URINARIOS</div>
                      <div style={gridGrupos}>
                        <EventCardGroup
                          {...grupoProps(r.paciente_id, 'sonda')}
                          {...PERFIL_CONTINUIDAD}
                          estadosPermitidos={[...PERFIL_CONTINUIDAD.estadosPermitidos]}
                          etiquetasEstado={{ ...PERFIL_CONTINUIDAD.etiquetasEstado }}
                          label="Sondas"
                          opciones={SONDA_OPCIONES}
                        />
                      </div>
                    </div>

                    {/* PROCEDIMIENTOS Y CURACIONES */}
                    <div style={seccion}>
                      <div style={{ ...seccionTitulo, background: '#7d5b2f' }}>PROCEDIMIENTOS Y CURACIONES</div>
                      <div style={gridGrupos}>
                        <EventCardGroup
                          {...grupoProps(r.paciente_id, 'procedimiento')}
                          {...PERFIL_DONE_CON_OBS}
                          label="Procedimientos"
                          opciones={PROCEDIMIENTO_OPCIONES}
                        />
                        <EventCardGroup
                          {...grupoProps(r.paciente_id, 'curacion')}
                          {...PERFIL_DONE_CON_OBS}
                          label="Curaciones"
                          opciones={CURACION_OPCIONES}
                        />
                      </div>
                    </div>

                    {/* RIESGOS Y CAUSA NO OCUPACION (legacy) */}
                    <div style={seccion}>
                      <div style={{ ...seccionTitulo, background: '#A32D2D' }}>
                        RIESGOS Y AISLAMIENTO <span style={infoChip}>riesgos legacy · aislamiento como evento</span>
                      </div>
                      <div style={camposGrid}>
                        {campoDropdownConColor(r, "riesgo_upp", "Riesgo UPP", riesgos)}
                        {campoDropdownConColor(r, "riesgo_caidas", "Riesgo de caídas", riesgos)}
                        {campoCausaOcupacion(r, "causa_no_ocupacion", "Causa no ocupación")}
                      </div>
                      <div style={gridGrupos}>
                        <EventCardGroup
                          {...grupoProps(r.paciente_id, 'precaucion_aislamiento')}
                          {...PERFIL_CONTINUIDAD}
                          estadosPermitidos={[...PERFIL_CONTINUIDAD.estadosPermitidos]}
                          etiquetasEstado={{ ...PERFIL_CONTINUIDAD.etiquetasEstado }}
                          label="Aislamiento"
                          opciones={AISLAMIENTO_OPCIONES}
                          maxEventos={1}
                        />
                      </div>
                    </div>

                    {/* APOYOS Y ESTUDIOS */}
                    <div style={seccion}>
                      <div style={{ ...seccionTitulo, background: '#5a4a8a' }}>
                        APOYOS Y ESTUDIOS <span style={infoChip}>cada evento con estado y fechas</span>
                      </div>
                      <div style={gridGrupos}>
                        <EventCardGroup
                          {...grupoProps(r.paciente_id, 'interconsulta')}
                          {...PERFIL_EVENTO_CLASICO}
                          etiquetasEstado={{ Solicitada: 'Ordenada' }}
                          estadosCreacion={['Solicitada', 'Pendiente', 'Realizada']}
                          label="Interconsultas"
                          opciones={interconsultaOpciones}
                          maxEventos={10}
                        />
                        <EventCardGroup
                          {...grupoProps(r.paciente_id, 'hemoderivado')}
                          {...PERFIL_EVENTO_CLASICO}
                          label="Hemoderivados"
                          opciones={hemoderivados}
                          maxEventos={10}
                        />
                        <EventCardGroup
                          {...grupoProps(r.paciente_id, 'laboratorio')}
                          {...PERFIL_EVENTO_CLASICO}
                          label="Laboratorios"
                          opciones={laboratorios}
                          maxEventos={20}
                        />
                        <EventCardGroup
                          {...grupoProps(r.paciente_id, 'estudio_gabinete')}
                          {...PERFIL_EVENTO_CLASICO}
                          label="Estudios de gabinete"
                          opciones={estudios}
                          maxEventos={10}
                        />
                        <EventCardGroup
                          {...grupoProps(r.paciente_id, 'oxigeno')}
                          {...PERFIL_CONTINUIDAD}
                          estadosPermitidos={[...PERFIL_CONTINUIDAD.estadosPermitidos]}
                          etiquetasEstado={{ ...PERFIL_CONTINUIDAD.etiquetasEstado }}
                          label="Oxigenoterapia"
                          opciones={oxigenoOpciones}
                        />
                        <EventCardGroup
                          {...grupoProps(r.paciente_id, 'higiene')}
                          {...PERFIL_DONE_MINIMAL}
                          label="Higiene"
                          opciones={higienes}
                        />
                        <EventCardGroup
                          {...grupoProps(r.paciente_id, 'glucemia')}
                          {...PERFIL_DONE_MINIMAL}
                          label="Glucemia capilar"
                          opciones={GLUCEMIA_OPCIONES}
                          permitirDuplicados
                          maxEventos={20}
                        />
                      </div>
                      <div style={camposGrid}>
                        {campoTextoLibre(r, "traslado", "Traslado (texto libre)")}
                      </div>
                    </div>

                    {/* TARJETA DE IDENTIFICACIÓN — datos persistentes que alimentan
                        /imprimir/ficha/:pacienteId. Grupo y alergias viven en pacientes.
                        La escala del dolor se captura al INGRESO (Censo), no aquí. */}
                    <div style={seccion}>
                      <div style={{ ...seccionTitulo, background: '#5b3a8a' }}>
                        TARJETA DE IDENTIFICACIÓN <span style={infoChip}>alimenta la ficha impresa 🪪</span>
                      </div>
                      <div style={camposGrid}>
                        {campoDropdownConColor(r, "grupo_sanguineo", "Grupo y RH", GRUPO_SANGUINEO_OPCIONES, guardarCampoPaciente)}
                        {campoTextoLibre(r, "alergias", "Alergias (NO = vacío)", guardarCampoPaciente, "Ej. Penicilina, AINEs")}
                      </div>
                      <div style={{ padding: '0 8px 8px', fontSize: 10, color: '#888' }}>
                        💡 Estos datos se imprimen automáticamente en la Tarjeta de Identificación (🪪).
                      </div>
                    </div>

                    {/* OBSERVACIONES */}
                    <div style={seccion}>
                      <div style={{ ...seccionTitulo, background: '#888' }}>OBSERVACIONES GENERALES</div>
                      <div style={{ padding: 8 }}>
                        <textarea defaultValue={r.observaciones || ''}
                          onBlur={e => { if (e.target.value !== (r.observaciones || '')) guardarCampo(r.paciente_id, 'observaciones', e.target.value); }}
                          style={{ ...input, minHeight: 60, resize: 'vertical' }}
                          disabled={guardando === r.paciente_id}
                          placeholder="Notas, eventos del turno, situaciones especiales..." />
                      </div>
                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={piePagina}>
        {renglones.length} paciente{renglones.length === 1 ? '' : 's'} activo{renglones.length === 1 ? '' : 's'}
        {eventos.cargando && <span style={{ marginLeft: 16, color: '#5a4a8a' }}>📋 Cargando eventos...</span>}
        {guardando && <span style={{ marginLeft: 16, color: '#C39C59' }}>💾 Guardando...</span>}
      </div>
    </div>
  );
};

// ---- estilos ----
const cabeceraBanda: React.CSSProperties = { background: '#0E6755', color: '#fff', padding: '8px 16px', fontWeight: 700, fontSize: 14, letterSpacing: 1, borderRadius: 4, textAlign: 'center', marginBottom: 12 };
const tarjeta: React.CSSProperties = { border: '1px solid #C39C59', borderRadius: 6, background: '#fff', overflow: 'hidden' };
const tarjetaHeader: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#F5F1E8', borderBottom: '1px solid #C39C59', cursor: 'pointer' };
const camaNumero: React.CSSProperties = { width: 50, height: 50, background: '#0E6755', color: '#fff', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700 };
const pacienteNombre: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: '#265C4E', marginBottom: 2 };
const pacienteSub: React.CSSProperties = { fontSize: 11, color: '#888', lineHeight: 1.4 };
const tarjetaBody: React.CSSProperties = { padding: 12, background: '#fdfaf2' };
const seccion: React.CSSProperties = { marginBottom: 10, border: '1px solid #e8dfc6', borderRadius: 4, overflow: 'hidden', background: '#fff' };
const seccionTitulo: React.CSSProperties = { color: '#fff', padding: '6px 10px', fontSize: 11, fontWeight: 700, letterSpacing: 1 };
const infoChip: React.CSSProperties = { fontSize: 9, background: 'rgba(255,255,255,0.25)', padding: '1px 6px', borderRadius: 8, marginLeft: 6, fontWeight: 500 };
const camposGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8, padding: 8 };
const gridGrupos: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8, padding: 8 };
const campoContenedor: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };
const campoLabel: React.CSSProperties = { fontSize: 10, color: '#265C4E', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 };
const input: React.CSSProperties = { width: '100%', padding: '6px 8px', border: '1px solid #C39C59', borderRadius: 4, fontSize: 12, background: '#fff', color: '#265C4E', fontFamily: 'inherit' };
const errorBanner: React.CSSProperties = { background: '#fdecea', color: '#A32D2D', padding: '10px 16px', borderRadius: 4, marginBottom: 12, fontSize: 13 };
const vacio: React.CSSProperties = { padding: 40, textAlign: 'center', color: '#888', background: '#fff', border: '1px solid #C39C59', borderRadius: 4 };
const piePagina: React.CSSProperties = { padding: '8px 16px', fontSize: 12, color: '#888', textAlign: 'right' };
