// src/pages/components/VistaProductividad.tsx
// Pestaña Productividad: 73 indicadores oficiales x 31 dias x 3 turnos (M/V/N)
// Codigo de color por origen:
//   AUTO_ING         (verde claro)   - autollenado al registrar ingreso
//   AUTO_TURNO       (azul claro)    - autollenado al cierre de turno
//   AUTO_EVENTO      (lavanda)       - autollenado al marcar evento Realizada
//   AUTO_CONTINUIDAD (durazno)       - autollenado por pg_cron por turno
//   MANUAL           (amarillo claro) - captura del personal
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

interface Indicador {
  id: number;
  codigo: string;
  proceso_id: number;
  proceso_nom: string;
  subproceso: string | null;
  etiqueta: string;
  origen: 'AUTO_ING' | 'AUTO_TURNO' | 'AUTO_EVENTO' | 'AUTO_CONTINUIDAD' | 'MANUAL';
  orden: number;
  // Indicadores neonatales (CVP neonatos, catéter umbilical, etc.): solo se
  // muestran en servicios de Pediatría (código PED). Se ocultan en los demás.
  solo_pediatria?: boolean;
}

interface Captura {
  indicador_id: number;
  anio: number;
  mes: number;
  dia: number;
  turno: 'M' | 'V' | 'N';
  valor: number;
  origen?: 'AUTO_ING' | 'AUTO_TURNO' | 'AUTO_EVENTO' | 'AUTO_CONTINUIDAD' | 'MANUAL';
}

interface Props {
  servicioId: number;
  servicioNombre: string;
  servicioCodigo: string;
}

const TURNOS: Array<'M' | 'V' | 'N'> = ['M', 'V', 'N'];

const COLOR_ORIGEN: Record<Indicador['origen'], string> = {
  AUTO_ING:         '#C8E6C9',  // verde claro
  AUTO_TURNO:       '#BBDEFB',  // azul claro
  AUTO_EVENTO:      '#E1BEE7',  // lavanda
  AUTO_CONTINUIDAD: '#FFE0B2',  // durazno
  MANUAL:           '#FFFDE7',  // amarillo claro
};

const COLOR_PROCESO: Record<number, string> = {
  1: '#E3F2FD', 2: '#E8F5E9', 3: '#FFF3E0', 4: '#F3E5F5',
  5: '#FCE4EC', 6: '#E0F2F1', 7: '#FFEBEE', 8: '#FFF9C4',
};

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

// Lunes de la semana que contiene a `ref` (semana Lun–Dom).
function lunesDeSemana(ref: Date): Date {
  const d = new Date(ref);
  const dow = (d.getDay() + 6) % 7; // 0=Lun … 6=Dom
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d;
}

interface DiaSemana { fecha: Date; anio: number; mes: number; dia: number; }

