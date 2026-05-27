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

// Días desde el nacimiento. Si hay fecha_nacimiento usa esa fecha exacta;
// si no, aproxima desde edad+unidad (1 año = 365 días, 1 mes = 30 días).
// Lo usa Pediatría: en UCIN/UTIN los neonatos viven horas/días y el cálculo
// exacto importa, mientras que en CYD/Escolares solo es un dato extra.
export function edadEnDias(
  edad: number | null | undefined,
  unidad?: EdadUnidad | string | null,
  fechaNac?: string | null,
): number | null {
  if (fechaNac) {
    const fn = new Date(fechaNac + 'T00:00:00');
    if (!isNaN(fn.getTime())) {
      const hoy = new Date();
      const ms = hoy.getTime() - fn.getTime();
      const dias = Math.floor(ms / (1000 * 60 * 60 * 24));
      if (dias >= 0) return dias;
    }
  }
  if (edad == null) return null;
  const u = (unidad ?? 'AÑOS') as EdadUnidad;
  if (u === 'DIAS') return edad;
  if (u === 'MESES') return edad * 30;
  return edad * 365;
}
