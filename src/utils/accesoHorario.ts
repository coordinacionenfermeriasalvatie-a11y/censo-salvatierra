// Restricción de acceso por turno asignado.
//
// gestor y enfermera (gestores del cuidado / jefes de servicio / operativos)
// solo pueden entrar al censo dentro de la VENTANA DE ACCESO de su turno
// asignado (turno_principal). jefe / subjefe / supervisor entran 24/7, igual
// que quien tenga acceso_24_7 o es_admin_sistema.
//
// Ventanas de acceso dictadas por la subjefatura (hora local del Pacífico,
// America/Mazatlan, UTC-7), con traslape entre turnos para el cambio de guardia:
//   M = 07:00–15:00   V = 13:00–21:00   N = 19:30–08:30 (cruza medianoche)
//
// TURNOS DE FIN DE SEMANA — NO son acceso libre. Trabajan en bloques largos:
//
// ESPECIAL (dos sub-turnos; cuentan sábados, domingos Y días festivos):
//   ESPECIAL_D (diurno)   = 07:00–21:00 del día válido.
//   ESPECIAL_N (nocturno) = 19:00–09:00; la noche "pertenece" al día en que
//                           ARRANCA (igual criterio que el nocturno A/B),
//                           cubriendo la madrugada siguiente.
//
// ACUMULADA (un SOLO turno, sin diurno/nocturno; solo Sáb/Dom, sin festivos):
//   Sábado  = 07:00–22:00.
//   Domingo = 07:00 en adelante, de corrido hasta el LUNES 09:00.
//   (La noche del sábado NO entra; la del domingo sí, hasta el lunes 09:00.)
//
// Lun–Vie normales (no festivos) quedan BLOQUEADOS. Festivos = descanso
// obligatorio Art. 74 LFT (ver esFestivoOficial).
// Compat: valores viejos 'JORNADA'/'JORNADA_N' → ESPECIAL; y
//         'ACUMULADA_D'/'ACUMULADA_N' → 'ACUMULADA'.

import type { Perfil, Rol } from '../types'

const ROLES_RESTRINGIDOS: Rol[] = ['gestor', 'enfermera']

// Ventana en minutos desde la medianoche local. `fin` puede pasar de 1440
// (24:00) cuando la ventana cruza la medianoche (turno Nocturno).
type Ventana = { inicio: number; fin: number }

// Ventanas de ACCESO dictadas por la subjefatura, con traslape entre turnos
// para el cambio de guardia. N cruza medianoche, por eso su `fin` pasa de 1440.
const VENTANAS: Record<'M' | 'V' | 'N', Ventana> = {
  M: { inicio: 7 * 60, fin: 15 * 60 }, // 07:00–15:00
  V: { inicio: 13 * 60, fin: 21 * 60 }, // 13:00–21:00
  N: { inicio: 19 * 60 + 30, fin: 24 * 60 + 8 * 60 + 30 }, // 19:30–08:30 (+1 día)
}

// Ventanas de los turnos de fin de semana (mismas para especial y acumulada;
// solo cambian los DÍAS válidos). El traslape diurno/nocturno (19:00–21:00 y
// 07:00–09:00) es a propósito, para el cambio de guardia.
const FINDE_DIA = { inicio: 7 * 60, fin: 21 * 60 } // 07:00–21:00
const FINDE_NOCHE_INICIO = 19 * 60 // 19:00 (arranca la noche)
const FINDE_NOCHE_FIN = 9 * 60 // 09:00 (del día siguiente)

// Jornada ACUMULADA (un solo turno): sábado 07:00–22:00; domingo 07:00 corrido
// hasta el lunes 09:00. Sin festivos (solo Sáb/Dom).
const ACUM_DIA_INICIO = 7 * 60 // 07:00 (sábado y domingo)
const ACUM_SAB_FIN = 22 * 60 // 22:00 (cierre del sábado)
const ACUM_LUN_FIN = 9 * 60 // 09:00 (cierre de la madrugada del lunes)

type PartesLocal = { anio: number; mes: number; dia: number; minutos: number }

/** Año, mes, día y minutos-desde-medianoche en hora local del Pacífico
 *  (America/Mazatlan), sin importar la zona horaria del dispositivo. */
