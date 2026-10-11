# Product: Kumlod

Kumlod adalah web app pribadi (PWA) untuk satu mahasiswa Informatika: mengelola semester, mata kuliah, pertemuan, absensi, tugas, materi, dan nilai (IPS/IPK). Dipakai di HP Android, iPhone, dan laptop.

- PRD: #[[file:docs/PRD.md]]
- Spec aktif: `.kiro/specs/kumlod-core/` (requirements, design, tasks)

Prinsip yang harus dijaga di setiap perubahan:

1. Input harus cepat. Aksi paling sering (absen, tambah tugas, tandai dikumpulkan) maksimal 2-3 tap.
2. App yang menghampiri pengguna lewat push notification, bukan sebaliknya.
3. Konservatif soal absen: izin dan sakit dihitung tidak hadir secara default.
4. Data resmi (huruf KHS) mengalahkan hasil hitung.
5. Single-tenant dan self-hosted. Tidak ada pendaftaran publik.

Bahasa antarmuka dan pesan error API: Bahasa Indonesia. Kode, nama identifier, dan nilai enum: Bahasa Inggris.
