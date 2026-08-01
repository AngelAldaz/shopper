import { db, getMeta, setMeta } from './dexie'
import { bumpTries, markFailed, markSent, pendingOps } from './outbox'
import { isNetworkError, isPermanent, supabaseBackend, type SyncBackend } from './backend'
import { flushPhotos, type PhotoFlushResult } from './photos'
import { PULL_ENTITIES, type PullEntity } from './schema'

const LAST_PULLED = 'last_pulled_at'
const EPOCH = '1970-01-01T00:00:00.000Z'

/**
 * Se pide un poco antes de la última marca conocida.
 *
 * Cubre una carrera real: una transacción puede escribir updated_at = T y
 * confirmar DESPUÉS de que nuestra consulta ya pasó por ahí. Sin el solape esa
 * fila no se pediría nunca más. Repetirla no cuesta nada porque bulkPut es
 * idempotente; perderla sí.
 */
const OVERLAP_MS = 10_000

/**
 * Tablas que se traen enteras en lugar de por diferencias.
 *
 * Son diminutas (una fila por persona) y tienen dos problemas para el delta:
 * household_members cambia de rol sin que cambie joined_at, y salir del hogar
 * es un borrado DURO, que por definición un delta no puede detectar. Traerlas
 * completas y reemplazar es lo que hace que "me sacaron del hogar" se note.
 */
const FULL_REFRESH: PullEntity[] = ['profiles', 'households', 'household_members']

/** Columna por la que se pide el delta. Por omisión, updated_at. */
const CURSOR: Partial<Record<PullEntity, string>> = {
  price_history: 'recorded_at',
}

export interface PushResult {
  sent: number
  failed: number
  /** true si quedó algo pendiente por un fallo pasajero (típicamente sin red). */
  interrupted: boolean
}

/**
 * Sube la cola en orden estricto de llegada.
 *
 * El orden resuelve gratis la dependencia natural "creé el producto y enseguida
 * su precio": el producto se manda primero porque ocurrió primero. Por eso se
 * envía de una en una y se corta ante un fallo pasajero — adelantar operaciones
 * podría mandar un precio antes que el producto al que apunta.
 */
export async function syncPush(backend: SyncBackend = supabaseBackend): Promise<PushResult> {
  const ops = await pendingOps()
  let sent = 0
  let failed = 0

  for (const op of ops) {
    if (op.seq === undefined) continue
    const { error } = await backend.upsert(op.entity, op.payload)

    if (!error) {
      await markSent(op.seq)
      sent++
      continue
    }

    if (isPermanent(error)) {
      // Un cambio que el servidor rechaza (RLS, restricción) se aparta y se
      // sigue: no puede bloquear para siempre todo lo que viene detrás.
      await markFailed(op.seq, error.message)
      failed++
      continue
    }

    if (isNetworkError(error)) {
      // Sin señal: el cambio es válido y subirá al reconectar. NO cuenta como
      // intento fallido, o unos minutos de mala señal marcarían como perdido
      // algo bueno. Paramos aquí; se reintenta en el próximo online /
      // visibilitychange / apertura de la app.
      return { sent, failed, interrupted: true }
    }

    // El servidor respondió con un error transitorio (5xx). Ese sí cuenta, con
    // tope, por si algo está de verdad mal y no debe atorar al resto para
    // siempre.
    const tries = await bumpTries(op.seq, error.message)
    if (tries >= 5) {
      failed++
      continue
    }
    return { sent, failed, interrupted: true }
  }

  return { sent, failed, interrupted: false }
}

export interface PullResult {
  changed: number
  error: string | null
}

/**
 * Baja lo que cambió desde la última vez y lo vuelca al espejo local.
 *
 * La marca de tiempo sale del `updated_at` que devuelve el SERVIDOR, nunca del
 * reloj del teléfono: los relojes de los móviles se desfasan y un adelanto de
 * unos segundos bastaría para saltarse filas.
 */
export async function syncPull(backend: SyncBackend = supabaseBackend): Promise<PullResult> {
  const since = await getMeta<string>(LAST_PULLED, EPOCH)
  const from = new Date(Date.parse(since) - OVERLAP_MS).toISOString()

  let maxSeen = since
  let changed = 0

  for (const entity of PULL_ENTITIES) {
    const full = FULL_REFRESH.includes(entity)
    const cursor = CURSOR[entity] ?? 'updated_at'

    const { rows, error } = full
      ? await backend.fetchAll(entity)
      : await backend.fetchSince(entity, cursor, from)

    if (error) {
      // No se avanza la marca: la próxima vez se vuelve a pedir todo lo que
      // faltó. Perder una tabla a medias sería peor que repetir trabajo.
      return { changed, error: error.message }
    }

    changed += await applyRows(entity, rows, full)

    for (const row of rows) {
      const ts = row[cursor]
      if (typeof ts === 'string' && ts > maxSeen) maxSeen = ts
    }
  }

  if (maxSeen !== since) await setMeta(LAST_PULLED, maxSeen)
  return { changed, error: null }
}

async function applyRows(
  entity: PullEntity,
  rows: Record<string, unknown>[],
  full: boolean,
): Promise<number> {
  const table = db.table(entity)

  // Las filas con deleted_at se van del espejo en lugar de quedarse marcadas:
  // así todo lo que hay en Dexie está vivo y ninguna consulta de la app tiene
  // que acordarse de filtrar.
  const live = rows.filter((r) => !r['deleted_at'])
  const dead = rows.filter((r) => Boolean(r['deleted_at'])).map((r) => r['id'])

  await db.transaction('rw', table, async () => {
    if (full) {
      // Reemplazo completo: lo que ya no viene del servidor deja de existir
      // aquí. Es lo que hace que salir de un hogar o que te saquen se note.
      await table.clear()
    }
    if (live.length) await table.bulkPut(live)
    if (dead.length) await table.bulkDelete(dead as never[])
  })

  return live.length + dead.length
}

/** Ciclo completo: sube lo local, sube las fotos, y trae lo ajeno. */
export async function syncNow(backend: SyncBackend = supabaseBackend): Promise<{
  push: PushResult
  photos: PhotoFlushResult
  pull: PullResult
}> {
  const push = await syncPush(backend)

  // Las fotos van DESPUÉS de los datos: la fila a la que apunta cada foto tiene
  // que existir ya en el servidor antes de actualizarle la ruta.
  const photos = await flushPhotos()
  // Subir una foto genera un cambio de ruta que también hay que mandar.
  if (photos.uploaded > 0) await syncPush(backend)

  // Se baja aunque la subida quedara a medias: seguir viendo lo que hicieron
  // los demás es útil incluso si lo tuyo todavía no ha subido.
  const pull = await syncPull(backend)
  return { push, photos, pull }
}

/** Se usa al cerrar sesión y al salir del hogar, junto con borrar el espejo. */
export async function resetSyncCursor(): Promise<void> {
  await setMeta(LAST_PULLED, EPOCH)
}
