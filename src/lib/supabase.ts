import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Si faltan las llaves, la app arranca igual y lo dice en la pantalla de
 * entrada, en lugar de quedarse en blanco con un error de consola que solo
 * ve quien abre las DevTools.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'sin-llave', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,

    // Los correos de confirmación se abren en Safari, NO en el PWA instalado
    // (en iOS son almacenamientos distintos). Por eso el enlace apunta a
    // /auth/confirm con un token_hash y lo canjeamos a mano con verifyOtp, que
    // funciona en cualquier navegador. La detección automática de sesión en la
    // URL depende de un verifier que solo existe en el navegador donde
    // empezaste, así que aquí no sirve.
    detectSessionInUrl: false,

    storageKey: 'shopper-auth',
  },
})
