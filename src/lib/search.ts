import { norm } from './norm'

const DAY = 86_400_000
const MIN_SUBSTRING_TERM = 3

/**
 * Puntúa un texto ya normalizado contra un término suelto ya normalizado.
 *
 * La escala está pensada para que escribir "hu" ponga "huevo" por encima de
 * "hierbas finas", pero sin esconder esta última: el usuario pidió ver todas
 * las opciones e ir filtrando, no que la app decidiera por él.
 */
function scoreTerm(text: string, term: string): number {
  if (text.startsWith(term)) return 100 // "hu" → "huevo"
  if (text.split(' ').some((w) => w.startsWith(term))) return 60 // "fin" → "hierbas finas"
  // Buscar dentro de la palabra solo a partir de 3 letras: con "h" suelta,
  // "leche" también coincidiría y la primera pantalla del typeahead se llenaría
  // de ruido. Desde 3 letras ya hay intención clara ("uev" → "huevo").
  if (term.length >= MIN_SUBSTRING_TERM && text.includes(term)) return 25
  return 0
}

/**
 * Puntúa un texto contra la consulta completa. Con varias palabras, **todas**
 * tienen que aparecer ("huevo bl" no debe traer "pan blanco"), y la puntuación
 * es el promedio para que la escala no dependa de cuántas escribiste.
 *
 * Devuelve 0 cuando no hay coincidencia y 1 cuando la consulta está vacía, para
 * que una búsqueda en blanco liste todo en lugar de nada.
 */
export function scoreText(text: string, query: string): number {
  const q = norm(query)
  if (!q) return 1

  const t = norm(text)
  const terms = q.split(' ').filter(Boolean)
  let total = 0
  for (const term of terms) {
    const s = scoreTerm(t, term)
    if (s === 0) return 0
    total += s
  }
  return total / terms.length
}

/** Bonus 0–30 por uso reciente, con caída suave: ~30 hoy, ~15 a los 10 días. */
export function recencyBonus(lastUsedAt: number | null | undefined, now: number): number {
  // `== null` y no `!lastUsedAt`: el 0 es un timestamp válido, no "sin dato".
  if (lastUsedAt == null) return 0
  const days = Math.max(0, (now - lastUsedAt) / DAY)
  return 30 * Math.exp(-days / 14)
}

export interface RankOptions<T> {
  getText: (item: T) => string
  getLastUsedAt?: (item: T) => number | null | undefined
  /** Inyectable para que las pruebas no dependan del reloj. */
  now?: number
  limit?: number
}

/**
 * Ordena candidatos para el typeahead. Corre en cada tecla sobre el espejo
 * local (unos cientos de filas), así que no hace falta debounce ni red.
 */
export function rank<T>(items: T[], query: string, opts: RankOptions<T>): T[] {
  const { getText, getLastUsedAt, now = Date.now(), limit } = opts

  const scored = items
    .map((item) => {
      const base = scoreText(getText(item), query)
      return base === 0
        ? null
        : { item, score: base + recencyBonus(getLastUsedAt?.(item), now), text: norm(getText(item)) }
    })
    .filter((x): x is { item: T; score: number; text: string } => x !== null)

  // Alfabético como desempate: sin esto el orden de dos productos con la misma
  // puntuación cambiaría entre renders y la lista "bailaría" al escribir.
  scored.sort((a, b) => b.score - a.score || a.text.localeCompare(b.text, 'es'))

  const result = scored.map((s) => s.item)
  return limit ? result.slice(0, limit) : result
}
