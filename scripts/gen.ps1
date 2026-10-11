<#
.SYNOPSIS
  Regenerates code from the API contract (api/openapi.yaml).

.DESCRIPTION
  - Go:         internal/api/api.gen.go via oapi-codegen (go tool)
  - TypeScript: web/src/api/schema.d.ts via openapi-typescript
  Run from anywhere; paths are resolved from the repo root.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    Write-Host '==> Go: oapi-codegen'
    go tool oapi-codegen -config api/oapi-codegen.yaml api/openapi.yaml
    if ($LASTEXITCODE -ne 0) { throw 'oapi-codegen gagal' }

    Write-Host '==> TypeScript: openapi-typescript'
    Push-Location web
    try {
        if (-not (Test-Path node_modules)) { npm ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'npm ci gagal' } }
        npm run --silent gen:api
        if ($LASTEXITCODE -ne 0) { throw 'openapi-typescript gagal' }
    } finally {
        Pop-Location
    }

    Write-Host '==> go build ./... (cek kode hasil generate)'
    go build ./...
    if ($LASTEXITCODE -ne 0) { throw 'go build gagal' }
    Write-Host 'Selesai.'
} finally {
    Pop-Location
}
