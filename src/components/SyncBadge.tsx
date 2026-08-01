import { useState } from 'react'
import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { useSync } from '@/db/SyncProvider'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { cn } from '@/lib/cn'
import type { PushEntity } from '@/db/schema'

/**
 * Estado de la sincronización.
 *
 * Cuando todo va bien no aparece nada: un indicador permanente de "al día" es
 * ruido. Solo se muestra cuando hay algo que la persona debería saber —que está
 * sin señal, que queda algo por subir, o que un cambio no se pudo guardar.
 */
export function SyncBadge() {
  const { online, syncing, pending, failed, retryFailed } = useSync()
  const [detail, setDetail] = useState(false)

  if (failed > 0) {
    return (
      <>
        <Bar tone="danger">
          <TriangleAlert size={16} className="shrink-0" />
          {/* El texto abre el detalle: qué falló y por qué, con opción de
              descartar. Antes solo había "Reintentar", que no ayuda si el
              cambio está de verdad roto. */}
          <button type="button" onClick={() => setDetail(true)} className="flex-1 text-left underline">
            {failed === 1 ? 'Un cambio no se pudo guardar' : `${failed} cambios no se guardaron`}
          </button>
          <button
            type="button"
            onClick={() => void retryFailed()}
            className="shrink-0 font-semibold underline"
          >
            Reintentar
          </button>
        </Bar>
        <FailedDetail open={detail} onClose={() => setDetail(false)} />
      </>
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

const ENTITY_LABEL: Record<PushEntity, string> = {
  stores: 'Súper',
  products: 'Producto',
  product_prices: 'Precio',
  shopping_lists: 'Lista',
  list_items: 'Producto en una lista',
}

function FailedDetail({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { failedList, retryFailed, discardFailed, online } = useSync()

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Cambios sin guardar"
      footer={
        <div className="flex gap-2">
          <Button
            variant="outline"
            block
            onClick={async () => {
              await discardFailed()
              onClose()
            }}
          >
            Descartar
          </Button>
          <Button
            block
            onClick={async () => {
              await retryFailed()
              onClose()
            }}
          >
            Reintentar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        <p className="text-sm text-muted">
          {online
            ? 'Tus datos están a salvo en el teléfono. Estos cambios no llegaron al servidor:'
            : 'Sin conexión. Estos cambios subirán cuando vuelva la señal; puedes reintentar ahora si ya tienes internet.'}
        </p>

        <ul className="flex flex-col gap-2">
          {failedList.map((op) => {
            const name =
              (op.payload['name'] as string | undefined) ??
              (op.payload['price'] != null ? `$${op.payload['price']}` : null)
            return (
              <li
                key={op.seq}
                className="rounded-soft border border-border bg-surface-2 px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{ENTITY_LABEL[op.entity]}</span>
                  {name && <span className="truncate text-muted">{name}</span>}
                </div>
                {op.error && <p className="mt-1 text-xs break-words text-danger">{op.error}</p>}
              </li>
            )
          })}
        </ul>

        <p className="text-xs text-muted">
          Si descartas, esos cambios dejan de intentar subir. Lo que ves en la app no se borra.
        </p>
      </div>
    </Sheet>
  )
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