function partesLocalesMazatlan(ahora: Date): PartesLocal {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mazatlan',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(ahora)
  const val = (t: string) => Number(partes.find(p => p.type === t)?.value ?? '0')
  return {
    anio: val('year'),
    mes: val('month'),
    dia: val('day'),
    minutos: val('hour') * 60 + val('minute'),
  }
}

/** Minutos desde la medianoche en hora local del Pacífico (America/Mazatlan). */
export function minutosLocalesMazatlan(ahora: Date = new Date()): number {
  return partesLocalesMazatlan(ahora).minutos
}

function dentroDeVentana(min: number, v: Ventana): boolean {
  if (v.fin <= 1440) return min >= v.inicio && min < v.fin
  // Cruza medianoche: [inicio, 24:00) ∪ [00:00, fin-24:00)
  return min >= v.inicio || min < v.fin - 1440
}

function turnoDe(perfil: Pick<Perfil, 'turno_principal'>): string {
  return (perfil.turno_principal ?? '').trim().toUpperCase()
}

function grupoDe(perfil: Pick<Perfil, 'grupo_nocturno'>): 'A' | 'B' | null {
  const g = (perfil.grupo_nocturno ?? '').trim().toUpperCase()
  return g === 'A' || g === 'B' ? g : null
}

/** Grupo nocturno ('A' | 'B') que está de guardia en la NOCHE vigente en este
 *  instante, o null si ahora no hay noche vigente (fuera de 19:30–08:30).
 *
 *  El nocturno se parte en dos grupos que se alternan por la PARIDAD de la
 *  fecha en que ARRANCA la noche: en junio (mes par) las noches de día NON las
 *  cubre A y las pares B; la regla se voltea cada mes. Equivale a: A cubre la
 *  noche cuando (día + mes) es impar; B cuando es par. Como la noche cruza la
 *  medianoche, de 00:00 a 08:29 la noche "arrancó ayer", así que se usa la
 *  fecha de inicio, no la del reloj. */
function grupoNocturnoDeGuardia(ahora: Date): 'A' | 'B' | null {
  const { anio, mes, dia, minutos } = partesLocalesMazatlan(ahora)
  let m = mes
  let d = dia
  if (minutos >= 19 * 60 + 30) {
    // 19:30–23:59: la noche arranca HOY (mes/día ya correctos).
  } else if (minutos < 8 * 60 + 30) {
    // 00:00–08:29: la noche arrancó AYER (usar fecha previa, vía UTC).
    const ayer = new Date(Date.UTC(anio, mes - 1, dia))
    ayer.setUTCDate(ayer.getUTCDate() - 1)
    m = ayer.getUTCMonth() + 1
    d = ayer.getUTCDate()
  } else {
    return null // 08:30–19:29: sin noche vigente.
  }
  return (d + m) % 2 === 1 ? 'A' : 'B'
}

/** Día del mes (1-based) del n-ésimo lunes de un mes, calculado en UTC. */
function nthLunes(anio: number, mes: number, n: number): number {
  const dowPrimero = new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay() // 0=Dom..6=Sáb
  const offset = (1 - dowPrimero + 7) % 7 // días hasta el primer lunes
  return 1 + offset + (n - 1) * 7
}

/** ¿Es día de descanso obligatorio (festivo oficial, Art. 74 LFT)?
 *  Incluye los festivos "recorridos" a lunes y la transmisión del Poder
 *  Ejecutivo Federal (1 oct cada 6 años: 2024, 2030, 2036…). No incluye
 *  jornadas electorales (variables) ni festivos locales/estatales. */
function esFestivoOficial(anio: number, mes: number, dia: number): boolean {
  if (mes === 1 && dia === 1) return true // Año Nuevo
  if (mes === 2 && dia === nthLunes(anio, 2, 1)) return true // 1er lunes feb (5 feb)
  if (mes === 3 && dia === nthLunes(anio, 3, 3)) return true // 3er lunes mar (21 mar)
  if (mes === 5 && dia === 1) return true // Día del Trabajo
  if (mes === 9 && dia === 16) return true // Independencia
  if (mes === 11 && dia === nthLunes(anio, 11, 3)) return true // 3er lunes nov (20 nov)
  if (mes === 10 && dia === 1 && (anio - 2024) % 6 === 0) return true // transmisión Ejec.
  if (mes === 12 && dia === 25) return true // Navidad
  return false
}

