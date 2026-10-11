# Deployment

Target: VPS Ubuntu 22.04 atau lebih baru (2 vCPU / 2 GB cukup), domain yang bisa diarahkan ke VPS, dan opsional object storage S3-compatible untuk backup. Deploy dijalankan dari Windows lewat OpenSSH bawaan.

## Gambaran

| Item | Lokasi |
|---|---|
| Binary | `/opt/kumlod/kumlod` |
| Data | `/var/lib/kumlod/data/kumlod.db`, `/var/lib/kumlod/data/files/` |
| Konfigurasi | `/etc/kumlod/kumlod.env`, `/etc/kumlod/storage.env` (root:kumlod, 640) |
| Service | `kumlod.service` (user `kumlod`, dengan hardening systemd) |
| Proxy | Caddy di port 80/443, HTTPS otomatis, HSTS, kompresi |
| Backup database | `litestream.service`, replikasi terus-menerus ke object storage |
| Backup file | `kumlod-backup-files.timer`, rclone harian ke object storage |
| CLI produksi | `kumlodctl` (menjalankan `kumlod` sebagai user `kumlod` dengan env produksi) |

## Pertama kali

1. Buat VPS Ubuntu dan pasang SSH key kamu:

   ```powershell
   ssh-keygen -t ed25519                     # kalau belum punya key
   type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@IP "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
   ```

   Script setup hanya mematikan login SSH pakai password kalau sudah ada SSH key di `authorized_keys`.

2. Arahkan DNS domain (record A/AAAA) ke IP VPS.

3. Build, upload, dan jalankan setup dari repo di Windows:

   ```powershell
   ./scripts/deploy.ps1 -Server root@IP -Setup -Domain kumlod.example.com -Email kamu@example.com
   ```

   Ini membangun `dist/kumlod-linux-amd64`, mengunggah folder `deploy/`, lalu menjalankan `setup-vps.sh`: update sistem dan update keamanan otomatis, user `kumlod`, folder dan env, service systemd, Caddy dengan HTTPS, firewall (SSH, 80, 443), pengetatan SSH, Litestream, dan timer backup file. Script aman dijalankan berulang.

4. Buat akun:

   ```bash
   ssh root@IP
   kumlodctl user create gua
   ```

5. Buka `https://kumlod.example.com`, login, lalu ikuti [USER_GUIDE.md](USER_GUIDE.md).

Kalau user SSH kamu bukan root, pakai user dengan sudo (`-Server kamu@IP`); script akan meminta password sudo lewat terminal.

## Deploy versi baru

```powershell
./scripts/deploy.ps1 -Server root@IP
```

Binary diganti, service di-restart, lalu `/api/health` dicek. Migrasi database jalan otomatis saat start. PWA di HP menawarkan "Muat ulang" begitu versi baru terdeteksi.

## Konfigurasi produksi

`/etc/kumlod/kumlod.env` (lihat [deploy/kumlod.env.example](../deploy/kumlod.env.example)):

```
KUMLOD_ADDR=127.0.0.1:8080
KUMLOD_DATA_DIR=/var/lib/kumlod/data
KUMLOD_TRUST_PROXY=true
KUMLOD_VAPID_SUBJECT=mailto:kamu@example.com
KUMLOD_MAX_UPLOAD_MB=50
KUMLOD_LOG_FORMAT=json
```

Setelah mengubah: `sudo systemctl restart kumlod`. Kalau `KUMLOD_MAX_UPLOAD_MB` dinaikkan, naikkan juga `request_body max_size` di `/etc/caddy/Caddyfile` lalu `sudo systemctl reload caddy`.

Kunci VAPID untuk push dibuat otomatis saat start pertama dan disimpan di database, jadi ikut ter-backup. Jangan hapus atau ganti, karena subscription perangkat yang sudah ada terikat ke kunci itu.

## Backup

Isi `/etc/kumlod/storage.env` (contoh untuk Cloudflare R2, Backblaze B2, Wasabi, AWS S3, atau MinIO):

```
KUMLOD_S3_BUCKET=kumlod-backup
KUMLOD_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
KUMLOD_S3_REGION=auto
KUMLOD_S3_ACCESS_KEY_ID=...
KUMLOD_S3_SECRET_ACCESS_KEY=...
KUMLOD_S3_PROVIDER=Cloudflare
```

