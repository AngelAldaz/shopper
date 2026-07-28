import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './dexie'
import { resolveListItem, type ResolvedItem } from '@/lib/pricing'
import type { Unit } from '@/lib/money'
import type { ListItem, ShoppingList, Store } from './schema'

export interface ShoppingListWithProgress extends ShoppingList {
  total: number
  checked: number
  /** Estimado del hogar; "≈" porque los precios pueden haber cambiado. */
  estimated: number
  /** Cuántos renglones no tienen precio en ningún súper. */
  missingPrices: number
}

/** Listas activas con su progreso y total estimado, para las tarjetas. */
export function useLists(): ShoppingListWithProgress[] {
  return (
    useLiveQuery(async () => {
      const [lists, items, prices, products] = await Promise.all([
        db.shopping_lists.toArray(),
        db.list_items.toArray(),
        db.product_prices.toArray(),
        db.products.toArray(),
      ])

      const pricesByProduct = groupBy(prices, (p) => p.product_id)
      const productById = new Map(products.map((p) => [p.id, p]))
      const emptyStores = new Map<string, Store>()

      return lists
        .filter((l) => l.status !== 'archivada')
        .map((list): ShoppingListWithProgress => {
          const mine = items.filter((i) => i.list_id === list.id)
          let estimated = 0
          let missingPrices = 0

          for (const item of mine) {
            const product = productById.get(item.product_id)
            if (!product) continue
            const resolved = resolveListItem(
              item.quantity,
              item.pinned_store_id,
              product,
              pricesByProduct.get(item.product_id) ?? [],
              emptyStores,
            )
            if (resolved.subtotal === null) missingPrices++
            else estimated += resolved.subtotal
          }

          return {
            ...list,
            total: mine.length,
            checked: mine.filter((i) => i.is_checked).length,
            estimated: Math.round(estimated * 100) / 100,
            missingPrices,
          }
        })
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    }, [], []) ?? []
  )
}

export function useList(id: string | undefined): ShoppingList | undefined {
  return useLiveQuery(() => (id ? db.shopping_lists.get(id) : undefined), [id])
}

export interface ResolvedListItem extends ListItem {
  productName: string
  brand: string | null
  unit: Unit
  resolved: ResolvedItem
}

/**
 * Renglones de una lista, cada uno ya resuelto a su súper y subtotal.
 *
 * Reactivo sobre TODO lo que influye en el precio: si alguien del hogar cambia
 * el precio del huevo, esta lista se repinta con el nuevo súper ganador sin que
 * el usuario haga nada.
 */
export function useListItems(listId: string | undefined): ResolvedListItem[] {
  return (
    useLiveQuery(async () => {
      if (!listId) return []
      const [items, prices, products, stores] = await Promise.all([
        db.list_items.where('list_id').equals(listId).toArray(),
        db.product_prices.toArray(),
        db.products.toArray(),
        db.stores.toArray(),
      ])

      const pricesByProduct = groupBy(prices, (p) => p.product_id)
      const productById = new Map(products.map((p) => [p.id, p]))
      const storeById = new Map(stores.map((s) => [s.id, s]))

      return items
        .map((item) => {
          const product = productById.get(item.product_id)
          if (!product) return null
          return {
            ...item,
            productName: product.name,
            brand: product.brand,
            unit: product.unit,
            resolved: resolveListItem(
              item.quantity,
              item.pinned_store_id,
              product,
              pricesByProduct.get(item.product_id) ?? [],
              storeById,
            ),
          } as ResolvedListItem
        })
        .filter((x): x is ResolvedListItem => x !== null)
        .sort((a, b) => a.sort_order - b.sort_order || a.productName.localeCompare(b.productName, 'es'))
    }, [listId], []) ?? []
  )
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = map.get(k)
    if (list) list.push(item)
    else map.set(k, [item])
  }
  return map
}
