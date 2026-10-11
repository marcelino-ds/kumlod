# Requirements: Kumlod Core

## Pendahuluan

Dokumen ini mendefinisikan kebutuhan Fase 1 (core) Kumlod, web app pribadi berbasis PWA untuk satu mahasiswa yang mengelola semester, mata kuliah, pertemuan, absensi, tugas, materi, dan nilai. Integrasi Moodle, share dari WhatsApp, dan app native ada di luar cakupan dokumen ini (lihat `docs/PRD.md`).

## Glosarium

- Semester: periode akademik (ganjil, genap, atau pendek). Paling banyak satu semester aktif.
- Matkul: mata kuliah dalam satu semester, punya SKS dan satu atau lebih slot jadwal mingguan.
- Pertemuan: satu sesi kuliah. Jenisnya kuliah, UTS, atau UAS. Statusnya terjadwal atau batal.
- Pertemuan terhitung: pertemuan berjenis kuliah yang tidak dibatalkan. Hanya ini yang dipakai untuk menghitung absensi.
- Jatah bolos: jumlah maksimal ketidakhadiran supaya persentase hadir tetap memenuhi batas minimal.
- Komponen nilai: bagian penilaian matkul (misalnya Tugas, UTS, UAS) dengan bobot persen.
- Huruf resmi: huruf mutu dari KHS. Mengalahkan huruf hasil hitung.
- Zona waktu aplikasi: default Asia/Jakarta. Dipakai untuk menentukan "hari ini" dan jadwal reminder.

## Kebutuhan

### Kebutuhan 1: Autentikasi pengguna tunggal

**User story:** Sebagai pemilik Kumlod, gua mau cuma gua yang bisa akses data, supaya nilai dan catatan kuliah gua ga kebuka publik.

#### Kriteria penerimaan

1. Sistem HARUS menyediakan perintah CLI untuk membuat akun dan mengganti password, dan sistem TIDAK BOLEH punya endpoint pendaftaran.
2. KETIKA username dan password yang benar dikirim, sistem HARUS membuat sesi dan menyetel cookie `kumlod_session` yang berlaku 30 hari.
3. JIKA kredensial salah, MAKA sistem HARUS menolak dengan pesan yang sama untuk username salah maupun password salah.
4. JIKA ada lebih dari 5 percobaan login gagal dari satu IP dalam 15 menit, MAKA sistem HARUS membalas 429 untuk percobaan berikutnya sampai jendela waktu itu lewat.
5. KETIKA pengguna logout, sistem HARUS menghapus sesi di server dan cookie di browser, dan frontend HARUS menghapus cache data lokal.
6. KETIKA request API datang tanpa sesi valid (kecuali login dan health), sistem HARUS membalas 401 dan frontend HARUS mengarahkan ke halaman login.
7. KETIKA pengguna mengganti password, sistem HARUS memverifikasi password lama dan mencabut semua sesi lain.

### Kebutuhan 2: Manajemen semester

**User story:** Sebagai mahasiswa, gua mau data kuliah dikelompokkan per semester, supaya pas naik semester gua tinggal bikin semester baru tanpa kehilangan data lama.

#### Kriteria penerimaan

1. Sistem HARUS bisa membuat semester dengan nama, tahun ajaran, jenis (ganjil, genap, pendek), tanggal mulai, dan tanggal selesai.
2. JIKA tanggal selesai lebih awal dari tanggal mulai, MAKA sistem HARUS menolak dengan pesan validasi.
3. Sistem HARUS memastikan paling banyak satu semester aktif. KETIKA sebuah semester diaktifkan, semester aktif sebelumnya HARUS otomatis jadi tidak aktif.
4. KETIKA semester pertama dibuat, sistem HARUS langsung menjadikannya aktif.
5. Semester tidak aktif HARUS tetap bisa dibuka dan tetap dihitung dalam IPK.
6. KETIKA semester dihapus, frontend HARUS meminta konfirmasi, lalu sistem HARUS menghapus semua matkul, pertemuan, tugas, materi, dan file di dalamnya.
7. Halaman Hari Ini, Tugas, Matkul, dan Materi HARUS memakai semester aktif secara default.

### Kebutuhan 3: Mata kuliah dan jadwal

**User story:** Sebagai mahasiswa, gua mau nyimpen semua matkul beserta jadwalnya, supaya gua tau kuliah apa aja tiap hari.

#### Kriteria penerimaan

