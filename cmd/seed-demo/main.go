// Command seed-demo fills an empty Kumlod instance with realistic dummy data
// (a semester 3 Informatika student) through the HTTP API, so every screen has
// something to show. Dates are relative to today.
//
//	go run ./cmd/seed-demo -user demo -password demo12345
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"os"
	"strings"
	"time"
	_ "time/tzdata"

	"kumlod/internal/api"
)

func main() {
	base := flag.String("url", "http://127.0.0.1:8080", "alamat server Kumlod")
	user := flag.String("user", "", "username")
	pass := flag.String("password", os.Getenv("KUMLOD_SEED_PASSWORD"), "password (atau env KUMLOD_SEED_PASSWORD)")
	flag.Parse()
	if *user == "" || *pass == "" {
		fmt.Fprintln(os.Stderr, "pemakaian: seed-demo -user <username> -password <password>")
		os.Exit(2)
	}
	if err := run(*base, *user, *pass); err != nil {
		fmt.Fprintln(os.Stderr, "seed gagal:", err)
		os.Exit(1)
	}
}

// ---------------------------------------------------------------- HTTP client

type client struct {
	base string
	http *http.Client
}

func (c *client) do(method, path string, in, out any) error {
	var body io.Reader
	if in != nil {
		b, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, c.base+path, body)
	if err != nil {
		return err
	}
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("X-Requested-With", "kumlod")
	return c.send(req, out)
}

func (c *client) send(req *http.Request, out any) error {
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("%s %s: %d %s", req.Method, req.URL.Path, resp.StatusCode, strings.TrimSpace(string(data)))
	}
	if out != nil && len(data) > 0 {
		return json.Unmarshal(data, out)
	}
	return nil
}

func (c *client) upload(courseID, meetingID, title, desc, fileName string, content []byte) error {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fields := map[string]string{"course_id": courseID, "meeting_id": meetingID, "title": title, "description": desc}
	for k, v := range fields {
		if v != "" {
			if err := mw.WriteField(k, v); err != nil {
				return err
			}
		}
	}
	fw, err := mw.CreateFormFile("file", fileName)
	if err != nil {
		return err
	}
	if _, err := fw.Write(content); err != nil {
		return err
	}
	if err := mw.Close(); err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, c.base+"/api/materials/upload", &buf)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("X-Requested-With", "kumlod")
	return c.send(req, nil)
}

// -------------------------------------------------------------------- helpers

func ptr[T any](v T) *T { return &v }

var loc = mustLoc("Asia/Jakarta")

func mustLoc(name string) *time.Location {
	l, err := time.LoadLocation(name)
	if err != nil {
		panic(err)
	}
	return l
}

// clock holds "today" so every date in the dataset is relative to it.
type clock struct{ today time.Time }

func (k clock) date(days int) string { return k.today.AddDate(0, 0, days).Format("2006-01-02") }

// at returns today+days at HH:MM local time.
func (k clock) at(days int, hhmm string) time.Time {
	t, err := time.ParseInLocation("15:04", hhmm, loc)
	if err != nil {
		panic(err)
	}
	d := k.today.AddDate(0, 0, days)
	return time.Date(d.Year(), d.Month(), d.Day(), t.Hour(), t.Minute(), 0, 0, loc)
}

func academicYear(start time.Time) (string, api.SemesterTerm) {
	y := start.Year()
	if start.Month() >= time.August {
		return fmt.Sprintf("%d/%d", y, y+1), api.Odd
	}
	return fmt.Sprintf("%d/%d", y-1, y), api.Even
}

// ----------------------------------------------------------------------- data

type comp struct {
	name   string
	weight float64
	tasks  bool
	score  *float64
}

func (c comp) input() api.GradeComponentInput {
	src := api.GradeSource("manual")
	if c.tasks {
		src = "tasks"
	}
	return api.GradeComponentInput{Name: c.name, Weight: c.weight, Score: c.score, Source: src}
}

type courseDef struct {
	code, name, lecturer, color, notes string
	credits                            int
	day                                int // ISO weekday
	start, end, room                   string
	minPct                             int // 0 = default
	comps                              []comp
	topics                             []string       // 14 lecture topics, UTS and UAS are added
	attendance                         map[int]string // meeting number -> status; "" = belum dicatat. Default hadir.
}

type taskDef struct {
	course, title, desc string
	days                int // deadline offset from today
	time                string
	status              string
	score               float64
	priority            string
	meeting             int
	url                 string
}

type materialDef struct {
	course, kind, title, desc, url string
	meeting                        int
	fileName                       string
	file                           []byte
}

