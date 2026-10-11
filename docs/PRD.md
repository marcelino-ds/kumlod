# PRD: Kumlod

Versi 0.1, Oktober 2026. Pengguna: satu orang (pemilik), mahasiswa Informatika semester 3.

## 1. Ringkasan

Kumlod adalah web app pribadi (PWA) buat ngatur perkuliahan per semester: jadwal, absensi, tugas, materi, dan nilai per mata kuliah. Tujuannya bikin follow-up kuliah jalan otomatis, supaya ga ada lagi tugas kelewat, jatah bolos kebablasan, atau materi yang hilang pas mau ujian.

## 2. Masalah

| Masalah | Dampak |
|---|---|
| Tugas ga ke-follow up | Telat atau lupa ngumpulin, nilai komponen tugas hilang |
| Materi kesebar di WA, Moodle, dan Drive | Susah belajar pas UTS/UAS |
| Absensi ga ke-track | Ga tau sisa jatah bolos, berisiko ga boleh ikut UAS |
| Nilai ga kepantau | Ga tau butuh nilai berapa di UAS dan dampaknya ke IPK |

## 3. Tujuan dan metrik

| Tujuan | Metrik |
|---|---|
| Ga ada tugas yang kelewat tanpa sadar | 0 tugas lewat deadline tanpa reminder |
| Absensi selalu tercatat | 100% pertemuan tercatat maksimal 24 jam setelah kuliah |
| Input secepat mungkin | Tambah tugas atau isi absen di bawah 10 detik |
| App beneran kepake | Dibuka minimal 5 hari per minggu |
| Dampak ke nilai | IPS semester 3 lebih tinggi dari IPK sebelumnya |

## 4. Pengguna dan perangkat

- Satu pengguna. Ga ada pendaftaran publik.
- Perangkat: HP Android, iPhone, dan laptop. Data harus sinkron di semua perangkat.
- Bahasa antarmuka: Indonesia.

## 5. Prinsip produk

1. Input harus cepet. Aksi paling sering (absen, tambah tugas, tandai dikumpulkan) maksimal 2-3 tap.
2. App yang nyamperin. Reminder deadline, pengingat absen, dan ringkasan pagi dikirim lewat push notification.
3. Konservatif soal absen. Secara default izin dan sakit dihitung tidak hadir, jadi jatah bolos ga pernah kelihatan lebih longgar dari kenyataan.
4. Data resmi menang. Huruf dari KHS mengalahkan hasil hitung Kumlod.
5. Data milik sendiri. Self-host di VPS pribadi, ga ada pihak ketiga yang menyimpan data kuliah.

## 6. Cakupan Fase 1 (core)

| Modul | Kemampuan utama |
|---|---|
| Semester | Buat, ubah, hapus, aktifkan. Satu semester aktif, sisanya arsip yang tetap dihitung ke IPK |
| Mata kuliah | Kode, SKS, dosen, warna, beberapa slot jadwal mingguan, batas minimal hadir |
| Pertemuan | Dibuat otomatis dari jadwal (default 16, UTS di tengah, UAS di akhir), bisa diedit, dibatalkan, ditambah |
| Absensi | Hadir/izin/sakit/alpa per pertemuan, persentase, sisa jatah bolos, level peringatan |
| Tugas | Deadline, status, prioritas, link pengumpulan, nilai, terhubung ke matkul, pertemuan, dan komponen nilai |
| Materi | Link, catatan, atau upload file per matkul dan pertemuan, plus pencarian teks penuh |
| Nilai | Komponen berbobot, nilai sementara dan akhir, huruf mutu, target "butuh berapa buat dapet A", huruf resmi KHS |
| IPS/IPK | IPS per semester, IPK kumulatif dengan baseline opsional, simulasi target IPK |
| Hari Ini | Kuliah hari ini dengan tombol absen, deadline terdekat, peringatan absen |
| Notifikasi | Push ke Android, iPhone, dan laptop: reminder tugas H-3/H-1/3 jam, pengingat absen, ringkasan pagi |
| Pengaturan | Zona waktu, skala nilai (preset dan custom), aturan absen, reminder, baseline IPK, ganti password |
| PWA | Bisa di-install, buka data terakhir saat offline, absen dan status tugas tetap tersimpan saat sinyal hilang |

