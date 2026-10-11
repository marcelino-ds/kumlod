#!/usr/bin/env bash
# Kumlod VPS setup for a fresh Ubuntu server (22.04 or newer). Safe to run again.
#
#   sudo DOMAIN=kumlod.example.com EMAIL=kamu@example.com bash setup-vps.sh
#
# What it does: system updates and automatic security updates, a "kumlod" system
# user, folders and env files, the systemd service, Caddy with automatic HTTPS,
# the firewall, SSH hardening (only when an SSH key is installed), Litestream for
# the database, and a daily file backup timer (both only when object storage is set).
set -euo pipefail

DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
LITESTREAM_VERSION="${LITESTREAM_VERSION:-0.5.17}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '\n==> %s\n' "$*"; }
warn() { printf 'PERINGATAN: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Jalankan sebagai root (pakai sudo)."
[ -n "$DOMAIN" ] || die "DOMAIN wajib diisi, contoh: DOMAIN=kumlod.example.com"
[ -n "$EMAIL" ] || die "EMAIL wajib diisi (untuk Let's Encrypt dan VAPID), contoh: EMAIL=kamu@example.com"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || die "DOMAIN tidak valid: $DOMAIN"
[[ "$EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$ ]] || die "EMAIL tidak valid: $EMAIL"
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || die "Script ini untuk Ubuntu (terdeteksi: ${ID:-unknown})."
for f in kumlod.service Caddyfile kumlod.env.example storage.env.example litestream.yml \
         litestream.override.conf backup-files.sh kumlod-backup-files.service kumlod-backup-files.timer kumlodctl; do
  [ -f "$HERE/$f" ] || die "File $f tidak ada di $HERE"
done

export DEBIAN_FRONTEND=noninteractive

log "Update sistem dan pasang paket"
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg ufw unattended-upgrades sqlite3 rclone \
  debian-keyring debian-archive-keyring apt-transport-https

log "Update keamanan otomatis"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
systemctl enable --now unattended-upgrades.service

log "User sistem dan folder"
if ! id kumlod >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/kumlod --create-home --shell /usr/sbin/nologin kumlod
fi
install -d -m 0755 -o root -g root /opt/kumlod
install -d -m 0750 -o kumlod -g kumlod /var/lib/kumlod /var/lib/kumlod/data
install -d -m 0750 -o root -g kumlod /etc/kumlod

if [ ! -f /etc/kumlod/kumlod.env ]; then
  sed -e "s|__EMAIL__|${EMAIL}|g" "$HERE/kumlod.env.example" >/etc/kumlod/kumlod.env
fi
if [ ! -f /etc/kumlod/storage.env ]; then
  cp "$HERE/storage.env.example" /etc/kumlod/storage.env
fi
chown root:kumlod /etc/kumlod/kumlod.env /etc/kumlod/storage.env
chmod 0640 /etc/kumlod/kumlod.env /etc/kumlod/storage.env

log "Service systemd dan kumlodctl"
install -m 0644 "$HERE/kumlod.service" /etc/systemd/system/kumlod.service
install -m 0755 "$HERE/kumlodctl" /usr/local/bin/kumlodctl
systemctl daemon-reload
systemctl enable kumlod.service
if [ -x /opt/kumlod/kumlod ]; then
  systemctl restart kumlod.service
else
  warn "Binary belum ada di /opt/kumlod/kumlod. Deploy dulu dengan scripts/deploy.ps1."
fi

log "Caddy (HTTPS otomatis)"
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
    gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >/etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi
sed -e "s|__DOMAIN__|${DOMAIN}|g" -e "s|__EMAIL__|${EMAIL}|g" "$HERE/Caddyfile" >/etc/caddy/Caddyfile.new
caddy validate --config /etc/caddy/Caddyfile.new --adapter caddyfile
mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile
systemctl enable caddy.service
systemctl reload caddy.service || systemctl restart caddy.service

log "Firewall (SSH, HTTP, HTTPS)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

log "SSH"
has_key=0
for f in /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys; do
  if [ -s "$f" ] && grep -qE '^(ssh-(ed25519|rsa)|ecdsa-sha2-|sk-)' "$f"; then
    has_key=1
  fi
done
if [ "$has_key" -eq 1 ]; then
  cat >/etc/ssh/sshd_config.d/99-kumlod.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
  if sshd -t; then
    systemctl reload ssh.service 2>/dev/null || systemctl reload sshd.service
    echo "Login SSH pakai password dimatikan (SSH key ditemukan)."
  else
    rm -f /etc/ssh/sshd_config.d/99-kumlod.conf
    warn "Konfigurasi SSH tidak valid, perubahan dibatalkan."
  fi
else
  warn "Belum ada SSH key di authorized_keys, jadi login password TIDAK dimatikan."
  warn "Pasang SSH key (ssh-copy-id atau tambah ke ~/.ssh/authorized_keys), lalu jalankan script ini lagi."
fi

log "Litestream ${LITESTREAM_VERSION}"
if ! command -v litestream >/dev/null 2>&1 || ! litestream version 2>/dev/null | grep -q "${LITESTREAM_VERSION}"; then
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/litestream.deb" \
    "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-x86_64.deb"
  dpkg -i "$tmp/litestream.deb"
  rm -rf "$tmp"
fi
install -m 0644 "$HERE/litestream.yml" /etc/litestream.yml
install -d -m 0755 /etc/systemd/system/litestream.service.d
install -m 0644 "$HERE/litestream.override.conf" /etc/systemd/system/litestream.service.d/override.conf

log "Backup file harian"
install -m 0755 "$HERE/backup-files.sh" /opt/kumlod/backup-files.sh
install -m 0644 "$HERE/kumlod-backup-files.service" /etc/systemd/system/kumlod-backup-files.service
install -m 0644 "$HERE/kumlod-backup-files.timer" /etc/systemd/system/kumlod-backup-files.timer
systemctl daemon-reload

if grep -qE '^KUMLOD_S3_BUCKET=[^[:space:]]+' /etc/kumlod/storage.env; then
  systemctl enable litestream.service
  systemctl restart litestream.service
  systemctl enable --now kumlod-backup-files.timer
  echo "Replikasi database (Litestream) dan backup file harian aktif."
else
  systemctl disable --now litestream.service >/dev/null 2>&1 || true
  systemctl disable --now kumlod-backup-files.timer >/dev/null 2>&1 || true
  warn "Object storage belum diisi. Isi /etc/kumlod/storage.env lalu jalankan script ini lagi untuk mengaktifkan backup."
fi

log "Selesai"
cat <<EOF
Kumlod: https://${DOMAIN}
Langkah berikutnya:
  1. Arahkan DNS ${DOMAIN} ke IP server ini (Caddy mengurus sertifikat HTTPS otomatis).
  2. Deploy binary dari Windows:  ./scripts/deploy.ps1 -Server <user>@<ip>
  3. Buat akun:                    sudo kumlodctl user create <username>
  4. Cek status:                   systemctl status kumlod caddy litestream
EOF