1. Sistem HARUS bisa membuat matkul dengan nama, kode, SKS (0-24), dosen, warna, catatan, dan nol atau lebih slot jadwal mingguan (hari, jam mulai, jam selesai, ruang).
2. KETIKA jumlah pertemuan atau batas minimal hadir tidak diisi, sistem HARUS memakai default dari pengaturan.
3. JIKA jam selesai sebuah slot tidak lebih besar dari jam mulainya, MAKA sistem HARUS menolak.
4. KETIKA matkul dibuat tanpa komponen nilai, sistem HARUS memasang template default: Tugas 30% (sumber tugas), UTS 30%, UAS 40%.
5. Daftar matkul HARUS menampilkan SKS, jadwal, ringkasan absen, nilai sementara, dan jumlah tugas yang belum dikumpulkan.
6. KETIKA matkul dihapus, sistem HARUS menghapus pertemuan, tugas, materi, dan file milik matkul itu.

### Kebutuhan 4: Pertemuan

**User story:** Sebagai mahasiswa, gua mau pertemuan kuliah kebentuk otomatis dari jadwal, supaya gua ga perlu input 16 pertemuan satu-satu.

#### Kriteria penerimaan

1. KETIKA matkul dibuat dengan opsi generate aktif dan punya minimal satu slot jadwal, sistem HARUS membuat pertemuan sebanyak jumlah pertemuan matkul itu, mulai dari tanggal mulai semester, mengikuti urutan kronologis semua slot.
2. KETIKA jumlah pertemuan N minimal 4, sistem HARUS menandai pertemuan ke-floor(N/2) sebagai UTS dan pertemuan ke-N sebagai UAS.
3. JIKA matkul sudah punya pertemuan, MAKA permintaan generate HARUS ditolak dengan status 409.
4. Pengguna HARUS bisa menambah pertemuan, mengubah tanggal, jam, ruang, jenis, status, topik, dan catatan, serta menghapus pertemuan.
5. Pertemuan berstatus batal TIDAK BOLEH dihitung dalam absensi.

### Kebutuhan 5: Absensi

**User story:** Sebagai mahasiswa, gua mau tau persis sisa jatah bolos tiap matkul, supaya gua ga sampai dilarang ikut UAS.

#### Kriteria penerimaan

1. Pengguna HARUS bisa mencatat kehadiran per pertemuan (hadir, izin, sakit, alpa) dan menghapus catatannya.
2. Halaman Hari Ini HARUS menampilkan tombol absen untuk tiap pertemuan hari ini, dan perubahan HARUS langsung terlihat sebelum respons server datang.
3. Sistem HARUS menghitung per matkul: total pertemuan terhitung, yang sudah lewat, yang sudah dicatat, hadir, tidak hadir, belum dicatat, minimal hadir = ceil(batas% x total terhitung), jatah bolos = total terhitung - minimal hadir, sisa jatah = jatah bolos - tidak hadir, dan persentase hadir dari pertemuan yang sudah dicatat.
4. KETIKA pengaturan "izin dan sakit dihitung tidak hadir" aktif (default), sistem HARUS menghitung izin dan sakit sebagai tidak hadir.
5. Sistem HARUS memberi level: aman (sisa > 1), waspada (sisa = 1), kritis (sisa = 0), lewat batas (sisa < 0), dan level HARUS ditampilkan dengan teks, bukan hanya warna.
6. KETIKA ada pertemuan terhitung yang tanggalnya sudah lewat tapi belum dicatat, sistem HARUS menampilkannya sebagai peringatan.

### Kebutuhan 6: Tugas

**User story:** Sebagai mahasiswa, gua mau nyatet tugas secepat mungkin dan diingetin sebelum deadline, supaya ga ada tugas yang kelewat.

#### Kriteria penerimaan

1. Pengguna HARUS bisa membuat tugas dengan judul dan deadline. Matkul, deskripsi, prioritas, link pengumpulan, pertemuan, dan komponen nilai bersifat opsional.
2. Form tambah cepat HARUS bisa dibuka dari semua halaman utama dan mengisi deadline default hari ini jam 23:59.
3. Status tugas HARUS salah satu dari: belum, dikerjakan, dikumpulkan, dinilai. KETIKA status berubah jadi dikumpulkan atau dinilai, sistem HARUS mencatat waktu selesai. KETIKA status kembali ke belum atau dikerjakan, waktu selesai HARUS dikosongkan.
4. Daftar tugas HARUS bisa difilter berdasarkan status dan matkul, dan dikelompokkan jadi: terlambat, hari ini, besok, 7 hari ke depan, dan nanti.
5. Pengguna HARUS bisa mengisi nilai tugas 0-100, dan tugas bernilai yang terhubung ke komponen bersumber tugas HARUS dipakai untuk menghitung nilai komponen itu.
6. KETIKA tugas dibuat tanpa semester, sistem HARUS memakai semester dari matkulnya, atau semester aktif kalau tugas tanpa matkul. JIKA tidak ada keduanya, MAKA sistem HARUS menolak dengan pesan validasi.

### Kebutuhan 7: Materi

**User story:** Sebagai mahasiswa, gua mau semua materi kumpul per matkul dan pertemuan, supaya gampang dicari pas mau ujian.

