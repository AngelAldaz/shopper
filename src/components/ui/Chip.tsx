import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
  /**
   * Color propio del súper. Si viene, manda sobre el rosa de la marca.
   * Se llama `tint` y no `color` porque `color` ya es un atributo del DOM.
   */
  tint?: string | null
}

/**
 * Chip seleccionable. Se usa para los supers, donde cada tienda tiene su color
 * para poder reconocerla de un vistazo en la vista "por súper".
 */
export function Chip({ selected = false, tint, className, children, ...rest }: Props) {
  const custom = tint
    ? selected
      ? { backgroundColor: tint, borderColor: tint, color: '#fff' }
      : { borderColor: tint, color: tint }
    : undefined

  return (
    <button
      type="button"
      aria-pressed={selected}
      style={custom}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4',
        'text-sm font-semibold whitespace-nowrap',
        'transition-transform duration-150 active:scale-[0.96]',
        !tint &&
          (selected
            ? 'border-primary bg-primary text-on-primary'
            : 'border-border bg-surface text-muted'),
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
