# Development

## Kebutuhan

- Go 1.27 atau lebih baru (`go version`)
- Node.js 24 dan npm 11
- Windows PowerShell 5.1 atau PowerShell 7 untuk script di `scripts/`

Tidak perlu CGO, compiler C, atau Docker. SQLite sudah termasuk lewat `modernc.org/sqlite`.

## Menjalankan lokal

```powershell
Copy-Item .env.example .env            # KUMLOD_DEV=true: log teks, cookie tanpa Secure
go run ./cmd/kumlod user create gua    # atau: "rahasia-banget" | go run ./cmd/kumlod user create gua --password-stdin
go run ./cmd/kumlod serve
```

Frontend dengan hot reload (proxy `/api` ke `127.0.0.1:8080`):

```powershell
cd web
npm ci
npm run dev                            # http://localhost:5173
```

Service worker sengaja tidak aktif di dev server. Untuk mencoba PWA, push, dan offline, build frontend lalu buka binary langsung di `http://127.0.0.1:8080`:

```powershell
cd web; npm run build; cd ..
go run ./cmd/kumlod serve
```

Push notification di browser butuh HTTPS atau `localhost`/`127.0.0.1`.

## Kontrak API dan generator

`api/openapi.yaml` adalah sumber kebenaran. Setelah mengubahnya:

```powershell
./scripts/gen.ps1
```

Script ini menulis ulang `internal/api/api.gen.go` (oapi-codegen) dan `web/src/api/schema.d.ts` (openapi-typescript). Jangan edit kedua file itu manual. Handler di `internal/httpapi` mengimplementasikan `api.ServerInterface`, jadi endpoint baru langsung jadi error compile sampai handler-nya ditulis.

`web/src/routeTree.gen.ts` dibuat plugin TanStack Router saat `npm run dev` atau `npm run build` dan ikut di-commit.

## Test dan pengecekan

```powershell
go test ./...
go vet ./...
cd web
npm run typecheck
npm test                               # vitest run
npm run build
```

Cakupan test:

| Lapisan | Isi |
|---|---|
| `internal/domain` | Table-driven: absensi dan level, nilai dan target per huruf, IPS/IPK dan simulasi, generate pertemuan, jendela reminder, validasi pengaturan |
| `internal/store` | SQLite sementara + migrasi: satu semester aktif, cascade dan file ikut terhapus, FTS, relasi tugas, `completed_at` |
| `internal/httpapi` | `httptest`: login, rate limit, sesi, CSRF, validasi, alur matkul sampai IPK, upload dan header download |
| `internal/scheduler` | Jam palsu: tiap jendela reminder terkirim sekali, ringkasan sekali per hari, retry saat jaringan gagal |
| `web/src/lib` | Vitest: pengelompokan tugas, tanggal dan zona waktu, label, UUIDv7 |

## Konfigurasi

Dibaca dari environment. File `.env` di working directory dibaca saat start tanpa menimpa variabel yang sudah ada.

| Variabel | Default | Keterangan |
|---|---|---|
| `KUMLOD_ADDR` | `127.0.0.1:8080` | Alamat listen |
| `KUMLOD_DATA_DIR` | `./data` | Berisi `kumlod.db` dan folder `files/` |
| `KUMLOD_DEV` | `false` | Log teks level debug, cookie tanpa Secure |
| `KUMLOD_COOKIE_SECURE` | `true` (`false` kalau dev) | Atribut Secure cookie sesi |
| `KUMLOD_TRUST_PROXY` | `false` | Pakai `X-Forwarded-For` (entri terakhir) sebagai IP klien |
| `KUMLOD_VAPID_SUBJECT` | `mailto:admin@localhost` | Wajib `mailto:` atau `https:` |
| `KUMLOD_MAX_UPLOAD_MB` | `50` | Batas ukuran file upload |
| `KUMLOD_LOG_FORMAT` | `json` (`text` kalau dev) | Format log |

CLI:

```
kumlod serve                               # default
kumlod migrate
kumlod user create <username> [--password-stdin]
kumlod user passwd <username> [--password-stdin]   # juga mencabut semua sesi
kumlod version
```

Kumlod untuk satu pengguna: `user create` menolak kalau sudah ada akun.

## Konvensi

- JSON snake_case. Update memakai PUT objek lengkap; field nullable dikirim `null` untuk mengosongkan.
- POST, PUT, DELETE wajib header `X-Requested-With: kumlod` (klien frontend menambahkannya otomatis).
- ID UUIDv7. Frontend membuat ID sendiri untuk data baru supaya retry saat sinyal jelek tidak membuat duplikat.
- Timestamp di database TEXT UTC `2006-01-02T15:04:05.000Z`, tanggal lokal `YYYY-MM-DD`, jam lokal `HH:MM` dalam zona waktu aplikasi.
- Hanya `internal/store` yang berisi SQL. Logika hitung ada di `internal/domain` sebagai fungsi murni.
- Pesan error API dan teks UI berbahasa Indonesia; kode, identifier, dan nilai enum berbahasa Inggris.
- Dependensi dipin versi persis (`go.sum`, `save-exact=true` di `web/.npmrc`).
- Frontend tanpa script inline (CSP `script-src 'self'`).

## Struktur backend

```
cmd/kumlod        CLI dan entrypoint
internal/app      Wiring: database, file, push, HTTP server, scheduler, shutdown
internal/config   Env dan .env
internal/clock    Abstraksi waktu (jam palsu untuk test)
internal/db       Buka SQLite (WAL, foreign keys, busy_timeout) dan migrasi goose embed
internal/domain   Logika murni dan error bertipe
internal/store    SQL manual
internal/auth     argon2id, token sesi, rate limiter login
internal/files    Penyimpanan file materi di disk
internal/push     VAPID dan Web Push
internal/scheduler Reminder tugas, pengingat absen, ringkasan harian
internal/httpapi  Handler, middleware, pemetaan error
internal/webui    Embed build frontend dan SPA fallback
```

## Masalah umum

- Halaman "Frontend Kumlod belum di-build": jalankan `npm run build` di `web/`, lalu build ulang binary (frontend di-embed saat compile).
- Login selalu gagal di HTTP biasa (bukan localhost): set `KUMLOD_DEV=true` atau `KUMLOD_COOKIE_SECURE=false`, karena cookie Secure hanya dikirim lewat HTTPS.
- 429 saat login: tunggu 15 menit atau restart server (rate limit disimpan di memori).