#### Kriteria penerimaan

1. Pengguna HARUS bisa menambahkan materi ke matkul (dan opsional ke pertemuan) dalam bentuk link, catatan, atau upload file.
2. JIKA ukuran file melebihi batas (default 50 MB), MAKA sistem HARUS menolak dengan status 413.
3. File HARUS disimpan di disk server dan hanya bisa diunduh dengan sesi yang valid.
4. File PDF, PNG, JPEG, GIF, dan WebP HARUS bisa dibuka langsung di browser. Jenis lain HARUS dikirim sebagai attachment.
5. Sistem HARUS menyediakan pencarian teks penuh berdasarkan judul, deskripsi, dan nama file, dengan pencocokan awalan kata.
6. KETIKA materi bertipe file dihapus, sistem HARUS ikut menghapus file fisiknya.

### Kebutuhan 8: Nilai mata kuliah

**User story:** Sebagai mahasiswa, gua mau tau nilai sementara dan butuh nilai berapa di komponen sisa, supaya gua bisa ngatur usaha belajar.

#### Kriteria penerimaan

1. Pengguna HARUS bisa mengatur komponen nilai per matkul: nama, bobot, sumber (manual atau tugas), dan nilai manual.
2. Untuk komponen bersumber tugas, nilai efektif HARUS berupa rata-rata nilai tugas terhubung yang sudah punya nilai.
3. Sistem HARUS menghitung nilai sementara (rata-rata berbobot dari komponen yang sudah punya nilai), nilai akhir (ketika semua komponen punya nilai), dan huruf mutu menurut skala nilai.
4. JIKA total bobot bukan 100, MAKA sistem HARUS tetap menghitung secara proporsional dan frontend HARUS menampilkan peringatan.
5. Untuk setiap huruf di skala nilai, sistem HARUS menghitung rata-rata minimal yang dibutuhkan di komponen yang belum punya nilai, dengan status: sudah aman, mungkin, atau tidak mungkin.
6. Pengguna HARUS bisa mengisi huruf resmi dari KHS, dan huruf resmi HARUS mengalahkan hasil hitung untuk IPS dan IPK.

### Kebutuhan 9: IPS, IPK, dan simulasi target

**User story:** Sebagai mahasiswa dengan IPK yang mau dinaikin, gua mau tau IPS minimal yang harus gua kejar semester ini.

#### Kriteria penerimaan

1. Sistem HARUS menghitung IPS per semester = jumlah(bobot huruf x SKS) / jumlah SKS untuk matkul yang punya huruf (resmi atau sementara), dan menandai IPS sebagai proyeksi kalau ada huruf sementara.
2. Sistem HARUS menghitung IPK dari semua semester di Kumlod ditambah baseline opsional (IPK dan total SKS sebelum memakai Kumlod).
3. KETIKA target IPK dikirim, sistem HARUS menghitung IPS minimal di semester aktif, dengan status: sudah aman, mungkin, atau tidak mungkin.
4. JIKA semester aktif belum punya SKS, MAKA simulasi HARUS mengembalikan status tanpa SKS.

### Kebutuhan 10: Dashboard Hari Ini

**User story:** Sebagai mahasiswa, gua mau satu halaman yang langsung nunjukin apa yang harus gua lakuin hari ini.

#### Kriteria penerimaan

1. Dashboard HARUS menampilkan tanggal hari ini menurut zona waktu aplikasi dan nama semester aktif.
2. Dashboard HARUS menampilkan pertemuan hari ini di semester aktif, urut jam mulai, lengkap dengan matkul, ruang, jenis, dan tombol absen.
3. Dashboard HARUS menampilkan tugas terlambat dan tugas dengan deadline 7 hari ke depan yang belum dikumpulkan, dengan aksi cepat tandai dikumpulkan.
4. Dashboard HARUS menampilkan matkul dengan level absen waspada, kritis, atau lewat batas, serta matkul yang punya pertemuan belum dicatat.
5. JIKA belum ada semester aktif, MAKA dashboard HARUS menampilkan ajakan membuat semester.

### Kebutuhan 11: Notifikasi dan reminder

**User story:** Sebagai mahasiswa yang gampang lupa, gua mau diingetin lewat notifikasi HP dan laptop tanpa harus buka app.

#### Kriteria penerimaan

