/**
 * Normalización de texto para búsqueda: minúsculas, sin acentos, sin espacios
 * de más.
 *
 * IMPORTANTE: esta función tiene un gemelo en Postgres (`public.norm_text`) que
 * alimenta la columna generada `products.search_key`. Si las dos dejan de
 * coincidir, el índice del servidor y el buscador del cliente ordenarían
 * distinto y el typeahead mostraría cosas que la base no encuentra.
 * `src/lib/norm.test.ts` compara ambas contra la misma lista de casos.
 */
export function norm(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .normalize('NFD') // separa la letra de su acento: "ñ" → "n" + "◌̃"
    .replace(/[̀-ͯ]/g, '') // y tira el acento
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Divide en palabras ya normalizadas, para el ranking por prefijo de palabra. */
export function words(text: string | null | undefined): string[] {
  const n = norm(text)
  return n ? n.split(' ') : []
}
