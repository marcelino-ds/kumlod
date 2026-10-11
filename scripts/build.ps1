<#
.SYNOPSIS
  Builds the frontend and the Kumlod binaries.

.DESCRIPTION
  1. Builds web/ into internal/webui/dist (embedded into the binary).
  2. Cross-compiles dist/kumlod-linux-amd64 (CGO_ENABLED=0) for the VPS and,
     unless -LinuxOnly, dist/kumlod-windows-amd64.exe for local use.

.PARAMETER Version
  Version embedded in the binary. Default: git describe, or a timestamp.
.PARAMETER SkipWeb
  Reuse the current internal/webui/dist instead of rebuilding the frontend.
.PARAMETER Test
  Run Go and frontend tests before building.
.PARAMETER LinuxOnly
  Only build the Linux binary.

.EXAMPLE
  ./scripts/build.ps1
  ./scripts/build.ps1 -Test -Version v0.1.0
#>
param(
    [string]$Version = '',
    [switch]$SkipWeb,
    [switch]$Test,
    [switch]$LinuxOnly
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Invoke-Checked([string]$what, [scriptblock]$block) {
    & $block
    if ($LASTEXITCODE -ne 0) { throw "$what gagal (exit $LASTEXITCODE)" }
}

Push-Location $root
try {
    if (-not $Version) {
        $prev = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        $Version = (& git describe --tags --always --dirty 2>$null)
        $gitOk = $LASTEXITCODE -eq 0
        $ErrorActionPreference = $prev
        if (-not $gitOk -or -not $Version) { $Version = 'v0.1.0-' + (Get-Date -Format 'yyyyMMddHHmm') }
    }
    Write-Host "==> Kumlod $Version"

    if ($Test) {
        Write-Host '==> go test ./...'
        Invoke-Checked 'go test' { go test ./... }
    }

    if (-not $SkipWeb) {
        Push-Location web
        try {
            if (-not (Test-Path node_modules)) {
                Write-Host '==> npm ci'
                Invoke-Checked 'npm ci' { npm ci --no-audit --no-fund }
            }
            if ($Test) {
                Write-Host '==> npm test'
                Invoke-Checked 'npm test' { npm test }
            }
            Write-Host '==> npm run build (typecheck + vite)'
            Invoke-Checked 'npm run build' { npm run build }
        } finally {
            Pop-Location
        }
    }
    if (-not (Test-Path internal/webui/dist/index.html)) {
        throw 'internal/webui/dist/index.html tidak ada. Jalankan tanpa -SkipWeb.'
    }

    New-Item -ItemType Directory -Force dist | Out-Null
    $ldflags = "-s -w -X main.version=$Version"
    $saved = @{ GOOS = $env:GOOS; GOARCH = $env:GOARCH; CGO_ENABLED = $env:CGO_ENABLED }
    try {
        $env:CGO_ENABLED = '0'
        $env:GOARCH = 'amd64'

        $env:GOOS = 'linux'
        Write-Host '==> go build linux/amd64'
        Invoke-Checked 'go build linux' { go build -trimpath -ldflags $ldflags -o dist/kumlod-linux-amd64 ./cmd/kumlod }

        if (-not $LinuxOnly) {
            $env:GOOS = 'windows'
            Write-Host '==> go build windows/amd64'
            Invoke-Checked 'go build windows' { go build -trimpath -ldflags $ldflags -o dist/kumlod-windows-amd64.exe ./cmd/kumlod }
        }
    } finally {
        foreach ($k in $saved.Keys) {
            if ($null -eq $saved[$k]) { Remove-Item "Env:$k" -ErrorAction SilentlyContinue } else { Set-Item "Env:$k" $saved[$k] }
        }
    }

    $hash = (Get-FileHash dist/kumlod-linux-amd64 -Algorithm SHA256).Hash.ToLower()
    [System.IO.File]::WriteAllText((Join-Path $root 'dist/kumlod-linux-amd64.sha256'), "$hash  kumlod-linux-amd64`n")
    Get-ChildItem dist | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
        '{0,-32} {1,8:N1} MB' -f $_.Name, ($_.Length / 1MB)
    }
} finally {
    Pop-Location
}
