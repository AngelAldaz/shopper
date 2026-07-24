import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'soft' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary shadow-sweet active:brightness-95',
  soft: 'bg-primary-soft text-primary-ink active:brightness-95',
  outline: 'bg-surface text-text border border-border active:bg-surface-2',
  ghost: 'bg-transparent text-primary-ink active:bg-primary-soft',
  danger: 'bg-danger text-on-danger shadow-sweet active:brightness-95',
}

// `sm` baja de los 44 pt que pide Apple, así que solo se usa en controles
// secundarios que viven dentro de una fila ya tocable (p. ej. el − y + de un
// stepper), nunca como acción principal.
const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-5 text-base gap-2',
  lg: 'h-14 px-6 text-lg gap-2.5',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  block?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold',
        'transition-[filter,background-color,transform] duration-150 active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