export function VistaProductividad({ servicioId, servicioNombre, servicioCodigo }: Props) {
  // Pediatría (incluye ONC-PED, UPED): único servicio donde se muestran los
  // indicadores neonatales. En el resto se ocultan (solo_pediatria=true).
  const esPediatria = (servicioCodigo || '').includes('PED');

  const [semanaInicio, setSemanaInicio] = useState<Date>(() => lunesDeSemana(new Date()));

  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [capturas, setCapturas]       = useState<Map<string, {valor: number; origen: string}>>(new Map());
  const [cargando, setCargando]       = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [guardando, setGuardando]     = useState<string | null>(null);

  // Los 7 días (Lun–Dom) de la semana seleccionada. Cada día conserva su
  // anio/mes/dia reales, así que una semana puede cruzar el cambio de mes.
  const dias = useMemo<DiaSemana[]>(() => (
    Array.from({ length: 7 }, (_, i) => {
      const f = new Date(semanaInicio);
      f.setDate(semanaInicio.getDate() + i);
      return { fecha: f, anio: f.getFullYear(), mes: f.getMonth() + 1, dia: f.getDate() };
    })
  ), [semanaInicio]);

  const cellKey = (indId: number, d: DiaSemana, t: 'M'|'V'|'N') =>
    `${indId}-${d.anio}-${d.mes}-${d.dia}-${t}`;

  // Etiqueta del rango de la semana (compacta si no cruza de mes).
  const rangoSemana = useMemo(() => {
    const ini = dias[0], fin = dias[6];
    return ini.mes === fin.mes
      ? `${ini.dia} – ${fin.dia} ${MESES_CORTO[fin.mes - 1]} ${fin.anio}`
      : `${ini.dia} ${MESES_CORTO[ini.mes - 1]} – ${fin.dia} ${MESES_CORTO[fin.mes - 1]} ${fin.anio}`;
  }, [dias]);

  const moverSemana = (deltaDias: number) =>
    setSemanaInicio(prev => { const d = new Date(prev); d.setDate(d.getDate() + deltaDias); return d; });

  // Cargar catalogo + capturas
  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      // 1. Catalogo
      const { data: cat, error: e1 } = await supabase
        .from('catalogo_indicadores_productividad')
        .select('*')
        .eq('activo', true)
        .order('orden', { ascending: true });
      if (e1) throw e1;
      // Fuera de Pediatría ocultamos los indicadores neonatales del catálogo.
      const catFiltrado = (cat || []).filter(
        (i: any) => esPediatria || i.solo_pediatria !== true
      );
      setIndicadores(catFiltrado as Indicador[]);

      // 2. Capturas de la semana. La semana puede abarcar 1 o 2 pares (anio,mes);
      //    se piden ambos meses completos y se filtran por día al renderizar.
      const combos = Array.from(new Set(dias.map(d => `${d.anio}-${d.mes}`)))
        .map(s => { const [a, mm] = s.split('-').map(Number); return { anio: a, mes: mm }; });
      const orFiltro = combos.map(c => `and(anio.eq.${c.anio},mes.eq.${c.mes})`).join(',');

      const { data: caps, error: e2 } = await supabase
        .from('productividad_capturas')
        .select('indicador_id, anio, mes, dia, turno, valor, origen')
        .eq('servicio_id', servicioId)
        .or(orFiltro);
      if (e2) throw e2;

      const m = new Map<string, {valor: number; origen: string}>();
      (caps || []).forEach((c: Captura) => {
        m.set(`${c.indicador_id}-${c.anio}-${c.mes}-${c.dia}-${c.turno}`, {
          valor: Number(c.valor),
          origen: c.origen || 'MANUAL'
        });
      });
      setCapturas(m);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar productividad');
    } finally {
      setCargando(false);
    }
  }, [servicioId, dias, esPediatria]);

  useEffect(() => { cargar(); }, [cargar]);

  // Guardar una celda
  const guardarCelda = async (
    indicadorId: number,
    d: DiaSemana,
    turno: 'M'|'V'|'N',
    valor: number
  ) => {
    const key = cellKey(indicadorId, d, turno);
    setGuardando(key);
    try {
      const { error: e } = await supabase
        .from('productividad_capturas')
        .upsert(
          {
            servicio_id: servicioId,
            indicador_id: indicadorId,
            anio: d.anio, mes: d.mes, dia: d.dia, turno, valor,
          },
          { onConflict: 'servicio_id,indicador_id,anio,mes,dia,turno' }
        );
      if (e) throw e;
      setCapturas(prev => {
        const m = new Map(prev);
        m.set(key, { valor, origen: 'MANUAL' });
        return m;
      });
    } catch (err: any) {
      setError(err?.message || 'Error al guardar');
    } finally {
      setGuardando(null);
    }
  };

  // Calculos por indicador
  const getValor = (indId: number, d: DiaSemana, t: 'M'|'V'|'N') =>
    capturas.get(cellKey(indId, d, t))?.valor ?? 0;

  // Bloque 5: leer el origen REAL de la captura (no solo del catálogo)
  const getOrigen = (indId: number, d: DiaSemana, t: 'M'|'V'|'N'): string | null =>
    capturas.get(cellKey(indId, d, t))?.origen ?? null;

  const totalTurno = (indId: number, t: 'M'|'V'|'N') =>
    dias.reduce((s, d) => s + getValor(indId, d, t), 0);

  const totalSemana = (indId: number) =>
    totalTurno(indId, 'M') + totalTurno(indId, 'V') + totalTurno(indId, 'N');

  // Agrupar indicadores por proceso
  const procesos = useMemo(() => {
    const grupos = new Map<number, { nombre: string; indicadores: Indicador[] }>();
    indicadores.forEach(i => {
      if (!grupos.has(i.proceso_id)) {
        grupos.set(i.proceso_id, { nombre: i.proceso_nom, indicadores: [] });
      }
      grupos.get(i.proceso_id)!.indicadores.push(i);
    });
    return Array.from(grupos.entries()).sort((a, b) => a[0] - b[0]);
  }, [indicadores]);

  // Resumen por proceso
  const totalProceso = (procesoId: number) => {
    const inds = indicadores.filter(i => i.proceso_id === procesoId);
    return inds.reduce((acc, i) => acc + totalSemana(i.id), 0);
  };

  const totalGeneral = useMemo(
    () => indicadores.reduce((acc, i) => acc + totalSemana(i.id), 0),
    [indicadores, capturas, dias]
  );

  if (cargando) {
    return <div style={vacio}>Cargando productividad...</div>;
  }

  if (error) {
    return (
      <div style={errorBanner}>
        ⚠️ {error}
        <button onClick={cargar} style={{ marginLeft: 12 }}>Reintentar</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 12 }}>
      {/* Barra superior */}
      <div style={barraSuperior}>
        <div>
          <strong style={{ fontSize: 14, color: '#265C4E' }}>
            Bitácora de Productividad — {servicioNombre}
          </strong>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            73 indicadores oficiales IMSS-Bienestar · semana (Lun–Dom) × turnos M/V/N
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => moverSemana(-7)} style={btnNav} title="Semana anterior">◀</button>
          <span style={etiquetaSemana}>{rangoSemana}</span>
          <button onClick={() => moverSemana(7)} style={btnNav} title="Semana siguiente">▶</button>
          <button onClick={() => setSemanaInicio(lunesDeSemana(new Date()))} style={btnHoy}>Hoy</button>
        </div>
      </div>

      {/* Leyenda */}
      <div style={leyenda}>
        <Pill color={COLOR_ORIGEN.AUTO_ING}         label="AUTO-INGRESO" />
        <Pill color={COLOR_ORIGEN.AUTO_TURNO}       label="AUTO-TURNO" />
        <Pill color={COLOR_ORIGEN.AUTO_EVENTO}      label="AUTO-EVENTO" />
        <Pill color={COLOR_ORIGEN.AUTO_CONTINUIDAD} label="AUTO-CONTINUIDAD" />
        <Pill color={COLOR_ORIGEN.MANUAL}           label="MANUAL" />
        <Pill color="#FFF2CC"                       label="TOTAL" />
      </div>

      {/* Tabla principal */}
      <div style={contenedorScroll}>
        <table style={tabla}>
          <thead>
            <tr>
              <th style={{ ...thFijo, minWidth: 320 }}>Indicador / Proceso</th>
              {dias.map((d, i) => (
                <th key={`${d.anio}-${d.mes}-${d.dia}`} colSpan={3} style={thDia}>
                  {DOW[i]}<br/>{d.dia}
                </th>
              ))}
              <th style={thTotal}>T<br/>M</th>
              <th style={thTotal}>T<br/>V</th>
              <th style={thTotal}>T<br/>N</th>
              <th style={thTotal}>T<br/>SEM</th>
            </tr>
            <tr>
              <th style={thFijo}></th>
              {dias.flatMap(d =>
                TURNOS.map(t => (
                  <th key={`${d.anio}-${d.mes}-${d.dia}${t}`} style={thTurno}>{t}</th>
                ))
              )}
              <th style={thTotalSub}></th>
              <th style={thTotalSub}></th>
              <th style={thTotalSub}></th>
              <th style={thTotalSub}></th>
            </tr>
          </thead>

          <tbody>
            {procesos.map(([pid, grupo]) => (
              <React.Fragment key={pid}>
                {/* Header proceso */}
                <tr>
                  <td colSpan={1 + dias.length * 3 + 4} style={{
                    ...tdHeaderProceso,
                    background: COLOR_PROCESO[pid] || '#E3F2FD'
                  }}>
                    ▶ {pid}. {grupo.nombre}
                  </td>
                </tr>
                {/* Indicadores */}
                {grupo.indicadores.map(ind => {
                  const tM = totalTurno(ind.id, 'M');
                  const tV = totalTurno(ind.id, 'V');
                  const tN = totalTurno(ind.id, 'N');
                  const tSem = tM + tV + tN;
                  return (
                    <tr key={ind.id}>
                      <td style={{ ...tdLabel, fontSize: 10 }}>
                        <strong style={{ color: '#666', fontSize: 9 }}>{ind.codigo}</strong>{' '}
                        {ind.etiqueta}
                      </td>
                      {dias.map(d => (
                        TURNOS.map(t => {
                          const v = getValor(ind.id, d, t);
                          const key = cellKey(ind.id, d, t);
                          const isGuardando = guardando === key;
                          // Bloque 5: color y editabilidad según ORIGEN REAL de la captura
                          // (no del catálogo). Si no hay captura aún, cae al origen del catálogo.
                          const origenCelda = (getOrigen(ind.id, d, t) || ind.origen) as 'AUTO_ING' | 'AUTO_TURNO' | 'AUTO_EVENTO' | 'AUTO_CONTINUIDAD' | 'MANUAL';
                          const isEditable = origenCelda === 'MANUAL';
                          return (
                            <td key={`${d.anio}-${d.mes}-${d.dia}${t}`} style={{
                              ...tdCelda,
                              background: COLOR_ORIGEN[origenCelda],
                              opacity: isGuardando ? 0.5 : 1,
                            }}
                            title={
                              origenCelda === 'AUTO_ING'         ? 'Autollenado al ingreso del paciente (no editable). Modifica en VistaFormatoControl.' :
                              origenCelda === 'AUTO_TURNO'       ? 'Calculado por cambio de turno (no editable).' :
                              origenCelda === 'AUTO_EVENTO'      ? 'Autollenado al marcar un evento como Realizada (no editable). Modifica el evento en VistaFormatoControl.' :
                              origenCelda === 'AUTO_CONTINUIDAD' ? 'Calculado por pg_cron al inicio del turno para items de continuidad activos (no editable).' :
                              'Captura manual'
                            }>
                              {isEditable ? (
                                <input
                                  type="number"
                                  min={0}
                                  value={v || ''}
                                  onChange={e => {
                                    const nv = Number(e.target.value) || 0;
                                    setCapturas(prev => {
                                      const m = new Map(prev);
                                      m.set(key, { valor: nv, origen: 'MANUAL' });
                                      return m;
                                    });
                                  }}
                                  onBlur={e => {
                                    const nv = Number(e.target.value) || 0;
                                    guardarCelda(ind.id, d, t, nv);
                                  }}
                                  style={inputCelda}
                                />
                              ) : (
                                <span style={{ fontSize: 9, fontWeight: 600, color: '#0E6755' }}>{v || ''}</span>
                              )}
                            </td>
                          );
                        })
                      )).flat()}
                      <td style={tdTotal}>{tM || ''}</td>
                      <td style={tdTotal}>{tV || ''}</td>
                      <td style={tdTotal}>{tN || ''}</td>
                      <td style={{...tdTotal, fontWeight: 700 }}>{tSem || ''}</td>
                    </tr>
                  );
                })}
                {/* Subtotal proceso */}
                <tr>
                  <td style={{...tdSubtotal, background: COLOR_PROCESO[pid] }}>
                    SUBTOTAL {pid}. {grupo.nombre}
                  </td>
                  <td colSpan={dias.length * 3} style={{ background: '#F5F5F5' }}></td>
                  <td colSpan={4} style={{...tdSubtotal, background: COLOR_PROCESO[pid], textAlign: 'center' }}>
                    {totalProceso(pid)}
                  </td>
                </tr>
              </React.Fragment>
            ))}

            {/* Gran total */}
            <tr>
              <td style={tdGranTotal}>▶ GRAN TOTAL DEL SERVICIO</td>
              <td colSpan={dias.length * 3} style={{ background: '#1F4E79' }}></td>
              <td colSpan={4} style={{...tdGranTotal, textAlign: 'center' }}>{totalGeneral}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Resumen final */}
      <div style={resumen}>
        <h3 style={{ margin: 0, color: '#265C4E', fontSize: 13 }}>
          Resumen semanal — {rangoSemana}
        </h3>
        <table style={{ width: '100%', marginTop: 8, fontSize: 11 }}>
          <thead>
            <tr>
              <th style={thResumen}>Proceso</th>
              <th style={thResumen}>Total Semana</th>
              <th style={thResumen}>Prom. Día</th>
            </tr>
          </thead>
          <tbody>
            {procesos.map(([pid, grupo]) => {
              const t = totalProceso(pid);
              return (
                <tr key={pid}>
                  <td style={{...tdResumen, background: COLOR_PROCESO[pid] }}>
                    {pid}. {grupo.nombre}
                  </td>
                  <td style={{...tdResumen, textAlign: 'center', fontWeight: 700 }}>{t}</td>
                  <td style={{...tdResumen, textAlign: 'center' }}>{(t / 7).toFixed(1)}</td>
                </tr>
              );
            })}
            <tr>
              <td style={{...tdResumen, background: '#1F4E79', color: '#FFF', fontWeight: 700 }}>
                GRAN TOTAL
              </td>
              <td style={{...tdResumen, background: '#1F4E79', color: '#FFF',
                textAlign: 'center', fontWeight: 700 }}>{totalGeneral}</td>
              <td style={{...tdResumen, background: '#1F4E79', color: '#FFF',
                textAlign: 'center', fontWeight: 700 }}>{(totalGeneral / 7).toFixed(1)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Pill({ color, label }: { color: string; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 12, fontSize: 10,
      border: '1px solid #C39C59', background: '#FFF',
    }}>
      <span style={{ width: 12, height: 12, background: color, border: '1px solid #999' }}/>
      {label}
    </span>
  );
}

