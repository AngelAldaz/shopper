import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { registerSW } from 'virtual:pwa-register'

import './styles/theme.css'
import { App } from './App'
import { applyTheme, getThemePref } from './lib/theme'

applyTheme(getThemePref())

// Si el usuario no eligió tema, seguimos al sistema en vivo (cambio automático
// al anochecer en iOS) sin necesidad de recargar.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getThemePref() === 'system') applyTheme('system')
})

registerSW({ immediate: true })

const root = document.getElementById('root')
if (!root) throw new Error('Falta #root en index.html')

createRoot(root).render(
  <StrictMode>
    {/* BASE_URL lo inyecta Vite desde `base` en vite.config.ts, así que dev y
        producción usan el mismo prefijo sin duplicar la constante. */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
