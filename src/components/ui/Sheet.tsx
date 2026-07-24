import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  /** Fija al fondo (botón de guardar), fuera del área que hace scroll. */
  footer?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * Hoja inferior. Casi toda acción de la app pasa por aquí en lugar de navegar a
 * otra pantalla: se llega con el pulgar y no se pierde el contexto.
 *
 * Va sobre <dialog> nativo a propósito — trae gratis la captura de foco, la
 * tecla Esc y el backdrop, que a mano casi siempre quedan a medias.
 */
export function Sheet({ open, onClose, title, footer, children, className }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    else if (!open && d.open) d.close()
  }, [open])

  useEffect(() => {
    if (!open) return
    // showModal() no bloquea el scroll del fondo en Safari iOS: sin esto, al
    // arrastrar sobre la hoja se mueve la página de atrás.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      // El <dialog> ocupa toda la pantalla y la hoja va dentro, así que un
      // clic cuyo target es el propio dialog es un clic en el fondo.
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className={cn(
        'fixed inset-0 m-0 flex h-full max-h-full w-full max-w-full items-end justify-center',
        'bg-transparent p-0 text-text backdrop:bg-black/40 backdrop:backdrop-blur-[2px]',
      )}
    >
      <div
        className={cn(
          'animate-sheet flex max-h-[88dvh] w-full max-w-lg flex-col',
          'rounded-t-sheet border-t border-border bg-surface shadow-sheet',
          className,
        )}
      >
        <div className="flex items-center gap-2 px-5 pt-3 pb-1">
          <div className="flex-1">
            {/* Asa decorativa: le dice al pulgar que esto se arrastra. */}
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
            {title && <h2 className="text-xl font-semibold">{title}</h2>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid size-11 shrink-0 place-items-center rounded-full text-muted active:bg-surface-2"
          >
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-2">{children}</div>

        {footer && (
          // Mismo caso que PageHeader: inset del home indicator + aire propio
          // en un solo padding-bottom, o las dos clases se pisan.
          <div className="border-t border-border px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  )
}
