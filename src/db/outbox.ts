import { db } from './dexie'
import { pushablePayload, type OutboxOp, type PushEntity } from './schema'

/** A partir de aquí, una operación deja de reintentarse y se marca fallida. */
export const MAX_TRIES = 5

/**
 * Encola un cambio para subirlo.
 *
 * Se guarda la fila ENTERA, no un parche. Eso hace que reenviar sea idempotente
 * —el servidor recibe un upsert por id, y el id lo generó el cliente— así que
 * si la petición salió pero se perdió la respuesta, el reintento no duplica ni
 * corrompe nada.
 *
 * Si ya había una operación pendiente para la misma fila, se REEMPLAZA su
 * contenido conservando su número de orden. Dos razones:
 *   · Corregir tres veces el precio de un producto en el pasillo debe subir un
 *     cambio, no tres.
 *   · Conservar el seq original mantiene las dependencias: si creaste el
 *     producto y luego su precio, el producto sigue yendo primero.
 */
export async function enqueue(
  entity: PushEntity,
  row: Record<string, unknown> & { id: string },
): Promise<void> {
  const payload = pushablePayload(entity, row)

  await db.transaction('rw', db.outbox, async () => {
    // Se buscan TODAS las ops de esta fila, sin importar su estado. Reusar la
    // más antigua conserva el orden de dependencias, y de paso SANA una que se
    // hubiera quedado en `failed`: volver a tocar la fila la reintenta con el
    // contenido nuevo. Antes solo se miraban las `pending`, así que un `failed`
    // quedaba conviviendo con una nueva `pending` y el banner "no se guardó" no
    // se iba nunca aunque la fila ya estuviera bien.
    const ops = await db.outbox.where('[entity+row_id]').equals([entity, row.id]).sortBy('seq')

    if (ops.length > 0) {
      const keep = ops[0]!
      if (keep.seq !== undefined) {
        await db.outbox.update(keep.seq, { payload, status: 'pending', tries: 0, error: null })
      }
      // Cualquier duplicado (p. ej. un failed + un pending viejos) se colapsa.
      for (const dup of ops.slice(1)) {
        if (dup.seq !== undefined) await db.outbox.delete(dup.seq)
      }
      return
    }

    await db.outbox.add({
      entity,
      row_id: row.id,
      payload,
      status: 'pending',
      tries: 0,
      error: null,
      created_at: new Date().toISOString(),
    } as OutboxOp)
  })
}

/** Pendientes en orden de llegada: ese orden ES el de las dependencias. */
export function pendingOps(): Promise<OutboxOp[]> {
  return db.outbox.where('status').equals('pending').sortBy('seq')
}

export function countPending(): Promise<number> {
  return db.outbox.where('status').equals('pending').count()
}

export function countFailed(): Promise<number> {
  return db.outbox.where('status').equals('failed').count()
}

export function failedOps(): Promise<OutboxOp[]> {
  return db.outbox.where('status').equals('failed').sortBy('seq')
}

export async function markSent(seq: number): Promise<void> {
  await db.outbox.delete(seq)
}

export async function markFailed(seq: number, error: string): Promise<void> {
  await db.outbox.update(seq, { status: 'failed', error })
}

export async function bumpTries(seq: number, error: string): Promise<number> {
  const op = await db.outbox.get(seq)
  const tries = (op?.tries ?? 0) + 1
  if (tries >= MAX_TRIES) {
    // Un cambio que no sube tras varios intentos no puede quedarse atorando
    // todo lo que viene detrás. Se aparta y se le avisa a la persona.
    await db.outbox.update(seq, { status: 'failed', tries, error })
  } else {
    await db.outbox.update(seq, { tries, error })
  }
  return tries
}

/** Reintentar a mano lo que se marcó como fallido. */
export async function retryFailed(): Promise<void> {
  const ops = await failedOps()
  await Promise.all(
    ops.map((op) =>
      op.seq === undefined
        ? Promise.resolve()
        : db.outbox.update(op.seq, { status: 'pending', tries: 0, error: null }),
    ),
  )
}

/**
 * Descartar los cambios que no se pudieron guardar.
 *
 * Escotilla de salida cuando un cambio está de verdad roto (p. ej. quedó de una
 * versión vieja) y solo hay que quitárselo de encima. La copia local no se
 * toca; solo se deja de intentar subir ese cambio.
 */
export async function discardFailed(): Promise<void> {
  const ops = await failedOps()
  await Promise.all(
    ops.map((op) => (op.seq === undefined ? Promise.resolve() : db.outbox.delete(op.seq))),
  )
}