var semester3 = []courseDef{
	{
		code: "IF2101", name: "Struktur Data", lecturer: "Dr. Rina Kartika, M.Kom.", color: "#6366f1", credits: 3,
		day: 1, start: "07:30", end: "10:00", room: "Lab Komputer 2",
		notes: "Kelas B. Asdos: Kak Fajar (praktikum Jumat sore, opsional). Bahasa: C++.",
		comps: []comp{{"Tugas", 30, true, nil}, {"Kuis", 10, false, ptr(85.0)}, {"UTS", 25, false, nil}, {"UAS", 35, false, nil}},
		topics: []string{"Pengantar struktur data dan kompleksitas", "Array dan pointer", "Linked list (singly, doubly)", "Stack",
			"Queue dan deque", "Rekursi", "Tree dan binary tree", "Binary search tree", "AVL tree", "Heap dan priority queue",
			"Hash table", "Graph: representasi", "Graph: BFS dan DFS", "Sorting lanjut (merge sort, quick sort)"},
		attendance: map[int]string{3: "sick"},
	},
	{
		code: "IF2102", name: "Basis Data", lecturer: "Budi Santoso, S.T., M.T.", color: "#0ea5e9", credits: 3,
		day: 2, start: "10:00", end: "12:30", room: "R. 3.04",
		notes: "Proyek akhir kelompok 4 orang, presentasi minggu 15.",
		topics: []string{"Pengantar sistem basis data", "Model ER dan ERD", "Model relasional", "Aljabar relasional",
			"Normalisasi (1NF-3NF)", "SQL DDL", "SQL DML", "SQL JOIN", "Subquery dan view", "Fungsi agregat dan GROUP BY",
			"Indeks dan optimasi query", "Transaksi dan ACID", "Stored procedure dan trigger", "Keamanan basis data"},
	},
	{
		code: "IF2106", name: "Statistika dan Probabilitas", lecturer: "Dewi Lestari, M.Si.", color: "#f59e0b", credits: 2,
		day: 2, start: "13:00", end: "14:40", room: "R. 1.02",
		comps: []comp{{"Tugas", 30, true, nil}, {"Kuis", 10, false, ptr(75.0)}, {"UTS", 30, false, nil}, {"UAS", 30, false, nil}},
		topics: []string{"Statistika deskriptif", "Penyajian data", "Ukuran pemusatan dan penyebaran", "Peluang dasar",
			"Peluang bersyarat dan teorema Bayes", "Variabel acak", "Distribusi diskrit", "Distribusi normal", "Sampling",
			"Estimasi interval", "Uji hipotesis", "Regresi linear", "Korelasi", "Review"},
		attendance: map[int]string{4: "excused"},
	},
	{
		code: "IF2103", name: "Pemrograman Berorientasi Objek", lecturer: "Andi Wijaya, M.Cs.", color: "#10b981", credits: 3,
		day: 3, start: "08:00", end: "10:30", room: "Lab Komputer 1",
		notes: "Pakai Java 21 + IntelliJ. Mini project boleh berdua.",
		comps: []comp{{"Tugas", 25, true, nil}, {"Praktikum", 15, false, ptr(88.0)}, {"UTS", 25, false, nil}, {"UAS", 35, false, nil}},
		topics: []string{"Paradigma OOP", "Class dan object", "Enkapsulasi", "Inheritance", "Polymorphism",
			"Abstract class dan interface", "Exception handling", "Collections (List, Map, Set)", "Generics", "File I/O",
			"GUI dengan JavaFX", "Design pattern dasar", "Unit testing dengan JUnit", "Presentasi mini project"},
	},
	{
		code: "IF2108", name: "Bahasa Inggris Teknik", lecturer: "Sarah Johnson, M.A.", color: "#ec4899", credits: 2,
		day: 3, start: "13:00", end: "14:40", room: "R. 2.05",
		comps: []comp{{"Tugas", 30, true, nil}, {"Presentasi", 20, false, nil}, {"UTS", 20, false, nil}, {"UAS", 30, false, nil}},
		topics: []string{"Self-introduction in tech", "Reading technical documentation", "Vocabulary for software development",
			"Writing professional emails", "Describing processes", "Writing user stories", "Presentation skills", "Product review",
			"Technical writing: README", "Meetings and discussions", "Job interview practice", "CV and cover letter",
			"Final presentation prep", "Final presentation"},
	},
	{
		code: "IF2104", name: "Matematika Diskrit", lecturer: "Prof. Dr. Siti Aminah", color: "#8b5cf6", credits: 3,
		day: 4, start: "07:30", end: "10:00", room: "R. 2.01",
		notes: "Buku: Rosen, Discrete Mathematics and Its Applications. Kuis tiap 2 minggu.",
		comps: []comp{{"Tugas", 20, true, nil}, {"Kuis", 20, false, ptr(68.0)}, {"UTS", 30, false, nil}, {"UAS", 30, false, nil}},
		topics: []string{"Logika proposisi", "Logika predikat", "Metode pembuktian", "Himpunan", "Relasi dan fungsi",
			"Induksi matematika", "Kombinatorika dasar", "Permutasi dan kombinasi", "Prinsip sarang merpati", "Relasi rekurensi",
			"Teori graf", "Pohon", "Aljabar Boolean", "Review"},
		attendance: map[int]string{6: ""},
	},
	{
		code: "IF2107", name: "Praktikum Basis Data", lecturer: "Tim Asisten Lab BD", color: "#14b8a6", credits: 1,
		day: 4, start: "15:00", end: "16:40", room: "Lab Basis Data", minPct: 85,
		notes: "Laporan dikumpulkan H+6 setelah praktikum. Telat = nilai laporan 0.",
		comps: []comp{{"Laporan", 40, true, nil}, {"Responsi", 30, false, nil}, {"Ujian praktikum", 30, false, nil}},
		topics: []string{"Pengenalan PostgreSQL", "DDL: CREATE dan ALTER", "DML: INSERT, UPDATE, DELETE", "SELECT dan JOIN",
			"Subquery", "Agregasi", "View", "Stored procedure", "Trigger", "Transaksi", "Indeks", "Backup dan restore",
			"Mini project", "Responsi"},
	},
	{
		code: "UNV2101", name: "Pendidikan Kewarganegaraan", lecturer: "Drs. Agus Salim, M.Pd.", color: "#ef4444", credits: 2,
		day: 5, start: "08:00", end: "09:40", room: "R. 4.01",
		comps: []comp{{"Tugas", 30, true, nil}, {"Partisipasi", 10, false, ptr(90.0)}, {"UTS", 30, false, nil}, {"UAS", 30, false, nil}},
		topics: []string{"Pengantar PKn", "Identitas nasional", "Integrasi nasional", "Konstitusi", "Hak dan kewajiban warga negara",
			"Demokrasi Pancasila", "Negara hukum", "Wawasan nusantara", "Ketahanan nasional", "Geostrategi Indonesia",
			"Bela negara", "Pendidikan anti korupsi", "Presentasi kelompok 1", "Presentasi kelompok 2"},
		attendance: map[int]string{3: "excused"},
	},
	{
		code: "IF2105", name: "Sistem Operasi", lecturer: "Hendra Gunawan, M.Kom.", color: "#f97316", credits: 3,
		day: 5, start: "13:30", end: "16:00", room: "R. 2.03",
		notes: "Dosen ketat soal absen, telat 15 menit dihitung alpa.",
		topics: []string{"Pengantar sistem operasi", "Struktur SO dan system call", "Proses dan thread", "Penjadwalan CPU",
			"Sinkronisasi proses", "Deadlock", "Manajemen memori", "Virtual memory", "Sistem file", "Manajemen I/O",
			"Proteksi dan keamanan", "Virtualisasi dan container", "Shell scripting", "Studi kasus Linux"},
		attendance: map[int]string{2: "absent", 4: "sick", 5: "absent"},
	},
}

