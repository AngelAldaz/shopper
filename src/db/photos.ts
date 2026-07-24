import { db } from './dexie'
import { saveRow } from './mutate'
import { photoPath, publicUrl, uploadPhoto } from '@/lib/photos'
import type { PendingPhoto } from './schema'

/** Prefijo de una foto que todavía vive solo en este teléfono. */
const LOCAL = 'local:'

/**
 * Encola una foto tomada sin señal.
 *
 * Devuelve una ruta `local:<uuid>` que se guarda en el producto o el precio
 * como si fuera la definitiva. La pantalla ya la muestra desde el Blob; cuando
 * haya red se sube y la ruta se reescribe con la de verdad.
 */
export async function queuePhoto(
  blob: Blob,
  target: { entity: 'products' | 'product_prices'; id: string },
): Promise<string> {
  const id = crypto.randomUUID()
  await db.photo_blobs.add({
    id,
    blob,
    target_entity: target.entity,
    target_id: target.id,
    created_at: new Date().toISOString(),
  })
  return LOCAL + id
}

export function isLocalPhoto(path: string | null | undefined): boolean {
  return Boolean(path?.startsWith(LOCAL))
}

// Los objectURL hay que revocarlos o la memoria crece sin freno. Se cachean por
// id para no crear uno nuevo en cada render de la misma foto.
const objectUrls = new Map<string, string>()

export async function localPhotoUrl(path: string): Promise<string | null> {
  const id = path.slice(LOCAL.length)
  const cached = objectUrls.get(id)
  if (cached) return cached

  const row = await db.photo_blobs.get(id)
  if (!row) return null

  const url = URL.createObjectURL(row.blob)
  objectUrls.set(id, url)
  return url
}

function releaseLocalPhoto(id: string): void {
  const url = objectUrls.get(id)
  if (url) {
    URL.revokeObjectURL(url)
    objectUrls.delete(id)
  }
}

/**
 * Resuelve la ruta guardada a algo que un <img> pueda mostrar.
 *
 * Una sola función decide, para que ninguna pantalla tenga que saber si la foto
 * ya subió o sigue esperando en la cola.
 */
export async function resolvePhotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  return isLocalPhoto(path) ? localPhotoUrl(path) : publicUrl(path)
}

export interface PhotoFlushResult {
  uploaded: number
  failed: number
}

/**
 * Sube las fotos pendientes y reescribe las rutas.
 *
 * Va después de la cola de datos: la fila a la que apunta la foto tiene que
 * existir ya en el servidor antes de actualizarle la ruta.
 */
export async function flushPhotos(): Promise<PhotoFlushResult> {
  const pendientes = await db.photo_blobs.toArray()
  let uploaded = 0
  let failed = 0

  for (const foto of pendientes) {
    const dueño = (await db.table(foto.target_entity).get(foto.target_id)) as
      | { household_id?: string; photo_path?: string | null }
      | undefined

    if (!dueño?.household_id) {
      // El producto o el precio se borró antes de que la foto llegara a subir:
      // ya no hay dónde ponerla.
      await descartar(foto)
      continue
    }

    const path = photoPath(dueño.household_id, foto.id)
    const { error } = await uploadPhoto(path, foto.blob)
    if (error) {
      failed++
      continue
    }

    // La ruta definitiva se guarda por la vía normal, así que también viaja por
    // la cola y llega al otro teléfono.
    await saveRow(foto.target_entity, { id: foto.target_id, photo_path: path })
    await descartar(foto)
    uploaded++
  }

  return { uploaded, failed }
}

async function descartar(foto: PendingPhoto): Promise<void> {
  releaseLocalPhoto(foto.id)
  await db.photo_blobs.delete(foto.id)
}

export function countPendingPhotos(): Promise<number> {
  return db.photo_blobs.count()
}
