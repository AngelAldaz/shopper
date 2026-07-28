import { Outlet, Route, Routes } from 'react-router'
import { TabBar } from '@/components/TabBar'
import { SyncBadge } from '@/components/SyncBadge'
import { Bow } from '@/components/ui/Bow'
import { SyncProvider } from '@/db/SyncProvider'
import { SessionProvider, useSession } from '@/features/auth/SessionProvider'
import { AuthPage } from '@/features/auth/AuthPage'
import { ConfirmEmailPage } from '@/features/auth/ConfirmEmailPage'
import { HouseholdProvider, useHousehold } from '@/features/household/useHousehold'
import { OnboardingPage } from '@/features/household/OnboardingPage'
import { ListsPage } from '@/features/lists/ListsPage'
import { CatalogPage } from '@/features/products/CatalogPage'
import { ProductDetailPage } from '@/features/products/ProductDetailPage'
import { StoresPage } from '@/features/stores/StoresPage'
import { MePage } from '@/features/me/MePage'

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg">
      <Bow size={72} className="animate-pulse text-primary-soft" />
    </div>
  )
}

function RequireSession() {
  const { session, loading } = useSession()
  // Sin este estado se vería un parpadeo de la pantalla de entrada cada vez que
  // se abre la app, mientras se recupera la sesión guardada.
  if (loading) return <Splash />
  if (!session) return <AuthPage />
  return <Outlet />
}

/** El proveedor va fuera del guardián para que el onboarding pueda refrescarlo. */
function WithHousehold() {
  return (
    <HouseholdProvider>
      <HouseholdGate />
    </HouseholdProvider>
  )
}

function HouseholdGate() {
  const { household, loading } = useHousehold()
  if (loading) return <Splash />
  // Sin hogar no hay nada que enseñar: ni catálogo, ni supers, ni listas
  // pertenecen a nadie todavía.
  if (!household) return <OnboardingPage />
  // El motor de sincronización va dentro del hogar porque necesita saber cuál
  // es, tanto para el canal de realtime como para el espejo local.
  return (
    <SyncProvider householdId={household.id}>
      <Outlet />
    </SyncProvider>
  )
}

function Shell() {
  return (
    <div className="min-h-dvh bg-bg">
      {/* El padding inferior deja hueco a la barra de pestañas más el inset del
          home indicator; sin él, el último elemento de cada lista queda tapado. */}
      <main className="safe-x mx-auto max-w-lg pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <SyncBadge />
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}

export function App() {
  return (
    <SessionProvider>
      <Routes>
        {/* Fuera de los guardianes a propósito: esta ruta se abre desde el
            correo, en un navegador donde todavía no hay sesión. */}
        <Route path="auth/confirm" element={<ConfirmEmailPage />} />

        <Route element={<RequireSession />}>
          <Route element={<WithHousehold />}>
            <Route element={<Shell />}>
              <Route index element={<ListsPage />} />
              <Route path="catalogo" element={<CatalogPage />} />
              <Route path="producto/:id" element={<ProductDetailPage />} />
              <Route path="supers" element={<StoresPage />} />
              <Route path="yo" element={<MePage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </SessionProvider>
  )
}
