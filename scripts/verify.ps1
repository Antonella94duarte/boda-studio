# ---------------------------------------------------------------------------
# Verificación completa del proyecto: instala, compila, migra y prueba.
#
#   pwsh -File scripts/verify.ps1
#
# Cada bloque corre aunque el anterior falle (así se ven todos los problemas de
# una vez) y al final imprime un resumen. Los pasos que producen mucho texto
# dejan su salida en un .log y, si fallan, se muestran las últimas líneas.
# ---------------------------------------------------------------------------

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$results = [System.Collections.Generic.List[object]]::new()
$logs = [ordered]@{
    'Typecheck' = 'verify-typecheck.log'
    'Tests'     = 'verify-test.log'
    'Build'     = 'verify-build.log'
}

function Step {
    param([string]$Name, [scriptblock]$Action, [string]$LogName)
    Write-Host ''
    Write-Host "=== $Name ===" -ForegroundColor Cyan
    $started = Get-Date

    if ($LogName) {
        $logPath = Join-Path $root $LogName
        Remove-Item $logPath -ErrorAction SilentlyContinue
        & $Action *> $logPath
    } else {
        & $Action
    }

    $code = $LASTEXITCODE
    $ok = ($code -eq 0) -or ($null -eq $code)
    $results.Add([pscustomobject]@{
        Paso     = $Name
        Estado   = if ($ok) { 'OK' } else { "FALLO (exit $code)" }
        Segundos = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
    })
    if (-not $ok) { Write-Host "  -> falló con exit $code" -ForegroundColor Yellow }
    return $ok
}

Write-Host "Node: $(node -v)  |  pnpm: $(pnpm -v)" -ForegroundColor DarkGray

Step '1/10 Preparar .env' {
    if (-not (Test-Path '.env')) {
        Copy-Item '.env.example' '.env'
        Write-Host '  .env creado a partir de .env.example (valores de desarrollo)' -ForegroundColor DarkGray
    } else {
        Write-Host '  .env ya existe: se respeta' -ForegroundColor DarkGray
    }
    $global:LASTEXITCODE = 0
} | Out-Null

Step '2/10 Instalar dependencias' { pnpm install --reporter=append-only } | Out-Null
Step '3/10 Compilar @boda/shared' { pnpm run build:shared } | Out-Null
Step '4/10 Generar cliente Prisma' {
    pnpm --filter @boda/api exec prisma generate

    # En Windows el antivirus o OneDrive pueden retener el .dll del motor justo
    # cuando Prisma lo renombra (EPERM). Se reintenta una vez.
    if ($LASTEXITCODE -ne 0) {
        Write-Host '  reintentando: el motor pudo quedar bloqueado por el antivirus o OneDrive' -ForegroundColor DarkGray
        Start-Sleep -Seconds 3
        pnpm --filter @boda/api exec prisma generate
    }

    # Si igual falla pero el cliente ya está generado, no se corta la
    # verificación: el paso siguiente (db push) lo regenera de todos modos.
    if ($LASTEXITCODE -ne 0) {
        $generado = Get-ChildItem -Path (Join-Path $root 'node_modules\.pnpm') -Recurse -Filter 'query_engine-windows.dll.node' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($generado) {
            Write-Host '  el cliente de Prisma ya estaba generado: se continúa' -ForegroundColor DarkGray
            $global:LASTEXITCODE = 0
        }
    }
} | Out-Null
Step '5/10 Crear las tablas (db push)' { pnpm run db:push } | Out-Null
Step '6/10 Cargar datos de ejemplo (seed)' { pnpm run db:seed } | Out-Null
Step '7/10 Typecheck de los tres paquetes' { pnpm run typecheck } 'verify-typecheck.log' | Out-Null
Step '8/10 Tests' { pnpm run test } 'verify-test.log' | Out-Null
Step '9/10 Build de la API y de la web' {
    pnpm --filter @boda/api build
    if ($LASTEXITCODE -ne 0) { return }
    pnpm --filter @boda/web build
} 'verify-build.log' | Out-Null

# --- Prueba de humo de la API ---------------------------------------------
Write-Host ''
Write-Host '=== 10/10 Prueba de humo del API (login, invitados, campaña en seco, RSVP) ===' -ForegroundColor Cyan

# Se arranca con cmd.exe porque en Windows `pnpm` es un shim de PowerShell y
# Start-Process no puede ejecutarlo directamente. La salida queda en un log para
# poder diagnosticar si la API no levanta.
$apiLog = Join-Path $root 'api-dev.log'
Remove-Item $apiLog -ErrorAction SilentlyContinue
$api = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c', "pnpm --filter @boda/api dev > `"$apiLog`" 2>&1" `
    -PassThru -WindowStyle Hidden
$healthy = $false
$segundos = 0
try {
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Seconds 1
        $segundos = $i
        try {
            Invoke-RestMethod -Uri 'http://localhost:4000/api/health' -TimeoutSec 3 | Out-Null
            $healthy = $true
            break
        } catch { }
    }

    if (-not $healthy) {
        Write-Host '  La API no respondió en 40 s. Últimas líneas del log:' -ForegroundColor Yellow
        if (Test-Path $apiLog) { Get-Content $apiLog -Tail 25 | ForEach-Object { Write-Host "    $_" } }
        $results.Add([pscustomobject]@{ Paso = '10/10 Prueba de humo del API'; Estado = 'FALLO'; Segundos = 40 })
    } else {
        Write-Host '  La API responde; corriendo la prueba de humo...' -ForegroundColor DarkGray
        node scripts/smoke-api.mjs
        $code = $LASTEXITCODE
        $results.Add([pscustomobject]@{
            Paso     = '10/10 Prueba de humo del API'
            Estado   = if ($code -eq 0) { 'OK' } else { "FALLO (exit $code)" }
            Segundos = $segundos
        })
    }
} finally {
    if ($api -and -not $api.HasExited) { Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue }
    Get-Process -Name node -ErrorAction SilentlyContinue |
        Where-Object { $_.StartTime -gt (Get-Date).AddMinutes(-3) } |
        Stop-Process -Force -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host '================ RESUMEN ================' -ForegroundColor Cyan
$results | Format-Table -AutoSize

$fallos = @($results | Where-Object { $_.Estado -ne 'OK' })
if ($fallos.Count -gt 0) {
    # Los errores de compilación y de tests son lo más útil: se muestran acá.
    foreach ($entry in $logs.GetEnumerator()) {
        $logPath = Join-Path $root $entry.Value
        if (-not (Test-Path $logPath)) { continue }
        Write-Host ''
        Write-Host "--- $($entry.Value) (últimas 40 líneas) ---" -ForegroundColor DarkGray
        Get-Content $logPath -Tail 40 | ForEach-Object { Write-Host "  $_" }
    }
    Write-Host ''
    Write-Host "$($fallos.Count) paso(s) con problemas." -ForegroundColor Red
    exit 1
}

Write-Host 'Todo verificado correctamente.' -ForegroundColor Green
exit 0
