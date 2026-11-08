// Term tables for existing-codebase feature titles.
//
// Data only: aliases are space-separated surface forms that mean one canonical
// noun, so "login", "masuk" and "autentikasi" collapse into a single concept
// instead of producing a title that names the same thing twice. Kept apart from
// the deriver so the algorithm stays readable and both files stay well inside
// the file-size ceiling.
export interface FeatureTerm {
	/** Canonical Indonesian noun used in the title. */
	id: string;
	/** Canonical English noun, used when the feature is planned in English. */
	en: string;
	/** Space-separated surface forms that mean this term. */
	aliases: string;
}

/** What the feature does. */
export const ACTION_TERMS: readonly FeatureTerm[] = [
	{
		id: "Pencarian",
		en: "Search",
		aliases:
			"cari mencari pencarian telusuri menelusuri penelusuran search searching",
	},
	{
		id: "Filter",
		en: "Filter",
		aliases:
			"filter filters filtering memfilter saring menyaring penyaringan penyaring",
	},
	{
		id: "Pengurutan",
		en: "Sorting",
		aliases: "urut urutan mengurutkan pengurutan sort sorting",
	},
	{
		id: "Autentikasi",
		en: "Authentication",
		aliases: "login masuk signin auth autentikasi authentikasi authentication",
	},
	{
		id: "Registrasi",
		en: "Registration",
		aliases: "registrasi register registration pendaftaran mendaftar signup",
	},
	{
		id: "Notifikasi",
		en: "Notifications",
		aliases:
			"notifikasi notification notifications pemberitahuan peringatan alert alerts pengingat reminder",
	},
	{ id: "Dashboard", en: "Dashboard", aliases: "dashboard dasbor" },
	{
		id: "Manajemen",
		en: "Management",
		aliases: "mengelola kelola manajemen manage managing management",
	},
	{
		id: "Penyimpanan",
		en: "Saving",
		aliases: "simpan menyimpan penyimpanan save draft draf",
	},
	{
		id: "Pelaporan",
		en: "Reporting",
		aliases: "laporan report reports reporting rekap rekapitulasi",
	},
	{
		id: "Ekspor",
		en: "Export",
		aliases: "ekspor export unduh download cetak print",
	},
	{ id: "Impor", en: "Import", aliases: "impor import unggah upload" },
	{
		id: "Pembayaran",
		en: "Payment",
		aliases: "pembayaran payment payments bayar checkout",
	},
	{
		id: "Pemantauan",
		en: "Tracking",
		aliases: "monitoring monitor memantau pemantauan tracking lacak pelacakan",
	},
	{
		id: "Analitik",
		en: "Analytics",
		aliases: "analitik analytics analisis statistik statistics",
	},
	{
		id: "Visualisasi",
		en: "Visualization",
		aliases: "grafik chart charts diagram visualisasi visualization",
	},
	{
		id: "Perbaikan",
		en: "Fix",
		aliases:
			"perbaiki memperbaiki perbaikan fix fixes fixing responsif responsiveness responsive",
	},
	{
		id: "Integrasi",
		en: "Integration",
		aliases: "integrasi integration sinkronisasi sinkron sync",
	},
	{ id: "Komentar", en: "Comments", aliases: "komentar comment comments" },
	{
		id: "Ulasan",
		en: "Reviews",
		aliases: "ulasan review reviews rating penilaian",
	},
	{
		id: "Wishlist",
		en: "Wishlist",
		aliases: "wishlist favorit favorite favourite",
	},
	{ id: "Keranjang", en: "Cart", aliases: "keranjang cart troli" },
	{
		id: "Pengaturan",
		en: "Settings",
		aliases: "pengaturan setting settings konfigurasi configuration",
	},
	{ id: "Profil", en: "Profile", aliases: "profil profile" },
	{ id: "Berbagi", en: "Sharing", aliases: "berbagi bagikan share sharing" },
	{
		id: "Otomatisasi",
		en: "Automation",
		aliases: "otomatis otomatisasi automation automate",
	},
	{
		id: "Rekomendasi",
		en: "Recommendation",
		aliases: "rekomendasi recommendation recommendations",
	},
];