/** ¿Ese día es válido para un turno de fin de semana? Sábado o domingo siempre;
 *  además los festivos oficiales si `incluyeFestivos` (familia ESPECIAL). */
function esDiaFinde(anio: number, mes: number, dia: number, incluyeFestivos: boolean): boolean {
  const dow = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()
  if (dow === 0 || dow === 6) return true // domingo o sábado
  return incluyeFestivos && esFestivoOficial(anio, mes, dia)
}

/** Acceso DIURNO de fin de semana: día válido (Sáb/Dom[/festivo]) y 07:00–21:00. */
function accesoFindeDiurno(ahora: Date, incluyeFestivos: boolean): boolean {
  const { anio, mes, dia, minutos } = partesLocalesMazatlan(ahora)
  return (
    esDiaFinde(anio, mes, dia, incluyeFestivos) &&
    minutos >= FINDE_DIA.inicio &&
    minutos < FINDE_DIA.fin
  )
}

/** Acceso NOCTURNO de fin de semana (19:00–09:00). La noche pertenece al día en
 *  que ARRANCA (19:00); de 00:00 a 08:59 arrancó AYER. Así cubre las noches de
 *  Sáb/Dom[/festivo] y su madrugada siguiente (p. ej. la noche del domingo se
 *  extiende a la madrugada del lunes). */
function accesoFindeNocturno(ahora: Date, incluyeFestivos: boolean): boolean {
  const { anio, mes, dia, minutos } = partesLocalesMazatlan(ahora)
  if (minutos >= FINDE_NOCHE_INICIO) {
    return esDiaFinde(anio, mes, dia, incluyeFestivos) // la noche arranca HOY
  }
  if (minutos < FINDE_NOCHE_FIN) {
    const ayer = new Date(Date.UTC(anio, mes - 1, dia))
    ayer.setUTCDate(ayer.getUTCDate() - 1) // la noche arrancó AYER
    return esDiaFinde(ayer.getUTCFullYear(), ayer.getUTCMonth() + 1, ayer.getUTCDate(), incluyeFestivos)
  }
  return false // 09:00–18:59: sin noche vigente
}

/** Acceso de JORNADA ACUMULADA (un solo turno, sin diurno/nocturno; solo
 *  Sáb/Dom, sin festivos). Ventana dictada por la subjefatura:
 *    Sábado : 07:00–22:00.
 *    Domingo: 07:00 en adelante, de corrido hasta el LUNES 09:00.
 *  La noche del sábado NO entra (cierra a las 22:00); la del domingo se extiende
 *  a la madrugada del lunes hasta las 09:00. */
function accesoAcumulada(ahora: Date): boolean {
  const { anio, mes, dia, minutos } = partesLocalesMazatlan(ahora)
  const dow = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay() // 0=Dom..6=Sáb
  if (dow === 6) return minutos >= ACUM_DIA_INICIO && minutos < ACUM_SAB_FIN // Sáb 07:00–22:00
  if (dow === 0) return minutos >= ACUM_DIA_INICIO // Dom 07:00 → (sigue de corrido)
  if (dow === 1) return minutos < ACUM_LUN_FIN // Lun 00:00–08:59 (madrugada del domingo)
  return false
}

/** Normaliza el turno: traduce valores viejos a los actuales para no bloquear a
 *  nadie que haya quedado con un valor anterior.
 *  - 'JORNADA'/'JORNADA_N'      → ESPECIAL (la familia más permisiva).
 *  - 'ACUMULADA_D'/'ACUMULADA_N'→ 'ACUMULADA' (ya no se separa diurno/nocturno). */
function normalizaTurno(turno: string): string {
  if (turno === 'JORNADA') return 'ESPECIAL_D'
  if (turno === 'JORNADA_N') return 'ESPECIAL_N'
  if (turno === 'ACUMULADA_D' || turno === 'ACUMULADA_N') return 'ACUMULADA'
  return turno
}

