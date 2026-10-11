# Tech: Kumlod

## Stack

- Backend: Go (modul `kumlod`), `net/http` bawaan, SQLite via `modernc.org/sqlite` (tanpa CGO), migrasi goose (embed), SQL manual di `internal/store`.
- Kontrak API: `api/openapi.yaml` (OpenAPI 3.0.3) adalah sumber kebenaran. Go di-generate ke `internal/api/api.gen.go` (oapi-codegen, models + std-http-server). TypeScript di-generate ke `web/src/api/schema.d.ts` (openapi-typescript).
- Frontend: React + TypeScript + Vite, TanStack Router (file-based) + TanStack Query, Tailwind CSS v4, shadcn/ui, vite-plugin-pwa (`injectManifest`).
- Push: Web Push + VAPID. Deploy: satu binary + systemd + Caddy + Litestream di Ubuntu.

## Perintah

```powershell
# Generate kode dari kontrak API (Go dan TS)
./scripts/gen.ps1

# Backend
go test ./...
go vet ./...
go run ./cmd/kumlod serve

# Frontend (di folder web/)
npm run dev        # Vite dev server, proxy /api ke 127.0.0.1:8080
npm run build      # output ke ../internal/webui/dist
npm run typecheck
npm test           # vitest run

# Build binary Linux untuk VPS
./scripts/build.ps1
```

## Konvensi

- Ubah `api/openapi.yaml` dulu, lalu jalankan generator. Jangan edit `api.gen.go` atau `schema.d.ts` manual.
- JSON snake_case. Update memakai PUT objek lengkap. Request POST/PUT/DELETE wajib header `X-Requested-With: kumlod`.
- ID UUIDv7 string. Timestamp di DB: TEXT UTC `2006-01-02T15:04:05.000Z`. Tanggal lokal `YYYY-MM-DD`, jam lokal `HH:MM`.
- Hanya `internal/store` yang menulis SQL. Logika hitung (absensi, nilai, IPK, reminder) ada di `internal/domain` sebagai fungsi murni dengan table-driven test.
- Dependensi dipin versi persis: `go.sum` untuk Go, `save-exact=true` di `web/.npmrc` untuk npm.
- Build Linux: `GOOS=linux GOARCH=amd64 CGO_ENABLED=0`.
- Frontend tanpa script inline (CSP `script-src 'self'`).
