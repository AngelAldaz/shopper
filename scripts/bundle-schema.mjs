/**
 * Junta las migraciones en un solo archivo pegable en el SQL Editor de Supabase.
 *
 * Existe porque aplicar el esquema a la nube es un paso manual: pegar nueve
 * archivos en orden invita a saltarse uno o a cambiar el orden, y una migración
 * fuera de sitio falla con un error que no dice cuál fue el error real.
 *
 * Las migraciones siguen siendo la fuente de verdad; esto es una salida
 * derivada. Regenerar con:  npm run db:bundle
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const migrationsDir = new URL('supabase/migrations/', root)
const outFile = fileURLToPath(new URL('supabase/schema.sql', root))

const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()

const parts = [
  `-- ############################################################################`,
  `-- ARCHIVO GENERADO — NO EDITAR A MANO.`,
  `--`,
  `-- Son las ${files.length} migraciones de supabase/migrations/ concatenadas en orden,`,
  `-- para poder aplicar el esquema de una sola vez en el SQL Editor de Supabase.`,
  `-- Para cambiar algo, edita la migración correspondiente y corre:`,
  `--     npm run db:bundle`,
  `--`,
  `-- Todo va dentro de una transacción: si algo falla, no queda nada a medias.`,
  `-- ############################################################################`,
  ``,
  `begin;`,
  ``,
]

for (const file of files) {
  const sql = await readFile(new URL(file, migrationsDir), 'utf8')
  parts.push(
    `-- ╔══════════════════════════════════════════════════════════════════════════`,
    `-- ║  ${file}`,
    `-- ╚══════════════════════════════════════════════════════════════════════════`,
    ``,
    sql.trimEnd(),
    ``,
    ``,
  )
}

parts.push(`commit;`, ``)

await writeFile(outFile, parts.join('\n'), 'utf8')
console.log(`✓ supabase/schema.sql generado desde ${files.length} migraciones`)
