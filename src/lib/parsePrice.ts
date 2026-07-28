/**
 * Interpreta un precio tecleado a mano.
 *
 * En un teclado de iPhone en es-MX conviven la coma y el punto según el ajuste,
 * y la gente escribe "1,299.50" o "45,90" sin pensarlo. Se acepta lo que salga
 * y se devuelve un número o null; la UI decide qué hacer con el null.
 */
export function parsePrice(input: string): number | null {
  const raw = input.trim()
  if (!raw) return null

  // Quita todo menos dígitos, coma y punto.
  let s = raw.replace(/[^\d.,]/g, '')
  if (!s) return null

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')

  // El separador decimal es el ÚLTIMO que aparezca; el otro es de miles.
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    s = s.replace(/,/g, '')
  }

  const n = Number.parseFloat(s)
  if (!Number.isFinite(n) || n <= 0) return null
  // Dos decimales: es dinero.
  return Math.round(n * 100) / 100
}
