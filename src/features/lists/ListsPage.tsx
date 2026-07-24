import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Fab } from '@/components/ui/Fab'

export function ListsPage() {
  return (
    <>
      <PageHeader title="Mis listas" subtitle="Todavía no hay ninguna" />
      <EmptyState
        title="Empieza tu primera lista"
        description="Agrega lo que necesitas y te decimos en qué súper sale más barato cada cosa."
      />
      <Fab icon={<Plus size={26} />} label="Nueva lista" />
    </>
  )
}
