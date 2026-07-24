import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseConfig } from './supabaseConfig'

const config = resolveSupabaseConfig(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

/**
 * Si faltan las llaves, la app arranca igual y lo dice en la pantalla de
 * entrada. Ver supabaseConfig.ts para por qué eso necesita cuidado.
 */
export const isSupabaseConfigured = config.configured

export const supabase = createClient(config.url, config.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,

    // Los correos de confirmación se abren en Safari, NO en el PWA instalado
    // (en iOS son almacenamientos distintos). El flujo por omisión de Supabase
    // ya confirma la cuenta del lado del servidor y redirige con el resultado
    // en el fragmento de la URL, que leemos en ConfirmEmailPage. La detección
    // automática aquí no ayuda y podría consumir el fragmento antes.
    detectSessionInUrl: false,

    storageKey: 'shopper-auth',
  },
})
