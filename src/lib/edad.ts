// src/lib/edad.ts
// Formateador de edad respetando la unidad (AÑOS / MESES / DÍAS).
// Para neonatos en UCIN/UTIN se usa DIAS o MESES. Para el resto AÑOS.

export type EdadUnidad = 'AÑOS' | 'MESES' | 'DIAS';

export function formatEdad(
  edad: number | null | undefined,
  unidad?: EdadUnidad | string | null,
): string {
  if (edad == null) return '';
  const u = (unidad ?? 'AÑOS') as EdadUnidad;
  if (u === 'DIAS') return `${edad} ${edad === 1 ? 'día' : 'días'}`;
  if (u === 'MESES') return `${edad} ${edad === 1 ? 'mes' : 'meses'}`;
  return `${edad} ${edad === 1 ? 'año' : 'años'}`;
}

// Versión corta para tablas apretadas (impresión Control).
export function formatEdadCorta(
  edad: number | null | undefined,
  unidad?: EdadUnidad | string | null,
): string {
  if (edad == null) return '';
  const u = (unidad ?? 'AÑOS') as EdadUnidad;
  if (u === 'DIAS') return `${edad}d`;
  if (u === 'MESES') return `${edad}m`;
  return `${edad}a`;
}
