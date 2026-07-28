import { useRef, useState, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Props {
  onDelete: () => void
  children: ReactNode
  label?: string
  className?: string
}

// Ancho del botón que queda al descubierto, y cuánto se deja pasar de más para
// que el gesto se sienta elástico en lugar de topar seco.
const REVEAL = 96
const OVERSHOOT = 24

/**
 * Deslizar a la izquierda para revelar "Borrar", el patrón de iOS.
 *
 * Va sobre Pointer Events con `touch-pan-y`: así el navegador sigue encargándose
 * del scroll vertical de la lista y nosotros solo interceptamos el arrastre
 * horizontal. Sin eso, el gesto pelearía con el scroll y ninguno se sentiría
 * bien.
 *
 * El borrado NO pide confirmación aparte: deslizar y luego tocar el botón rojo
 * ya son dos gestos deliberados, igual que en Recordatorios o Mail. Un diálogo
 * encima sobraría.
 */
export function SwipeToDelete({ onDelete, children, label = 'Borrar', className }: Props) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef({ x: 0, base: 0 })
  const pointer = useRef<number | null>(null)
  // Si el dedo se movió, el toque final cierra en vez de disparar el onClick de
  // adentro (que navegaría). Es un ref para leerlo en el mismo gesto sin esperar
  // a un re-render.
  const moved = useRef(false)

  const isOpen = offset < 0

  function onPointerDown(e: React.PointerEvent) {
    pointer.current = e.pointerId
    start.current = { x: e.clientX, base: offset }
    moved.current = false
    setDragging(true)
    // Capturar el puntero mantiene el arrastre aunque el dedo se salga de la
    // tarjeta. Puede lanzar si el puntero no es capturable (algún navegador,
    // o eventos sintéticos); no es fatal, el gesto funciona igual.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* sin captura, pero seguimos */
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (pointer.current !== e.pointerId) return
    const dx = e.clientX - start.current.x
    if (Math.abs(dx) > 4) moved.current = true
    // Solo hacia la izquierda (valores negativos); a la derecha topa en cerrado.
    const next = Math.max(-(REVEAL + OVERSHOOT), Math.min(0, start.current.base + dx))
    setOffset(next)
  }

  function onPointerEnd(e: React.PointerEvent) {
    if (pointer.current !== e.pointerId) return
    pointer.current = null
    setDragging(false)
    // Se ancla abierto o cerrado según de qué lado quedó a la mitad.
    setOffset((o) => (o <= -REVEAL / 2 ? -REVEAL : 0))
  }

  return (
    <div className={cn('relative overflow-hidden rounded-card', className)}>
      <button
        type="button"
        aria-label={label}
        tabIndex={isOpen ? 0 : -1}
        onClick={onDelete}
        className="absolute inset-y-0 right-0 flex w-24 flex-col items-center justify-center gap-1 bg-danger text-on-danger"
      >
        <Trash2 size={22} />
        <span className="text-xs font-semibold">{label}</span>
      </button>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(e) => {
          if (moved.current || offset !== 0) {
            // Venía de arrastrar, o estaba abierto: el toque cierra y no navega.
            e.preventDefault()
            e.stopPropagation()
            setOffset(0)
            moved.current = false
          }
        }}
        style={{ transform: `translateX(${offset}px)` }}
        className={cn(
          'relative touch-pan-y',
          !dragging && 'transition-transform duration-200 ease-out',
        )}
      >
        {children}
      </div>
    </div>
  )
}
