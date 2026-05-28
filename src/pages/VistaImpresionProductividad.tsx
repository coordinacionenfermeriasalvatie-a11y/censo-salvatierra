// src/pages/VistaImpresionProductividad.tsx
// =====================================================================
// BLOQUE 7 — Impresión de Productividad Mensual a PDF
// =====================================================================
// Benemérito Hospital General con Especialidades del IMSS-Bienestar "Juan María de Salvatierra"
// CLUES BSIMB000672
//
// Formato: Carta vertical, una sección por servicio. Cada servicio muestra
// el GRAN TOTAL POR PROCESO (no detalle indicador por indicador, para que
// quepa en hojas razonables). Para el detalle se usa el Excel.
//
// Ruta: /imprimir/productividad/:anio/:mes
//   ?auto=1 (default) → abre Cmd+P automáticamente
//   ?auto=0           → solo previsualiza
// =====================================================================

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface FilaExport {
  servicio_id: number;
  servicio_codigo: string;
  servicio_nombre: string;
  servicio_orden: number;
  indicador_id: number;
  indicador_codigo: string;
  proceso_id: number;
  proceso_nom: string;
  indicador_etiqueta: string;
  catalogo_origen: string;
  total_m: number;
  total_v: number;
  total_n: number;
  total_mes: number;
  anio: number | null;
  mes: number | null;
}

const MESES_TEXTO = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

