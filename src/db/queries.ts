import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './dexie'
import { rank } from '@/lib/search'
import { bestPrices, type PricedProduct } from '@/lib/pricing'
import type { Product, ProductPrice, Store } from './schema'

/**
 * Consultas reactivas contra el espejo local. Todas pasan por useLiveQuery, así
 * que la pantalla se repinta sola cuando cambia Dexie —lo escriba esta persona
 * o lo traiga una bajada del hogar— sin suscripciones manuales.
 *
 * El household_id NO se filtra aquí: el espejo solo contiene el hogar activo,
 * porque la bajada solo trae eso. Filtrar de nuevo sería redundante.
 */

export function useStores(): Store[] {
  return (
    useLiveQuery(() => db.stores.orderBy('name').toArray(), [], []) ?? []
  )
}

export function useStore(id: string | undefined): Store | undefined {
  return useLiveQuery(() => (id ? db.stores.get(id) : undefined), [id])
}

/** Cuántos productos tiene cada súper como el más barato: la "medalla" del súper. */
export function useStoreWinCounts(): Record<string, number> {
  return (
    useLiveQuery(async () => {
      const [products, prices] = await Promise.all([
        db.products.toArray(),
        db.product_prices.toArray(),
      ])
      const best = bestPrices(products, prices)
      const counts: Record<string, number> = {}
      for (const p of best) {
        if (p.bestStoreId) counts[p.bestStoreId] = (counts[p.bestStoreId] ?? 0) + 1
      }
      return counts
    }, [], {}) ?? {}
  )
}

export function useProduct(id: string | undefined): Product | undefined {
  return useLiveQuery(() => (id ? db.products.get(id) : undefined), [id])
}

/** Precios vivos de un producto, del más barato al más caro. */
export function useProductPrices(productId: string | undefined): ProductPrice[] {
  return (
    useLiveQuery(
      () =>
        productId
          ? db.product_prices.where('product_id').equals(productId).sortBy('price')
          : Promise.resolve<ProductPrice[]>([]),
      [productId],
      [],
    ) ?? []
  )
}

/**
 * Catálogo con su mejor precio ya resuelto, ordenado para el typeahead.
 *
 * El cálculo del mejor precio corre en el cliente (lib/pricing) sobre el espejo,
 * porque tiene que funcionar sin señal. Es la misma lógica que la vista SQL
 * best_prices, y una prueba compara las dos para que no se separen.
 */
export function useCatalog(query: string): PricedProduct[] {
  return (
    useLiveQuery(async () => {
      const [products, prices, stores] = await Promise.all([
        db.products.toArray(),
        db.product_prices.toArray(),
        db.stores.toArray(),
      ])
      const priced = bestPrices(products, prices, stores)
      return rank(priced, query, {
        getText: (p) => `${p.name} ${p.brand ?? ''}`,
        getLastUsedAt: (p) => (p.last_used_at ? Date.parse(p.last_used_at) : null),
      })
    }, [query], []) ?? []
  )
}

export function useCatalogCount(): number {
  return useLiveQuery(() => db.products.count(), [], 0) ?? 0
}
