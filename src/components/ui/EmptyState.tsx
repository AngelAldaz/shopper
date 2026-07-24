import type { ReactNode } from 'react'
import { Bow } from './Bow'

interface Props {
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-14 text-center">
      <Bow size={64} className="text-primary-soft" />
      <h2 className="text-xl font-semibold">{title}</h2>
      {description && <p className="max-w-xs text-balance text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