// Semester 2 (archive): KHS letter plus the component scores at the time.
var semester2 = []struct {
	code, name, color, letter string
	credits                   int
	tugas, uts, uas           float64
}{
	{"IF1201", "Algoritma dan Pemrograman 2", "#6366f1", "A", 4, 92, 85, 88},
	{"IF1204", "Praktikum Algoritma dan Pemrograman", "#14b8a6", "A", 1, 95, 90, 90},
	{"MA1201", "Kalkulus 2", "#f59e0b", "B+", 3, 80, 72, 78},
	{"IF1202", "Logika Informatika", "#8b5cf6", "A-", 3, 85, 74, 79}, // computed B+, KHS A-
	{"IF1203", "Pengantar Sistem Digital", "#f97316", "B", 3, 78, 68, 72},
	{"MA1202", "Aljabar Linear", "#0ea5e9", "B+", 3, 82, 70, 77},
	{"UNV1201", "Bahasa Indonesia", "#ef4444", "A", 2, 90, 88, 86},
	{"UNV1202", "Pendidikan Agama", "#10b981", "A", 2, 92, 86, 88},
}

func tasks() []taskDef {
	return []taskDef{
		// Struktur Data
		{course: "IF2101", title: "Tugas 1: Implementasi linked list", desc: "Insert, delete, dan reverse singly linked list di C++. Sertakan screenshot output.", days: -27, time: "23:59", status: "graded", score: 88, meeting: 3, url: "https://elearning.example.ac.id/mod/assign/view.php?id=2101"},
		{course: "IF2101", title: "Tugas 2: Stack dan queue", desc: "Konversi infix ke postfix pakai stack.", days: -20, time: "23:59", status: "graded", score: 92, meeting: 4},
		{course: "IF2101", title: "Tugas 3: Rekursi", desc: "Menara Hanoi dan permutasi string secara rekursif.", days: -6, time: "23:59", status: "submitted", meeting: 6},
		{course: "IF2101", title: "Tugas 4: Binary tree traversal", desc: "Preorder, inorder, postorder, level order. Kumpulkan .cpp + laporan PDF.", days: 4, time: "23:59", status: "todo", priority: "high", meeting: 7},
		// Basis Data
		{course: "IF2102", title: "Tugas 1: ERD sistem perpustakaan", desc: "Minimal 6 entitas, pakai notasi Chen.", days: -26, time: "23:59", status: "graded", score: 85, meeting: 2},
		{course: "IF2102", title: "Tugas 2: Model relasional", desc: "Transformasi ERD tugas 1 ke skema relasional.", days: -19, time: "23:59", status: "graded", score: 78, meeting: 3},
		{course: "IF2102", title: "Tugas 3: Soal normalisasi", desc: "Normalisasi tabel faktur penjualan sampai 3NF. Tulis tangan, scan PDF.", days: 2, time: "23:59", status: "in_progress", priority: "high", meeting: 4},
		{course: "IF2102", title: "Proyek: Database toko online (kelompok)", desc: "Kelompok: aku, Raka, Nadia, Yusuf. ERD, DDL, 20 query, dan presentasi.", days: 35, time: "23:59", status: "todo", priority: "normal"},
		// Statistika
		{course: "IF2106", title: "Kuis 2 di Moodle: Peluang bersyarat", desc: "10 soal, 30 menit, sekali kesempatan.", days: 0, time: "21:00", status: "todo", priority: "high", url: "https://elearning.example.ac.id/mod/quiz/view.php?id=2106"},
		{course: "IF2106", title: "Latihan soal variabel acak", desc: "Buku Walpole bab 3 no. 1-15 ganjil.", days: 3, time: "23:59", status: "todo", meeting: 6},
		{course: "IF2106", title: "Tugas 1: Statistika deskriptif dengan Excel", desc: "Data tinggi badan 50 mahasiswa.", days: -18, time: "23:59", status: "graded", score: 90, meeting: 2},
		// PBO
		{course: "IF2103", title: "Tugas 1: Class dan object", desc: "Class Mahasiswa dan MataKuliah dengan getter/setter.", days: -25, time: "23:59", status: "graded", score: 90, meeting: 2},
		{course: "IF2103", title: "Tugas 2: Inheritance dan polymorphism", desc: "Hierarki class Kendaraan.", days: -11, time: "23:59", status: "submitted", meeting: 5},
		{course: "IF2103", title: "Mini project: Aplikasi kasir (Java)", desc: "CLI dulu, GUI JavaFX setelah UTS. Push ke GitHub, kirim link repo.", days: 6, time: "23:59", status: "in_progress", priority: "high", meeting: 6, url: "https://github.com/"},
		// Bahasa Inggris
		{course: "IF2108", title: "Writing: Describe your dream app", desc: "250-300 words.", days: -17, time: "23:59", status: "graded", score: 88, meeting: 3},
		{course: "IF2108", title: "Presentation: Tech product review", desc: "5 menit, slide max 6.", days: 13, time: "13:00", status: "todo", priority: "low"},
		// Matematika Diskrit
		{course: "IF2104", title: "PR 1: Logika proposisi", desc: "Tabel kebenaran dan ekuivalensi logika.", days: -24, time: "23:59", status: "graded", score: 80, meeting: 1},
		{course: "IF2104", title: "PR 2: Himpunan dan relasi", desc: "Soal latihan Rosen 2.1 dan 9.1.", days: -10, time: "23:59", status: "graded", score: 75, meeting: 4},
		{course: "IF2104", title: "PR 3: Induksi matematika", desc: "Buktikan 5 soal dengan induksi. Dikumpul fisik ke ruang dosen.", days: -1, time: "23:59", status: "todo", priority: "high", meeting: 6},
		// Praktikum Basis Data
		{course: "IF2107", title: "Laporan modul 1: Pengenalan PostgreSQL", days: -24, time: "23:59", status: "graded", score: 90, meeting: 1},
		{course: "IF2107", title: "Laporan modul 2: DDL", days: -17, time: "23:59", status: "graded", score: 87, meeting: 2},
		{course: "IF2107", title: "Laporan modul 3: DML", days: -10, time: "23:59", status: "graded", score: 92, meeting: 3},
		{course: "IF2107", title: "Laporan modul 4: SELECT dan JOIN", days: -3, time: "23:59", status: "submitted", meeting: 4},
		{course: "IF2107", title: "Laporan modul 5: Subquery", days: 4, time: "23:59", status: "todo", meeting: 5},
		// PKn
		{course: "UNV2101", title: "Resume video identitas nasional", desc: "1 halaman.", days: -15, time: "23:59", status: "graded", score: 85, meeting: 2},
		{course: "UNV2101", title: "Makalah: Demokrasi Pancasila (kelompok)", desc: "10-15 halaman, format APA. Bagianku: bab 2.", days: 10, time: "23:59", status: "todo", priority: "low", meeting: 6},
		// Sistem Operasi
		{course: "IF2105", title: "Laporan: Instalasi Linux di VirtualBox", desc: "Ubuntu Server 24.04, screenshot tiap langkah.", days: -22, time: "23:59", status: "graded", score: 82, meeting: 1},
		{course: "IF2105", title: "Tugas: Simulasi penjadwalan CPU", desc: "FCFS, SJF, dan Round Robin. Hitung waiting time dan turnaround time. Program bebas bahasa.", days: 1, time: "23:59", status: "in_progress", priority: "high", meeting: 4},
		// Tanpa matkul
		{title: "Upload berkas beasiswa PPA", desc: "KHS semester 2, surat keterangan aktif, slip gaji ortu.", days: 5, time: "16:00", status: "todo", priority: "high"},
		{title: "Isi kuesioner evaluasi dosen (EDOM)", days: 20, time: "23:59", status: "todo", priority: "low"},
	}
}

