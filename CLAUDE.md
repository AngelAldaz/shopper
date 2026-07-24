# Shopper

PWA de listas de súper que dice **dónde comprar cada producto al mejor precio**.
Se va llenando foto a foto y precio a precio: cada producto puede existir en
varios supers con precios distintos, y la lista siempre elige el más barato.
Pensada para usarse en un iPhone, dentro del súper, con o sin señal.

Plan completo aprobado en:
`~/.claude/plans/quiero-armar-una-aplicaci-n-tender-stallman.md`

## Comandos

```bash
npm run dev          # http://localhost:5173/shopper/
npm run build        # typecheck + build (genera dist/404.html para GH Pages)
npm run preview
npm run typecheck
npm test             # vitest
npm run pwa-assets   # regenera iconos desde public/logo.svg
npm run db:start     # Supabase local en Docker
npm run db:reset     # reaplica las migraciones en local
npm run db:test      # 50 comprobaciones del esquema contra Postgres real
```

Local: Studio en http://127.0.0.1:54323 · correos en Mailpit
http://127.0.0.1:54324 (el stack local no manda nada a internet).

## Requisitos del entorno

- **Node ≥ 24** (instalado: 24.18.0). Vite 8 y Vite 7 exigen `^20.19.0 || >=22.12.0`;
  con Node 20.17 el binario nativo de rolldown ni siquiera se instala. Si alguna
  vez ves `Cannot find native binding`, es que `npm install` corrió con un Node
  viejo: borra `node_modules` y `package-lock.json` y reinstala.
- **Docker** para el Supabase local.

## Convenciones

- **Código e identificadores en inglés** (igual que el esquema de la BD y las
  librerías). **Todo el texto de interfaz en español**, `es-MX`, moneda MXN.
- Rutas de importación con alias `@/` → `src/`.
- Componentes de UI genéricos en `src/components/ui/`, los de dominio en
  `src/features/<área>/`.

## Decisiones de arquitectura

### Local-first, no "online con caché"
Todo se escribe **primero en IndexedDB (Dexie)** y luego se sincroniza. La UI lee
siempre del espejo local con `useLiveQuery`, así que responde igual con o sin red.
Esto no es una optimización: el caso de uso central es corregir un precio parado
en el pasillo del súper, donde no hay señal.

Consecuencias que hay que respetar en todo el código:
- **Los UUID los genera el cliente** (`crypto.randomUUID()`), nunca el servidor.
  Sin eso, un producto creado offline no podría tener precios apuntándole antes
  de sincronizar.
- **Borrado suave** (`deleted_at`) en todas las tablas. Una fila ausente es
  indistinguible de una que nunca existió, así que sin esto los borrados no se
  propagarían entre dispositivos.
- **Índices únicos parciales** (`where deleted_at is null`). Si no, borrar el
  huevo de Walmart y volverlo a agregar chocaría contra la restricción.
- `updated_at` **lo pone el servidor** con un trigger. Los relojes de los
  teléfonos se desfasan; el del servidor es el único confiable para el delta.

### No hay TanStack Query
Sobra en una app local-first: el estado del servidor vive en IndexedDB y Dexie ya
es reactivo. Añadir una capa de caché sobre otra capa de caché solo crea dos
fuentes de verdad.

### `norm_text` está duplicada a propósito
La misma normalización existe en `src/lib/norm.ts` (TS) y en `public.norm_text`
(Postgres, que alimenta `products.search_key`). Si divergen, el typeahead del
cliente y el índice del servidor ordenan distinto.

> ⚠️ La primera versión SQL tenía la cadena destino de `translate()` más corta
> que la origen, así que **`ñ` se convertía en otra letra** (piña, año, ñame).
> Si tocas esa función, cuenta los caracteres de ambas cadenas y corre
> `src/lib/norm.test.ts`.

### Variables de entorno vacías ≠ ausentes
Vite sustituye `import.meta.env.VITE_*` **al compilar**. Si la variable no está
definida en el CI, en el bundle queda `""`, no `undefined` — así que **`??` no
sirve** para el respaldo: deja pasar la cadena vacía. Con `createClient("")` la
app queda **en blanco** al cargar el módulo, sin ningún error visible.

