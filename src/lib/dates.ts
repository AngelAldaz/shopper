const rtf = new Intl.RelativeTimeFormat('es-MX', { numeric: 'auto' })
const fmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })

/**
 * "hoy", "hace 3 días", o la fecha corta si ya es viejo. Para saber de un
 * vistazo si un precio está fresco o conviene volver a mirarlo en el estante.
 */
export function relativeDate(iso: string, now = Date.now()): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const days = Math.round((then - now) / 86_400_000)

  if (days === 0) return 'hoy'
  if (days > -7) return rtf.format(days, 'day')
  return fmt.format(then)
}

/** Fecha larga legible: "24 de julio". Para el encabezado de compartir. */
export function longDate(iso: string | number = Date.now()): string {
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long' }).format(
    typeof iso === 'string' ? Date.parse(iso) : iso,
  )
}