func materials() []materialDef {
	return []materialDef{
		{course: "IF2101", kind: "link", title: "Halaman Moodle Struktur Data", url: "https://elearning.example.ac.id/course/view.php?id=2101"},
		{course: "IF2101", kind: "link", title: "Slide P1-P6 (Google Drive)", url: "https://drive.google.com/drive/folders/1sTrUkTuRdAtA2026"},
		{course: "IF2101", kind: "file", title: "Modul linked list", meeting: 3, fileName: "Modul Linked List.pdf",
			file: makePDF("Modul 3 - Linked List", []string{"Node: data + pointer ke node berikutnya.", "Insert di depan: O(1).", "Insert di belakang tanpa tail: O(n).", "Doubly linked list: pointer prev dan next.", "Latihan: reverse linked list secara iteratif dan rekursif."})},
		{course: "IF2101", kind: "note", title: "Catatan stack", meeting: 4, desc: "Stack = LIFO.\n- push, pop, peek semua O(1)\n- Bisa pakai array (ukuran tetap) atau linked list\n- Dipakai untuk: undo, cek kurung seimbang, infix ke postfix, call stack rekursi\n\nKata dosen: UTS pasti ada soal infix ke postfix!"},
		{course: "IF2101", kind: "link", title: "Visualisasi BST (VisuAlgo)", meeting: 9, url: "https://visualgo.net/en/bst"},

		{course: "IF2102", kind: "link", title: "Halaman Moodle Basis Data", url: "https://elearning.example.ac.id/course/view.php?id=2102"},
		{course: "IF2102", kind: "file", title: "Slide ERD", meeting: 2, fileName: "Slide ERD.pdf",
			file: makePDF("Model ER dan ERD", []string{"Entitas kuat dan entitas lemah.", "Atribut: simple, composite, multivalued, derived.", "Kardinalitas: 1:1, 1:N, M:N.", "Relasi M:N jadi tabel tersendiri saat ke model relasional."})},
		{course: "IF2102", kind: "note", title: "Ringkasan normalisasi", meeting: 5, desc: "1NF: semua atribut atomik, tidak ada grup berulang.\n2NF: 1NF + tidak ada dependensi parsial ke sebagian primary key.\n3NF: 2NF + tidak ada dependensi transitif.\nBCNF: setiap determinan adalah candidate key.\n\nTips: tulis dulu semua functional dependency sebelum mecah tabel."},
		{course: "IF2102", kind: "link", title: "dbdiagram.io buat gambar ERD", meeting: 2, url: "https://dbdiagram.io"},

		{course: "IF2106", kind: "note", title: "Rumus peluang", meeting: 5, desc: "P(A|B) = P(A n B) / P(B)\nBayes: P(A|B) = P(B|A) P(A) / P(B)\nIndependen: P(A n B) = P(A) P(B)\nKomplemen: P(A') = 1 - P(A)"},
		{course: "IF2106", kind: "link", title: "Buku Walpole (Drive)", url: "https://drive.google.com/file/d/1wAlPoLeStAtIsTiKa"},

		{course: "IF2103", kind: "link", title: "Halaman Moodle PBO", url: "https://elearning.example.ac.id/course/view.php?id=2103"},
		{course: "IF2103", kind: "link", title: "Oracle Java Tutorial: OOP concepts", meeting: 1, url: "https://docs.oracle.com/javase/tutorial/java/concepts/"},
		{course: "IF2103", kind: "note", title: "Catatan inheritance", meeting: 4, desc: "extends = turunan class, Java cuma single inheritance.\nsuper() wajib di baris pertama constructor.\n@Override buat menimpa method parent.\nprotected: bisa diakses subclass dan package yang sama."},

		{course: "IF2108", kind: "note", title: "Useful phrases for presentation", meeting: 7, desc: "Opening: \"Today I'd like to walk you through...\"\nTransition: \"Moving on to...\"\nClosing: \"To sum up...\" / \"Any questions?\""},

		{course: "IF2104", kind: "link", title: "Buku Rosen bab 1-2 (Drive)", url: "https://drive.google.com/file/d/1rOsEnDiScReTeMaTh"},
		{course: "IF2104", kind: "note", title: "Hukum-hukum himpunan", meeting: 4, desc: "Identitas: A u {} = A\nDominasi: A n {} = {}\nDe Morgan: (A u B)' = A' n B', (A n B)' = A' u B'\nDistributif: A n (B u C) = (A n B) u (A n C)"},
		{course: "IF2104", kind: "file", title: "Latihan soal UTS Matdis", fileName: "Latihan UTS Matdis.pdf",
			file: makePDF("Latihan UTS Matematika Diskrit", []string{"1. Buktikan (p -> q) ekuivalen dengan (~q -> ~p).", "2. Tentukan |A u B| jika |A| = 12, |B| = 9, |A n B| = 4.", "3. Buktikan 1 + 2 + ... + n = n(n+1)/2 dengan induksi.", "4. Apakah relasi R = {(a,b) | a habis membagi b} refleksif, simetris, transitif?"})},

		{course: "IF2107", kind: "link", title: "Modul praktikum lengkap (Drive)", url: "https://drive.google.com/drive/folders/1pRaKtIkUmBaSiSdAtA"},
		{course: "IF2107", kind: "file", title: "Script modul 3", meeting: 3, fileName: "praktikum-modul3.sql",
			file: []byte("-- Praktikum Basis Data, Modul 3: DML\nCREATE TABLE mahasiswa (\n  nim VARCHAR(12) PRIMARY KEY,\n  nama VARCHAR(100) NOT NULL,\n  angkatan INT NOT NULL\n);\n\nINSERT INTO mahasiswa VALUES ('2025010001', 'Andi', 2025), ('2025010002', 'Bunga', 2025);\nUPDATE mahasiswa SET nama = 'Bunga Lestari' WHERE nim = '2025010002';\nDELETE FROM mahasiswa WHERE angkatan < 2020;\n")},

		{course: "UNV2101", kind: "link", title: "Video materi identitas nasional (YouTube)", meeting: 2, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},

		{course: "IF2105", kind: "link", title: "Download VirtualBox", meeting: 1, url: "https://www.virtualbox.org/wiki/Downloads"},
		{course: "IF2105", kind: "note", title: "Algoritma penjadwalan CPU", meeting: 4, desc: "FCFS: urut kedatangan, bisa convoy effect.\nSJF: burst terpendek dulu, optimal waiting time, bisa starvation.\nRound Robin: time quantum, adil, quantum terlalu kecil = banyak context switch.\nWaiting time = turnaround - burst. Turnaround = selesai - datang."},
		{course: "IF2105", kind: "link", title: "Operating System Concepts (slide resmi)", url: "https://www.os-book.com/OS10/slide-dir/index.html"},
	}
}