Toda lectura de `import.meta.env` pasa por `src/lib/supabaseConfig.ts`, que
trata `undefined`, `""` y espacios como "sin configurar". Síntoma para
reconocerlo: el bundle publicado no contiene **ni** el valor real **ni** el de
respaldo (el empaquetador plegó la constante y descartó el respaldo).

### RLS no basta: hacen falta los GRANT
Supabase **ya no** concede automáticamente `SELECT/INSERT/UPDATE` a `authenticated`
sobre las tablas nuevas del esquema `public` (los privilegios por omisión solo
traen `Dxtm`). Sin `grant` explícito, toda consulta responde
`permission denied for table …` aunque las políticas estén perfectas.

- RLS decide **qué filas**; el GRANT decide si la tabla **existe** para ese rol.
- **Nunca se concede DELETE** en tablas de datos: todo borrado es suave (un
  `update` de `deleted_at`). Así ningún error del cliente ni sesión robada puede
  destruir datos.
- Al añadir una tabla nueva, añade su `grant` en la misma migración.

Y hay **dos vías de acceso distintas** que hay que cerrar por separado:
1. Concesiones al rol **`anon`** (privilegios por omisión de Supabase) → `0010`.
2. Concesión implícita al pseudo-rol **`PUBLIC`**, que Postgres pone en *toda*
   función nueva → `0011`. Revocar a `anon` **no** deshace esta.

Al crear una función nueva, revócala de `PUBLIC` y concédela solo a quien la
necesite. Las de trigger no se conceden a nadie: las invoca el motor.

### Las fuentes se declaran a mano
`src/styles/theme.css` escribe sus propios `@font-face` en vez de importar el
`index.css` de fontsource. No es purismo:

- Ese `index.css` arrastra los subconjuntos cirílico, vietnamita y latin-ext
  (~143 KB de precaché tirados). El español completo cabe en el latino.
- Y carga el archivo `wght`, que **solo expone el eje de peso**: con él,
  `font-variation-settings: 'SOFT'` se ignora sin avisar y Fraunces se ve como
  una serif de periódico. El archivo `soft` sí lo expone.

Si algún día los títulos "se ven raros", mira primero qué archivo de Fraunces
se está cargando.

### Fotos detrás de un adaptador
Todo pasa por `src/lib/photos.ts` (`upload` · `publicUrl` · `remove`). Hoy es
Supabase Storage (1 GB ≈ 12,500 fotos, usaremos ~6 %). Si algún día crece, migrar
a Cloudflare R2 es cambiar ese archivo y nada más.

## Despliegue

**En vivo:** https://angelaldaz.github.io/shopper/ · repo `AngelAldaz/shopper`

GitHub Pages desde Actions, en `/shopper/`. El repo **tiene que ser público**:
GitHub Pages gratis no publica desde repos privados.

- La `anon key` de Supabase viaja en el bundle **por diseño** — es pública y lo
  que protege los datos es RLS.
- La `service_role` key **jamás** entra al repo, al `.env` ni al bundle.
- `base: '/shopper/'` en `vite.config.ts` tiene que coincidir con `scope`,
  `start_url` y `navigateFallback` del PWA, o el service worker no toma control.
- `dist/404.html` es una copia de `index.html` (lo hace un plugin en el build):
  arregla los deep links en frío, antes de que el SW esté instalado.

**Si el build pasa pero `deploy-pages` falla**, mira la anotación del check:
```
Invoke-RestMethod "https://api.github.com/repos/AngelAldaz/shopper/commits/<sha>/check-runs"
```
El caso visto: *"due to in progress deployment. Please cancel <sha> first"* — un
despliegue anterior se queda encajado en el backend de Pages y rechaza todos los
siguientes en ~20 s. No es del código. Se resuelve esperando, o reiniciando el
origen en Settings → Pages (Source: None → GitHub Actions).

## Estado

- [x] **Fase 0** — Esqueleto y estética
- [x] **Fase 1** — Repo y GitHub Pages en vivo *(instalado en el iPhone)*
- [ ] Fase 2 — Supabase: esquema, RLS y sesiones
- [ ] Fase 3 — Hogar compartido
- [ ] Fase 4 — Motor local-first (Dexie + sync)
- [ ] Fase 5 — Supers, catálogo, fotos y precios
- [ ] Fase 6 — Listas y mejor precio
- [ ] Fase 7 — Historial de precios, compartir y keepalive
