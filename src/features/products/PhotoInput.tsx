import { useEffect, useRef, useState } from 'react'
import { Camera, Loader } from 'lucide-react'
import { compressPhoto } from '@/lib/photos'
import { cn } from '@/lib/cn'

interface Props {
  /** Foto ya existente (ruta local o pública), para mostrarla de fondo. */
  currentUrl?: string | null
  /** Devuelve el Blob comprimido; el llamador decide qué hacer con él. */
  onPhoto: (blob: Blob) => void
  className?: string
}

/**
 * Toma o elige una foto y la comprime antes de entregarla.
 *
 * `capture="environment"` le pide a iOS la cámara trasera directamente, que es
 * lo natural parado frente al estante. La compresión (a ~80 KB WebP) ocurre
 * aquí, antes de que nadie intente subir: 4 MB con señal de súper no terminan
 * nunca.
 */
export function PhotoInput({ currentUrl, onPhoto, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState(false)

  // El preview local es un objectURL: hay que revocarlo o la memoria crece.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  async function pick(file: File) {
    setBusy(true)
    setError(false)
    try {
      const blob = await compressPhoto(file)
      // Preview inmediato desde el blob ya comprimido, para que se vea sin
      // esperar a la subida.
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old)
        return URL.createObjectURL(blob)
      })
      onPhoto(blob)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  const shown = preview ?? currentUrl

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void pick(file)
          // Se limpia para poder volver a elegir la MISMA foto si hace falta.
          e.target.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={cn(
          'relative grid aspect-square w-full place-items-center overflow-hidden rounded-card',
          'border-2 border-dashed border-border bg-surface-2 text-muted',
          'active:bg-surface',
        )}
      >
        {shown && (
          <img src={shown} alt="" className="absolute inset-0 size-full object-cover" />
        )}
        <span
          className={cn(
            'relative z-10 flex flex-col items-center gap-1 rounded-full px-4 py-3',
            shown && 'bg-black/45 text-white',
          )}
        >
          {busy ? <Loader size={26} className="animate-spin" /> : <Camera size={26} />}
          <span className="text-sm font-semibold">
            {busy ? 'Preparando…' : shown ? 'Cambiar foto' : 'Tomar foto'}
          </span>
        </span>
      </button>
      {error && <p className="mt-1 text-sm text-danger">No se pudo procesar la foto.</p>}
    </div>
  )
}