// ------------------------------------------------------------------------ run

func run(base, user, pass string) error {
	jar, _ := cookiejar.New(nil)
	c := &client{base: strings.TrimRight(base, "/"), http: &http.Client{Jar: jar, Timeout: 30 * time.Second}}

	if err := c.do(http.MethodPost, "/api/auth/login", api.LoginRequest{Username: user, Password: pass}, nil); err != nil {
		return fmt.Errorf("login: %w", err)
	}
	var sems api.SemesterList
	if err := c.do(http.MethodGet, "/api/semesters", nil, &sems); err != nil {
		return err
	}
	if len(sems.Items) > 0 {
		return errors.New("database sudah berisi semester; seed-demo hanya untuk database kosong")
	}

	now := time.Now().In(loc)
	k := clock{today: time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)}
	isoDay := int(k.today.Weekday()+6)%7 + 1
	monday := k.today.AddDate(0, 0, 1-isoDay)
	start3 := monday.AddDate(0, 0, -35) // the current week is week 6
	start2 := start3.AddDate(0, 0, -26*7)

	// Settings: baseline IPK for semester 1.
	var st api.Settings
	if err := c.do(http.MethodGet, "/api/settings", nil, &st); err != nil {
		return err
	}
	if err := c.do(http.MethodPut, "/api/settings", api.SettingsUpdate{
		Timezone: st.Timezone, GradeScale: st.GradeScale, CountExcusedAsAbsent: st.CountExcusedAsAbsent,
		DefaultMinAttendancePct: st.DefaultMinAttendancePct, DefaultTotalMeetings: st.DefaultTotalMeetings,
		Reminders: st.Reminders, Baseline: api.Baseline{Gpa: ptr(3.52), Credits: 20},
	}, nil); err != nil {
		return err
	}

	// Semester 2 (archive).
	year2, term2 := academicYear(start2)
	var sem2 api.Semester
	if err := c.do(http.MethodPost, "/api/semesters", api.SemesterCreate{
		Name: "Semester 2", AcademicYear: year2, Term: term2,
		StartDate: start2.Format("2006-01-02"), EndDate: start2.AddDate(0, 0, 19*7).Format("2006-01-02"),
	}, &sem2); err != nil {
		return err
	}
	for _, d := range semester2 {
		var co api.Course
		if err := c.do(http.MethodPost, "/api/semesters/"+sem2.Id+"/courses", api.CourseCreate{
			Code: ptr(d.code), Name: d.name, Credits: d.credits, Color: ptr(d.color), Schedules: []api.ScheduleInput{},
			GenerateMeetings: ptr(false),
			GradeComponents: &[]api.GradeComponentInput{
				comp{"Tugas", 30, false, ptr(d.tugas)}.input(), comp{"UTS", 30, false, ptr(d.uts)}.input(), comp{"UAS", 40, false, ptr(d.uas)}.input(),
			},
		}, &co); err != nil {
			return err
		}
		if err := c.do(http.MethodPut, "/api/courses/"+co.Id, api.CourseUpdate{
			Code: co.Code, Name: co.Name, Credits: co.Credits, Lecturer: co.Lecturer, Color: co.Color, TotalMeetings: co.TotalMeetings,
			MinAttendancePct: co.MinAttendancePct, Notes: co.Notes, Schedules: []api.ScheduleInput{}, FinalGradeLetter: ptr(d.letter),
		}, nil); err != nil {
			return err
		}
	}

	// Semester 3 (active).
	year3, term3 := academicYear(start3)
	var sem3 api.Semester
	if err := c.do(http.MethodPost, "/api/semesters", api.SemesterCreate{
		Name: "Semester 3", AcademicYear: year3, Term: term3, Activate: ptr(true),
		StartDate: start3.Format("2006-01-02"), EndDate: start3.AddDate(0, 0, 19*7).Format("2006-01-02"),
	}, &sem3); err != nil {
		return err
	}

	courseIDs := map[string]string{}
	meetingIDs := map[string]map[int]string{}
	today := k.date(0)
	for _, d := range semester3 {
		in := api.CourseCreate{
			Code: ptr(d.code), Name: d.name, Credits: d.credits, Lecturer: ptr(d.lecturer), Color: ptr(d.color),
			Schedules: []api.ScheduleInput{{DayOfWeek: d.day, StartTime: d.start, EndTime: d.end, Room: d.room}},
		}
		if d.notes != "" {
			in.Notes = ptr(d.notes)
		}
		if d.minPct > 0 {
			in.MinAttendancePct = ptr(d.minPct)
		}
		if len(d.comps) > 0 {
			list := make([]api.GradeComponentInput, 0, len(d.comps))
			for _, cp := range d.comps {
				list = append(list, cp.input())
			}
			in.GradeComponents = &list
		}
		var co api.Course
		if err := c.do(http.MethodPost, "/api/semesters/"+sem3.Id+"/courses", in, &co); err != nil {
			return err
		}
		courseIDs[d.code] = co.Id
		meetingIDs[d.code] = map[int]string{}

		var ms api.MeetingList
		if err := c.do(http.MethodGet, "/api/courses/"+co.Id+"/meetings", nil, &ms); err != nil {
			return err
		}
		lecture := 0
		for _, m := range ms.Items {
			meetingIDs[d.code][m.Number] = m.Id
			topic := ""
			switch m.Kind {
			case "midterm":
				topic = "Ujian Tengah Semester"
			case "final":
				topic = "Ujian Akhir Semester"
			default:
				if lecture < len(d.topics) {
					topic = d.topics[lecture]
				}
				lecture++
			}
			upd := api.MeetingUpdate{Date: m.Date, StartTime: m.StartTime, EndTime: m.EndTime, Room: m.Room, Kind: m.Kind, Status: m.Status, Topic: topic}
			cancelled := d.code == "IF2102" && m.Number == 5
			if cancelled {
				upd.Status = "cancelled"
				upd.Notes = "Dosen dinas luar kota. Diganti kelas online."
			}
			if err := c.do(http.MethodPut, "/api/meetings/"+m.Id, upd, nil); err != nil {
				return err
			}
			if cancelled || m.Date >= today {
				continue
			}
			status, special := d.attendance[m.Number]
			if !special {
				status = "present"
			}
			if status == "" {
				continue // forgot to record
			}
			s := api.AttendanceUpdateStatus(status)
			if err := c.do(http.MethodPut, "/api/meetings/"+m.Id+"/attendance", api.AttendanceUpdate{Status: &s}, nil); err != nil {
				return err
			}
		}
	}

	// Replacement class for the cancelled Basis Data meeting, tonight online.
	if err := c.do(http.MethodPost, "/api/courses/"+courseIDs["IF2102"]+"/meetings", api.MeetingCreate{
		Date: today, StartTime: ptr("19:00"), EndTime: ptr("20:40"), Room: ptr("Online (Zoom)"),
		Topic: ptr("Pengganti P5: Normalisasi (1NF-3NF)"), Notes: ptr("Link Zoom dikirim di grup WA kelas."),
	}, nil); err != nil {
		return err
	}

	for _, t := range tasks() {
		in := api.TaskCreate{Title: t.title, Deadline: k.at(t.days, t.time), SemesterId: ptr(sem3.Id)}
		if t.course != "" {
			in.CourseId = ptr(courseIDs[t.course])
			if t.meeting > 0 {
				in.MeetingId = ptr(meetingIDs[t.course][t.meeting])
			}
		}
		if t.desc != "" {
			in.Description = ptr(t.desc)
		}
		if t.url != "" {
			in.SubmissionUrl = ptr(t.url)
		}
		if t.priority != "" {
			in.Priority = ptr(api.TaskPriority(t.priority))
		}
		var created api.Task
		if err := c.do(http.MethodPost, "/api/tasks", in, &created); err != nil {
			return err
		}
		switch t.status {
		case "graded":
			if err := c.do(http.MethodPut, "/api/tasks/"+created.Id, api.TaskUpdate{
				CourseId: created.CourseId, MeetingId: created.MeetingId, GradeComponentId: created.GradeComponentId,
				Title: created.Title, Description: created.Description, Deadline: created.Deadline, Status: "graded",
				Priority: created.Priority, SubmissionUrl: created.SubmissionUrl, Score: ptr(t.score),
			}, nil); err != nil {
				return err
			}
		case "submitted", "in_progress":
			if err := c.do(http.MethodPut, "/api/tasks/"+created.Id+"/status", api.TaskStatusUpdate{Status: api.TaskStatus(t.status)}, nil); err != nil {
				return err
			}
		}
	}

	for _, m := range materials() {
		courseID := courseIDs[m.course]
		meetingID := ""
		if m.meeting > 0 {
			meetingID = meetingIDs[m.course][m.meeting]
		}
		if m.kind == "file" {
			if err := c.upload(courseID, meetingID, m.title, m.desc, m.fileName, m.file); err != nil {
				return err
			}
			continue
		}
		in := api.MaterialCreate{CourseId: courseID, Kind: api.MaterialCreateKind(m.kind), Title: m.title}
		if meetingID != "" {
			in.MeetingId = ptr(meetingID)
		}
		if m.desc != "" {
			in.Description = ptr(m.desc)
		}
		if m.url != "" {
			in.Url = ptr(m.url)
		}
		if err := c.do(http.MethodPost, "/api/materials", in, nil); err != nil {
			return err
		}
	}

	fmt.Printf("Selesai: 2 semester, %d matkul, %d tugas, %d materi.\n", len(semester2)+len(semester3), len(tasks()), len(materials()))
	return nil
}

