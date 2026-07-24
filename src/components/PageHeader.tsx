import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: Props) {
  return (
    <header className="safe-top flex items-end justify-between gap-3 px-5 pt-4 pb-3">
      <div className="min-w-0">
        <h1 className="truncate text-[1.75rem] leading-tight font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}
