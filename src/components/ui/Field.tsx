import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string | null
  /** Adornos a los lados del campo ($ a la izquierda, "por kilo" a la derecha).
   *  Se llaman `leading`/`trailing` porque `prefix` ya es un atributo del DOM. */
  leading?: ReactNode
  trailing?: ReactNode
}

export function Field({
  label,
  hint,
  error,
  leading,
  trailing,
  className,
  id,
  ...rest
}: Props) {
  const auto = useId()
  const inputId = id ?? auto
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="px-1 text-sm font-semibold text-muted">
        {label}
      </label>

      <div
        className={cn(
          'flex items-center gap-2 rounded-soft border bg-surface px-4',
          'focus-within:ring-2 focus-within:ring-primary/40',
          error ? 'border-danger' : 'border-border',
        )}
      >
        {leading && <span className="shrink-0 text-muted">{leading}</span>}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          // h-12 = 48px: por encima de los 44 pt de Apple y cómodo con pulgar.
          className={cn(
            'h-12 min-w-0 flex-1 bg-transparent text-text outline-none',
            'placeholder:text-muted/60',
            className,
          )}
          {...rest}
        />
        {trailing && <span className="shrink-0 text-muted">{trailing}</span>}
      </div>

      {error ? (
        <p id={`${inputId}-error`} className="px-1 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="px-1 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
