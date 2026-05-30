// src/pages/VistaImpresionRecetario.tsx
// =====================================================================
// IMPRESIÓN — RECETARIO COLECTIVO DE PACIENTES (Indicaciones médicas)
// =====================================================================
// v1 (19-may-2026)
//
// Vista dedicada para imprimir todos los pacientes activos de un servicio
// con sus indicaciones de medicamentos en tabla horizontal Oficio.
//
// Fuente de datos: vista `v_recetario_servicio` que ya une:
//   - paciente (id, nombre, edad, género, NSS, dx, cama, subservicio)
//   - servicio (servicio_id, codigo)
//   - medicamento (id, orden, nombre, dosis, vía, frecuencia, solicitada,
//     dispensada)
//
// Estructura visual:
//   - Filas de medicamento agrupadas por paciente con rowSpan en las
//     columnas Cama/Paciente/Dx.
//   - Pacientes sin medicamentos aparecen con fila "(Sin indicaciones)".
//   - Pie con bloque clásico de receta IMSS-Bienestar: 3 firmas (médico,
//     enfermería, farmacia).
//
// Ruta: /imprimir/recetario/:servicioId
// =====================================================================

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { EncabezadoOficial } from './components/EncabezadoOficial';

// ---------- Tipos ----------
interface Servicio {
  id: number;
  codigo?: string;
  nombre: string;
  total_camas: number;
}

interface FilaRecetario {
  paciente_id: string;
  servicio_id: number;
  servicio_codigo: string | null;
  subservicio: string | null;
  subservicio_orden: number | null;
  subservicio_completo: string | null;
  numero_cama: string;
  nombre_paciente: string;
  edad: number | null;
  edad_unidad: string | null;
  genero: string | null;
  nss_curp: string | null;
  diagnostico_ingreso: string | null;
  paciente_estado: string | null;
  medicamento_id: string | null;
  orden: number | null;
  medicamento: string | null;
  dosis: string | null;
  via: string | null;
  frecuencia: string | null;
  solicitada: number | null;
  dispensada: number | null;
}

interface GrupoPaciente {
  paciente_id: string;
  subservicio: string | null;
  subservicio_orden: number | null;
  subservicio_completo: string | null;
  numero_cama: string;
  nombre_paciente: string;
  edad: number | null;
  edad_unidad: string | null;
  genero: string | null;
  nss_curp: string | null;
  diagnostico_ingreso: string | null;
  medicamentos: FilaRecetario[];
}

