# Prueba de humo del flujo de hogar contra el Supabase local.
#
# Existe porque las pruebas SQL cubren la lógica del servidor, pero NO las
# consultas que hace el cliente a través de PostgREST. Ahí fue donde se escapó
# el fallo PGRST200: la lógica era correcta, pero faltaba la clave foránea que
# PostgREST necesita para unir miembros con perfiles.
#
#   npm run test:flow

$ErrorActionPreference = 'Stop'
$API = 'http://127.0.0.1:54321'
$MAIL = 'http://127.0.0.1:54324'
$ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
$anonH = @{ apikey = $ANON; 'Content-Type' = 'application/json' }
$fallos = 0

function Check($cond, $msg) {
  if ($cond) { Write-Host "  ✓ $msg" -ForegroundColor Green }
  else { Write-Host "  ✗ $msg" -ForegroundColor Red; $script:fallos++ }
}

function NuevoUsuario($email, $nombre) {
  $body = @{ email = $email; password = 'contrasena-larga-123'; data = @{ display_name = $nombre } } | ConvertTo-Json
  Invoke-RestMethod "$API/auth/v1/signup" -Method Post -Headers $anonH -Body $body | Out-Null
  Start-Sleep -Milliseconds 1200

  # Confirmar desde Mailpit, igual que haría la persona en Safari.
  $msgs = Invoke-RestMethod "$MAIL/api/v1/messages"
  $mio = $msgs.messages | Where-Object { $_.To[0].Address -eq $email } | Select-Object -First 1
  $src = Invoke-RestMethod "$MAIL/api/v1/message/$($mio.ID)"
  $link = ([regex]::Match($src.HTML, 'href="([^"]+)"').Groups[1].Value) -replace '&amp;', '&'
  # Basta con que la petición llegue: /auth/v1/verify confirma la cuenta del
  # lado del servidor ANTES de redirigir, así que el 303 hacia la app da igual.
  try { Invoke-WebRequest $link -MaximumRedirection 0 | Out-Null } catch { }

  $login = Invoke-RestMethod "$API/auth/v1/token?grant_type=password" -Method Post -Headers $anonH `
    -Body (@{ email = $email; password = 'contrasena-larga-123' } | ConvertTo-Json)
  return @{ apikey = $ANON; Authorization = "Bearer $($login.access_token)"; 'Content-Type' = 'application/json' }
}

function Rpc($h, $fn, $body) {
  Invoke-RestMethod "$API/rest/v1/rpc/$fn" -Method Post -Headers $h -Body $body
}

function Miembros($h, $hogar) {
  # La consulta EXACTA que hace useHousehold, con el perfil embebido.
  Invoke-RestMethod "$API/rest/v1/household_members?select=user_id,role,joined_at,profiles(display_name)&household_id=eq.$hogar&order=joined_at" -Headers $h
}

$sufijo = [guid]::NewGuid().ToString('N').Substring(0, 6)

Write-Host "`n── alta y creación de hogar ─────────────────────────"
$ana = NuevoUsuario "ana.$sufijo@local.mx" "Ana Ruiz"
$hogar = Rpc $ana 'create_household' '{"p_name":"Casa Ruiz"}'
Check ($hogar -match '^[0-9a-f-]{36}$') "Ana crea el hogar"

$ms = Miembros $ana $hogar
Check ($ms.Count -eq 1) "la consulta con perfil embebido responde (esto fallaba con PGRST200)"
Check ($ms[0].profiles.display_name -eq 'Ana Ruiz') "trae el nombre del perfil: '$($ms[0].profiles.display_name)'"
Check ($ms[0].role -eq 'owner') "quien crea el hogar manda en él"

$h = (Invoke-RestMethod "$API/rest/v1/households?select=invite_code&id=eq.$hogar" -Headers $ana)[0]
$codigo = $h.invite_code
Check ($codigo.Length -eq 6) "el código de invitación tiene 6 caracteres: $codigo"

Write-Host "`n── supers del onboarding ────────────────────────────"
$supers = @(
  @{ id = [guid]::NewGuid().ToString(); household_id = $hogar; name = 'Walmart'; color = '#2E77BB' },
  @{ id = [guid]::NewGuid().ToString(); household_id = $hogar; name = 'Soriana'; color = '#D94F4F' }
) | ConvertTo-Json
Invoke-RestMethod "$API/rest/v1/stores" -Method Post -Headers ($ana + @{ Prefer = 'return=minimal' }) -Body $supers | Out-Null
Check ((Invoke-RestMethod "$API/rest/v1/stores?select=id" -Headers $ana).Count -eq 2) "los supers elegidos se guardan"

Write-Host "`n── se une una segunda persona ───────────────────────"
$beto = NuevoUsuario "beto.$sufijo@local.mx" "Beto Sosa"
Rpc $beto 'join_household' (@{ p_code = $codigo } | ConvertTo-Json) | Out-Null
Check ((Invoke-RestMethod "$API/rest/v1/stores?select=id" -Headers $beto).Count -eq 2) "Beto ve los supers de Ana al entrar"
Check ((Miembros $ana $hogar).Count -eq 2) "el hogar tiene dos personas"

Write-Host "`n── contrato del motor de sincronizacion ─────────────"
# Las pruebas del motor usan un servidor falso; esto verifica lo que ese falso
# NO puede verificar: que PostgREST acepte exactamente lo que le mandamos.

# 1. Upsert con la lista blanca de columnas, tal cual la manda pushablePayload.
$prodId = [guid]::NewGuid().ToString()
$prod = @{
  id = $prodId; household_id = $hogar; name = 'Huevo blanco'; brand = 'San Juan'
  unit = 'pieza'; photo_path = $null; notes = $null; last_used_at = $null
  created_at = '2026-07-24T10:00:00.000Z'; deleted_at = $null
} | ConvertTo-Json
$up = @{ Prefer = 'resolution=merge-duplicates,return=minimal' }
Invoke-RestMethod "$API/rest/v1/products?on_conflict=id" -Method Post -Headers ($ana + $up) -Body $prod | Out-Null
Check $true "el upsert acepta la lista blanca de columnas"

# 2. Reenviar lo mismo no duplica: es la base de que reintentar sea seguro.
Invoke-RestMethod "$API/rest/v1/products?on_conflict=id" -Method Post -Headers ($ana + $up) -Body $prod | Out-Null
Check ((Invoke-RestMethod "$API/rest/v1/products?select=id&id=eq.$prodId" -Headers $ana).Count -eq 1) `
  "reenviar el mismo upsert deja una sola fila"

# 3. search_key es GENERATED ALWAYS: mandarla debe fallar. Si algun dia dejara
#    de fallar, la lista blanca habria dejado de ser necesaria y querriamos
#    enterarnos.
$conGenerada = ($prod | ConvertFrom-Json)
$conGenerada | Add-Member -NotePropertyName search_key -NotePropertyValue 'a-mano'
try {
  Invoke-RestMethod "$API/rest/v1/products?on_conflict=id" -Method Post -Headers ($ana + $up) -Body ($conGenerada | ConvertTo-Json)
  Check $false "mandar search_key deberia ser rechazado"
} catch {
  Check $true "mandar una columna generada es rechazado (por eso hay lista blanca)"
}

# 4. El servidor pisa updated_at con SU reloj, que es el eje del delta.
$guardado = (Invoke-RestMethod "$API/rest/v1/products?select=updated_at,created_by&id=eq.$prodId" -Headers $ana)[0]
Check ($guardado.updated_at -gt '2026-07-24T10:00:00') "updated_at lo pone el servidor, no el cliente"
Check ($null -ne $guardado.created_by) "created_by lo pone el trigger aunque no se envie"

# 5. La consulta del delta: mayor que una marca ISO.
$desde = '1970-01-01T00:00:00.000Z'
$delta = Invoke-RestMethod "$API/rest/v1/products?select=id&updated_at=gt.$desde" -Headers $ana
Check ($delta.Count -ge 1) "la consulta incremental por updated_at devuelve filas"
$futuro = '2999-01-01T00:00:00.000Z'
$vacio = Invoke-RestMethod "$API/rest/v1/products?select=id&updated_at=gt.$futuro" -Headers $ana
Check ($vacio.Count -eq 0) "y no devuelve nada si ya estas al dia"

# 6. Borrado suave por upsert, que es como lo manda la cola.
$borrado = ($prod | ConvertFrom-Json)
$borrado.deleted_at = '2026-07-24T12:00:00.000Z'
Invoke-RestMethod "$API/rest/v1/products?on_conflict=id" -Method Post -Headers ($ana + $up) -Body ($borrado | ConvertTo-Json) | Out-Null
$vivos = Invoke-RestMethod "$API/rest/v1/products?select=id&id=eq.$prodId&deleted_at=is.null" -Headers $ana
Check ($vivos.Count -eq 0) "el borrado suave viaja como un upsert normal"

Write-Host "`n── reglas de salida ─────────────────────────────────"
try {
  Rpc $ana 'leave_household' (@{ p_household_id = $hogar } | ConvertTo-Json) | Out-Null
  Check $false "quien manda NO debería poder salir dejando el hogar sin dueño"
} catch {
  Check ($_.ErrorDetails.Message -match 'pasa el mando') "quien manda no puede salir sin pasar el mando"
}

$betoId = ((Miembros $ana $hogar) | Where-Object { $_.profiles.display_name -eq 'Beto Sosa' }).user_id
Rpc $ana 'transfer_ownership' (@{ p_household_id = $hogar; p_user_id = $betoId } | ConvertTo-Json) | Out-Null
$ms = Miembros $ana $hogar
Check ((($ms | Where-Object { $_.user_id -eq $betoId }).role) -eq 'owner') "el mando pasa a Beto"

$salida = Rpc $ana 'leave_household' (@{ p_household_id = $hogar } | ConvertTo-Json)
Check ($salida -eq 'left') "ahora Ana sí puede salir"
Check ((Invoke-RestMethod "$API/rest/v1/stores?select=id" -Headers $ana).Count -eq 0) "Ana deja de ver los datos al instante"
Check ((Invoke-RestMethod "$API/rest/v1/stores?select=id" -Headers $beto).Count -eq 2) "Beto, que se queda, conserva todo"

$salida2 = Rpc $beto 'leave_household' (@{ p_household_id = $hogar } | ConvertTo-Json)
Check ($salida2 -eq 'deleted') "la última persona en salir se lleva el hogar"

Write-Host ""
if ($fallos -eq 0) {
  Write-Host "  Todo el flujo de hogar funciona." -ForegroundColor Green
} else {
  Write-Host "  $fallos comprobaciones fallaron." -ForegroundColor Red
  exit 1
}
