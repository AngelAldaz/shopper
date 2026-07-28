import { db } from '@/db/dexie'
import { saveRow } from '@/db/mutate'

/**
 * Agrega un producto a una lista, o le suma cantidad si ya estaba.
 *
 * El índice único (list_id, product_id) del servidor no permite dos renglones
 * del mismo producto; en vez de chocar contra él, se suma. Es también lo que la
 * persona espera: agregar "huevo" dos veces es querer más huevo, no un error.
 */
export async function addProductToList(
  householdId: string,
  listId: string,
  productId: string,
  quantity: number,
): Promise<void> {
  const existing = await db.list_items
    .where('list_id')
    .equals(listId)
    .filter((i) => i.product_id === productId)
    .first()

  if (existing) {
    await saveRow('list_items', {
      id: existing.id,
      household_id: householdId,
      quantity: existing.quantity + quantity,
      // Volver a agregar algo tachado lo destacha: lo acabas de pedir otra vez.
      is_checked: false,
      checked_at: null,
    })
    return
  }

  // sort_order al final: los productos nuevos van abajo, en el orden en que se
  // agregaron, que es como se piensa una lista.
  const count = await db.list_items.where('list_id').equals(listId).count()
  await saveRow('list_items', {
    household_id: householdId,
    list_id: listId,
    product_id: productId,
    quantity,
    is_checked: false,
    sort_order: count,
  })

  // Marca de uso, para que el typeahead suba lo que más ocupas.
  await saveRow('products', {
    id: productId,
    household_id: householdId,
    last_used_at: new Date().toISOString(),
  })
}