export const VistaImpresionProductividad: React.FC = () => {
  const { anio: anioStr, mes: mesStr } = useParams<{ anio: string; mes: string }>();
  const [searchParams] = useSearchParams();
  const autoImprimir = searchParams.get('auto') !== '0';

  const anio = parseInt(anioStr || '0', 10);
  const mes = parseInt(mesStr || '0', 10);

  const [filas, setFilas] = useState<FilaExport[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!anio || !mes || mes < 1 || mes > 12) {
      setError('Año o mes inválido');
      setCargando(false);
      return;
    }

    const cargar = async () => {
      try {
        const { data, error: err } = await supabase
          .from('v_productividad_export_mensual')
          .select('*')
          .or(`anio.eq.${anio},anio.is.null`)
          .or(`mes.eq.${mes},mes.is.null`);

        if (err) throw err;

        const filtradas = (data as FilaExport[]).filter(f =>
          (f.anio === anio && f.mes === mes) || (f.anio === null && f.mes === null)
        );

        setFilas(filtradas);
      } catch (e: any) {
        setError(e.message || String(e));
      } finally {
        setCargando(false);
      }
    };

    cargar();
  }, [anio, mes]);

  useEffect(() => {
    if (!cargando && !error && autoImprimir) {
      const t = setTimeout(() => window.print(), 700);
      return () => clearTimeout(t);
    }
  }, [cargando, error, autoImprimir]);

  if (cargando) {
    return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>Cargando productividad...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#A32D2D', fontFamily: 'Arial, sans-serif' }}>
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => window.close()} style={{ marginTop: 16, padding: '8px 16px' }}>Cerrar</button>
      </div>
    );
  }

  // Agrupar por servicio
  const serviciosMap = new Map<number, { codigo: string; nombre: string; orden: number; filas: FilaExport[] }>();
  filas.forEach(f => {
    if (!serviciosMap.has(f.servicio_id)) {
      serviciosMap.set(f.servicio_id, { codigo: f.servicio_codigo, nombre: f.servicio_nombre, orden: f.servicio_orden, filas: [] });
    }
    serviciosMap.get(f.servicio_id)!.filas.push(f);
  });
  const servicios = Array.from(serviciosMap.values()).sort((a, b) => a.orden - b.orden);

  // Para cada servicio: agrupar por proceso y sumar
  const procesosPorServicio = servicios.map(sv => {
    const procMap = new Map<number, { nombre: string; total: number; indicadores: number }>();
    sv.filas.forEach(f => {
      if (!procMap.has(f.proceso_id)) {
        procMap.set(f.proceso_id, { nombre: f.proceso_nom, total: 0, indicadores: 0 });
      }
      const g = procMap.get(f.proceso_id)!;
      g.total += f.total_mes;
      g.indicadores++;
    });
    return {
      ...sv,
      procesos: Array.from(procMap.entries()).map(([pid, p]) => ({ pid, ...p })).sort((a, b) => a.pid - b.pid),
      totalServicio: sv.filas.reduce((acc, f) => acc + f.total_mes, 0),
    };
  });

  const granTotal = procesosPorServicio.reduce((acc, sv) => acc + sv.totalServicio, 0);
  const fechaHoy = new Date().toLocaleString('es-MX', { timeZone: 'America/Mazatlan' });

  return (
    <>
      <style>{cssImpresion}</style>

      {!autoImprimir && (
        <div className="no-print barra-accion">
          <button onClick={() => window.print()} className="btn-imprimir">🖨️ Imprimir</button>
          <button onClick={() => window.close()} className="btn-cerrar">✕ Cerrar</button>
          <span className="vista-info">Vista previa · Carta vertical · {servicios.length} servicios</span>
        </div>
      )}

      <div className="hoja">
        {/* ENCABEZADO INSTITUCIONAL */}
        <div className="encabezado">
          <div className="banda-dorada">BENEMÉRITO HOSPITAL GENERAL CON ESPECIALIDADES DEL IMSS-BIENESTAR</div>
          <div className="banda-verde">"JUAN MARÍA DE SALVATIERRA" — CLUES BSIMB000672</div>
          <div className="subtitulo">PRODUCTIVIDAD MENSUAL CONSOLIDADA — REPORTE EJECUTIVO</div>
        </div>

        <div className="sub-encabezado">
          <div><strong>PERIODO:</strong> {MESES_TEXTO[mes - 1]} {anio}</div>
          <div><strong>SERVICIOS:</strong> {servicios.length}</div>
          <div><strong>ELABORADO:</strong> {fechaHoy}</div>
        </div>

        {/* TABLA RESUMEN POR SERVICIO Y PROCESO */}
        <table className="tabla">
          <thead>
            <tr>
              <th className="c-servicio">SERVICIO</th>
              <th>1. CENSO HOSPITALARIO</th>
              <th>2. TERAPIA INFUSIÓN</th>
              <th>3. SONDAS Y DISPOSITIVOS</th>
              <th>4. VENTILACIÓN</th>
              <th>5. CIRUGÍA / OBSTETRICIA</th>
              <th>6. HERIDAS</th>
              <th>7. EVENTOS CRÍTICOS</th>
              <th>8. CALIDAD</th>
              <th className="c-total">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {procesosPorServicio.map(sv => (
              <tr key={sv.codigo}>
                <td className="c-servicio">
                  <div className="sv-nombre">{sv.nombre}</div>
                  <div className="sv-codigo">{sv.codigo}</div>
                </td>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(pid => {
                  const p = sv.procesos.find(x => x.pid === pid);
                  return <td key={pid} className="c-num">{p?.total || 0}</td>;
                })}
                <td className="c-total">{sv.totalServicio}</td>
              </tr>
            ))}
            <tr className="fila-gran-total">
              <td className="c-servicio">▶ TOTAL HOSPITAL</td>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(pid => {
                const totalProc = procesosPorServicio.reduce((acc, sv) => {
                  const p = sv.procesos.find(x => x.pid === pid);
                  return acc + (p?.total || 0);
                }, 0);
                return <td key={pid} className="c-num">{totalProc}</td>;
              })}
              <td className="c-total">{granTotal}</td>
            </tr>
          </tbody>
        </table>

        <div className="leyenda">
          <em>
            Reporte ejecutivo de productividad mensual del Benemérito Hospital General con Especialidades del IMSS-Bienestar "Juan María de Salvatierra" — IMSS-Bienestar.
            Los valores corresponden a la suma mensual por proceso oficial de captura de productividad de enfermería.
            Para el detalle indicador por indicador (73 indicadores oficiales × turno M/V/N) consultar el archivo Excel
            consolidado entregado en conjunto con este reporte.
          </em>
        </div>

        {/* FIRMAS */}
        <div className="firmas">
          <div className="firma-bloque">
            <div className="firma-linea"></div>
            <div className="firma-titulo">ENFERMERA(O) SUBJEFE</div>
            <div className="firma-sub">Elaboró · Nombre / Firma</div>
          </div>
          <div className="firma-bloque">
            <div className="firma-linea"></div>
            <div className="firma-titulo">ENFERMERA(O) JEFE</div>
            <div className="firma-sub">Revisó / Validó · Nombre / Firma</div>
          </div>
        </div>

        <div className="footer">
          <span>FOLIO ________</span>
          <span>HOJA 1 DE 1</span>
          <span>ELABORADO: {fechaHoy}</span>
        </div>
      </div>
    </>
  );
};

