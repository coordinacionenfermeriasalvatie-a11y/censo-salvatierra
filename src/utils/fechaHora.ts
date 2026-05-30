// Helpers de fecha/turno en la zona horaria oficial del hospital:
// America/Mazatlan (Pacifico/BCS, UTC-7 fijo, sin horario de verano).
//
// El turno sigue las MISMAS fronteras oficiales que usa la base de datos
// (fn_turno_actual / fn_turno_de_fecha):
//   Matutino   M: 08:00 - 14:29
//   Vespertino V: 14:30 - 20:29
//   Nocturno   N: 20:30 - 07:59
//
// IMPORTANTE: no usar new Date().toISOString().slice(0,10) para "hoy"
// (eso da la fecha en UTC; despues de ~17:00 hora local ya es el dia
// siguiente en UTC) ni new Date().getHours() para el turno (eso usa la
// zona horaria del dispositivo, no la del hospital).

export const TZ_HOSPITAL = 'America/Mazatlan';

/** Fecha de hoy (YYYY-MM-DD) en hora del hospital. */
export const hoyMazatlan = (): string => {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: TZ_HOSPITAL, year: 'numeric', month: '2-digit', day: '2-digit',
  };
  const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

/** Hora actual (HH:MM, 24h) en hora del hospital. */
export const horaMazatlan = (): string => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ_HOSPITAL, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('hour')}:${get('minute')}`;
};

/**
 * Partes de fecha/hora de un instante (Date o ISO timestamptz) en hora del
 * hospital. month es 1-12. Util para formatear timestamps de la BD sin que la
 * zona horaria del dispositivo corra el dia/hora.
 */
export const partesMazatlan = (input: Date | string): {
  year: number; month: number; day: number; hour: number; minute: number;
} => {
  const d = typeof input === 'string' ? new Date(input) : input;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ_HOSPITAL, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const n = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? '0', 10);
  return { year: n('year'), month: n('month'), day: n('day'), hour: n('hour') % 24, minute: n('minute') };
};

/** Turno actual (M/V/N) segun fronteras oficiales, en hora del hospital. */
export const turnoActualMazatlan = (): 'M' | 'V' | 'N' => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ_HOSPITAL, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const hh = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10) % 24;
  const mm = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  const mins = hh * 60 + mm;
  if (mins >= 8 * 60 && mins <= 14 * 60 + 29) return 'M';      // 08:00 - 14:29
  if (mins >= 14 * 60 + 30 && mins <= 20 * 60 + 29) return 'V'; // 14:30 - 20:29
  return 'N';                                                   // 20:30 - 07:59
};