// ---------- Utilidades ----------
function fechaHoy(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function generoCorto(g: string | null): string {
  if (!g) return '';
  const u = g.toUpperCase();
  if (u.startsWith('F')) return 'F';
  if (u.startsWith('M')) return 'M';
  return u.substring(0, 1);
}

function limpiar(s: string | null): string {
  if (!s) return '';
  return String(s).trim();
}

// Edad con unidad para impresión (versión corta)
function formatEdadCorta(edad: number | null, unidad: string | null): string {
  if (edad == null) return '';
  const u = unidad ?? 'AÑOS';
  if (u === 'DIAS') return `${edad}d`;
  if (u === 'MESES') return `${edad}m`;
  return `${edad}a`;
}

// Agrupa pacientes por subservicio respetando el orden del subservicio.
interface SubservicioGrupo {
  subservicio_id: string;
  nombre: string;
  nombre_completo: string | null;
  orden: number;
  grupos: GrupoPaciente[];
}
function agruparPorSubservicio(grupos: GrupoPaciente[]): SubservicioGrupo[] {
  const m = new Map<string, SubservicioGrupo>();
  for (const g of grupos) {
    const key = g.subservicio || '(SIN)';
    let sg = m.get(key);
    if (!sg) {
      sg = {
        subservicio_id: key,
        nombre: g.subservicio || 'SIN SUBSERVICIO',
        nombre_completo: g.subservicio_completo,
        orden: g.subservicio_orden ?? 9999,
        grupos: [],
      };
      m.set(key, sg);
    }
    sg.grupos.push(g);
  }
  return [...m.values()].sort((a, b) => a.orden - b.orden);
}

// Sección de tabla de recetario reutilizable: una tabla con encabezado
// opcional de subservicio y page-break-after si no es la última.
const RecetarioSeccion: React.FC<{
  titulo?: string;
  subtitulo?: string | null;
  grupos: GrupoPaciente[];
  esUltima: boolean;
}> = ({ titulo, subtitulo, grupos, esUltima }) => {
  return (
    <div className={esUltima ? 'rec-seccion' : 'rec-seccion rec-page-break'}>
      {titulo && (
        <div className="rec-sub-encabezado">
          <span className="rec-sub-abrev">{titulo}</span>
          {subtitulo && subtitulo !== titulo && (
            <span className="rec-sub-completo">— {subtitulo}</span>
          )}
        </div>
      )}
      <table className="tabla-recetario">
        <thead>
          <tr className="col-row">
            <th style={{ width: '4%' }}>CAMA</th>
            <th style={{ width: '21%' }}>PACIENTE</th>
            <th style={{ width: '38%' }}>MEDICAMENTO</th>
            <th style={{ width: '7%' }}>POSOLOGÍA</th>
            <th style={{ width: '5%' }}>VÍA</th>
            <th style={{ width: '7%' }}>FRECUENCIA</th>
            <th style={{ width: '3%' }}>SOL</th>
            <th style={{ width: '3%' }}>DIS</th>
            <th style={{ width: '12%' }}>OBSERVACIONES</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => {
            const n = Math.max(1, g.medicamentos.length);

            if (g.medicamentos.length === 0) {
              return (
                <tr key={g.paciente_id}>
                  <td className="c-cama">{g.numero_cama}</td>
                  <td className="c-paciente">
                    <div className="nombre">{limpiar(g.nombre_paciente)}</div>
                    <div className="datos-pac">
                      {formatEdadCorta(g.edad, g.edad_unidad)} {generoCorto(g.genero)} · {limpiar(g.nss_curp)}
                    </div>
                  </td>
                  <td colSpan={7} className="c-sin-meds">
                    (Sin indicaciones capturadas)
                  </td>
                </tr>
              );
            }

            return g.medicamentos.map((m, idx) => (
              <tr key={`${g.paciente_id}-${m.medicamento_id}`}
                  className={idx === 0 ? 'fila-inicio-pac' : ''}>
                {idx === 0 && (
                  <>
                    <td className="c-cama" rowSpan={n}>{g.numero_cama}</td>
                    <td className="c-paciente" rowSpan={n}>
                      <div className="nombre">{limpiar(g.nombre_paciente)}</div>
                      <div className="datos-pac">
                        {formatEdadCorta(g.edad, g.edad_unidad)} {generoCorto(g.genero)} · {limpiar(g.nss_curp)}
                      </div>
                    </td>
                  </>
                )}
                <td className="c-med">{limpiar(m.medicamento)}</td>
                {/* POSOLOGÍA: dose detail (ej. "500 mg", "5 mL", "1 amp") */}
                <td className="c-pos">{limpiar(m.dosis)}</td>
                <td className="c-via">{limpiar(m.via)}</td>
                <td className="c-frec">{limpiar(m.frecuencia)}</td>
                <td className="c-check">{m.solicitada != null && m.solicitada > 0 ? <b>{m.solicitada}</b> : '☐'}</td>
                <td className="c-check">{m.dispensada != null && m.dispensada > 0 ? <b>{m.dispensada}</b> : '☐'}</td>
                <td className="c-obs"></td>
              </tr>
            ));
          })}
          {grupos.length === 0 && (
            <tr>
              <td colSpan={9} className="c-vacio">
                Sin pacientes activos en este subservicio.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

// ---------- Componente ----------
export const VistaImpresionRecetario: React.FC = () => {
  const { servicioId } = useParams<{ servicioId: string }>();
  const [searchParams] = useSearchParams();
  const autoImprimir = searchParams.get('auto') !== '0';

  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [grupos, setGrupos] = useState<GrupoPaciente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const svcId = Number(servicioId);

        // 1. Servicio
        const { data: svc, error: errSvc } = await supabase
          .from('servicios')
          .select('id, codigo, nombre, total_camas')
          .eq('id', svcId)
          .single();
        if (errSvc) throw errSvc;
        setServicio(svc);

        // 2. Recetario completo del servicio (vista ya unida)
        const { data: filas, error: errFilas } = await supabase
          .from('v_recetario_servicio')
          .select('*')
          .eq('servicio_id', svcId)
          .eq('paciente_estado', 'ACTIVO');

        if (errFilas) throw errFilas;

        // 3. Agrupar por paciente
        const mapaPacientes = new Map<string, GrupoPaciente>();
        (filas || []).forEach((f: FilaRecetario) => {
          if (!mapaPacientes.has(f.paciente_id)) {
            mapaPacientes.set(f.paciente_id, {
              paciente_id: f.paciente_id,
              subservicio: f.subservicio,
              subservicio_orden: f.subservicio_orden,
              subservicio_completo: f.subservicio_completo,
              numero_cama: f.numero_cama,
              nombre_paciente: f.nombre_paciente,
              edad: f.edad,
              edad_unidad: f.edad_unidad,
              genero: f.genero,
              nss_curp: f.nss_curp,
              diagnostico_ingreso: f.diagnostico_ingreso,
              medicamentos: [],
            });
          }
          // Solo agregar si tiene medicamento real (no es paciente sin recetario)
          if (f.medicamento_id && f.medicamento) {
            mapaPacientes.get(f.paciente_id)!.medicamentos.push(f);
          }
        });

        // 4. Ordenar pacientes por subservicio_orden + cama, medicamentos por orden
        const lista = Array.from(mapaPacientes.values());
        lista.sort((a, b) => {
          const oa = a.subservicio_orden ?? 9999;
          const ob = b.subservicio_orden ?? 9999;
          if (oa !== ob) return oa - ob;
          const na = parseInt(a.numero_cama, 10);
          const nb = parseInt(b.numero_cama, 10);
          if (!isNaN(na) && !isNaN(nb)) return na - nb;
          return a.numero_cama.localeCompare(b.numero_cama);
        });
        lista.forEach(g => {
          g.medicamentos.sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99));
        });

        setGrupos(lista);
      } catch (e: any) {
        console.error('[VistaImpresionRecetario] error:', e);
        setError(e.message || 'Error al cargar datos');
      } finally {
        setCargando(false);
      }
    })();
  }, [servicioId]);

  // Auto-imprimir cuando termina de cargar
  useEffect(() => {
    if (!cargando && !error && grupos.length > 0 && autoImprimir) {
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
  }, [cargando, error, grupos.length, autoImprimir]);

  if (cargando) {
    return <div style={{ padding: 40, fontFamily: 'Arial', textAlign: 'center' }}>
      Cargando recetario del servicio…
    </div>;
  }
  if (error) {
    return <div style={{ padding: 40, fontFamily: 'Arial', color: '#A32D2D' }}>
      ⚠️ {error}
    </div>;
  }

  const totalPacientes = grupos.length;
  const totalMedicamentos = grupos.reduce((acc, g) => acc + g.medicamentos.length, 0);

  return (
    <div className="hoja-impresion">
      {/* Botones flotantes (ocultos al imprimir) */}
      <div className="no-print" style={barraTop}>
        <button onClick={() => window.print()} style={btnPrint}>🖨️ Imprimir</button>
        <button onClick={() => window.close()} style={btnCerrar}>✕ Cerrar</button>
        <span style={{ marginLeft: 12, color: '#666', fontSize: 12 }}>
          Vista previa · Tamaño: <b>Oficio horizontal</b> · {totalPacientes} pacientes · {totalMedicamentos} indicaciones
        </span>
      </div>

      {/* Encabezado institucional con logos */}
      <EncabezadoOficial formato="RECETARIO COLECTIVO DE PACIENTES — INDICACIONES MÉDICAS" />

      {/* Sub-encabezado */}
      <div style={subHeaderBox}>
        <span><b>FECHA:</b> {fechaHoy()}</span>
        <span><b>SERVICIO:</b> {servicio?.nombre ?? '--'}</span>
        <span><b>PACIENTES:</b> {totalPacientes}</span>
        <span><b>INDICACIONES:</b> {totalMedicamentos}</span>
      </div>

      {/* Servicios con subservicios (URGENCIAS, TOCO CIRUGÍA, PEDIATRÍA): una
          sección por subservicio, ordenada por número de cama, con salto de
          página entre bloques. Los servicios de un solo subservicio se imprimen
          en una tabla continua. */}
      {(() => {
        const secciones = agruparPorSubservicio(grupos);
        return secciones.length > 1
          ? secciones.map((sg, i, arr) => (
              <RecetarioSeccion
                key={sg.subservicio_id}
                titulo={sg.nombre}
                subtitulo={sg.nombre_completo}
                grupos={sg.grupos}
                esUltima={i === arr.length - 1}
              />
            ))
          : <RecetarioSeccion grupos={grupos} esUltima={true} />;
      })()}

      {/* Leyenda y pie con 3 firmas clásicas de receta IMSS */}
      <div style={leyendaBox}>
        <span><b>SOL</b> = Cantidad solicitada a farmacia &nbsp; · &nbsp; <b>DIS</b> = Cantidad dispensada por farmacia &nbsp; · &nbsp; ☐ = sin cantidad capturada (escribir a mano)</span>
      </div>

      <footer style={pieBox}>
        <div style={firma}>
          <div style={firmaLinea}></div>
          <div style={firmaLabel}>
            <b>MÉDICO TRATANTE</b>
            <div style={firmaSubLabel}>Nombre y firma · Cédula Profesional ____________</div>
          </div>
        </div>
        <div style={firma}>
          <div style={firmaLinea}></div>
          <div style={firmaLabel}>
            <b>ENFERMERA(O) RESPONSABLE</b>
            <div style={firmaSubLabel}>Nombre y firma · Turno: _____</div>
          </div>
        </div>
        <div style={firma}>
          <div style={firmaLinea}></div>
          <div style={firmaLabel}>
            <b>FARMACIA — DISPENSACIÓN</b>
            <div style={firmaSubLabel}>Sello / Fecha entrega: ___________________</div>
          </div>
        </div>
      </footer>

      <div style={pieFolio}>
        FOLIO ____   ·   HOJA 1 DE 1
      </div>

      {/* Estilos de impresión */}
      <style>{`
        @page {
          size: legal landscape;
          margin: 8mm 6mm;
        }

        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }

        @media screen {
          .hoja-impresion {
            background: white;
            max-width: 1500px;
            margin: 60px auto 20px;
            padding: 14px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          }
        }

        .hoja-impresion {
          font-family: Arial, sans-serif;
          color: #000;
        }

        .tabla-recetario {
          width: 100%;
          border-collapse: collapse;
          font-size: 9pt;
          table-layout: fixed;
          margin-top: 6px;
        }
        .tabla-recetario th,
        .tabla-recetario td {
          border: 0.5px solid #555;
          padding: 3px 4px;
          vertical-align: top;
          word-wrap: break-word;
          overflow: hidden;
        }
        .tabla-recetario thead th {
          background: #265C4E;
          color: white;
          font-weight: 700;
          text-align: center;
          font-size: 8.5pt;
          padding: 5px 4px;
          letter-spacing: 0.3px;
        }
        .tabla-recetario tbody td {
          height: 26px;
        }

        /* Columnas de paciente */
        .tabla-recetario .c-cama {
          background: #f5f1e8;
          font-weight: 700;
          text-align: center;
          font-size: 11pt;
          vertical-align: middle;
        }
        .tabla-recetario .c-paciente {
          vertical-align: middle;
        }
        .tabla-recetario .c-paciente .nombre {
          font-weight: 700;
          font-size: 12pt;
          line-height: 1.1;
        }
        .tabla-recetario .c-paciente .datos-pac {
          font-size: 8pt;
          color: #555;
          margin-top: 2px;
        }
        .tabla-recetario .c-dx {
          font-size: 8pt;
          vertical-align: middle;
          line-height: 1.15;
        }

        /* Columnas de medicamento */
        .tabla-recetario .c-med {
          font-weight: 600;
          font-size: 12pt;
        }
        .tabla-recetario .c-pos {
          text-align: center;
          font-size: 9.5pt;
          font-weight: 600;
          color: #265C4E;
          background: #fafafa;
        }
        .tabla-recetario .c-via,
        .tabla-recetario .c-frec {
          text-align: center;
          font-size: 9.5pt;
        }

        /* Sección de subservicio (impresión por hoja en Pediatría) */
        .rec-seccion { margin-bottom: 16px; }
        .rec-page-break { page-break-after: always; }
        .rec-sub-encabezado {
          background: #FAF5EA;
          border-left: 6px solid #C39C59;
          padding: 6px 10px;
          margin-bottom: 4px;
          font-family: Arial, sans-serif;
        }
        .rec-sub-abrev {
          font-size: 16pt;
          font-weight: 800;
          color: #0E6755;
          letter-spacing: 0.5px;
        }
        .rec-sub-completo {
          font-size: 10pt;
          color: #7d5b2f;
          margin-left: 8px;
          text-transform: uppercase;
        }
        @media print {
          .rec-page-break { page-break-after: always; break-after: page; }
        }
        .tabla-recetario .c-check {
          text-align: center;
          font-size: 12pt;
          color: #888;
        }
        .tabla-recetario .c-obs {
          background: #fafafa;
        }

        /* Separadores entre pacientes */
        .tabla-recetario .fila-inicio-pac td {
          border-top: 1.5px solid #265C4E;
        }

        /* Estados especiales */
        .tabla-recetario .c-sin-meds {
          text-align: center;
          color: #888;
          font-style: italic;
          font-size: 8pt;
          vertical-align: middle;
          background: #fafafa;
        }
        .tabla-recetario .c-vacio {
          text-align: center;
          color: #888;
          font-style: italic;
          padding: 30px;
        }
      `}</style>
    </div>
  );
};