const cssImpresion = `
@page { size: letter portrait; margin: 12mm 10mm; }
* { box-sizing: border-box; }
body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background: #e8e8e8; color: #000; }
@media print {
  body { background: #fff; }
  .no-print { display: none !important; }
  .hoja { margin: 0 !important; box-shadow: none !important; padding: 0 !important; }
}
.barra-accion {
  position: sticky; top: 0; z-index: 100;
  background: #265C4E; padding: 8px 16px;
  display: flex; align-items: center; gap: 12px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}
.btn-imprimir { background: #fff; color: #0E6755; border: none; border-radius: 4px; padding: 6px 14px; font-size: 13px; font-weight: 700; cursor: pointer; }
.btn-cerrar { background: transparent; color: #fff; border: 1px solid #fff; border-radius: 4px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
.vista-info { color: rgba(255,255,255,0.85); font-size: 12px; margin-left: 8px; }
.hoja { width: 190mm; min-height: 273mm; margin: 12px auto; padding: 8mm; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
.encabezado { border: 2px solid #0E6755; border-radius: 4px; overflow: hidden; margin-bottom: 8px; }
.banda-dorada { background: #C39C59; color: #fff; padding: 4px 10px; font-size: 10pt; font-weight: 700; text-align: center; }
.banda-verde { background: #0E6755; color: #fff; padding: 4px 10px; font-size: 10pt; font-weight: 700; text-align: center; }
.subtitulo { background: #fff; color: #0E6755; padding: 5px 10px; font-size: 10pt; font-weight: 700; text-align: center; border-top: 1px solid #C39C59; }
.sub-encabezado { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #0E6755; margin-bottom: 8px; font-size: 9pt; color: #265C4E; }
.tabla { width: 100%; border-collapse: collapse; font-size: 8pt; margin-bottom: 10px; }
.tabla th { background: #0E6755; color: #fff; border: 1px solid #C39C59; padding: 5px 4px; text-align: center; font-weight: 700; font-size: 7.5pt; letter-spacing: 0.3px; }
.tabla td { border: 1px solid #C39C59; padding: 5px 4px; vertical-align: middle; color: #000; }
.c-servicio { background: #F5F1E8; font-weight: 700; text-align: left !important; padding-left: 8px !important; width: 18%; }
.sv-nombre { font-size: 9pt; color: #0E6755; }
.sv-codigo { font-size: 7pt; color: #888; font-weight: 400; margin-top: 1px; }
.c-num { text-align: center; font-size: 9pt; }
.c-total { background: #FFF2CC; text-align: center; font-weight: 700; font-size: 10pt; color: #0E6755; }
.fila-gran-total { background: #0E6755; }
.fila-gran-total td { background: #0E6755 !important; color: #fff !important; font-weight: 700; font-size: 10pt; }
.fila-gran-total .c-total { background: #265C4E !important; }
.leyenda { font-size: 8pt; color: #555; padding: 4px 0 16px 0; text-align: justify; }
.firmas { display: flex; justify-content: space-around; gap: 30px; margin-top: 20px; }
.firma-bloque { flex: 1; text-align: center; }
.firma-linea { border-bottom: 1px solid #000; height: 22px; margin-bottom: 4px; }
.firma-titulo { font-size: 10pt; font-weight: 700; color: #0E6755; letter-spacing: 0.5px; }
.firma-sub { font-size: 8pt; color: #555; margin-top: 2px; }
.footer { margin-top: 18px; border-top: 1px solid #C39C59; padding-top: 4px; display: flex; justify-content: space-between; font-size: 8pt; color: #555; font-weight: 600; }
`;
