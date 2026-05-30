// src/pages/VistaImpresionDietas.tsx
// =====================================================================
// IMPRESIÓN — SOLICITUD DE DIETAS (Servicio de Nutrición y Dietología)
// =====================================================================
// Benemérito Hospital General con Especialidades IMSS-Bienestar "Juan María de Salvatierra"
// CLUES BSIMB000672
//
// Formato: Carta VERTICAL (8.5" × 11"), una sola hoja con todos los
// pacientes activos del servicio.
//
// Columnas: CAMA · PACIENTE · TIPO DE DIETA · CONSISTENCIA · RESTRICCIONES · OBSERVACIONES
//
// Fuente de datos: vista v_dietas_servicio (JOINs pre-armados).
// Solo pacientes con estado='ACTIVO' (la vista ya filtra).
//
// Ruta: /imprimir/dietas/:servicioId
//   ?auto=1 (default)  → abre Cmd+P automáticamente al cargar
//   ?auto=0            → solo previsualiza (botón Imprimir manual arriba)
// =====================================================================
import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { EncabezadoOficial } from './components/EncabezadoOficial';

interface DietaImpresion {
  paciente_id: string;
  subservicio: string;
  numero_cama: string;
  nombre_paciente: string;
  edad: number;
  genero: string;
  nss_curp: string | null;
  tipo_dieta: string | null;
  consistencia: string | null;
  restricciones: string | null;
  observaciones: string | null;
}

interface ServicioInfo {
  nombre: string;
  codigo: string;
  total_camas: number;
}

