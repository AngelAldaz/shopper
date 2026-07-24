import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { supabase } from '@/lib/supabase'
import { useHousehold, type Member } from './useHousehold'

interface Props {
  open: boolean
  onClose: () => void
  onLeft: () => void
}

interface Counts {
  products: number
  prices: number
  lists: number
}

/**
 * Salir del hogar, con las tres situaciones que pidió el usuario:
 *
 *  · Eres la única persona → el hogar quedaría huérfano y sus datos
 *    inalcanzables para siempre, así que se borra entero. Antes se dice
 *    exactamente cuánto se pierde, con números reales.
 *  · Mandas y queda más gente → primero hay que pasar el mando; un hogar nunca
 *    se queda sin dueño.
 *  · Cualquier otro caso → confirmación normal.
 *
 * En los tres, quien se va pierde el acceso y quien se queda conserva todo.
 */
export function LeaveHouseholdSheet({ open, onClose, onLeft }: Props) {
  const { household, members, myRole } = useHousehold()
  const [counts, setCounts] = useState<Counts | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const soloYo = members.length <= 1
  const mandoConGente = myRole === 'owner' && members.length > 1

  useEffect(() => {
    if (!open || !household || !soloYo) return
    // Solo se consultan los números cuando de verdad se va a borrar todo:
    // en los otros casos no se pierde nada y enseñarlos asustaría de más.
    void (async () => {
      const [p, pp, l] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }).is('deleted_at', null),
        supabase.from('product_prices').select('id', { count: 'exact', head: true }).is('deleted_at', null),
        supabase.from('shopping_lists').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      ])
      setCounts({ products: p.count ?? 0, prices: pp.count ?? 0, lists: l.count ?? 0 })
    })()
  }, [open, household, soloYo])

  async function leave() {
    if (!household) return
    setBusy(true)
    setError(null)
    try {
      const { error } = await supabase.rpc('leave_household', { p_household_id: household.id })
      if (error) throw error
      onLeft()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={soloYo ? 'Salir y borrar el hogar' : 'Salir del hogar'}
      footer={
        mandoConGente ? (
          <Button variant="outline" block onClick={onClose}>
            Entendido
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" block onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="danger" block onClick={leave} disabled={busy}>
              {busy ? 'Saliendo…' : soloYo ? 'Borrar todo' : 'Salir'}
            </Button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        {mandoConGente ? (
          <Note tone="warning">
            Eres quien manda en <strong>{household?.name}</strong> y hay más gente dentro. Antes de
            salir tienes que pasarle el mando a alguien, para que el hogar no se quede sin dueño.
          </Note>
        ) : soloYo ? (
          <>
            <Note tone="danger">
              Eres la única persona en <strong>{household?.name}</strong>. Si sales,{' '}
              <strong>se borrará para siempre</strong>:
            </Note>
            <ul className="flex flex-col gap-1 rounded-soft bg-surface-2 p-4 text-sm">
              <Count n={counts?.products} label="productos del catálogo" />
              <Count n={counts?.prices} label="precios capturados" />
              <Count n={counts?.lists} label="listas" />
              <li className="pt-1 text-muted">Y todas las fotos que hayas tomado.</li>
            </ul>
          </>
        ) : (
          <Note tone="warning">
            Vas a salir de <strong>{household?.name}</strong>. Perderás el acceso al catálogo, a
            los precios y a las listas, también en este teléfono. Quienes se queden conservan todo
            intacto.
          </Note>
        )}

        {error && (
          <p role="alert" className="rounded-soft bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  )
}

function Note({ tone, children }: { tone: 'warning' | 'danger'; children: React.ReactNode }) {
  return (
    <div
      className={
        'flex gap-3 rounded-soft p-4 text-sm ' +
        (tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')
      }
    >
      <TriangleAlert size={20} className="mt-0.5 shrink-0" />
      <p className="text-balance">{children}</p>
    </div>
  )
}

function Count({ n, label }: { n: number | undefined; label: string }) {
  return (
    <li>
      <strong className="text-danger">{n ?? '…'}</strong>{' '}
      <span className="text-muted">{label}</span>
    </li>
  )
}

export type { Member }