// makePDF builds a minimal one-page PDF with ASCII text.
func makePDF(title string, lines []string) []byte {
	esc := strings.NewReplacer(`\`, `\\`, "(", `\(`, ")", `\)`)
	var content strings.Builder
	fmt.Fprintf(&content, "BT /F1 18 Tf 56 780 Td (%s) Tj ET\n", esc.Replace(title))
	y := 745
	for _, l := range lines {
		fmt.Fprintf(&content, "BT /F1 11 Tf 56 %d Td (%s) Tj ET\n", y, esc.Replace(l))
		y -= 20
	}
	objs := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
		fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", content.Len(), content.String()),
	}
	var b bytes.Buffer
	b.WriteString("%PDF-1.4\n")
	offsets := make([]int, len(objs))
	for i, o := range objs {
		offsets[i] = b.Len()
		fmt.Fprintf(&b, "%d 0 obj\n%s\nendobj\n", i+1, o)
	}
	xref := b.Len()
	fmt.Fprintf(&b, "xref\n0 %d\n0000000000 65535 f \n", len(objs)+1)
	for _, off := range offsets {
		fmt.Fprintf(&b, "%010d 00000 n \n", off)
	}
	fmt.Fprintf(&b, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objs)+1, xref)
	return b.Bytes()
}
