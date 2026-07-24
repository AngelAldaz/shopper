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
 * Cuando está cerrada NO se monta nada. Es a propósito: una versión anterior
 * mantenía el <dialog> siempre en el DOM con la clase `flex`, y esa clase pisa
 * la regla del navegador `dialog:not([open]) { display: none }`. Resultado: la
 * hoja se veía SIEMPRE, fuera de la capa superior (por debajo de la barra de
 * pestañas), sin fondo oscuro y sin poder cerrarse, porque cerrar solo quita el
 * atributo `open` y el `display: flex` seguía ganando.
 *
 * Desmontar es la defensa que no depende de acordarse: si no está abierta, no
 * existe.
 */
export function Sheet({ open, onClose, title, footer, children, className }: Props) {
  if (!open) return null
  return (
    <SheetPanel onClose={onClose} title={title} footer={footer} className={className}>
      {children}
    </SheetPanel>
  )
}

function SheetPanel({ onClose, title, footer, children, className }: Omit<Props, 'open'>) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    // showModal() es lo que promueve el diálogo a la capa superior: por encima
    // de TODO, sin importar z-index. Con show() o con el atributo `open` a mano,
    // la barra de pestañas taparía la hoja.
    ref.current?.showModal()

    // Y no bloquea el scroll del fondo en Safari iOS: sin esto, arrastrar sobre
    // la hoja mueve la página de atrás.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      // El <dialog> ocupa toda la pantalla y la hoja va dentro, así que un clic
      // cuyo target es el propio dialog es un clic en el fondo.
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className={cn(
        // `open:flex` y no `flex` a secas: así el display solo se aplica cuando
        // el diálogo está realmente abierto y nunca compite con la regla del
        // navegador para el estado cerrado.
        'fixed inset-0 m-0 hidden h-full max-h-full w-full max-w-full open:flex',
        'items-end justify-center bg-transparent p-0 text-text',
        'backdrop:bg-black/40 backdrop:backdrop-blur-[2px]',
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
          <div className="min-w-0 flex-1">
            {/* Asa decorativa: le dice al pulgar que esto se arrastra. */}
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
            {title && <h2 className="text-xl font-semibold text-balance">{title}</h2>}
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
          // Inset del home indicator + aire propio en un solo padding-bottom:
          // con dos clases separadas se pisarían.
          <div className="border-t border-border px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  )
}