/** TRUE si el rol está sujeto a la restricción de horario por turno. */
export function rolRestringidoPorHorario(rol: Rol): boolean {
  return ROLES_RESTRINGIDOS.includes(rol)
}

/** ¿Puede esta cuenta acceder al censo en este momento?
 *  - Roles globales (jefe/subjefe/supervisor): siempre.
 *  - acceso_24_7 o es_admin_sistema: siempre (excepción del administrador).
 *  - ESPECIAL_D/_N: fin de semana CON festivos (diurno 07:00–21:00 / nocturno
 *    19:00–09:00). ACUMULADA: un solo turno, solo Sáb/Dom (sin festivos):
 *    sábado 07:00–22:00 y domingo 07:00 corrido hasta el lunes 09:00.
 *  - turno M/V: solo dentro de su ventana de acceso.
 *  - turno N: dentro de la ventana nocturna Y, si tiene grupo (A/B), solo las
 *    noches que le tocan a su grupo. N sin grupo entra cualquier noche.
 *  - sin turno asignado: NO (debe contactar a la jefatura). */
export function accesoPermitidoPorHorario(
  perfil: Pick<
    Perfil,
    'rol' | 'turno_principal' | 'grupo_nocturno' | 'acceso_24_7' | 'es_admin_sistema'
  >,
  ahora: Date = new Date()
): boolean {
  if (!rolRestringidoPorHorario(perfil.rol)) return true
  if (perfil.acceso_24_7 === true) return true
  if (perfil.es_admin_sistema === true) return true

  const turno = normalizaTurno(turnoDe(perfil))

  // Turnos de fin de semana. ESPECIAL (con festivos) se parte en diurno/nocturno;
  // ACUMULADA es un solo turno (solo Sáb/Dom).
  if (turno === 'ESPECIAL_D') return accesoFindeDiurno(ahora, true)
  if (turno === 'ESPECIAL_N') return accesoFindeNocturno(ahora, true)
  if (turno === 'ACUMULADA') return accesoAcumulada(ahora)

  if (turno === 'M' || turno === 'V') {
    return dentroDeVentana(minutosLocalesMazatlan(ahora), VENTANAS[turno])
  }

  if (turno === 'N') {
    if (!dentroDeVentana(minutosLocalesMazatlan(ahora), VENTANAS.N)) return false
    const grupo = grupoDe(perfil)
    if (grupo === null) return true // N sin grupo: entra cualquier noche en su ventana.
    return grupoNocturnoDeGuardia(ahora) === grupo
  }

  // Sin turno asignado (NULL / vacío) => bloquear.
  return false
}

/** Texto legible de la ventana de acceso permitida, para la pantalla de
 *  bloqueo. */
export function descripcionVentanaAcceso(
  perfil: Pick<Perfil, 'turno_principal' | 'grupo_nocturno'>
): string {
  switch (normalizaTurno(turnoDe(perfil))) {
    case 'M':
      return 'Tu turno es Matutino: puedes ingresar de 07:00 a 15:00.'
    case 'V':
      return 'Tu turno es Vespertino: puedes ingresar de 13:00 a 21:00.'
    case 'N': {
      const grupo = grupoDe(perfil)
      if (grupo !== null) {
        return `Eres Nocturno ${grupo}: solo puedes ingresar las noches que le tocan a tu grupo, de 19:30 a 08:30. Si esta noche no es de tu grupo, te toca descanso.`
      }
      return 'Tu turno es Nocturno: puedes ingresar de 19:30 a 08:30.'
    }
    case 'ESPECIAL_D':
      return 'Tu turno es Especial diurno: solo puedes ingresar sábados, domingos y días festivos, de 07:00 a 21:00.'
    case 'ESPECIAL_N':
      return 'Tu turno es Especial nocturno: solo puedes ingresar las noches de sábado, domingo y día festivo, de 19:00 a 09:00.'
    case 'ACUMULADA':
      return 'Tu turno es Jornada acumulada: puedes ingresar el sábado de 07:00 a 22:00, y el domingo de 07:00 en adelante, de corrido hasta el lunes a las 09:00.'
    default:
      return 'No tienes un turno asignado. Contacta a la subjefatura de enfermería para que registre tu turno y puedas ingresar.'
  }
}
