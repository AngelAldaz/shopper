import { db } from './dexie'
import { enqueue } from './outbox'
import type { PushEntity } from './schema'

/** Se dispara tras cada escritura para que la subida no espere a un temporizador. */
let onChange: (() => void) | null = null
export function setMutationListener(fn: (() => void) | null): void {
  onChange = fn
}

/**
 * Guarda una fila. SIEMPRE en local primero.
 *
 * La pantalla reacciona al instante porque Dexie es reactivo; la red viene
 * después y puede tardar lo que quiera o no llegar nunca. No hay estados de
 * "guardando" ni ruedas girando: el caso de uso es capturar un precio parado en
 * el pasillo, y ahí no hay señal.
 */
export async function saveRow<T extends { id?: string }>(
  entity: PushEntity,
  patch: T & Record<string, unknown>,
): Promise<string> {
  // El id lo genera el cliente. Sin esto, un producto creado sin señal no
  // podría tener precios apuntándole hasta después de sincronizar.
  const id = patch.id ?? crypto.randomUUID()
  const now = new Date().toISOString()
  const table = db.table(entity)

  const existing = (await table.get(id)) as Record<string, unknown> | undefined
  const row = {
    created_at: now,
    deleted_at: null,
    created_by: null,
    updated_by: null,
    ...existing,
    ...patch,
    id,
    // Provisional: el servidor lo reescribe con SU reloj, que es el único
    // confiable para el delta, y la próxima bajada trae el valor bueno.
    updated_at: now,
  }

  await table.put(row)
  await enqueue(entity, row as Record<string, unknown> & { id: string })
  onChange?.()
  return id
}

/**
 * Qué se lleva por delante cada borrado.
 *
 * Duplica a propósito el trigger `cascade_soft_delete` del servidor. No es
 * redundancia gratuita: sin esto, borrar un súper sin conexión dejaría sus
 * precios vivos en el espejo y la app seguiría proponiéndolos como "el más
 * barato" hasta la próxima sincronización. El servidor sigue siendo la
 * autoridad; esto solo evita enseñar algo falso mientras tanto.
 */
const LOCAL_CASCADE: Partial<Record<PushEntity, { table: PushEntity; by: string }[]>> = {
  stores: [{ table: 'product_prices', by: 'store_id' }],
  products: [
    { table: 'product_prices', by: 'product_id' },
    { table: 'list_items', by: 'product_id' },
  ],
  shopping_lists: [{ table: 'list_items', by: 'list_id' }],
}

/**
 * Borrado suave: en el servidor es un UPDATE de deleted_at, y del espejo local
 * la fila desaparece —igual que hace la bajada— para que ninguna consulta de la
 * app tenga que acordarse de filtrar.
 */
export async function softDelete(entity: PushEntity, id: string): Promise<void> {
  const table = db.table(entity)
  const row = (await table.get(id)) as (Record<string, unknown> & { id: string }) | undefined
  if (!row) return

  const now = new Date().toISOString()
  // Se encola ANTES de quitarla del espejo: hace falta su contenido para el
  // upsert que le dirá al servidor que está borrada.
  await enqueue(entity, { ...row, deleted_at: now, updated_at: now })
  await table.delete(id)

  // Los hijos NO se encolan: de eso ya se encarga el trigger del servidor, y la
  // próxima bajada confirmará que se fueron. Aquí solo se limpian para que la
  // pantalla no mienta mientras tanto.
  for (const child of LOCAL_CASCADE[entity] ?? []) {
    await db.table(child.table).where(child.by).equals(id).delete()
  }

  onChange?.()
}