## 7. Di luar cakupan Fase 1

| Fitur | Rencana |
|---|---|
| Sinkronisasi Moodle (iCal, lalu web service) | Fase 2 |
| Share file dan teks dari WhatsApp (Android) | Fase 2 |
| Login passkey (Face ID, sidik jari) | Fase 2 |
| Antrian perubahan offline yang bertahan setelah app ditutup | Fase 2 |
| Penanganan matkul ngulang dan semester pendek untuk perbaikan nilai | Fase 2 |
| Tampilan kalender bulanan, import KRS | Fase 2 |
| App native lewat Capacitor | Fase 3 |
| Multi-user | Belum direncanakan |

## 8. Alur utama

1. Awal semester: buat semester, tambah matkul beserta jadwal, pertemuan terbentuk otomatis, cek komponen nilai tiap matkul.
2. Harian: buka notifikasi ringkasan pagi, datang kuliah, tap Hadir di halaman Hari Ini atau dari pengingat absen.
3. Ada tugas baru di grup WA: tombol tambah cepat, isi judul, pilih matkul, deadline (default 23:59), simpan.
4. Ngumpulin tugas: centang dari Hari Ini atau daftar tugas. Reminder berikutnya otomatis berhenti.
5. Menjelang UTS/UAS: buka materi per pertemuan atau cari lewat pencarian, cek target nilai di tab Nilai.
6. Akhir semester: isi huruf resmi dari KHS, cek IPS dan IPK.
7. Naik semester: buat semester baru dan aktifkan. Semester lama jadi arsip.

## 9. Kebutuhan non-fungsional

| Aspek | Target |
|---|---|
| Performa | Setelah kunjungan pertama, app terbuka di bawah 1 detik dari cache PWA. Respons API di bawah 200 ms di VPS |
| Keamanan | Login wajib, tanpa pendaftaran publik, password argon2id, cookie HttpOnly, proteksi CSRF, header keamanan, file hanya lewat sesi |
| Keandalan | Database direplikasi terus-menerus ke object storage, file materi di-backup harian |
| Sumber daya | Total RAM di bawah 100 MB di VPS 2 vCPU / 2 GB |
| Aksesibilitas | Label di semua input, fokus terlihat, status tidak hanya lewat warna, target sentuh minimal 44 px |
| Platform | Chrome Android, Safari iOS 16.4+ (push wajib lewat Home Screen), Chrome/Edge desktop |

## 10. Roadmap

| Fase | Isi |
|---|---|
| 1. Core | Semua yang ada di bagian 6, deploy ke VPS |
| 2. Integrasi | Moodle, share dari WA, passkey, offline queue persisten, matkul ngulang, kalender |
| 3. App | Bungkus jadi app Android/iOS lewat Capacitor kalau PWA ga cukup |

## 11. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| App ditinggal setelah beberapa minggu | Ringkasan pagi dan reminder tetap jalan walau app ga dibuka |
| Skala nilai kampus beda dari default | Dua preset, bisa diedit, saran cocokkan dengan KHS sampai skala disimpan |
| Push di iPhone ga jalan | Instruksi Add to Home Screen di halaman pengaturan |
| VPS rusak atau data hilang | Litestream ke object storage, backup file harian, script setup yang bisa diulang |
| Aturan absen kampus beda | Batas minimal per matkul, aturan izin/sakit bisa diubah |

## 12. Asumsi dan keputusan

- Zona waktu default Asia/Jakarta.
- Default 16 pertemuan per matkul: pertemuan 8 UTS, pertemuan 16 UAS. Absensi dihitung dari pertemuan kuliah yang tidak dibatalkan.
- Batas minimal hadir default 75%.
- Data mulai dari semester 3. Semester sebelumnya cukup diwakili baseline IPK dan total SKS (opsional).
- Stack: React + Vite (PWA), Go, SQLite, deploy satu binary di VPS Ubuntu dengan Caddy. Detail ada di `.kiro/specs/kumlod-core/design.md`.