export const VistaImpresionDietas: React.FC = () => {
  const { servicioId } = useParams<{ servicioId: string }>();
  const [searchParams] = useSearchParams();
  const autoImprimir = searchParams.get('auto') !== '0';

  const [dietas, setDietas] = useState<DietaImpresion[]>([]);
  const [servicio, setServicio] = useState<ServicioInfo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Solicitante = usuario que imprime; se firma con su nombre y matrícula.
  const [solicitante, setSolicitante] = useState<{ nombre_completo: string; matricula: string } | null>(null);

  // =====================================================================
  // CARGA DE DATOS
  // =====================================================================
  useEffect(() => {
    if (!servicioId) {
      setError('No se especificó el servicio.');
      setCargando(false);
      return;
    }

    const sid = parseInt(servicioId, 10);
    if (isNaN(sid)) {
      setError('ID de servicio inválido.');
      setCargando(false);
      return;
    }

    const cargar = async () => {
      try {
        // 1. Información del servicio
        const { data: servData, error: servError } = await supabase
          .from('servicios')
          .select('nombre, codigo, total_camas')
          .eq('id', sid)
          .single();

        if (servError) throw servError;
        setServicio(servData as ServicioInfo);

        // 2. Orden de los subservicios del servicio (UTIP, UCIN…, OBSERVACIÓN,
        //    SALA DE CHOQUE…). Permite agrupar y ordenar igual que el censo.
        const { data: subsData } = await supabase
          .from('subservicios')
          .select('nombre, orden')
          .eq('servicio_id', sid);
        const ordenSub = new Map<string, number>(
          (subsData || []).map((s: any) => [s.nombre, s.orden])
        );

        // 3. Dietas del servicio (vista pre-armada con JOINs)
        const { data: dietasData, error: dietasError } = await supabase
          .from('v_dietas_servicio')
          .select('paciente_id, subservicio, numero_cama, nombre_paciente, edad, genero, nss_curp, tipo_dieta, consistencia, restricciones, observaciones')
          .eq('servicio_id', sid);

        if (dietasError) throw dietasError;

        // 4. Ordenar por subservicio (según su orden) y luego por número de cama.
        const unidas: DietaImpresion[] = (dietasData || []) as DietaImpresion[];
        unidas.sort((a, b) => {
          const oa = ordenSub.get(a.subservicio) ?? 9999;
          const ob = ordenSub.get(b.subservicio) ?? 9999;
          if (oa !== ob) return oa - ob;
          return (a.numero_cama || '').localeCompare(b.numero_cama || '', undefined, { numeric: true });
        });

        setDietas(unidas);

        // Quién imprime/solicita: su nombre y matrícula van en la firma.
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: usr } = await supabase
            .from('perfiles')
            .select('nombre_completo, matricula')
            .eq('id', user.id)
            .single();
          if (usr) setSolicitante(usr as { nombre_completo: string; matricula: string });
        }
      } catch (e: any) {
        console.error('Error cargando dietas:', e);
        setError(`No se pudo cargar: ${e.message || e}`);
      } finally {
        setCargando(false);
      }
    };

    cargar();
  }, [servicioId]);

  // =====================================================================
  // AUTO-PRINT
  // =====================================================================
  useEffect(() => {
    if (!cargando && !error && autoImprimir) {
      const t = setTimeout(() => window.print(), 700);
      return () => clearTimeout(t);
    }
  }, [cargando, error, autoImprimir]);

  // =====================================================================
  // HELPERS
  // =====================================================================
  const generoCorto = (g: string | null): string => {
    if (!g) return '';
    const u = g.toUpperCase();
    if (u.startsWith('F')) return 'F';
    if (u.startsWith('M')) return 'M';
    return u.charAt(0);
  };

  const hoyTexto = (): string => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  const hoyConHora = (): string => {
    const d = new Date();
    const f = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const h = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${f} ${h}`;
  };

  // =====================================================================
  // ESTADOS DE CARGA / ERROR
  // =====================================================================
  if (cargando) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
        Cargando solicitud de dietas...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#A32D2D', fontFamily: 'Arial, sans-serif' }}>
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => window.close()} style={{ marginTop: 16, padding: '8px 16px' }}>
          Cerrar
        </button>
      </div>
    );
  }

  // =====================================================================
  // RENDER
  // =====================================================================
  const dietasActivas = dietas.filter(d => d.tipo_dieta || d.consistencia).length;
  // Servicios con varios subservicios (Urgencias, Toco Cirugía, Pediatría):
  // se agrupan en secciones con encabezado de subservicio y salto de página.
  const haySubservicios = new Set(dietas.map(d => d.subservicio).filter(Boolean)).size > 1;

  return (
    <>
      <style>{cssImpresion}</style>

      {/* Barra de acción (solo pantalla, no se imprime) */}
      {!autoImprimir && (
        <div className="no-print barra-accion">
          <button onClick={() => window.print()} className="btn-imprimir">
            🖨️ Imprimir
          </button>
          <button onClick={() => window.close()} className="btn-cerrar">
            ✕ Cerrar
          </button>
          <span className="vista-info">
            Vista previa · Tamaño: <strong>Carta horizontal</strong> · {dietas.length} pacientes · {dietasActivas} dietas activas
          </span>
        </div>
      )}

      <div className="hoja">
        {/* ENCABEZADO INSTITUCIONAL UNIFICADO */}
        <EncabezadoOficial formato="SOLICITUD DE DIETAS — SERVICIO DE NUTRICIÓN Y DIETOLOGÍA" />

        {/* SUB-ENCABEZADO DE SERVICIO */}
        <div className="sub-encabezado">
          <div className="se-bloque"><strong>FECHA:</strong> {hoyTexto()}</div>
          <div className="se-bloque"><strong>SERVICIO:</strong> {servicio?.nombre || 'N/D'}</div>
          <div className="se-bloque"><strong>PACIENTES:</strong> {dietas.length}</div>
          <div className="se-bloque"><strong>DIETAS ACTIVAS:</strong> {dietasActivas}</div>
        </div>

        {/* TABLA DE DIETAS */}
        <table className="tabla">
          <thead>
            <tr>
              <th className="c-cama">CAMA</th>
              <th className="c-paciente">PACIENTE</th>
              <th className="c-tipo">TIPO DE DIETA</th>
              <th className="c-cons">CONSISTENCIA</th>
              <th className="c-restr">RESTRICCIONES</th>
              <th className="c-obs">OBSERVACIONES</th>
            </tr>
          </thead>
          <tbody>
            {dietas.map((d, idx) => {
              // En servicios con subservicios: encabezado antes del primer
              // paciente de cada grupo, con salto de página (excepto el 1°).
              const subAnterior = idx > 0 ? dietas[idx - 1].subservicio : null;
              const inicioGrupo = haySubservicios && d.subservicio !== subAnterior;
              return (
                <React.Fragment key={d.paciente_id}>
                  {inicioGrupo && (
                    <tr className={idx === 0 ? 'sub-grupo primera' : 'sub-grupo'}>
                      <td colSpan={6}>{d.subservicio}</td>
                    </tr>
                  )}
                  <tr className={idx % 2 === 0 ? 'fila-par' : 'fila-impar'}>
                    <td className="c-cama">{d.numero_cama}</td>
                    <td className="c-paciente">
                      <div className="p-nombre">{d.nombre_paciente}</div>
                      <div className="p-sub">{d.edad != null ? `${d.edad} ${d.edad === 1 ? 'año' : 'años'}` : '—'} · {generoCorto(d.genero)} · {d.nss_curp || '—'}</div>
                    </td>
                    <td className="c-tipo"><strong>{d.tipo_dieta || '—'}</strong></td>
                    <td className="c-cons">{d.consistencia || '—'}</td>
                    <td className="c-restr">{d.restricciones || '—'}</td>
                    <td className="c-obs">{d.observaciones || ''}</td>
                  </tr>
                </React.Fragment>
              );
            })}
            {/* Filas vacías para completar el total de camas (solo en servicios
                de un solo subservicio; al agrupar no aplica). */}
            {!haySubservicios && servicio && Array.from({ length: Math.max(0, servicio.total_camas - dietas.length) }).map((_, idx) => (
              <tr key={`vacia-${idx}`} className="fila-vacia">
                <td className="c-cama">&nbsp;</td>
                <td colSpan={5}>&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* LEYENDA */}
        <div className="leyenda">
          <em>Solicitud emitida por el servicio de enfermería para coordinación con Nutrición y Cocina. Cualquier cambio en tipo o consistencia debe notificarse por escrito.</em>
        </div>

        {/* PIE CON FIRMA — 1 firma: Enfermera(o) solicitante (auto del usuario) */}
        <div className="firma">
          <div className="linea-firma"></div>
          <div className="firma-titulo">ENFERMERA(O) SOLICITANTE</div>
          {solicitante && (
            <div className="firma-nombre">{solicitante.nombre_completo} · Matrícula {solicitante.matricula}</div>
          )}
          <div className="firma-sub">Firma · Turno: ______</div>
        </div>

        {/* FOOTER */}
        <div className="footer">
          <span>FOLIO ________</span>
          <span>HOJA 1 DE 1</span>
          <span>ELABORADO: {hoyConHora()}</span>
        </div>
      </div>
    </>
  );
};

// =====================================================================
// CSS — Carta VERTICAL (8.5 × 11 in)
// =====================================================================
const cssImpresion = `
@page {
  size: letter landscape;
  margin: 10mm 12mm;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 0;
  font-family: Arial, Helvetica, sans-serif;
  background: #e8e8e8;
  color: #000;
}

.no-print {
  display: block;
}

@media print {
  body { background: #fff; }
  .no-print { display: none !important; }
  .hoja {
    margin: 0 !important;
    box-shadow: none !important;
    padding: 0 !important;
    min-height: auto !important;  /* evita 2ª hoja casi en blanco: el alto lo da el contenido */
  }
}

.barra-accion {
  position: sticky;
  top: 0;
  z-index: 100;
  background: #265C4E;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.btn-imprimir {
  background: #fff;
  color: #0E6755;
  border: none;
  border-radius: 4px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.btn-cerrar {
  background: transparent;
  color: #fff;
  border: 1px solid #fff;
  border-radius: 4px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
}

.vista-info {
  color: rgba(255,255,255,0.85);
  font-size: 12px;
  margin-left: 8px;
}

.hoja {
  width: 255mm;
  min-height: 196mm;
  margin: 12px auto;
  padding: 8mm;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

/* ENCABEZADO — logos a la misma ALTURA (28px), columnas al ancho real
   según la relación de aspecto (salud 7.48:1, hospital 4.57:1). */
.encabezado-flex {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
  border-bottom: 1.2px solid #0E6755;
  padding-bottom: 4px;
}
.logo-encabezado {
  height: 42px;
  width: auto;
  object-fit: contain;
}
.logo-izq { justify-self: start; }
.logo-der { justify-self: end; }
.encabezado {
  text-align: center;
  line-height: 1.2;
}

.linea-titulo-1 {
  font-size: 9pt;
  font-weight: 700;
  color: #0E6755;
  letter-spacing: 0.3px;
}

.linea-titulo-2 {
  font-size: 9pt;
  font-weight: 700;
  color: #0E6755;
  margin-top: 1px;
}

.linea-coordinacion {
  font-size: 8.5pt;
  font-weight: 700;
  color: #7d5b2f;
  margin-top: 2px;
  letter-spacing: 0.4px;
}

.linea-subtitulo {
  font-size: 8pt;
  font-weight: 600;
  color: #444;
  margin-top: 2px;
  font-style: italic;
}

/* Compatibilidad con clases viejas — sin fondo */
.banda-dorada, .banda-verde, .banda-coordinacion {
  background: transparent;
  color: #0E6755;
  padding: 1px 10px;
  font-size: 8.5pt;
  font-weight: 700;
  text-align: center;
  letter-spacing: 0.3px;
  line-height: 1.25;
}

.subtitulo {
  background: #fff;
  color: #0E6755;
  padding: 2px 10px;
  font-size: 8pt;
  font-weight: 700;
  text-align: center;
  letter-spacing: 0.4px;
  line-height: 1.25;
  border-top: 1px solid #C39C59;
}

/* SUB-ENCABEZADO */
.sub-encabezado {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  border-bottom: 1px solid #0E6755;
  margin-bottom: 8px;
  font-size: 9pt;
}

.se-bloque { color: #265C4E; }
.se-bloque strong { color: #0E6755; }

/* TABLA */
.tabla {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
  margin-bottom: 10px;
}

.tabla thead tr {
  background: #0E6755;
  color: #fff;
}

.tabla th {
  border: 1px solid #C39C59;
  padding: 5px 4px;
  text-align: center;
  font-weight: 700;
  font-size: 8.5pt;
  letter-spacing: 0.3px;
}

.tabla td {
  border: 1px solid #C39C59;
  padding: 4px 6px;
  vertical-align: middle;
  color: #000;
  height: 34px;
}

.fila-par { background: #fff; }
.fila-impar { background: #f5f1e8; }
.fila-vacia td { background: #fff; height: 28px; }

/* Encabezado de subservicio (Urgencias, Toco, Pediatría) */
.sub-grupo td {
  background: #DCEFE9;
  color: #0E6755;
  font-weight: 700;
  font-size: 9pt;
  letter-spacing: 0.4px;
  text-align: left;
  padding: 4px 8px;
  height: auto;
}
.sub-grupo:not(.primera) td { page-break-before: always; }

.c-cama {
  width: 36px;
  text-align: center;
  font-weight: 700;
  color: #0E6755;
  font-size: 11pt;
}

.c-paciente {
  width: 28%;
}

.p-nombre {
  font-weight: 700;
  font-size: 9pt;
  text-transform: uppercase;
  line-height: 1.15;
}

.p-sub {
  font-size: 7.5pt;
  color: #666;
  margin-top: 1px;
}

.c-tipo {
  width: 14%;
  text-align: center;
  font-size: 9.5pt;
}

.c-cons {
  width: 14%;
  text-align: center;
}

.c-restr {
  width: 18%;
  font-style: italic;
  font-size: 8.5pt;
}

.c-obs {
  width: auto;
  font-style: italic;
  font-size: 8.5pt;
  color: #444;
}

/* LEYENDA */
.leyenda {
  font-size: 8.5pt;
  color: #555;
  padding: 4px 0 8px 0;
}

/* FIRMA */
.firma {
  margin: 22px auto 6px auto;
  width: 65%;
  text-align: center;
}

.linea-firma {
  border-bottom: 1px solid #000;
  height: 16px;
}

.firma-titulo {
  font-size: 9.5pt;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #0E6755;
  margin-top: 2px;
}

.firma-nombre {
  font-size: 8.5pt;
  font-weight: 700;
  color: #000;
  margin-top: 2px;
}

.firma-sub {
  font-size: 7.5pt;
  color: #555;
  margin-top: 1px;
}

/* FOOTER */
.footer {
  margin-top: 14px;
  border-top: 1px solid #C39C59;
  padding-top: 4px;
  display: flex;
  justify-content: space-between;
  font-size: 8pt;
  color: #555;
  font-weight: 600;
  letter-spacing: 0.3px;
}
`;