1. Pengguna HARUS bisa mengaktifkan push notification per perangkat, dan sistem HARUS menyimpan subscription tiap perangkat.
2. JIKA perangkat iOS belum menjalankan Kumlod dari Home Screen, MAKA frontend HARUS menampilkan instruksi Add to Home Screen sebagai ganti tombol aktifkan.
3. Sistem HARUS mengirim reminder untuk tugas berstatus belum atau dikerjakan pada 72 jam, 24 jam, dan 3 jam sebelum deadline. Tiap jendela maksimal sekali per tugas per nilai deadline, dan kalau beberapa jendela terlewat bersamaan, hanya jendela terdekat yang dikirim.
4. Sistem HARUS mengirim pengingat absen 15 menit setelah jam mulai pertemuan hari ini yang belum dicatat, maksimal sekali per pertemuan, dan tidak lagi setelah 2 jam lewat dari jam selesai.
5. Sistem HARUS mengirim ringkasan harian pada jam yang diatur (default 06:00) kalau hari itu ada kuliah atau ada tugas dengan deadline 48 jam ke depan, maksimal sekali per hari, dan tidak dikirim kalau sudah terlambat lebih dari 2 jam.
6. KETIKA notifikasi diklik, perangkat HARUS membuka Kumlod di halaman yang relevan.
7. KETIKA push service membalas 404 atau 410, sistem HARUS menghapus subscription itu.
8. Pengguna HARUS bisa mematikan tiap jenis reminder dan mengirim notifikasi uji ke semua perangkat.

### Kebutuhan 12: Pengaturan

**User story:** Sebagai mahasiswa, gua mau aturan nilai dan absen bisa disesuaikan sama kampus gua.

#### Kriteria penerimaan

1. Sistem HARUS menyimpan pengaturan: zona waktu, skala nilai, batas minimal hadir default, jumlah pertemuan default, aturan izin dan sakit, reminder, dan baseline IPK.
2. Frontend HARUS menyediakan dua preset skala nilai (plus-minus dan huruf ganda) dan memungkinkan edit manual.
3. JIKA skala nilai tidak valid (huruf duplikat, nilai minimal duplikat, bobot di luar 0-4, nilai minimal di luar 0-100, atau tidak ada entri dengan nilai minimal 0), MAKA sistem HARUS menolak.
4. JIKA zona waktu bukan nama zona IANA yang valid, MAKA sistem HARUS menolak.
5. Selama skala nilai belum pernah disimpan, frontend HARUS menampilkan saran untuk mencocokkannya dengan KHS.

### Kebutuhan 13: PWA dan offline

**User story:** Sebagai mahasiswa yang sering dapet sinyal jelek di kampus, gua mau Kumlod tetap bisa dibuka dan dipakai absen walau koneksi putus.

#### Kriteria penerimaan

1. Kumlod HARUS bisa di-install sebagai PWA di Android, iPhone, dan desktop.
2. KETIKA offline, frontend HARUS menampilkan data terakhir yang tersimpan beserta banner offline.
3. KETIKA absen atau status tugas diubah saat offline, frontend HARUS menahan perubahan itu dan mengirimkannya otomatis saat koneksi kembali, selama app masih terbuka.
4. KETIKA versi baru tersedia, frontend HARUS menawarkan reload.
5. Tampilan HARUS mobile-first dengan navigasi bawah di HP dan sidebar di layar lebar.

### Kebutuhan 14: Keamanan

**User story:** Sebagai pemilik data, gua mau Kumlod aman walaupun bisa diakses dari internet.

#### Kriteria penerimaan

1. Semua request POST, PUT, dan DELETE ke API HARUS membawa header `X-Requested-With: kumlod`. JIKA tidak, MAKA sistem HARUS membalas 403.
2. Cookie sesi HARUS HttpOnly, SameSite=Lax, dan Secure di produksi. Token sesi HARUS disimpan di database dalam bentuk hash SHA-256.
3. Password HARUS di-hash dengan argon2id.
4. Sistem HARUS memvalidasi semua input dan membatasi body JSON maksimal 1 MB.
5. Sistem HARUS mengirim header keamanan: Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, dan Referrer-Policy.
6. Respons file HARUS memakai `X-Content-Type-Options: nosniff`, dan file yang tidak dibuka inline HARUS dikirim sebagai attachment dengan CSP sandbox.

### Kebutuhan 15: Deploy, backup, dan operasional

**User story:** Sebagai pemilik VPS, gua mau deploy dan backup Kumlod gampang dan bisa diulang.

#### Kriteria penerimaan

1. Backend dan frontend HARUS bisa di-build jadi satu binary Linux amd64 tanpa CGO.
2. Repo HARUS menyediakan script setup untuk Ubuntu fresh: user sistem, firewall, update keamanan otomatis, Caddy dengan HTTPS otomatis, service systemd, dan Litestream.
3. Script setup TIDAK BOLEH mematikan login SSH dengan password kalau belum ada SSH key terpasang.
4. KETIKA kredensial object storage diisi, database HARUS direplikasi terus-menerus lewat Litestream, dan file materi HARUS bisa di-backup harian.
5. Repo HARUS menyediakan script build dan deploy dari Windows (PowerShell).
6. Sistem HARUS menjalankan migrasi database otomatis saat start dan menyediakan endpoint health tanpa login.
