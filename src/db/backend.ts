import { supabase } from '@/lib/supabase'

export interface SyncError {
  message: string
  code?: string | undefined
}

/**
 * Lo único que el motor necesita del servidor.
 *
 * Existe como interfaz para poder probar la sincronización contra un doble en
 * memoria: los casos que de verdad importan —que un 4xx no atore la cola, que
 * reintentar sea idempotente, que la ventana de solape no pierda filas— son
 * imposibles de provocar de forma fiable contra un servidor real.
 */
export interface SyncBackend {
  upsert(entity: string, payload: Record<string, unknown>): Promise<{ error: SyncError | null }>
  fetchSince(
    entity: string,
    cursorColumn: string,
    sinceIso: string,
  ): Promise<{ rows: Record<string, unknown>[]; error: SyncError | null }>
  fetchAll(entity: string): Promise<{ rows: Record<string, unknown>[]; error: SyncError | null }>
}

export const supabaseBackend: SyncBackend = {
  async upsert(entity, payload) {
    const { error } = await supabase.from(entity).upsert(payload, { onConflict: 'id' })
    return { error: error ? { message: error.message, code: error.code } : null }
  },

  async fetchSince(entity, cursorColumn, sinceIso) {
    const { data, error } = await supabase.from(entity).select('*').gt(cursorColumn, sinceIso)
    return {
      rows: (data ?? []) as Record<string, unknown>[],
      error: error ? { message: error.message, code: error.code } : null,
    }
  },

  async fetchAll(entity) {
    const { data, error } = await supabase.from(entity).select('*')
    return {
      rows: (data ?? []) as Record<string, unknown>[],
      error: error ? { message: error.message, code: error.code } : null,
    }
  },
}

/**
 * Códigos que no van a mejorar por reintentar: una política que rechaza, una
 * restricción violada, una columna que no existe.
 *
 * Todo lo demás se considera pasajero (sin red, 5xx, timeout) y se reintenta.
 * El sesgo es deliberado: dar por perdido un cambio que sí se podía subir es
 * mucho peor que reintentarlo de más, porque significa perder algo que la
 * persona capturó en el súper. Aun así, `MAX_TRIES` acaba apartando lo que no
 * avanza, para que nunca bloquee a lo que viene detrás.
 */
const PERMANENT_CODES = new Set([
  '42501', // política RLS / falta de privilegio
  '23502', // not null
  '23503', // clave foránea
  '23505', // índice único
  '23514', // check
  '22P02', // tipo mal formado
  'PGRST116',
  'PGRST200',
  'PGRST201',
  'PGRST202',
  'PGRST204',
])

export function isPermanent(error: SyncError): boolean {
  return Boolean(error.code && PERMANENT_CODES.has(error.code))
}

/**
 * ¿La petición ni siquiera llegó a tener respuesta del servidor?
 *
 * Las respuestas de PostgREST SIEMPRE traen un `code`. Su ausencia significa que
 * el fetch falló antes de recibir nada: sin señal, DNS, timeout, CORS. Eso no es
 * un cambio inválido, es falta de red, y no debe contar como intento fallido —si
 * contara, unos minutos de mala señal en el súper marcarían como "no se guardó"
 * algo perfectamente bueno, que era justo el bug reportado.
 */
export function isNetworkError(error: SyncError): boolean {
  return !error.code
}