/** What the feature operates on: the target entity or context. */
export const ENTITY_TERMS: readonly FeatureTerm[] = [
	{
		id: "Pengguna",
		en: "Users",
		aliases:
			"pengguna user users akun account accounts anggota member members pelanggan customer customers klien client clients perekrut recruiter admin",
	},
	{ id: "Proyek", en: "Projects", aliases: "proyek projects" },
	{ id: "Portofolio", en: "Portfolio", aliases: "portofolio portfolio" },
	{
		id: "Artikel",
		en: "Articles",
		aliases: "artikel article articles tulisan postingan posting posts",
	},
	{ id: "Blog", en: "Blog", aliases: "blog blogs" },
	{
		id: "Produk",
		en: "Products",
		aliases: "produk product products barang katalog catalog items",
	},
	{
		id: "Pesanan",
		en: "Orders",
		aliases: "pesanan order orders transaksi transactions invoice faktur",
	},
	{ id: "Status", en: "Status", aliases: "status progres progress" },
	{ id: "Tugas", en: "Tasks", aliases: "tugas task tasks backlog" },
	{
		id: "Jadwal",
		en: "Schedule",
		aliases: "jadwal schedule schedules scheduling kalender calendar deadline",
	},
	{
		id: "Inventaris",
		en: "Inventory",
		aliases: "inventaris inventory stok stock gudang",
	},
	{
		id: "Pesan",
		en: "Messages",
		aliases: "pesan message messages chat percakapan",
	},
	{
		id: "Navigasi",
		en: "Navigation",
		aliases: "navigasi navigation navbar sidebar menu",
	},
	{
		id: "Mobile",
		en: "Mobile",
		aliases: "mobile ponsel smartphone android ios",
	},
	{ id: "Konten", en: "Content", aliases: "konten content" },
	{ id: "Data", en: "Data", aliases: "data dataset" },
	{
		id: "Dokumen",
		en: "Documents",
		aliases: "dokumen documents document berkas",
	},
	{ id: "Tim", en: "Team", aliases: "tim team teams" },
	{
		id: "Keuangan",
		en: "Finance",
		aliases: "keuangan finance budget anggaran",
	},
	{ id: "Penjualan", en: "Sales", aliases: "penjualan sales" },
	{
		id: "Pemasaran",
		en: "Marketing",
		aliases: "pemasaran marketing kampanye campaign promosi",
	},
	{
		id: "Harga",
		en: "Pricing",
		aliases: "harga price pricing diskon discount",
	},
	{
		id: "Lokasi",
		en: "Location",
		aliases: "lokasi location alamat address peta map",
	},
];

/**
 * Prompt scaffolding and artefact-less nouns. Dropped before the content-word
 * fallback so a bare request cannot become "Fitur Interaktif Yang Jelas".
 */
export const GENERIC_WORDS: Record<string, true> = {
	fitur: true,
	feature: true,
	features: true,
	fungsi: true,
	function: true,
	aplikasi: true,
	app: true,
	website: true,
	situs: true,
	platform: true,
	sistem: true,
	system: true,
	interaktif: true,
	interactive: true,
	tambahan: true,
	tambahkan: true,
	tambah: true,
	buat: true,
	buatkan: true,
	bikin: true,
	sediakan: true,
	sertakan: true,
	rencanakan: true,
	plan: true,
	add: true,
	create: true,
	provide: true,
	include: true,
	memungkinkan: true,
	mungkinkan: true,
	allow: true,
	allows: true,
	dapat: true,
	bisa: true,
	can: true,
	agar: true,
	supaya: true,
	demi: true,
	untuk: true,
	with: true,
	and: true,
	dan: true,
	atau: true,
	or: true,
	the: true,
	a: true,
	an: true,
	yang: true,
	pada: true,
	dari: true,
	secara: true,
	ketika: true,
	saat: true,
	jika: true,
	if: true,
	when: true,
	seluruh: true,
	semua: true,
	all: true,
	opsi: true,
	option: true,
	options: true,
	langsung: true,
	instan: true,
	instant: true,
	mudah: true,
	kemudahan: true,
	cepat: true,
	praktis: true,
	optimal: true,
	nyaman: true,
	serta: true,
	juga: true,
	hanya: true,
	tertentu: true,
	rumpun: true,
	bidang: true,
	jenis: true,
	tipe: true,
	type: true,
	kolom: true,
	field: true,
	input: true,
	tombol: true,
	button: true,
	baru: true,
	new: true,
	jelas: true,
	clear: true,
	tolong: true,
	please: true,
	coba: true,
	bantu: true,
	harap: true,
	dong: true,
	saya: true,
	kami: true,
	aku: true,
	gue: true,
	sebuah: true,
	suatu: true,
	tidak: true,
	not: true,
	hasil: true,
	something: true,
};
