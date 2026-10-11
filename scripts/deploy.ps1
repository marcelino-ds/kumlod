<#
.SYNOPSIS
  Deploys Kumlod to the VPS over SSH (uses the OpenSSH client built into Windows).

.DESCRIPTION
  Builds dist/kumlod-linux-amd64 (unless -SkipBuild), uploads it, installs it to
  /opt/kumlod/kumlod, restarts the service, and checks /api/health.
  With -Setup it first uploads deploy/ and runs setup-vps.sh (first install, or
  to re-apply server configuration).

.PARAMETER Server
  SSH target, e.g. root@203.0.113.10 or kamu@kumlod.example.com (user needs sudo).
.PARAMETER Setup
  Run deploy/setup-vps.sh on the server. Needs -Domain and -Email.
.PARAMETER Domain
  Public domain for Caddy, e.g. kumlod.example.com.
.PARAMETER Email
  Email for Let's Encrypt and the VAPID subject.
.PARAMETER Port
  SSH port (default 22).
.PARAMETER SkipBuild
  Upload the existing dist/kumlod-linux-amd64.

.EXAMPLE
  ./scripts/deploy.ps1 -Server root@203.0.113.10 -Setup -Domain kumlod.example.com -Email kamu@example.com
.EXAMPLE
  ./scripts/deploy.ps1 -Server root@203.0.113.10
#>
param(
    [Parameter(Mandatory = $true)][string]$Server,
    [switch]$Setup,
    [string]$Domain = '',
    [string]$Email = '',
    [int]$Port = 22,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Invoke-Checked([string]$what, [scriptblock]$block) {
    & $block
    if ($LASTEXITCODE -ne 0) { throw "$what gagal (exit $LASTEXITCODE)" }
}

# Values end up in a remote shell script, so only allow safe characters.
if ($Server -notmatch '^[A-Za-z0-9._-]+@[A-Za-z0-9.:_-]+$' -and $Server -notmatch '^[A-Za-z0-9.:_-]+$') {
    throw "Server tidak valid: $Server (contoh: root@203.0.113.10)"
}
if ($Setup) {
    if ($Domain -notmatch '^[A-Za-z0-9.-]+$') { throw 'Isi -Domain dengan domain yang valid, contoh: kumlod.example.com' }
    if ($Email -notmatch '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$') { throw 'Isi -Email dengan email yang valid' }
}
if (-not (Get-Command ssh -ErrorAction SilentlyContinue) -or -not (Get-Command scp -ErrorAction SilentlyContinue)) {
    throw 'ssh/scp tidak ditemukan. Aktifkan OpenSSH Client di Windows (Settings > Apps > Optional features).'
}

Push-Location $root
try {
    if (-not $SkipBuild) {
        & (Join-Path $PSScriptRoot 'build.ps1') -LinuxOnly
    }
    $binary = Join-Path $root 'dist/kumlod-linux-amd64'
    if (-not (Test-Path $binary)) { throw "Binary tidak ada: $binary. Jalankan scripts/build.ps1." }

    $remoteScript = @(
        'set -eu'
        'SUDO=""; if [ "$(id -u)" -ne 0 ]; then SUDO=sudo; fi'
    )
    if ($Setup) {
        Write-Host '==> Upload deploy/'
        Invoke-Checked 'ssh' { ssh -p $Port $Server 'rm -rf /tmp/kumlod-deploy && mkdir -p /tmp/kumlod-deploy' }
        Invoke-Checked 'scp deploy' { scp -P $Port (Get-ChildItem deploy -File | ForEach-Object { $_.FullName }) "${Server}:/tmp/kumlod-deploy/" }
    }
    Write-Host '==> Upload binary'
    Invoke-Checked 'scp binary' { scp -P $Port $binary "${Server}:/tmp/kumlod.new" }

    $remoteScript += @(
        '$SUDO install -d -m 0755 /opt/kumlod'
        '$SUDO install -m 0755 /tmp/kumlod.new /opt/kumlod/kumlod'
        'rm -f /tmp/kumlod.new'
        '/opt/kumlod/kumlod version'
    )
    if ($Setup) {
        $remoteScript += @(
            "`$SUDO env DOMAIN='$Domain' EMAIL='$Email' bash /tmp/kumlod-deploy/setup-vps.sh"
            'rm -rf /tmp/kumlod-deploy'
        )
    }
    $remoteScript += @(
        '$SUDO systemctl restart kumlod'
        'for i in $(seq 1 15); do'
        '  if curl -fsS http://127.0.0.1:8080/api/health; then echo; echo "Deploy berhasil."; exit 0; fi'
        '  sleep 1'
        'done'
        'echo "Health check gagal. Log terakhir:"'
        '$SUDO journalctl -u kumlod -n 50 --no-pager'
        'exit 1'
    )

    # Upload the script with LF endings and run it with a TTY so sudo can ask for a password.
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) 'kumlod-remote.sh'
    [System.IO.File]::WriteAllText($tmp, (($remoteScript -join "`n") + "`n"))
    try {
        Invoke-Checked 'scp script' { scp -P $Port $tmp "${Server}:/tmp/kumlod-remote.sh" }
    } finally {
        Remove-Item $tmp -ErrorAction SilentlyContinue
    }
    Write-Host '==> Pasang dan restart di server'
    Invoke-Checked 'remote deploy' { ssh -t -p $Port $Server 'bash /tmp/kumlod-remote.sh; status=$?; rm -f /tmp/kumlod-remote.sh; exit $status' }
} finally {
    Pop-Location
}