Lalu jalankan setup lagi supaya Litestream dan timer backup aktif:

```powershell
./scripts/deploy.ps1 -Server root@IP -Setup -Domain kumlod.example.com -Email kamu@example.com
```

- Database: Litestream mereplikasi `kumlod.db` ke `s3://<bucket>/kumlod/db` terus-menerus.
- File materi: `kumlod-backup-files.timer` menyalin `files/` ke `s3://<bucket>/kumlod/files` tiap hari sekitar 03:30 (`rclone copy`, tidak menghapus apa pun di tujuan).

Cek:

```bash
systemctl status litestream
journalctl -u litestream -n 50
systemctl list-timers kumlod-backup-files.timer
sudo systemctl start kumlod-backup-files.service && journalctl -u kumlod-backup-files -n 20
```

## Restore

Database dari Litestream (misalnya di VPS baru setelah setup dan isi `storage.env`):

```bash
sudo systemctl stop kumlod litestream
sudo -u kumlod mkdir -p /var/lib/kumlod/data/old
sudo -u kumlod sh -c 'mv /var/lib/kumlod/data/kumlod.db* /var/lib/kumlod/data/old/ 2>/dev/null || true'
sudo systemd-run --quiet --wait --collect --pty --uid=kumlod --gid=kumlod \
  --property=EnvironmentFile=/etc/kumlod/storage.env \
  litestream restore -config /etc/litestream.yml /var/lib/kumlod/data/kumlod.db
sudo systemctl start kumlod litestream
```

File materi:

```bash
sudo systemd-run --quiet --wait --collect --pty --uid=kumlod --gid=kumlod \
  --property=EnvironmentFile=/etc/kumlod/storage.env \
  /bin/sh -c 'export RCLONE_CONFIG_KUMLODS3_TYPE=s3 RCLONE_CONFIG_KUMLODS3_PROVIDER="$KUMLOD_S3_PROVIDER" \
    RCLONE_CONFIG_KUMLODS3_ACCESS_KEY_ID="$KUMLOD_S3_ACCESS_KEY_ID" RCLONE_CONFIG_KUMLODS3_SECRET_ACCESS_KEY="$KUMLOD_S3_SECRET_ACCESS_KEY" \
    RCLONE_CONFIG_KUMLODS3_ENDPOINT="$KUMLOD_S3_ENDPOINT" RCLONE_CONFIG_KUMLODS3_REGION="$KUMLOD_S3_REGION"; \
    rclone copy "kumlods3:$KUMLOD_S3_BUCKET/kumlod/files" /var/lib/kumlod/data/files'
```

Backup manual satu kali (tanpa object storage) cukup menyalin folder data saat service berhenti:

```bash
sudo systemctl stop kumlod
sudo tar -C /var/lib/kumlod -czf ~/kumlod-$(date +%F).tar.gz data
sudo systemctl start kumlod
```

## Operasional

```bash
systemctl status kumlod
journalctl -u kumlod -f                  # log JSON
kumlodctl user passwd gua                # ganti password dan cabut semua sesi
kumlodctl version
curl -s http://127.0.0.1:8080/api/health
```

## Keamanan

- Tidak ada pendaftaran publik; akun hanya dibuat lewat CLI di server.
- Password argon2id, cookie sesi HttpOnly + SameSite=Lax + Secure, token sesi disimpan sebagai hash SHA-256.
- Semua request yang mengubah data wajib header `X-Requested-With: kumlod`; CORS tidak diaktifkan.
- Login dibatasi 5 percobaan per IP per 15 menit (`KUMLOD_TRUST_PROXY=true` supaya IP asli dari Caddy dipakai).
- Header keamanan (CSP, nosniff, X-Frame-Options, Referrer-Policy) dari aplikasi, HSTS dari Caddy.
- File hanya bisa diunduh dengan sesi valid. Selain PDF dan gambar, file dikirim sebagai attachment dengan CSP sandbox.
- Service berjalan sebagai user tanpa login dengan hardening systemd; hanya `/var/lib/kumlod` yang bisa ditulis.
