import type { Unit } from '@/lib/money'

/**
 * Columnas que lleva toda tabla sincronizable. Ver supabase/migrations/0004
 * para el porqué de cada una; en resumen:
 *   id          lo genera el cliente, para poder crear cosas sin señal
 *   updated_at  lo pone el servidor, único reloj confiable para el delta
 *   deleted_at  borrado suave, o los borrados no viajarían entre teléfonos
 */
export interface SyncedRow {
  id: string
  household_id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  created_by: string | null
  updated_by: string | null
}

export interface Store extends SyncedRow {
  name: string
  color: string
}

export interface Product extends SyncedRow {
  name: string
  brand: string | null
  unit: Unit
  photo_path: string | null
  notes: string | null
  last_used_at: string | null
  /** Columna generada en el servidor. Nunca se envía. */
  search_key?: string
}

export interface ProductPrice extends SyncedRow {
  product_id: string
  store_id: string
  price: number
  photo_path: string | null
  package_note: string | null
}

export interface ShoppingList extends SyncedRow {
  name: string
  status: 'activa' | 'completada' | 'archivada'
  completed_at: string | null
}

export interface ListItem extends SyncedRow {
  list_id: string
  product_id: string
  /** SIEMPRE en la unidad base del producto: piezas, kilos o litros. */
  quantity: number
  /** null = "el más barato". Con valor, el usuario fijó un súper a mano. */
  pinned_store_id: string | null
  is_checked: boolean
  checked_at: string | null
  note: string | null
  sort_order: number
}

export interface PriceHistoryRow {
  id: number
  household_id: string
  product_price_id: string | null
  product_id: string
  store_id: string
  price: number
  recorded_at: string
  recorded_by: string | null
}

export interface HouseholdRow {
  id: string
  name: string
  invite_code: string
  updated_at: string
}

export interface HouseholdMemberRow {
  household_id: string
  user_id: string
  role: 'owner' | 'member'
  joined_at: string
}

export interface ProfileRow {
  id: string
  display_name: string
  active_household_id: string | null
  updated_at: string
}

/** Tablas que el cliente escribe y por tanto suben por la cola. */
export const PUSH_ENTITIES = [
  'stores',
  'products',
  'product_prices',
  'shopping_lists',
  'list_items',
] as const
export type PushEntity = (typeof PUSH_ENTITIES)[number]

/**
 * Todo lo que baja. El orden importa: primero aquello de lo que dependen los
 * demás, para que el espejo nunca tenga una fila apuntando a algo que todavía
 * no llegó.
 */
export const PULL_ENTITIES = [
  'profiles',
  'households',
  'household_members',
  'stores',
  'products',
  'product_prices',
  'shopping_lists',
  'list_items',
  'price_history',
] as const
export type PullEntity = (typeof PULL_ENTITIES)[number]

/**
 * Columnas que se mandan al servidor por cada tabla.
 *
 * Es una lista blanca a propósito, no un "todo menos algunas". Dos razones
 * concretas:
 *   · products.search_key es GENERATED ALWAYS: mandarla hace fallar el insert
 *     entero con "cannot insert into column".
 *   · created_by y updated_by los pone un trigger con auth.uid(); mandarlos
 *     desde el cliente sería confiar en algo que el cliente no debe decidir.
 */
export const PUSHABLE_COLUMNS: Record<PushEntity, readonly string[]> = {
  stores: ['id', 'household_id', 'name', 'color', 'created_at', 'deleted_at'],
  products: [
    'id',
    'household_id',
    'name',
    'brand',
    'unit',
    'photo_path',
    'notes',
    'last_used_at',
    'created_at',
    'deleted_at',
  ],
  product_prices: [
    'id',
    'household_id',
    'product_id',
    'store_id',
    'price',
    'photo_path',
    'package_note',
    'created_at',
    'deleted_at',
  ],
  shopping_lists: [
    'id',
    'household_id',
    'name',
    'status',
    'completed_at',
    'created_at',
    'deleted_at',
  ],
  list_items: [
    'id',
    'household_id',
    'list_id',
    'product_id',
    'quantity',
    'pinned_store_id',
    'is_checked',
    'checked_at',
    'note',
    'sort_order',
    'created_at',
    'deleted_at',
  ],
}

export function pushablePayload(
  entity: PushEntity,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const col of PUSHABLE_COLUMNS[entity]) {
    if (col in row) out[col] = row[col]
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Cola de salida
// ─────────────────────────────────────────────────────────────────────────────

export interface OutboxOp {
  /** Autoincremental: define el orden de envío y por tanto las dependencias. */
  seq?: number
  entity: PushEntity
  row_id: string
  payload: Record<string, unknown>
  status: 'pending' | 'failed'
  tries: number
  error: string | null
  created_at: string
}

export interface PendingPhoto {
  id: string
  blob: Blob
  /** Dónde escribir la ruta definitiva una vez subida. */
  target_entity: 'products' | 'product_prices'
  target_id: string
  created_at: string
}

export interface MetaRow {
  key: string
  value: unknown
}
