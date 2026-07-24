import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface Props extends HTMLAttributes<HTMLDivElement> {
  flat?: boolean
}

export function Card({ flat = false, className, children, ...rest }: Props) {
  return (
    <div
      className={cn(
        'rounded-card border border-border bg-surface',
        !flat && 'shadow-sweet',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
