# Structure: Kumlod

```
api/                 Kontrak OpenAPI dan config oapi-codegen
cmd/kumlod/          Entrypoint dan CLI
internal/api/        Kode hasil generate (jangan diedit manual)
internal/app/        Wiring dependensi dan lifecycle server
internal/auth/       argon2id, token sesi, rate limiter
internal/clock/      Abstraksi waktu
internal/config/     Konfigurasi dari env dan .env
internal/db/         Koneksi SQLite dan migrasi (migrations/*.sql)
internal/domain/     Logika murni: absensi, nilai, IPK, pertemuan, reminder, validasi pengaturan
internal/files/      Penyimpanan file materi di disk
internal/httpapi/    Handler API, middleware, pemetaan error
internal/push/       VAPID dan pengiriman Web Push
internal/scheduler/  Loop reminder
internal/store/      Akses database (satu-satunya yang berisi SQL)
internal/webui/      Embed build frontend dan SPA fallback
web/                 Frontend React + Vite (src/routes, src/components, src/api, src/lib, src/sw.ts)
deploy/              Setup VPS, unit systemd, Caddyfile, Litestream, backup
scripts/             Script PowerShell: gen, build, deploy
docs/                PRD, development, deployment, panduan pemakaian
.kiro/specs/         Spec fitur (requirements, design, tasks)
```

Aturan dependensi backend: `httpapi` -> `store`, `domain`, `files`, `push`, `auth`. `domain` tidak bergantung pada paket internal lain. `scheduler` -> `store`, `domain`, `push`.
