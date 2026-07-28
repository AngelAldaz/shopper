import type { Product, ProductPrice, Store } from '@/db/schema'

/**
 * Motor de "mejor precio", en el cliente.
 *
 * Es la misma lógica que las vistas best_prices y list_items_resolved de
 * supabase/migrations/0007, reimplementada aquí porque tiene que funcionar sin
 * señal, sobre el espejo local. pricing.test.ts comprueba que las dos den lo
 * mismo en los casos que importan; si divergen, la lista elegiría un súper
 * distinto con y sin conexión.
 *
 * Se asume que las filas que entran ya están vivas (deleted_at null): en el
 * espejo local solo hay filas vivas, porque la bajada borra lo eliminado.
 */

export interface PricedProduct extends Product {
  /** Súper donde está más barato, o null si no tiene precio en ningún lado. */
  bestStoreId: string | null
  bestStoreName: string | null
  bestStoreColor: string | null
  bestPrice: number | null
  /** Foto de ESE súper; si no tiene, la genérica del producto. */
  bestPhotoPath: string | null
  storeCount: number
}

/**
 * El más barato de una lista de precios de un mismo producto.
 *
 * Empata igual que el `distinct on ... order by price asc, updated_at desc` de
 * la vista: ante el mismo precio, gana el capturado más recientemente.
 */
export function cheapest(prices: ProductPrice[]): ProductPrice | null {
  let best: ProductPrice | null = null
  for (const p of prices) {
    if (
      !best ||
      p.price < best.price ||
      (p.price === best.price && p.updated_at > best.updated_at)
    ) {
      best = p
    }
  }
  return best
}

export function bestPrices(
  products: Product[],
  prices: ProductPrice[],
  stores: Store[] = [],
): PricedProduct[] {
  const storeById = new Map(stores.map((s) => [s.id, s]))
  const byProduct = new Map<string, ProductPrice[]>()
  for (const p of prices) {
    const list = byProduct.get(p.product_id)
    if (list) list.push(p)
    else byProduct.set(p.product_id, [p])
  }

  return products.map((product) => {
    const list = byProduct.get(product.id) ?? []
    const best = cheapest(list)
    const store = best ? storeById.get(best.store_id) : undefined
    return {
      ...product,
      bestStoreId: best?.store_id ?? null,
      bestStoreName: store?.name ?? null,
      bestStoreColor: store?.color ?? null,
      bestPrice: best?.price ?? null,
      bestPhotoPath: best?.photo_path ?? product.photo_path,
      storeCount: list.length,
    }
  })
}

export interface ResolvedItem {
  storeId: string | null
  storeName: string | null
  storeColor: string | null
  unitPrice: number | null
  photoPath: string | null
  subtotal: number | null
}

/**
 * Resuelve un renglón de lista: qué súper, a qué precio y cuánto suma.
 *
 * El coalesce va sobre súper Y precio A LA VEZ, no por separado. Si el usuario
 * fijó un súper y luego borró ESE precio, `pinned` no existe y los dos campos
 * caen JUNTOS al mejor precio. Resolverlos por separado mostraría el nombre del
 * súper fijado con el importe de otro. Es el caso al que la vista SQL dedica
 * una prueba, y aquí también.
 */
export function resolveListItem(
  quantity: number,
  pinnedStoreId: string | null,
  product: Product,
  prices: ProductPrice[],
  stores: Map<string, Store>,
): ResolvedItem {
  const pinned = pinnedStoreId
    ? (prices.find((p) => p.store_id === pinnedStoreId) ?? null)
    : null
  const chosen = pinned ?? cheapest(prices)

  if (!chosen) {
    return {
      storeId: null,
      storeName: null,
      storeColor: null,
      unitPrice: null,
      photoPath: product.photo_path,
      subtotal: null,
    }
  }

  const store = stores.get(chosen.store_id)
  return {
    storeId: chosen.store_id,
    storeName: store?.name ?? null,
    storeColor: store?.color ?? null,
    unitPrice: chosen.price,
    photoPath: chosen.photo_path ?? product.photo_path,
    // Se redondea a 2 al final, igual que round(...) en la vista, para que los
    // subtotales por kilo no arrastren decimales de coma flotante.
    subtotal: Math.round(chosen.price * quantity * 100) / 100,
  }
}
