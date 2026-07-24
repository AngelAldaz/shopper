import { Outlet, Route, Routes } from 'react-router'
import { TabBar } from '@/components/TabBar'
import { ListsPage } from '@/features/lists/ListsPage'
import { CatalogPage } from '@/features/products/CatalogPage'
import { StoresPage } from '@/features/stores/StoresPage'
import { MePage } from '@/features/me/MePage'

function Shell() {
  return (
    <div className="min-h-dvh bg-bg">
      {/* El padding inferior deja hueco a la barra de pestañas más el inset del
          home indicator; sin él, el último elemento de cada lista queda tapado. */}
      <main className="safe-x mx-auto max-w-lg pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<ListsPage />} />
        <Route path="catalogo" element={<CatalogPage />} />
        <Route path="supers" element={<StoresPage />} />
        <Route path="yo" element={<MePage />} />
      </Route>
    </Routes>
  )
}
