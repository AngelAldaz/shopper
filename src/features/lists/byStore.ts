import type { ResolvedListItem } from '@/db/lists'

export interface StoreGroup {
  storeId: string | null
  storeName: string
  storeColor: string | null
  items: ResolvedListItem[]
  subtotal: number
  hasMissing: boolean
}

/**
 * Agrupa los renglones por el súper donde conviene comprarlos.
 *
 * Es la vista que responde la pregunta real del usuario en la puerta del súper:
 * "ya que voy a Walmart, ¿qué me llevo aquí y cuánto va a ser?". Los productos
 * sin precio caen en un grupo aparte para que se note que les falta dato, en
 * vez de desaparecer o ensuciar un total.
 */
export function groupByStore(items: ResolvedListItem[]): StoreGroup[] {
  const groups = new Map<string, StoreGroup>()
  const MISSING = '__sin_precio__'

  for (const item of items) {
    const key = item.resolved.storeId ?? MISSING
    let group = groups.get(key)
    if (!group) {
      group = {
        storeId: item.resolved.storeId,
        storeName: item.resolved.storeName ?? 'Falta precio',
        storeColor: item.resolved.storeColor,
        items: [],
        subtotal: 0,
        hasMissing: key === MISSING,
      }
      groups.set(key, group)
    }
    group.items.push(item)
    if (item.resolved.subtotal !== null) group.subtotal += item.resolved.subtotal
  }

  // Redondeo por grupo tras acumular, para no arrastrar coma flotante.
  for (const g of groups.values()) g.subtotal = Math.round(g.subtotal * 100) / 100

  // Los supers con más gasto primero; el grupo "falta precio" siempre al final.
  return [...groups.values()].sort((a, b) => {
    if (a.hasMissing) return 1
    if (b.hasMissing) return -1
    return b.subtotal - a.subtotal
  })
}

export function listTotal(items: ResolvedListItem[]): { total: number; missing: number } {
  let total = 0
  let missing = 0
  for (const item of items) {
    if (item.resolved.subtotal === null) missing++
    else total += item.resolved.subtotal
  }
  return { total: Math.round(total * 100) / 100, missing }
}
