import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Fab } from '@/components/ui/Fab'

/** TEMPORAL (Fase 0): supers de muestra. Se sustituyen en la Fase 5. */
const DEMO = [
  { id: '1', name: 'Walmart', color: '#2E77BB', wins: 12 },
  { id: '2', name: 'Soriana', color: '#D94F4F', wins: 8 },
  { id: '3', name: 'Bodega Aurrerá', color: '#E8A33D', wins: 5 },
  { id: '4', name: 'Chedraui', color: '#E8623D', wins: 3 },
  { id: '5', name: 'La Comer', color: '#7C5CD6', wins: 2 },
  { id: '6', name: 'Mercado', color: '#2E8B6B', wins: 6 },
]

export function StoresPage() {
  return (
    <>
      <PageHeader title="Mis supers" subtitle="Dónde compras normalmente" />

      <ul className="flex flex-col gap-2.5 px-5">
        {DEMO.map((s) => (
          <li key={s.id}>
            <Card className="flex items-center gap-3 p-3">
              <span
                className="size-11 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
              <span className="shrink-0 rounded-full bg-success-soft px-3 py-1 text-sm font-semibold text-success">
                {s.wins} más barato
              </span>
            </Card>
          </li>
        ))}
      </ul>

      <Fab icon={<Plus size={26} />} label="Nuevo súper" />
    </>
  )
}
