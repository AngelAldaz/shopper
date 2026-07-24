import Dexie, { type EntityTable } from 'dexie'
import type {
  HouseholdMemberRow,
  HouseholdRow,
  ListItem,
  MetaRow,
  OutboxOp,
  PendingPhoto,
  PriceHistoryRow,
  Product,
  ProductPrice,
  ProfileRow,
  ShoppingList,
  Store,
} from './schema'

/**
 * Espejo local del servidor.
 *
 * Toda la UI lee de aquí, nunca de la red. Eso no es una optimización: el caso
 * de uso central es corregir un precio parado en el pasillo del súper, donde no
 * hay señal.
 *
 * Solo se indexa lo que se consulta de verdad. Meter índices "por si acaso"
 * encarece cada escritura, y aquí se escribe mucho (cada producto tachado).
 */
export class ShopperDB extends Dexie {
  profiles!: EntityTable<ProfileRow, 'id'>
  households!: EntityTable<HouseholdRow, 'id'>
  household_members!: Dexie.Table<HouseholdMemberRow, [string, string]>
  stores!: EntityTable<Store, 'id'>
  products!: EntityTable<Product, 'id'>
  product_prices!: EntityTable<ProductPrice, 'id'>
  shopping_lists!: EntityTable<ShoppingList, 'id'>
  list_items!: EntityTable<ListItem, 'id'>
  price_history!: EntityTable<PriceHistoryRow, 'id'>

  outbox!: EntityTable<OutboxOp, 'seq'>
  photo_blobs!: EntityTable<PendingPhoto, 'id'>
  meta!: Dexie.Table<MetaRow, string>

  constructor(name = 'shopper') {
    super(name)
    this.version(1).stores({
      profiles: 'id',
      households: 'id',
      household_members: '[household_id+user_id], household_id, user_id',

      stores: 'id, household_id',
      products: 'id, household_id, last_used_at',
      product_prices: 'id, household_id, product_id, store_id, [product_id+store_id]',
      shopping_lists: 'id, household_id',
      list_items: 'id, household_id, list_id, product_id',
      price_history: 'id, [product_id+store_id]',

      outbox: '++seq, status, [entity+row_id]',
      photo_blobs: 'id',
      meta: 'key',
    })
  }
}

export const db = new ShopperDB()

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

/**
 * Borra el espejo entero.
 *
 * Se llama al cerrar sesión y al salir del hogar. En el segundo caso es
 * imprescindible: quien se sale tiene una copia completa en el teléfono, y sin
 * esto seguiría viendo los datos del hogar sin conexión para siempre, aunque el
 * servidor ya le haya cortado el acceso.
 */
export async function wipeLocalMirror(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
}
