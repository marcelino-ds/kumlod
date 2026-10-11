# Implementation Plan: Kumlod Core

- [x] 1. Fondasi repo dan kontrak API
  - Buat `.gitignore`, `docs/PRD.md`, spec, dan steering
  - Tulis `api/openapi.yaml` dan validasi dengan oapi-codegen (Go) dan openapi-typescript (TS)
  - Inisialisasi modul Go `kumlod` dengan `oapi-codegen` sebagai tool
  - _Requirements: semua_

- [x] 2. Backend: fondasi
  - [x] 2.1 Paket `config` (env + `.env`), `clock`, logging `slog`, CLI (`serve`, `migrate`, `user create`, `user passwd`, `version`)
    - _Requirements: 1.1, 15.6_
  - [x] 2.2 Paket `db`: buka SQLite (`modernc.org/sqlite`) dengan pragma, migrasi goose embed `00001_init.sql`
    - _Requirements: 15.1, 15.6_
  - [x] 2.3 Paket `webui`: embed `dist`, SPA fallback, cache header, pesan kalau frontend belum di-build
    - _Requirements: 13.1, 15.1_

- [x] 3. Backend: logika domain dan test
  - [x] 3.1 Ringkasan absensi dan level
    - _Requirements: 5.3, 5.4, 5.5, 5.6_
  - [x] 3.2 Ringkasan nilai, huruf, target per huruf
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6_
  - [x] 3.3 IPS, IPK, baseline, simulasi target
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x] 3.4 Generate pertemuan dari jadwal
    - _Requirements: 4.1, 4.2_
  - [x] 3.5 Jendela reminder tugas
    - _Requirements: 11.3_
  - [x] 3.6 Validasi pengaturan dan skala nilai
    - _Requirements: 12.1, 12.3, 12.4_

- [x] 4. Backend: store (SQL manual) dan test
  - [x] 4.1 Users, sessions, settings (default + VAPID)
    - _Requirements: 1.2, 1.5, 1.7, 12.1_
  - [x] 4.2 Semester dengan satu semester aktif dan cascade file
    - _Requirements: 2.1-2.6_
  - [x] 4.3 Matkul, jadwal, komponen nilai default, pertemuan, absensi
    - _Requirements: 3.1-3.6, 4.1-4.5, 5.1_
  - [x] 4.4 Tugas dengan validasi relasi dan `completed_at`
    - _Requirements: 6.1, 6.3, 6.5, 6.6_
  - [x] 4.5 Materi, file, indeks FTS5, pencarian awalan kata
    - _Requirements: 7.1, 7.5, 7.6_
  - [x] 4.6 Push subscription dan notification log
    - _Requirements: 11.1, 11.7_

- [x] 5. Backend: HTTP API
  - [x] 5.1 Middleware: recover, log, header keamanan, batas body, sesi, CSRF, error JSON
    - _Requirements: 1.6, 14.1-14.5_
  - [x] 5.2 Auth: login, rate limit, logout, me, ganti password
    - _Requirements: 1.2-1.7_
  - [x] 5.3 Handler semester, matkul, pertemuan, absensi
    - _Requirements: 2, 3, 4, 5_
  - [x] 5.4 Handler tugas, nilai, IPK
    - _Requirements: 6, 8, 9_
  - [x] 5.5 Handler materi, upload, download file
    - _Requirements: 7, 14.6_
  - [x] 5.6 Handler dashboard, pengaturan, push
    - _Requirements: 10, 11.1, 11.8, 12_
  - [x] 5.7 Test handler: auth, CSRF, validasi, upload dan header download

- [x] 6. Backend: push dan scheduler
  - [x] 6.1 Paket `push`: VAPID, kirim, hapus subscription 404/410
    - _Requirements: 11.1, 11.7_
  - [x] 6.2 Scheduler: reminder tugas, pengingat absen, ringkasan harian, idempotensi, test dengan jam palsu
    - _Requirements: 11.3, 11.4, 11.5_

- [x] 7. Frontend: fondasi
  - [x] 7.1 Scaffold Vite + React + TS, Tailwind v4, shadcn/ui, TanStack Router + Query, output build ke `internal/webui/dist`
    - _Requirements: 13.5_
  - [x] 7.2 Generate `schema.d.ts`, klien `openapi-fetch` dengan header CSRF, penanganan 401, hook query dan mutasi
    - _Requirements: 1.6, 14.1_
  - [x] 7.3 Layout responsif (navigasi bawah dan sidebar), tambah tugas cepat, banner offline, toast
    - _Requirements: 6.2, 13.2, 13.5_

- [x] 8. Frontend: halaman
  - [x] 8.1 Login dan guard sesi
    - _Requirements: 1.2, 1.3, 1.5, 1.6_
  - [x] 8.2 Hari Ini dengan absen optimistic dan tandai tugas dikumpulkan
    - _Requirements: 5.2, 10.1-10.5_
  - [x] 8.3 Semester
    - _Requirements: 2.1-2.7_
  - [x] 8.4 Matkul: daftar, form, detail dengan tab pertemuan, tugas, materi, nilai
    - _Requirements: 3, 4, 5, 8_
  - [x] 8.5 Tugas: daftar berkelompok, filter, detail dan edit
    - _Requirements: 6.1-6.5_
  - [x] 8.6 Materi: pencarian, upload, link, catatan
    - _Requirements: 7.1-7.5_
  - [x] 8.7 Nilai: IPS, IPK, simulasi target
    - _Requirements: 9.1-9.4_
  - [x] 8.8 Pengaturan: notifikasi per perangkat, reminder, absensi, skala nilai, baseline, akun, cara install
    - _Requirements: 1.7, 11.1, 11.2, 11.8, 12.1-12.5_

- [x] 9. Frontend: PWA dan offline
  - [x] 9.1 Manifest, ikon, service worker (precache, navigasi, push, klik notifikasi), prompt update
    - _Requirements: 11.6, 13.1, 13.4_
  - [x] 9.2 Persist cache ke IndexedDB, mutasi tertahan saat offline, hapus cache saat logout
    - _Requirements: 1.5, 13.2, 13.3_
  - [x] 9.3 Test Vitest untuk helper

- [x] 10. Deploy dan dokumentasi
  - [x] 10.1 `deploy/setup-vps.sh`, `kumlod.service`, Caddyfile, Litestream, backup file rclone, `kumlodctl`, contoh env
    - _Requirements: 15.2, 15.3, 15.4_
  - [x] 10.2 `scripts/build.ps1`, `scripts/deploy.ps1`, `scripts/gen.ps1`
    - _Requirements: 15.1, 15.5_
  - [x] 10.3 `README.md`, `docs/DEVELOPMENT.md`, `docs/DEPLOYMENT.md`, `docs/USER_GUIDE.md`

- [x] 11. Integrasi dan verifikasi
  - [x] 11.1 Build frontend, embed, build binary Windows dan Linux
  - [x] 11.2 Jalankan semua test Go dan frontend
  - [x] 11.3 Smoke test API end-to-end dengan server lokal (browser Edge headless: alur utama, layout HP, offline)
  - [x] 11.4 Perbarui status tasks dan dokumentasi

Belum diverifikasi di lingkungan nyata: `setup-vps.sh` dan `deploy.ps1` di VPS Ubuntu (hanya cek sintaks), binary Linux saat runtime (hanya cek format ELF statis), push notification ke push service sungguhan, install PWA dan Add to Home Screen di HP.
