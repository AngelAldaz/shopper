import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { useSync } from '@/db/SyncProvider'
import { cn } from '@/lib/cn'

/**
 * Estado de la sincronización.
 *
 * Cuando todo va bien no aparece nada: un indicador permanente de "al día" es
 * ruido. Solo se muestra cuando hay algo que la persona debería saber —que está
 * sin señal, que queda algo por subir, o que un cambio no se pudo guardar.
 */
export function SyncBadge() {
  const { online, syncing, pending, failed, retryFailed } = useSync()

  if (failed > 0) {
    return (
      <Bar tone="danger">
        <TriangleAlert size={16} />
        <span className="flex-1">
          {failed === 1 ? 'Un cambio no se pudo guardar' : `${failed} cambios no se guardaron`}
        </span>
        <button type="button" onClick={() => void retryFailed()} className="font-semibold underline">
          Reintentar
        </button>
      </Bar>
    )
  }

  if (!online) {
    return (
      <Bar tone="warning">
        <CloudOff size={16} />
        <span>
          Sin conexión
          {pending > 0 && ` · ${pending} ${pending === 1 ? 'cambio' : 'cambios'} por subir`}
        </span>
      </Bar>
    )
  }

  if (syncing && pending > 0) {
    return (
      <Bar tone="muted">
        <RefreshCw size={16} className="animate-spin" />
        <span>Guardando {pending}…</span>
      </Bar>
    )
  }

  return null
}

function Bar({ tone, children }: { tone: 'danger' | 'warning' | 'muted'; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-2 px-5 py-2 text-sm',
        tone === 'danger' && 'bg-danger-soft text-danger',
        tone === 'warning' && 'bg-warning-soft text-warning',
        tone === 'muted' && 'bg-surface-2 text-muted',
      )}
    >
      {children}
    </div>
  )
}
