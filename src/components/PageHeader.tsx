import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: Props) {
  return (
    <header
      // El espacio de arriba es el inset de la Dynamic Island MÁS aire propio,
      // en un solo padding-top. Con dos clases separadas (safe-top + pt-*) se
      // pisan entre ellas, porque las dos escriben padding-top.
      className="flex items-end justify-between gap-3 px-5 pt-[calc(env(safe-area-inset-top)+2rem)] pb-4"
    >
      <div className="min-w-0">
        <h1 className="truncate text-[1.75rem] leading-tight font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}
