export interface SupabaseConfig {
  url: string
  anonKey: string
  /** false → la app arranca igual, pero avisa en pantalla en vez de romperse. */
  configured: boolean
}

// Valores de relleno con forma válida. No sirven para nada, pero evitan que
// createClient lance al cargar el módulo, que es lo que deja la pantalla en
// blanco sin ningún mensaje.
const PLACEHOLDER_URL = 'http://127.0.0.1:54321'
const PLACEHOLDER_KEY = 'llave-ausente'

/**
 * Resuelve las llaves de Supabase tolerando el caso que de verdad ocurre:
 * que la variable exista pero venga VACÍA.
 *
 * Vite sustituye `import.meta.env.VITE_*` en tiempo de compilación. Si la
 * variable no está definida en el CI, lo que queda en el bundle es `""`, no
 * `undefined`. Por eso aquí NO se puede usar `??`: el operador de fusión nula
 * deja pasar la cadena vacía tal cual, y createClient('') revienta al cargar
 * el módulo → pantalla en blanco, sin errores visibles y sin nada que indique
 * qué falta.
 */
export function resolveSupabaseConfig(rawUrl?: string, rawKey?: string): SupabaseConfig {
  const url = rawUrl?.trim() ?? ''
  const anonKey = rawKey?.trim() ?? ''
  return {
    url: url || PLACEHOLDER_URL,
    anonKey: anonKey || PLACEHOLDER_KEY,
    configured: Boolean(url && anonKey),
  }
}
