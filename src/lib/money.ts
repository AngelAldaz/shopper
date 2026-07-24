const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
})

export function money(amount: number): string {
  return MXN.format(amount)
}

/**
 * Los totales de una lista siempre se muestran como aproximados: el precio
 * guardado es el de la última vez que alguien lo capturó, no el de hoy.
 */
export function approx(amount: number): string {
  return `≈ ${MXN.format(amount)}`
}

export type Unit = 'pieza' | 'kg' | 'l'

/** "por kilo", "por litro", "c/u" — cómo se lee el precio guardado. */
export function perUnitLabel(unit: Unit): string {
  return unit === 'kg' ? 'por kilo' : unit === 'l' ? 'por litro' : 'c/u'
}

/**
 * Formatea una cantidad en su unidad base para lectura humana.
 * En kg y L la cantidad se guarda en la unidad grande (0.5 = 500 g), pero se
 * muestra en gramos o mililitros cuando es menos de uno, que es como se piensa
 * al comprar.
 */
export function formatQuantity(quantity: number, unit: Unit): string {
  if (unit === 'pieza') {
    return `${quantity} ${quantity === 1 ? 'pieza' : 'piezas'}`
  }
  const small = unit === 'kg' ? 'g' : 'ml'
  const big = unit === 'kg' ? 'kg' : 'L'
  if (quantity < 1) return `${Math.round(quantity * 1000)} ${small}`
  return `${Number(quantity.toFixed(3))} ${big}`
}