// ---------- Estilos inline ----------
const barraTop: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0,
  background: '#265C4E', color: '#fff', padding: '8px 16px',
  zIndex: 100, display: 'flex', alignItems: 'center', gap: 10,
  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
};
const btnPrint: React.CSSProperties = {
  background: '#fff', color: '#265C4E', border: 'none',
  padding: '6px 14px', borderRadius: 4, fontSize: 13, fontWeight: 700,
  cursor: 'pointer',
};
const btnCerrar: React.CSSProperties = {
  background: 'transparent', color: '#fff', border: '1px solid #fff',
  padding: '6px 14px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
};
const headerBox: React.CSSProperties = {
  textAlign: 'center', marginBottom: 6,
  borderBottom: '2px solid #0E6755', paddingBottom: 4,
};
const headerLinea1: React.CSSProperties = {
  background: '#C39C59', color: '#000', fontWeight: 700,
  fontSize: 10, padding: '4px 0', letterSpacing: 0.3,
};
const headerLinea2: React.CSSProperties = {
  background: '#0E6755', color: '#fff', fontWeight: 700,
  fontSize: 10, padding: '4px 0',
};
const headerLinea3: React.CSSProperties = {
  background: '#fff', color: '#0E6755', fontWeight: 700,
  fontSize: 9.5, padding: '4px 0',
};
const subHeaderBox: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between',
  fontSize: 9, padding: '4px 6px', marginBottom: 2,
  borderTop: '1px solid #555', borderBottom: '1px solid #555',
  background: '#fafafa',
};
const leyendaBox: React.CSSProperties = {
  fontSize: 8, color: '#555', padding: '4px 6px',
  fontStyle: 'italic', marginTop: 4,
};
const pieBox: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between',
  marginTop: 20, paddingTop: 6,
  borderTop: '1px solid #555',
};
const firma: React.CSSProperties = {
  width: '32%', textAlign: 'center',
};
const firmaLinea: React.CSSProperties = {
  borderBottom: '1px solid #000', height: 24, marginBottom: 2,
};
const firmaLabel: React.CSSProperties = {
  fontSize: 8, color: '#444', lineHeight: 1.3,
};
const firmaSubLabel: React.CSSProperties = {
  fontSize: 7, color: '#888', marginTop: 2,
};
const pieFolio: React.CSSProperties = {
  textAlign: 'right', fontSize: 8, color: '#666',
  marginTop: 6, paddingTop: 4,
};
