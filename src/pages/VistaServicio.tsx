// src/pages/VistaServicio.tsx
// Vista de cada servicio con menú de pestañas:
// Censo · Dietas · Recetario · Control · Productividad
// PARCHE v4.3 — sección colapsable "Egresados Recientes"
// PARCHE v4.4 — soporte visual para camillas NO CENSABLES (badge + estilo)
// PARCHE v4.5 — secciones separadas: censables arriba, camillas no censables abajo
//               + contador dual "X de N censables · Y de M camillas"
// PARCHE v4.6 — columna DIAGNÓSTICO en tabla de egresados recientes
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { ModalIngreso } from './components/ModalIngreso';
import { ModalEgreso } from './components/ModalEgreso';
import { ModalAsignarEnfermero } from './components/ModalAsignarEnfermero';
import { ModalGestionCama } from './components/ModalGestionCama';
import { ModalTraslado } from './components/ModalTraslado';
import { MenuPestanas, Pestana } from './components/MenuPestanas';
import { VistaDietas } from './components/VistaDietas';
import { VistaRecetario } from './components/VistaRecetario';
import { VistaFormatoControl } from './components/VistaFormatoControl';
import { VistaProductividad } from './components/VistaProductividad';
import { VistaERC } from './components/VistaERC';

interface Servicio {
  id: number;
  codigo: string;
  nombre: string;
}

interface CamaEstado {
  cama_id: number;
  subservicio_id: number;
  subservicio: string;
  numero_cama: string;
  es_censable: boolean;
  paciente_id: string | null;
  nombre_paciente: string | null;
  edad: number | null;
  genero: string | null;
  diagnostico_ingreso: string | null;
  fecha_ingreso: string | null;
  // Datos clínicos para la Tarjeta de Identificación 🪪 — capturados al
  // ingreso o luego en la pestaña Control. Si están presentes, la card
  // muestra un chip ⚠️ ALERGIA (seguridad al primer vistazo).
  grupo_sanguineo?: string | null;
  alergias?: string | null;
  // Riesgos: evaluación inicial se hace en el modal de Ingreso, se reevalúa
  // en la pestaña Control. La cama muestra chips de Caídas y UPP.
  riesgo_caidas?: string | null;
  riesgo_upp?: string | null;
  // Bloqueo de cama (no ocupable sin paciente). Si está bloqueada, la
  // cama se muestra en gris con su causa en lugar del estado "Libre".
  cama_bloqueada?: boolean;
  cama_causa_no_ocupacion?: string | null;
  cama_nota_no_ocupacion?: string | null;
  cama_bloqueada_desde?: string | null;
}

// Trazabilidad — completitud por paciente desde v_paciente_completitud_dia
interface Completitud {
  tiene_dieta: boolean;
  tiene_receta: boolean;
  tiene_control: boolean;
}

// PARCHE v4.3 — Tipo para pacientes egresados (sección colapsable inferior)
// PARCHE v4.6 — Se agrega diagnostico_ingreso para mostrarlo en la tabla
interface Egresado {
  paciente_id: string;
  numero_cama: string;
  subservicio: string;
  nombre_paciente: string;
  edad: number;
  diagnostico_ingreso: string | null;
  genero: string;
  fecha_ingreso: string;
  fecha_egreso: string;
  hora_egreso: string;
  motivo_nombre: string;
  destino_egreso: string | null;
  dias_estancia: number | null;
  egresado_por_nombre: string | null;
}

// PERF — Caché de datos por servicio (sobrevive desmonte del componente)
// TTL corto: 30s — equilibrio entre velocidad y frescura en un censo hospitalario
type ServiceCacheData = {
  servicio: Servicio;
  camas: CamaEstado[];
  egresados: Egresado[];
  asignaciones: Record<string, { nombre: string; codigo: string }>;
  completitud: Record<string, Completitud>;
  fetchedAt: number;
};
const CACHE_TTL_MS = 30_000;
const servicioCache = new Map<number, ServiceCacheData>();

function leerCache(servicioId: number): ServiceCacheData | null {
  const entry = servicioCache.get(servicioId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    servicioCache.delete(servicioId);
    return null;
  }
  return entry;
}

