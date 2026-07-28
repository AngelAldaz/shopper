import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './dexie'
import type { PriceHistoryRow } from './schema'

export interface PricePoint {
  date: string
  price: number
  recordedAt: number
}

export interface StoreHistory {
  storeId: string
  storeName: string
  storeColor: string
  points: PricePoint[]
  current: number
  /** Cambio contra el registro anterior de ESE súper, o null si es el primero. */
  delta: number | null
  previousAt: string | null
}

/**
 * Historial de precios de un producto, una serie por súper.
 *
 * El delta compara el precio actual con el ANTERIOR del mismo súper: es lo que
 * responde "¿esto subió desde la última vez que lo compré aquí?", que es la
 * pregunta real. Comparar entre supers distintos no diría nada útil.
 */
export function usePriceHistory(productId: string | undefined): StoreHistory[] {
  return (
    useLiveQuery(async () => {
      if (!productId) return []
      const [rows, stores] = await Promise.all([
        db.price_history.where('[product_id+store_id]').between([productId, ''], [productId, '￿']).toArray(),
        db.stores.toArray(),
      ])
      const storeById = new Map(stores.map((s) => [s.id, s]))

      const byStore = new Map<string, PriceHistoryRow[]>()
      for (const r of rows) {
        const list = byStore.get(r.store_id)
        if (list) list.push(r)
        else byStore.set(r.store_id, [r])
      }

      const result: StoreHistory[] = []
      for (const [storeId, list] of byStore) {
        const store = storeById.get(storeId)
        if (!store) continue // súper borrado: su historial no se muestra

        list.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
        const points = list.map((r) => ({
          date: r.recorded_at,
          price: Number(r.price),
          recordedAt: Date.parse(r.recorded_at),
        }))

        const last = list[list.length - 1]!
        const prev = list.length > 1 ? list[list.length - 2]! : null
        result.push({
          storeId,
          storeName: store.name,
          storeColor: store.color,
          points,
          current: Number(last.price),
          delta: prev ? Math.round((Number(last.price) - Number(prev.price)) * 100) / 100 : null,
          previousAt: prev?.recorded_at ?? null,
        })
      }

      // El súper con el precio actual más barato primero.
      return result.sort((a, b) => a.current - b.current)
    }, [productId], []) ?? []
  )
}
