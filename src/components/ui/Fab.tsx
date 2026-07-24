import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  label: string
}

/**
 * Botón flotante de acción principal.
 *
 * El `bottom` combina la altura de la barra de pestañas con el inset del home
 * indicator: sin `env(safe-area-inset-bottom)` queda tapado por la barra
 * gestual del iPhone.
 */
export function Fab({ icon, label, className, ...rest }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'fixed right-5 z-30 grid size-14 place-items-center rounded-full',
        'bg-primary text-on-primary shadow-float',
        'transition-transform duration-150 active:scale-90',
        'bottom-[calc(5.25rem+env(safe-area-inset-bottom))]',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  )
}