export function VistaServicio() {
  const { servicioId } = useParams<{ servicioId: string }>();
  const navigate = useNavigate();
  const { perfil } = useAuth();

  // Enfermeria de piso solo tiene acceso de LECTURA al censo
  // (no puede ingresar ni egresar pacientes)
  const censoSoloLectura = perfil?.rol === 'enfermera';

  const servicioIdNum = servicioId ? parseInt(servicioId, 10) : null;

  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [camas, setCamas] = useState<CamaEstado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>('censo');

  const [modalIngreso, setModalIngreso] = useState<{ camaId: number; subservicioId: number; numeroCama: string } | null>(null);
  const [modalEgreso, setModalEgreso] = useState<{ pacienteId: string; numeroCama: string; nombre: string; fechaIngreso: string } | null>(null);
  // Modal selector cuando se hace clic en cama vacía: ingresar paciente o
  // bloquear la cama como NO OCUPABLE. También sirve para ver/cambiar el
  // bloqueo actual y liberar la cama.
  const [modalGestionCama, setModalGestionCama] = useState<CamaEstado | null>(null);
  // Modal de traslado a otra cama del hospital.
  const [modalTraslado, setModalTraslado] = useState<CamaEstado | null>(null);
  const [modalAsignar, setModalAsignar] = useState<{ pacienteId: string; nombre: string; numeroCama: string } | null>(null);
  const [asignaciones, setAsignaciones] = useState<Record<string, { nombre: string; codigo: string }>>({});

  // Trazabilidad — mapa paciente_id -> flags de completitud del día
  const [completitud, setCompletitud] = useState<Record<string, Completitud>>({});

  // PARCHE v4.3 — Estado para sección Egresados
  const [egresados, setEgresados] = useState<Egresado[]>([]);
  const [egresadosAbiertos, setEgresadosAbiertos] = useState(false);

  // PARCHE v4.5 — Estado para sección Camillas (NO CENSABLES)
  const [camillasAbiertas, setCamillasAbiertas] = useState(true);

  const cargar = useCallback(async (force = false) => {
    if (!servicioIdNum) return;
    // PERF — Cache hit: hidratar estado y salir (sin red)
    if (!force) {
      const cached = leerCache(servicioIdNum);
      if (cached) {
        setServicio(cached.servicio);
        setCamas(cached.camas);
        setEgresados(cached.egresados);
        setAsignaciones(cached.asignaciones);
        setCompletitud(cached.completitud);
        setCargando(false);
        setError(null);
        return;
      }
    }
    setCargando(true);
    setError(null);
    try {
      // Validar sesión activa antes de pedir datos — si el JWT expiró
      // las queries no fallan con error claro, solo se quedan colgadas.
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        throw new Error('Tu sesión expiró. Cierra sesión y vuelve a iniciar para continuar.');
      }

      // Timeout duro de 20s en las queries paralelas. En 4G mobile a veces
      // Supabase tarda y dejaba al usuario viendo "Cargando servicio..."
      // indefinidamente. Mejor cortar y permitir reintento.
      const timeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
        Promise.race([
          p,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`Tiempo de espera agotado (${label}). Revisa tu conexión y reintenta.`)), ms)
          ),
        ]);

      // PERF — 4 consultas en paralelo + completitud en segundo turno.
      // La 5a (completitud) NECESITA los paciente_ids del servicio para
      // no traerse TODO el hospital cada vez. Se ejecuta justo después
      // de tener las camas, antes de cualquier set de estado.
      const [servRes, camasRes, egrRes, asigRes] = await timeout(Promise.all([
        supabase
          .from('servicios')
          .select('id, codigo, nombre')
          .eq('id', servicioIdNum)
          .single(),
        supabase
          .from('v_camas_estado')
          .select('*')
          .eq('servicio_id', servicioIdNum)
          .order('subservicio')
          .order('numero_cama_sort'),
        supabase
          .from('v_egresados_servicio')
          .select('*')
          .eq('servicio_id', servicioIdNum)
          .order('fecha_egreso', { ascending: false })
          .order('hora_egreso', { ascending: false })
          .limit(50),
        supabase
          .from('v_asignaciones_actuales')
          .select('paciente_id, enfermero_nombre, categoria_codigo')
          .eq('servicio_id', servicioIdNum)
          .not('enfermero_nombre', 'is', null),
      ]), 20000, 'carga del servicio');

      // Críticas: servicio y camas
      if (servRes.error) throw servRes.error;
      if (camasRes.error) throw camasRes.error;
      setServicio(servRes.data);
      setCamas(camasRes.data || []);

      // Completitud filtrada por los pacientes de este servicio.
      const pacienteIdsServicio = (camasRes.data || [])
        .map((c: any) => c.paciente_id)
        .filter(Boolean) as string[];
      const complRes = pacienteIdsServicio.length === 0
        ? { data: [] as any[], error: null as any }
        : await supabase
            .from('v_paciente_completitud_dia')
            .select('paciente_id, tiene_dieta, tiene_receta, tiene_control')
            .in('paciente_id', pacienteIdsServicio);

      // PARCHE v4.3 — Egresados (degradación elegante si falla)
      if (egrRes.error) {
        console.warn('No se pudieron cargar egresados:', egrRes.error.message);
        setEgresados([]);
      } else {
        setEgresados((egrRes.data || []) as Egresado[]);
      }

      // BLOQUE 8 — Asignaciones del turno actual
      if (asigRes.error) {
        console.warn('No se pudieron cargar asignaciones:', asigRes.error.message);
        setAsignaciones({});
      } else {
        const mapa: Record<string, { nombre: string; codigo: string }> = {};
        (asigRes.data || []).forEach((row: any) => {
          mapa[row.paciente_id] = {
            nombre: row.enfermero_nombre,
            codigo: row.categoria_codigo
          };
        });
        setAsignaciones(mapa);
      }

      // Trazabilidad — completitud del día
      let mapaCompletitud: Record<string, Completitud> = {};
      if (complRes.error) {
        console.warn('No se pudo cargar completitud:', complRes.error.message);
        setCompletitud({});
      } else {
        (complRes.data || []).forEach((row: any) => {
          mapaCompletitud[row.paciente_id] = {
            tiene_dieta: !!row.tiene_dieta,
            tiene_receta: !!row.tiene_receta,
            tiene_control: !!row.tiene_control,
          };
        });
        setCompletitud(mapaCompletitud);
      }

      // PERF — Guardar en caché para próximas visitas (TTL 30s)
      const asignacionesParaCache: Record<string, { nombre: string; codigo: string }> = {};
      (asigRes.data || []).forEach((row: any) => {
        if (row.enfermero_nombre) {
          asignacionesParaCache[row.paciente_id] = {
            nombre: row.enfermero_nombre,
            codigo: row.categoria_codigo
          };
        }
      });
      servicioCache.set(servicioIdNum, {
        servicio: servRes.data,
        camas: camasRes.data || [],
        egresados: egrRes.error ? [] : ((egrRes.data || []) as Egresado[]),
        asignaciones: asignacionesParaCache,
        completitud: mapaCompletitud,
        fetchedAt: Date.now(),
      });
    } catch (e: any) {
      setError(e.message || 'Error al cargar el servicio');
    } finally {
      setCargando(false);
    }
  }, [servicioIdNum]);

  useEffect(() => { cargar(); }, [cargar]);

  // Refrescar completitud al regresar al censo — captura hecha en otra pestaña
  // (Dietas/Recetario/Control) se refleja en los chips sin recargar todo.
  // Filtramos por pacientes del servicio actual (antes traía TODO el hospital).
  useEffect(() => {
    if (pestana !== 'censo' || !servicioIdNum) return;
    let cancelado = false;
    const pacienteIdsServicio = camas
      .map(c => c.paciente_id)
      .filter(Boolean) as string[];
    if (pacienteIdsServicio.length === 0) return;
    (async () => {
      const { data, error } = await supabase
        .from('v_paciente_completitud_dia')
        .select('paciente_id, tiene_dieta, tiene_receta, tiene_control')
        .in('paciente_id', pacienteIdsServicio);
      if (cancelado || error) {
        if (error) console.warn('Refresco de completitud falló:', error.message);
        return;
      }
      const mapaC: Record<string, Completitud> = {};
      (data || []).forEach((row: any) => {
        mapaC[row.paciente_id] = {
          tiene_dieta: !!row.tiene_dieta,
          tiene_receta: !!row.tiene_receta,
          tiene_control: !!row.tiene_control,
        };
      });
      setCompletitud(mapaC);
      // PERF — sincronizar con el caché para que próximas visitas vean los chips frescos
      const cached = servicioCache.get(servicioIdNum);
      if (cached) {
        servicioCache.set(servicioIdNum, { ...cached, completitud: mapaC, fetchedAt: Date.now() });
      }
    })();
    return () => { cancelado = true; };
  }, [pestana, servicioIdNum, camas]);

  const onCamaClick = (cama: CamaEstado) => {
    // Enfermeria: lectura. Click no abre modales de ingreso/egreso.
    if (censoSoloLectura) return;
    if (cama.paciente_id) {
      setModalEgreso({
        pacienteId: cama.paciente_id,
        numeroCama: cama.numero_cama,
        nombre: cama.nombre_paciente || '',
        fechaIngreso: cama.fecha_ingreso || '',
      });
    } else {
      // Cama vacía o bloqueada: abrimos el selector. Desde ahí se elige
      // ingreso o bloqueo, o se libera si ya estaba bloqueada.
      setModalGestionCama(cama);
    }
  };

  // PARCHE v4.5 — Separar camas en dos grupos: censables y no censables (camillas)
  // PERF — memoizar particiones para no rebuscar 4 veces sobre camas en
  // cada render del componente.
  //
  // IMPORTANTE: este useMemo va ANTES de los early returns (cargando/error)
  // para no violar Rules of Hooks. Antes estaba después y al cambiar
  // `cargando` de true→false React detectaba "rendered more hooks than
  // during previous render" → error #310 → pantalla en blanco.
  const { camasCensables, camasNoCensables, ocupadasCensables, totalCensables, ocupadasCamillas, totalCamillas } = useMemo(() => {
    const cens: CamaEstado[] = [];
    const ncens: CamaEstado[] = [];
    let ocup = 0;
    let ocupC = 0;
    for (const c of camas) {
      if (c.es_censable) {
        cens.push(c);
        if (c.paciente_id) ocup++;
      } else {
        ncens.push(c);
        if (c.paciente_id) ocupC++;
      }
    }
    return {
      camasCensables: cens,
      camasNoCensables: ncens,
      ocupadasCensables: ocup,
      totalCensables: cens.length,
      ocupadasCamillas: ocupC,
      totalCamillas: ncens.length,
    };
  }, [camas]);

  if (cargando) {
    return (
      <div style={contenedor}>
        <div style={{ padding: 40, textAlign: 'center', color: '#265C4E' }}>
          Cargando servicio...
          <div style={{ marginTop: 24, fontSize: 12, color: '#888' }}>
            Si tarda más de 20 segundos, revisa tu conexión y toca el botón ↻ recargar de tu navegador.
          </div>
        </div>
      </div>
    );
  }

  if (error || !servicio) {
    return (
      <div style={contenedor}>
        <div style={{ padding: 40, textAlign: 'center', color: '#A32D2D', whiteSpace: 'pre-wrap' }}>{error || 'Servicio no encontrado'}</div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
          <button onClick={() => cargar(true)} style={{ ...botonVolver, background: '#0E6755', color: '#fff', border: 'none' }}>↻ Reintentar</button>
          <button onClick={() => navigate('/')} style={botonVolver}>← Volver al tablero</button>
        </div>
      </div>
    );
  }

  // Función auxiliar para renderizar una tarjeta de cama
  const renderCama = (c: CamaEstado) => {
    const ocupada = !!c.paciente_id;
    const noCensable = !c.es_censable;
    return (
      <button
        key={c.cama_id}
        onClick={() => onCamaClick(c)}
        style={{
          ...camaCard,
          ...(ocupada ? camaOcupada : c.cama_bloqueada ? camaBloqueada : camaLibre),
          ...(noCensable ? camaNoCensable : {}),
          cursor: censoSoloLectura ? 'default' : 'pointer',
        }}
      >
        {noCensable && <div style={badgeNoCensable}>📋 NO CENSABLE</div>}
        <div style={camaNumero}>{c.numero_cama}</div>
        {ocupada ? (
          <>
            <div style={camaNombre}>{c.nombre_paciente}</div>
            {/* Aviso de seguridad clínica: si tiene alergias capturadas, las
                pintamos en rojo arriba del diagnóstico para que cualquier
                enfermera o médico que abra el censo las vea al instante.
                Se sincroniza con la Tarjeta de Identificación 🪪. */}
            {c.alergias && c.alergias.trim() && (
              <div style={alergiaChip} title={`Alergias: ${c.alergias}`}>
                ⚠️ ALERGIA: {c.alergias}
              </div>
            )}
            {/* Chips de trazabilidad de riesgos. La evaluación inicial se
                hace en el ingreso (modal Censo) y se reevalúa en la pestaña
                Control. Solo se pintan si están capturados. */}
            {(c.riesgo_caidas || c.riesgo_upp) && (
              <div style={riesgosRow}>
                {c.riesgo_caidas && (
                  <span
                    style={chipRiesgo(c.riesgo_caidas)}
                    title={`Riesgo de caídas: ${c.riesgo_caidas}`}
                  >🚶 {c.riesgo_caidas}</span>
                )}
                {c.riesgo_upp && (
                  <span
                    style={chipRiesgo(c.riesgo_upp)}
                    title={`Riesgo úlcera por presión: ${c.riesgo_upp}`}
                  >🛏️ {c.riesgo_upp}</span>
                )}
              </div>
            )}
            <div style={camaDx}>{c.diagnostico_ingreso}</div>
            {/* Trazabilidad — chips de completitud del día (dieta/receta/control) */}
            {(() => {
              const comp = c.paciente_id ? completitud[c.paciente_id] : undefined;
              const goTo = (p: Pestana) => (e: React.MouseEvent) => {
                e.stopPropagation();
                setPestana(p);
              };
              return (
                <div style={chipsRow}>
                  <span
                    style={chip(!!comp?.tiene_dieta)}
                    onClick={goTo('dietas')}
                    title={comp?.tiene_dieta ? 'Dieta capturada' : 'Sin dieta — click para capturar'}
                  >🍽️</span>
                  <span
                    style={chip(!!comp?.tiene_receta)}
                    onClick={goTo('recetario')}
                    title={comp?.tiene_receta ? 'Recetario con medicamentos' : 'Sin receta — click para capturar'}
                  >💊</span>
                  <span
                    style={chip(!!comp?.tiene_control)}
                    onClick={goTo('control')}
                    title={comp?.tiene_control ? 'Formato de control capturado' : 'Sin control — click para capturar'}
                  >📋</span>
                  <span
                    style={chip(true)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (c.paciente_id) {
                        window.open(`/imprimir/ficha/${c.paciente_id}`, '_blank', 'noopener,noreferrer');
                      }
                    }}
                    title="Imprimir Tarjeta de Identificación"
                  >🪪</span>
                  {/* Trasladar: cambia el paciente a otra cama. Si es otro
                      subservicio, cuenta como egreso/ingreso. */}
                  {!censoSoloLectura && (
                    <span
                      style={chip(true)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setModalTraslado(c);
                      }}
                      title="Trasladar paciente a otra cama"
                    >🔀</span>
                  )}
                </div>
              );
            })()}
            <div style={camaSubservicio}>{c.subservicio}</div>
            {/* BLOQUE 8 - Badge de enfermero asignado */}
            {(() => {
              const asig = c.paciente_id ? asignaciones[c.paciente_id] : null;
              const puedeAsignar = perfil && ['jefe','subjefe','supervisor','gestor'].includes(perfil.rol);
              const estilo = asig ? badgeEnfermero : badgeSinAsignar;
              return (
                <div
                  style={{ ...estilo, cursor: puedeAsignar ? 'pointer' : 'default' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (puedeAsignar && c.paciente_id) {
                      setModalAsignar({
                        pacienteId: c.paciente_id,
                        nombre: c.nombre_paciente || '',
                        numeroCama: c.numero_cama,
                      });
                    }
                  }}
                  title={puedeAsignar ? 'Click para asignar/cambiar enfermero' : ''}
                >
                  {asig
                    ? `👤 ${asig.nombre} (${asig.codigo})`
                    : '👤 Sin asignar'}
                </div>
              );
            })()}
          </>
        ) : c.cama_bloqueada ? (
          // Cama bloqueada (no ocupable): mostrar causa en rojo en lugar
          // del estado DISPONIBLE. Sigue siendo clicable para liberar o
          // cambiar la causa.
          <>
            <div style={camaBloqueadaLabel}>🚫 NO OCUPABLE</div>
            <div style={camaCausaTexto} title={c.cama_nota_no_ocupacion || c.cama_causa_no_ocupacion || ''}>
              {c.cama_causa_no_ocupacion}
            </div>
            <div style={camaSubservicio}>{c.subservicio}</div>
          </>
        ) : (
          <>
            <div style={camaLibreLabel}>DISPONIBLE</div>
            <div style={camaSubservicio}>{c.subservicio}</div>
          </>
        )}
      </button>
    );
  };

  return (
    <div style={contenedor}>
      <div style={header}>
        <button onClick={() => navigate('/')} style={botonVolver}>← Tablero</button>
        <div>
          <h1 style={titulo}>{servicio.nombre}</h1>
          <div style={subtitulo}>
            <span style={{ fontWeight: 600, color: '#0E6755' }}>
              {ocupadasCensables} de {totalCensables} censables
            </span>
            {totalCamillas > 0 && (
              <>
                <span style={{ margin: '0 8px', color: '#C39C59' }}>·</span>
                <span style={{ fontWeight: 600, color: '#7d5b2f' }}>
                  {ocupadasCamillas} de {totalCamillas} camillas
                </span>
              </>
            )}
          </div>
        </div>
        <div style={{ width: 100 }} />
      </div>

      <MenuPestanas
        pestanaActiva={pestana}
        onCambio={setPestana}
        servicioCodigo={servicio.codigo}
      />

      {pestana === 'censo' && (
        <>
          {censoSoloLectura && (
            <div style={{ background: '#fff7e0', color: '#7d5b2f', padding: '8px 14px', borderRadius: 4, margin: '0 0 10px', fontSize: 12, border: '1px solid #C39C59' }}>
              📖 Censo en modo solo lectura — Solo ves los pacientes asignados a ti en este turno. El ingreso y egreso lo realiza el gestor del servicio.
            </div>
          )}
          {/* Sección 1: camas censables */}
          <div style={camasGrid}>
            {camasCensables.map(renderCama)}
          </div>

          {/* Sección 2: camillas NO CENSABLES (colapsable) */}
          {totalCamillas > 0 && (
            <div style={camillasWrap}>
              <button
                onClick={() => setCamillasAbiertas(!camillasAbiertas)}
                style={camillasToggle}
              >
                <span>{camillasAbiertas ? '▼' : '▶'} 📋 CAMILLAS NO CENSABLES</span>
                <span style={camillasInfo}>
                  {ocupadasCamillas} de {totalCamillas} ocupadas
                </span>
              </button>
              {camillasAbiertas && (
                <div style={camillasBody}>
                  <div style={camillasAviso}>
                    Estas camas <strong>NO cuentan</strong> en el % de ocupación oficial,
                    pero sí registran ingresos, egresos, dispositivos y productividad de enfermería.
                  </div>
                  <div style={camasGrid}>
                    {camasNoCensables.map(renderCama)}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* PARCHE v4.3 — Sección colapsable de egresados (sólo en pestaña Censo) */}
      {pestana === 'censo' && (
        <div style={egresadosWrap}>
          <button
            onClick={() => setEgresadosAbiertos(!egresadosAbiertos)}
            style={egresadosToggle}
          >
            <span>{egresadosAbiertos ? '▼' : '▶'} 🚪 EGRESADOS RECIENTES</span>
            <span style={egresadosCount}>{egresados.length}</span>
          </button>
          {egresadosAbiertos && (
            <div style={egresadosBody}>
              {egresados.length === 0 ? (
                <div style={egresadosVacio}>Sin egresos registrados en este servicio.</div>
              ) : (
                <table style={egresadosTabla}>
                  <thead>
                    <tr style={egresadosThRow}>
                      <th style={egresadosTh}>CAMA</th>
                      <th style={egresadosTh}>NOMBRE</th>
                      <th style={egresadosTh}>EDAD</th>
                      <th style={egresadosTh}>DIAGNÓSTICO</th>
                      <th style={egresadosTh}>INGRESO</th>
                      <th style={egresadosTh}>EGRESO</th>
                      <th style={egresadosTh}>MOTIVO</th>
                      <th style={egresadosTh}>DESTINO</th>
                      <th style={egresadosTh}>DÍAS</th>
                      <th style={egresadosTh}>EGRESADO POR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {egresados.map((e, idx) => (
                      <tr key={e.paciente_id} style={idx % 2 === 0 ? egresadosTdRowPar : egresadosTdRowImpar}>
                        <td style={egresadosTd}>{e.numero_cama}</td>
                        <td style={{ ...egresadosTd, fontWeight: 600 }}>{e.nombre_paciente}</td>
                        <td style={egresadosTd}>{e.edad}</td>
                        <td style={{ ...egresadosTd, fontStyle: 'italic', color: '#7d5b2f' }}>{e.diagnostico_ingreso ?? '—'}</td>
                        <td style={egresadosTd}>{e.fecha_ingreso}</td>
                        <td style={egresadosTd}>{e.fecha_egreso} {e.hora_egreso?.substring(0, 5)}</td>
                        <td style={egresadosTd}>{e.motivo_nombre}</td>
                        <td style={egresadosTd}>{e.destino_egreso || '--'}</td>
                        <td style={egresadosTd}>{e.dias_estancia ?? '--'}</td>
                        <td style={{ ...egresadosTd, fontSize: 10, color: '#888' }}>{e.egresado_por_nombre || '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {pestana === 'dietas'    && <VistaDietas    servicioId={servicio.id} />}
      {pestana === 'recetario' && <VistaRecetario servicioId={servicio.id} />}
      {pestana === 'control'   && <VistaFormatoControl servicioId={servicio.id} />}
      {pestana === 'productividad' && (
        <VistaProductividad
          servicioId={servicio.id}
          servicioNombre={servicio.nombre}
        />
      )}
      {pestana === 'erc' && <VistaERC />}

      {modalTraslado && perfil && (
        <ModalTraslado
          pacienteId={modalTraslado.paciente_id!}
          nombrePaciente={modalTraslado.nombre_paciente || ''}
          camaActualId={modalTraslado.cama_id}
          numeroCamaActual={modalTraslado.numero_cama}
          subservicioActualId={modalTraslado.subservicio_id}
          servicioActual={servicio?.nombre || ''}
          perfilId={perfil.id}
          onClose={() => setModalTraslado(null)}
          onGuardado={() => { setModalTraslado(null); cargar(true); }}
        />
      )}

      {modalGestionCama && perfil && (
        <ModalGestionCama
          camaId={modalGestionCama.cama_id}
          numeroCama={modalGestionCama.numero_cama}
          bloqueada={!!modalGestionCama.cama_bloqueada}
          causaActual={modalGestionCama.cama_causa_no_ocupacion || null}
          notaActual={modalGestionCama.cama_nota_no_ocupacion || null}
          bloqueadaDesde={modalGestionCama.cama_bloqueada_desde || null}
          perfilId={perfil.id}
          onIngresar={() => {
            // Pasamos de gestión → modal de ingreso de paciente.
            const c = modalGestionCama;
            setModalGestionCama(null);
            setModalIngreso({
              camaId: c.cama_id,
              subservicioId: c.subservicio_id,
              numeroCama: c.numero_cama,
            });
          }}
          onClose={() => setModalGestionCama(null)}
          onGuardado={() => { setModalGestionCama(null); cargar(true); }}
        />
      )}

      {modalIngreso && perfil && (
        <ModalIngreso
          camaId={modalIngreso.camaId}
          subservicioId={modalIngreso.subservicioId}
          servicioId={servicio.id}
          numeroCama={modalIngreso.numeroCama}
          capturadoPor={perfil.id}
          onClose={() => setModalIngreso(null)}
          onGuardado={() => { setModalIngreso(null); cargar(true); }}
        />
      )}

      {modalAsignar && perfil && (
        <ModalAsignarEnfermero
          pacienteId={modalAsignar.pacienteId}
          pacienteNombre={modalAsignar.nombre}
          numeroCama={modalAsignar.numeroCama}
          servicioId={servicio.id}
          capturadoPor={perfil.id}
          onClose={() => setModalAsignar(null)}
          onGuardado={() => { setModalAsignar(null); cargar(true); }}
        />
      )}

      {modalEgreso && perfil && (
        <ModalEgreso
          pacienteId={modalEgreso.pacienteId}
          numeroCama={modalEgreso.numeroCama}
          nombrePaciente={modalEgreso.nombre}
          fechaIngreso={modalEgreso.fechaIngreso}
          capturadoPor={perfil.id}
          onClose={() => setModalEgreso(null)}
          onGuardado={() => { setModalEgreso(null); cargar(true); }}
          onTrasladar={() => {
            // Cerrar el modal de egreso y abrir el de traslado para la
            // misma cama/paciente. Buscamos la cama en el state local.
            const camaActual = camas.find(c => c.paciente_id === modalEgreso.pacienteId);
            if (camaActual) {
              setModalTraslado(camaActual);
            }
          }}
        />
      )}
    </div>
  );
}

const contenedor: React.CSSProperties = { padding: 20, maxWidth: 1400, margin: '0 auto' };
const header: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 };
const titulo: React.CSSProperties = { fontSize: 24, color: '#0E6755', margin: 0, textAlign: 'center' };
const subtitulo: React.CSSProperties = { fontSize: 13, color: '#888', textAlign: 'center', marginTop: 4 };
const botonVolver: React.CSSProperties = { background: 'transparent', border: '1px solid #0E6755', color: '#0E6755', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13 };
const camasGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 };
const camaNoCensable: React.CSSProperties = { border: '2px dashed #C39C59', background: 'repeating-linear-gradient(45deg, #FFF, #FFF 6px, #FAF5EA 6px, #FAF5EA 12px)' };
const badgeNoCensable: React.CSSProperties = { position: 'absolute', top: 4, right: 4, background: '#C39C59', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 8, letterSpacing: 0.3 };
const camaCard: React.CSSProperties = { padding: 14, border: '2px solid #C39C59', borderRadius: 8, background: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', minHeight: 110, transition: 'all 0.15s', position: 'relative', display: 'flex', flexDirection: 'column', gap: 4 };
const camaLibre: React.CSSProperties = { background: '#F5F1E8' };
const camaOcupada: React.CSSProperties = { background: '#fff', borderColor: '#0E6755', borderWidth: 2, boxShadow: '0 2px 6px rgba(14, 103, 85, 0.15)' };
const camaNumero: React.CSSProperties = { fontSize: 22, fontWeight: 700, color: '#0E6755' };
const camaNombre: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#265C4E', lineHeight: 1.2 };
const camaDx: React.CSSProperties = { fontSize: 11, color: '#7d5b2f', fontStyle: 'italic' };
// Chip rojo de seguridad clínica para alergias capturadas. Se muestra
// arriba del diagnóstico para que sea lo primero que se ve al ojear el censo.
const alergiaChip: React.CSSProperties = {
  fontSize: 10,
  background: '#A32D2D',
  color: '#fff',
  padding: '3px 6px',
  borderRadius: 4,
  fontWeight: 700,
  letterSpacing: 0.3,
  border: '1px solid #7d1f1f',
  marginTop: 2,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
// Fila de chips de riesgos (Caídas / UPP). Colores institucionales según
// el catálogo: ALTO rojo, MEDIANO dorado, BAJO verde.
const riesgosRow: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  marginTop: 2,
  flexWrap: 'wrap',
};
const chipRiesgo = (nivel: string): React.CSSProperties => {
  const n = nivel.toUpperCase();
  const bg = n === 'ALTO' ? '#A32D2D'
           : n === 'MEDIANO' || n === 'MEDIO' ? '#C39C59'
           : n === 'BAJO' ? '#0E6755'
           : '#888';
  return {
    fontSize: 9,
    background: bg,
    color: '#fff',
    padding: '2px 6px',
    borderRadius: 10,
    fontWeight: 700,
    letterSpacing: 0.2,
    lineHeight: 1.3,
  };
};
const camaSubservicio: React.CSSProperties = { fontSize: 10, color: '#888', textTransform: 'uppercase', marginTop: 'auto' };
const camaLibreLabel: React.CSSProperties = { fontSize: 12, color: '#C39C59', fontWeight: 700 };
// Cama bloqueada (no ocupable): fondo rosado grisáceo, borde rojo punteado.
// El contraste con DISPONIBLE permite ver al instante qué camas no cuentan
// para ocupación aunque no haya paciente.
const camaBloqueada: React.CSSProperties = {
  background: 'repeating-linear-gradient(45deg, #fdecea, #fdecea 6px, #f7d5d0 6px, #f7d5d0 12px)',
  borderColor: '#A32D2D',
  borderStyle: 'dashed',
};
const camaBloqueadaLabel: React.CSSProperties = {
  fontSize: 11,
  color: '#A32D2D',
  fontWeight: 800,
  letterSpacing: 0.3,
};
const camaCausaTexto: React.CSSProperties = {
  fontSize: 11,
  color: '#7d1f1f',
  fontWeight: 700,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const proximamente: React.CSSProperties = { textAlign: 'center', padding: 60, background: '#F5F1E8', borderRadius: 8, border: '2px dashed #C39C59', color: '#265C4E' };

// PARCHE v4.5 — Estilos sección Camillas NO CENSABLES
const camillasWrap: React.CSSProperties = { marginTop: 24, border: '2px dashed #C39C59', borderRadius: 8, background: '#FAF5EA', overflow: 'hidden' };
const camillasToggle: React.CSSProperties = { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#C39C59', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'inherit', letterSpacing: 0.3 };
const camillasInfo: React.CSSProperties = { background: 'rgba(255,255,255,0.25)', color: '#fff', borderRadius: 12, padding: '3px 10px', fontSize: 11, fontWeight: 600 };
const camillasBody: React.CSSProperties = { padding: 12 };
const camillasAviso: React.CSSProperties = { fontSize: 11, color: '#7d5b2f', fontStyle: 'italic', marginBottom: 12, padding: '8px 12px', background: '#fff', border: '1px solid #C39C59', borderRadius: 4, lineHeight: 1.4 };

// PARCHE v4.3 — Estilos sección Egresados
const egresadosWrap: React.CSSProperties = { marginTop: 24, border: '1px solid #C39C59', borderRadius: 6, background: '#fff', overflow: 'hidden' };
const egresadosToggle: React.CSSProperties = { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: '#F5F1E8', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#A32D2D', fontFamily: 'inherit' };
const egresadosCount: React.CSSProperties = { background: '#A32D2D', color: '#fff', borderRadius: 12, padding: '2px 10px', fontSize: 11, fontWeight: 700 };
const egresadosBody: React.CSSProperties = { padding: 8, overflowX: 'auto' };
const egresadosVacio: React.CSSProperties = { padding: 24, textAlign: 'center', color: '#888', fontStyle: 'italic' };
const egresadosTabla: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
const egresadosThRow: React.CSSProperties = { background: '#A32D2D' };
const egresadosTh: React.CSSProperties = { padding: '8px 6px', color: '#fff', textAlign: 'left', fontWeight: 700, fontSize: 11, letterSpacing: 0.3, borderBottom: '1px solid #7d1f1f' };
const egresadosTd: React.CSSProperties = { padding: '6px', borderBottom: '1px solid #e8dfc6', color: '#265C4E' };
const egresadosTdRowPar: React.CSSProperties = { background: '#fff' };
const egresadosTdRowImpar: React.CSSProperties = { background: '#fdfaf2' };

// BLOQUE 8 - Estilos badge enfermero
const badgeEnfermero: React.CSSProperties = {
  fontSize: 10,
  background: '#0E6755',
  color: '#fff',
  padding: '3px 6px',
  borderRadius: 4,
  marginTop: 4,
  fontWeight: 600,
  letterSpacing: 0.2,
  textAlign: 'center',
  border: '1px solid #0E6755'
};
const badgeSinAsignar: React.CSSProperties = {
  fontSize: 10,
  background: '#FAF5EA',
  color: '#A32D2D',
  padding: '3px 6px',
  borderRadius: 4,
  marginTop: 4,
  fontWeight: 600,
  letterSpacing: 0.2,
  textAlign: 'center',
  border: '1px dashed #A32D2D',
  fontStyle: 'italic'
};

// Trazabilidad — chips de completitud del día
const chipsRow: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  marginTop: 4,
  flexWrap: 'wrap',
};
const chip = (activo: boolean): React.CSSProperties => ({
  fontSize: 11,
  lineHeight: 1,
  padding: '3px 6px',
  borderRadius: 10,
  background: activo ? '#0E6755' : '#E8DFC6',
  color: activo ? '#fff' : '#888',
  border: `1px solid ${activo ? '#0E6755' : '#C39C59'}`,
  cursor: 'pointer',
  userSelect: 'none',
  filter: activo ? 'none' : 'grayscale(0.6)',
});
