import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { resolvePhotoUrl } from '@/db/photos'
import { cn } from '@/lib/cn'

interface Props {
  path: string | null | undefined
  alt: string
  className?: string
  /** Icono de relleno cuando no hay foto (tamaño del contenedor). */
  rounded?: 'soft' | 'card' | 'full'
}

/**
 * Muestra una foto de producto resolviendo su ruta, sin que la pantalla tenga
 * que saber si ya subió o sigue esperando en la cola offline: resolvePhotoUrl
 * devuelve un objectURL local o la URL pública, indistinguible para el <img>.
 */
export function Photo({ path, alt, className, rounded = 'soft' }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    let alive = true
    setBroken(false)
    void resolvePhotoUrl(path).then((u) => {
      if (alive) setUrl(u)
    })
    return () => {
      alive = false
    }
  }, [path])

  const radius =
    rounded === 'card' ? 'rounded-card' : rounded === 'full' ? 'rounded-full' : 'rounded-soft'

  if (!url || broken) {
    return (
      <div className={cn('grid place-items-center bg-surface-2 text-muted', radius, className)}>
        <ImageOff size={20} />
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => setBroken(true)}
      className={cn('object-cover', radius, className)}
    />
  )
}
