// Encabezado oficial reutilizable para TODAS las hojas de impresión.
// Logos institucionales a los costados + texto centrado SIN fondo de
// color. Diseño limpio y compacto: exactamente 3 renglones de texto
// (hospital / coordinación·CLUES / tipo de formato), con los logos a la
// misma altura que ese bloque de 3 renglones para que queden parejos.
//
// Es la ÚNICA fuente del encabezado: cualquier vista de impresión debe
// usar <EncabezadoOficial formato="..." /> para verse idéntica a las demás.

import React from 'react';

// Relación de aspecto real de los archivos (ancho/alto), para que al fijar
// la ALTURA los logos no se deformen y la columna reserve el ancho exacto.
const ASPECTO_IZQ = 2034 / 272;   // salud_imss_bienestar.png → banner ancho
const ASPECTO_DER = 1280 / 280;   // LOGO_HOSPITAL.png

interface Props {
  formato: string;             // 3er renglón: tipo de documento (SOLICITUD DE DIETAS, etc.)
  alturaLogos?: number;        // Altura visible de ambos logos en px (default 32)
  margenInferior?: number;     // Default 6
}

export const EncabezadoOficial: React.FC<Props> = ({
  formato,
  alturaLogos = 32,
  margenInferior = 6,
}) => (
  <header style={{
    display: 'grid',
    gridTemplateColumns: `${Math.round(alturaLogos * ASPECTO_IZQ)}px 1fr ${Math.round(alturaLogos * ASPECTO_DER)}px`,
    alignItems: 'center',
    gap: 12,
    borderBottom: '1.2px solid #0E6755',
    paddingBottom: 5,
    marginBottom: margenInferior,
  }}>
    <img
      src="/logos/salud_imss_bienestar.png"
      alt="SALUD · Servicios de Salud · IMSS-Bienestar"
      style={{ height: alturaLogos, width: 'auto', objectFit: 'contain' as const, justifySelf: 'start' }}
    />
    <div style={{ textAlign: 'center', lineHeight: 1.25 }}>
      <div style={{ fontSize: '8.5pt', fontWeight: 700, color: '#0E6755', letterSpacing: 0.2 }}>
        BENEMÉRITO HOSPITAL GENERAL CON ESPECIALIDADES IMSS-BIENESTAR "JUAN MARÍA DE SALVATIERRA"
      </div>
      <div style={{ fontSize: '8pt', fontWeight: 700, color: '#7d5b2f', marginTop: 1, letterSpacing: 0.3 }}>
        COORDINACIÓN DE ENFERMERÍA · CLUES BSIMB000672
      </div>
      <div style={{ fontSize: '8pt', fontWeight: 600, color: '#444', marginTop: 1, fontStyle: 'italic' as const }}>
        {formato}
      </div>
    </div>
    <img
      src="/logos/LOGO_HOSPITAL.png"
      alt='Benemérito Hospital General con Especialidades IMSS-Bienestar "Juan María de Salvatierra"'
      style={{ height: alturaLogos, width: 'auto', objectFit: 'contain' as const, justifySelf: 'end' }}
    />
  </header>
);
