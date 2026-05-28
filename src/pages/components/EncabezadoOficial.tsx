// Encabezado oficial reutilizable para vistas de impresión.
// Logos institucionales a los costados + texto centrado SIN fondo de
// color. Diseño limpio, compacto y discreto para impresión profesional.

import React from 'react';

// Relación de aspecto real de los archivos (ancho/alto), para que al fijar
// la ALTURA los logos no se deformen y la columna reserve el ancho exacto.
const ASPECTO_IZQ = 2034 / 272;   // salud_imss_bienestar.png → 7.48:1 (banner ancho)
const ASPECTO_DER = 1280 / 280;   // LOGO_HOSPITAL.png        → 4.57:1

interface Props {
  subtitulo?: string;          // Ej. "FORMATO CONTROL DE PACIENTES — INTERVENCIONES DE ENFERMERÍA"
  alturaLogos?: number;        // Altura visible de ambos logos en px (default 34)
  margenInferior?: number;     // Default 4
}

export const EncabezadoOficial: React.FC<Props> = ({
  subtitulo,
  alturaLogos = 42,
  margenInferior = 4,
}) => (
  <header style={{
    display: 'grid',
    gridTemplateColumns: `${Math.round(alturaLogos * ASPECTO_IZQ)}px 1fr ${Math.round(alturaLogos * ASPECTO_DER)}px`,
    alignItems: 'center', gap: 12,
    borderBottom: '1.2px solid #0E6755', paddingBottom: 4,
    marginBottom: margenInferior,
  }}>
    <img
      src="/logos/salud_imss_bienestar.png"
      alt="SALUD · Servicios de Salud · IMSS-Bienestar"
      style={{ height: alturaLogos, width: 'auto', objectFit: 'contain' as const, justifySelf: 'start' }}
    />
    <div style={{ textAlign: 'center', lineHeight: 1.2 }}>
      <div style={{ fontSize: 8.5, fontWeight: 700, color: '#0E6755', letterSpacing: 0.3 }}>
        BENEMÉRITO HOSPITAL GENERAL CON ESPECIALIDADES IMSS-BIENESTAR
      </div>
      <div style={{ fontSize: 8.5, fontWeight: 700, color: '#0E6755', marginTop: 1 }}>
        "JUAN MARÍA DE SALVATIERRA" — CLUES BSIMB000672
      </div>
      <div style={{ fontSize: 8, fontWeight: 700, color: '#7d5b2f', marginTop: 1, letterSpacing: 0.4 }}>
        COORDINACIÓN DE ENFERMERÍA
      </div>
      {subtitulo && (
        <div style={{ fontSize: 7.5, fontWeight: 600, color: '#444', marginTop: 2, fontStyle: 'italic' }}>
          {subtitulo}
        </div>
      )}
    </div>
    <img
      src="/logos/LOGO_HOSPITAL.png"
      alt='Benemérito Hospital General con Especialidades IMSS-Bienestar "Juan María de Salvatierra"'
      style={{ height: alturaLogos, width: 'auto', objectFit: 'contain' as const, justifySelf: 'end' }}
    />
  </header>
);
