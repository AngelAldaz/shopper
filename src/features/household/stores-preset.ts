/**
 * Supers que casi todo mundo tiene cerca en México, para que el alta no empiece
 * con una pantalla vacía. Los colores están elegidos para distinguirse entre sí
 * de un vistazo en la vista "por súper", no para imitar a cada marca.
 */
export const PRESET_STORES = [
  { name: 'Walmart', color: '#2E77BB' },
  { name: 'Bodega Aurrerá', color: '#E8A33D' },
  { name: 'Soriana', color: '#D94F4F' },
  { name: 'Chedraui', color: '#E8623D' },
  { name: 'La Comer', color: '#7C5CD6' },
  { name: 'Sam’s Club', color: '#4A6FA5' },
  { name: 'Costco', color: '#B8437E' },
  { name: 'Mercado', color: '#2E8B6B' },
  { name: 'Oxxo', color: '#C4453C' },
  { name: 'HEB', color: '#8A6478' },
] as const

/** Paleta para los supers que se creen a mano. */
export const STORE_COLORS = [
  '#2E77BB',
  '#E8A33D',
  '#D94F4F',
  '#E8623D',
  '#7C5CD6',
  '#4A6FA5',
  '#B8437E',
  '#2E8B6B',
  '#C4453C',
  '#8A6478',
] as const
