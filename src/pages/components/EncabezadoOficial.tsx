// Encabezado oficial reutilizable para vistas de impresión.
// Logos a los costados (pequeños pero visibles para impresión) + texto
// institucional centrado en 3 líneas: banda dorada / banda verde / subtítulo.
//
// Tamaño compacto para que quepa en oficio horizontal y carta.

import React from 'react';

interface Props {
  subtitulo?: string;          // Ej. "COORDINACIÓN DE ENFERMERÍA — FORMATO CONTROL DE PACIENTES"
  alturaLogos?: number;        // Default 38px
  margenInferior?: number;     // Default 3
}

export const EncabezadoOficial: React.FC<Props> = ({
  subtitulo,
  alturaLogos = 38,
  margenInferior = 3,
}) => (
  <header style={{
    display: 'flex', alignItems: 'center', gap: 8,
    borderBottom: '1.5px solid #0E6755', paddingBottom: 2,
    marginBottom: margenInferior,
  }}>
    <img
      src="/logos/imss_bienestar.png"
      alt="IMSS-Bienestar"
      style={{ maxHeight: alturaLogos, maxWidth: alturaLogos * 1.4, width: 'auto', height: 'auto', objectFit: 'contain', flexShrink: 0 }}
    />
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{
        background: '#C39C59', color: '#000', fontWeight: 700,
        fontSize: 8, padding: '2px 0', letterSpacing: 0.3,
      }}>BENEMÉRITO HOSPITAL GENERAL CON ESPECIALIDADES DEL IMSS-BIENESTAR</div>
      <div style={{
        background: '#0E6755', color: '#fff', fontWeight: 700,
        fontSize: 8, padding: '2px 0',
      }}>"JUAN MARÍA DE SALVATIERRA" — CLUES BSIMB000672</div>
      {subtitulo && (
        <div style={{
          background: '#fff', color: '#0E6755', fontWeight: 700,
          fontSize: 7.5, padding: '2px 0',
        }}>{subtitulo}</div>
      )}
    </div>
    <img
      src="/logos/LOGO_HOSPITAL.jpg"
      alt='Benemérito Hospital General con Especialidades del IMSS-Bienestar "Juan María de Salvatierra"'
      style={{ maxHeight: alturaLogos, maxWidth: alturaLogos * 1.4, width: 'auto', height: 'auto', objectFit: 'contain', flexShrink: 0 }}
    />
  </header>
);