// ===== Estilos =====
const barraSuperior: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '8px 12px', background: '#F5F5F5', border: '1px solid #C39C59',
  borderRadius: 4, marginBottom: 8,
};
const btnNav: React.CSSProperties = {
  padding: '4px 10px', fontSize: 12, border: '1px solid #C39C59',
  borderRadius: 4, background: '#FFF', color: '#265C4E', cursor: 'pointer',
  fontFamily: 'inherit', fontWeight: 700,
};
const btnHoy: React.CSSProperties = {
  padding: '4px 10px', fontSize: 11, border: '1px solid #0E6755',
  borderRadius: 4, background: '#0E6755', color: '#FFF', cursor: 'pointer',
  fontFamily: 'inherit', fontWeight: 700,
};
const etiquetaSemana: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: '#265C4E', minWidth: 150,
  textAlign: 'center', textTransform: 'capitalize',
};
const leyenda: React.CSSProperties = {
  display: 'flex', gap: 8, padding: '6px 12px', marginBottom: 8, flexWrap: 'wrap',
};
const contenedorScroll: React.CSSProperties = {
  overflowX: 'auto', overflowY: 'auto', maxHeight: '60vh',
  border: '1px solid #C39C59', borderRadius: 4, background: '#FFF',
};
const tabla: React.CSSProperties = {
  borderCollapse: 'collapse', fontSize: 10, fontFamily: 'inherit', minWidth: '100%',
};
const thFijo: React.CSSProperties = {
  position: 'sticky', left: 0, top: 0, zIndex: 4,
  background: '#1F4E79', color: '#FFF', padding: '8px 6px',
  textAlign: 'left', fontSize: 10, borderRight: '2px solid #C39C59',
};
const thDia: React.CSSProperties = {
  background: '#1F4E79', color: '#FFF', padding: '4px 2px',
  fontSize: 9, textAlign: 'center', border: '1px solid #2E5F8F',
  position: 'sticky', top: 0, zIndex: 2,
};
const thTurno: React.CSSProperties = {
  background: '#2E75B6', color: '#FFF', padding: '2px 0',
  fontSize: 8, textAlign: 'center', border: '1px solid #4A8BC4',
  position: 'sticky', top: 22, zIndex: 2, minWidth: 22,
};
const thTotal: React.CSSProperties = {
  background: '#1F4E79', color: '#FFF', padding: '4px 6px',
  fontSize: 9, textAlign: 'center', border: '1px solid #2E5F8F',
  position: 'sticky', top: 0, zIndex: 2, minWidth: 32,
};
const thTotalSub: React.CSSProperties = {
  background: '#2E75B6', position: 'sticky', top: 22, zIndex: 2,
};
const thResumen: React.CSSProperties = {
  background: '#1F4E79', color: '#FFF', padding: '6px 8px',
  fontSize: 11, textAlign: 'left', border: '1px solid #2E5F8F',
};
const tdHeaderProceso: React.CSSProperties = {
  fontWeight: 700, color: '#1F4E79', padding: '4px 8px', fontSize: 11,
  borderTop: '2px solid #1F4E79',
};
const tdLabel: React.CSSProperties = {
  position: 'sticky', left: 0, background: '#FAFAFA',
  padding: '3px 6px', borderRight: '2px solid #C39C59',
  borderBottom: '1px solid #E0E0E0', minWidth: 320, maxWidth: 320,
  fontSize: 10, zIndex: 1,
};
const tdCelda: React.CSSProperties = {
  textAlign: 'center', padding: 0, border: '1px solid #DDD',
  minWidth: 22, maxWidth: 22,
};
const inputCelda: React.CSSProperties = {
  width: '100%', height: '100%', border: 'none', background: 'transparent',
  textAlign: 'center', fontSize: 9, padding: '2px 0', color: '#265C4E',
  fontFamily: 'inherit', outline: 'none',
};
const tdTotal: React.CSSProperties = {
  background: '#FFF2CC', fontSize: 10, fontWeight: 600, textAlign: 'center',
  padding: '2px 4px', border: '1px solid #DDC080', minWidth: 32,
};
const tdSubtotal: React.CSSProperties = {
  fontWeight: 700, fontSize: 10, padding: '4px 8px', color: '#1F4E79',
  borderTop: '1px solid #1F4E79', borderBottom: '2px solid #1F4E79',
};
const tdGranTotal: React.CSSProperties = {
  background: '#1F4E79', color: '#FFF', fontWeight: 700,
  fontSize: 12, padding: '8px 12px',
};
const tdResumen: React.CSSProperties = {
  padding: '5px 8px', border: '1px solid #DDD', fontSize: 11,
};
const resumen: React.CSSProperties = {
  marginTop: 12, padding: 12, background: '#FFF',
  border: '1px solid #C39C59', borderRadius: 4,
};
const vacio: React.CSSProperties = {
  padding: 40, textAlign: 'center', color: '#888',
  background: '#FFF', border: '1px solid #C39C59', borderRadius: 4,
};
const errorBanner: React.CSSProperties = {
  background: '#fdecea', color: '#A32D2D', padding: '10px 16px',
  borderRadius: 4, marginBottom: 12, fontSize: 13,
};
