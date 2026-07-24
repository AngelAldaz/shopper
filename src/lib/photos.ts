import imageCompression from 'browser-image-compression'
import { supabase } from './supabase'

const BUCKET = 'fotos'

/**
 * ADAPTADOR DE ALMACENAMIENTO — el único archivo que habría que tocar para
 * migrar a Cloudflare R2 u otro proveedor.
 *
 * Hoy es Supabase Storage: 1 GB gratis ≈ 12,500 fotos comprimidas, y un
 * catálogo realista (300 productos × 2-3 supers) ocupa unos 60 MB. R2 daría
 * 10 GB, pero exige un Worker que valide el JWT y firme URLs, que es un punto
 * más de fallo justo en lo delicado: la subida sin señal.
 */

/**
 * Comprime antes de subir.
 *
 * Una foto de iPhone pesa 3-5 MB; así se queda en ~80 KB. Importa por dos
 * razones que no son el precio del almacenamiento: subir 4 MB con una barra de
 * señal en el súper no termina nunca, y las fotos se cachean en el teléfono
 * para verlas offline.
 *
 * WebP porque pesa la mitad que JPEG a igual calidad y Safari lo soporta desde
 * la versión 14.
 */
export async function compressPhoto(file: File | Blob): Promise<Blob> {
  const asFile = file instanceof File ? file : new File([file], 'foto.jpg', { type: file.type })
  return imageCompression(asFile, {
    maxWidthOrHeight: 1024,
    maxSizeMB: 0.15,
    useWebWorker: true,
    fileType: 'image/webp',
    initialQuality: 0.8,
  })
}

/** Ruta dentro del bucket. El primer segmento es lo que valida la política. */
export function photoPath(householdId: string, id: string): string {
  return `${householdId}/${id}.webp`
}

export async function uploadPhoto(path: string, blob: Blob): Promise<{ error: string | null }> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/webp',
    // Reintentar una subida no debe fallar por "ya existe": la ruta lleva un
    // uuid propio, así que sobrescribir siempre es sobrescribir lo mismo.
    upsert: true,
  })
  return { error: error?.message ?? null }
}

export function publicUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export async function removePhoto(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path])
}
