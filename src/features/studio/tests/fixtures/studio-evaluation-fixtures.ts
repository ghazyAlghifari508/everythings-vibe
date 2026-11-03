import type { StudioDesignBlueprint } from "../../services/studio-design-blueprint";

export const financeBlueprint: StudioDesignBlueprint = {
	productIdentity: {
		productName: "BukuKas Pro",
		targetAudience: "Indonesian MSME Owners",
		platform: "mobile",
		visualDirection: "Clean financial clarity",
	},
	designTokens: {
		primary: "#059669",
		secondary: "#475569",
		background: "#f8fafc",
		surface: "#ffffff",
		fontFamily: "Inter, sans-serif",
		radius: 12,
		border: "1px solid #e2e8f0",
		elevation: "0 1px 3px rgba(0,0,0,0.1)",
	},
	sharedComponents: {
		header: "Canonical app bar with brand title and active screen",
		navigation: "Bottom tab bar with 4 standard destinations",
		buttons: "Solid emerald rounded-xl",
		inputs: "Outlined with neutral border and emerald focus",
		cards: "White rounded-xl border with subtle shadow",
		tabs: "Segmented controls",
		icons: "Clean stroked icons",
	},
	navigationContract: {
		destinations: ["home", "plus", "wallet", "analytics"],
		labels: [
			"Beranda",
			"Catat Transaksi",
			"Anggaran & Target",
			"Laporan & Analitik",
		],
		iconMapping: {
			home: "home",
			plus: "plus",
			wallet: "wallet",
			analytics: "analytics",
		},
		ordering: ["home", "plus", "wallet", "analytics"],
		activeItemRule: "Highlight current tab with brand color",
	},
	canonicalShell: {
		version: 1,
		navigation: "bottom",
		statusBar: "none",
		density: "comfortable",
		activeDestinations: {
			Beranda: "home",
			"Catat Transaksi": "plus",
			"Anggaran & Target": "wallet",
			"Laporan & Analitik": "analytics",
		},
	},
	screenPlan: [
		{
			name: "Beranda",
			role: "Ringkasan saldo kas dan transaksi terbaru",
			order: 0,
		},
		{
			name: "Catat Transaksi",
			role: "Form pencatatan pengeluaran dan pemasukan",
			order: 1,
		},
		{
			name: "Anggaran & Target",
			role: "Pengaturan plafon anggaran per kategori",
			order: 2,
		},
		{
			name: "Laporan & Analitik",
			role: "Grafik arus kas dan statistik per periode",
			order: 3,
		},
	],
};

export const financeScreens = [
	{
		name: "Beranda",
		content:
			'<main data-studio-content><section data-card><h2>Saldo Kas</h2><p class="balance">Rp 12.450.000</p></section><section><h3>Transaksi Terbaru</h3><ul><li>Penjualan Kopi Rp 75.000</li></ul></section></main>',
	},
	{
		name: "Catat Transaksi",
		content:
			'<main data-studio-content><form><label for="tx-amount">Nominal</label><input id="tx-amount" type="number" placeholder="0"><label for="tx-cat">Kategori</label><select id="tx-cat"><option>Operasional</option></select><button type="submit" data-primary>Simpan Transaksi</button></form></main>',
	},
	{
		name: "Anggaran & Target",
		content:
			'<main data-studio-content><section data-card><h2>Plafon Bulanan</h2><p>Terpakai Rp 3.200.000 dari Rp 10.000.000</p><div role="progressbar" aria-valuenow="32" aria-valuemin="0" aria-valuemax="100">32%</div></section></main>',
	},
	{
		name: "Laporan & Analitik",
		content:
			'<main data-studio-content><section data-card><h2>Arus Kas Bersih</h2><p>Surplus: Rp 4.850.000</p><div data-chart="monthly">Tren meningkat 12%</div></section></main>',
	},
];

export const travelBlueprint: StudioDesignBlueprint = {
	productIdentity: {
		productName: "JelajahNusantara",
		targetAudience: "Wisatawan Domestik",
		platform: "mobile",
		visualDirection: "Vibrant discovery",
	},
	designTokens: {
		primary: "#0284c7",
		secondary: "#64748b",
		background: "#f0f9ff",
		surface: "#ffffff",
		fontFamily: "Poppins, sans-serif",
		radius: 16,
		border: "1px solid #bae6fd",
		elevation: "0 2px 4px rgba(0,0,0,0.06)",
	},
	sharedComponents: {
		header: "Branded travel header",
		navigation: "Travel bottom navigation",
		buttons: "Sky blue rounded-2xl",
		inputs: "Search field with icon",
		cards: "Card with destination cover image",
		tabs: "Destination category pills",
		icons: "Clean stroked travel icons",
	},
	navigationContract: {
		destinations: ["plane", "search", "calendar", "user"],
		labels: ["Eksplorasi", "Cari Tiket", "Jadwal Perjalanan", "Profil"],
		iconMapping: {
			plane: "plane",
			search: "search",
			calendar: "calendar",
			user: "user",
		},
		ordering: ["plane", "search", "calendar", "user"],
		activeItemRule: "Highlight active tab with sky blue indicator",
	},
	canonicalShell: {
		version: 1,
		navigation: "bottom",
		statusBar: "none",
		density: "comfortable",
		activeDestinations: {
			Eksplorasi: "plane",
			"Cari Tiket": "search",
			"Jadwal Perjalanan": "calendar",
			Profil: "user",
		},
	},
	screenPlan: [
		{ name: "Eksplorasi", role: "Destinasi populer dan rekomendasi", order: 0 },
		{
			name: "Cari Tiket",
			role: "Pencarian tiket penerbangan dan hotel",
			order: 1,
		},
		{
			name: "Jadwal Perjalanan",
			role: "Itinerary perjalanan terkonfirmasi",
			order: 2,
		},
		{ name: "Profil", role: "Akun pengguna dan riwayat transaksi", order: 3 },
	],
};

export const webSaaSBlueprint: StudioDesignBlueprint = {
	productIdentity: {
		productName: "PulseMetrics",
		targetAudience: "B2B Ops Leaders",
		platform: "web",
		visualDirection: "High-density enterprise analytics",
	},
	designTokens: {
		primary: "#2563eb",
		secondary: "#64748b",
		background: "#f8fafc",
		surface: "#ffffff",
		fontFamily: "Inter, sans-serif",
		radius: 8,
		border: "1px solid #e2e8f0",
		elevation: "none",
	},
	sharedComponents: {
		header: "Desktop top navigation bar with workspace switcher",
		navigation: "Left sidebar with navigation items",
		buttons: "Compact rectangular buttons",
		inputs: "Compact inputs with inline labels",
		cards: "Bordered analytical metric cards",
		tabs: "Horizontal tab strip",
		icons: "Stroke icons",
	},
	navigationContract: {
		destinations: ["home", "chart", "settings"],
		labels: ["Dashboard", "Laporan Performa", "Pengaturan Sistem"],
		iconMapping: {
			home: "home",
			chart: "chart",
			settings: "settings",
		},
		ordering: ["home", "chart", "settings"],
		activeItemRule: "Left border highlight and muted background",
	},
	canonicalShell: {
		version: 1,
		navigation: "sidebar",
		statusBar: "none",
		density: "compact",
		activeDestinations: {
			Dashboard: "home",
			"Laporan Performa": "chart",
			"Pengaturan Sistem": "settings",
		},
	},
	screenPlan: [
		{ name: "Dashboard", role: "Ringkasan metrik real-time", order: 0 },
		{ name: "Laporan Performa", role: "Tabel dan grafik analitik", order: 1 },
		{
			name: "Pengaturan Sistem",
			role: "Konfigurasi tim dan integrasi",
			order: 2,
		},
	],
};

export const customerDirectoryBlueprint: StudioDesignBlueprint = {
	productIdentity: {
		productName: "ClientHub CRM",
		targetAudience: "Sales & Account Managers",
		platform: "web",
		visualDirection: "Structured relational client directory",
	},
	designTokens: {
		primary: "#0f172a",
		secondary: "#334155",
		background: "#f8fafc",
		surface: "#ffffff",
		fontFamily: "Inter, sans-serif",
		radius: 8,
		border: "1px solid #e2e8f0",
		elevation: "none",
	},
	sharedComponents: {
		header: "Desktop top navigation bar with directory scope",
		navigation: "Left sidebar with client navigation",
		buttons: "Neutral compact buttons",
		inputs: "Search and filter inputs with accessible labels",
		cards: "Structured directory list cards",
		tabs: "Status filter tab strip",
		icons: "Stroke icons",
	},
	navigationContract: {
		destinations: ["home", "search", "settings"],
		labels: ["Direktori", "Pencarian Klien", "Pengaturan Akun"],
		iconMapping: {
			home: "home",
			search: "search",
			settings: "settings",
		},
		ordering: ["home", "search", "settings"],
		activeItemRule: "Highlight active navigation item",
	},
	canonicalShell: {
		version: 1,
		navigation: "sidebar",
		statusBar: "none",
		density: "compact",
		activeDestinations: {
			Direktori: "home",
			"Pencarian Klien": "search",
			"Pengaturan Akun": "settings",
		},
	},
	screenPlan: [
		{ name: "Direktori", role: "Daftar klien aktif dan kontak", order: 0 },
		{
			name: "Pencarian Klien",
			role: "Filter dan pencarian terperinci",
			order: 1,
		},
		{ name: "Pengaturan Akun", role: "Konfigurasi tim direktori", order: 2 },
	],
};

export const ecommerceBlueprint: StudioDesignBlueprint = {
	productIdentity: {
		productName: "Lumina Store",
		targetAudience: "Modern Retail Shoppers",
		platform: "web",
		visualDirection: "Clean editorial commerce catalog",
	},
	designTokens: {
		primary: "#18181b",
		secondary: "#71717a",
		background: "#fafafa",
		surface: "#ffffff",
		fontFamily: "Inter, sans-serif",
		radius: 10,
		border: "1px solid #e4e4e7",
		elevation: "none",
	},
	sharedComponents: {
		header: "Branded retail top navigation bar",
		navigation: "Top horizontal navigation",
		buttons: "Solid primary action buttons",
		inputs: "Product search bar with icon",
		cards: "Product showcase cards with price and action",
		tabs: "Product category pills",
		icons: "Stroke commerce icons",
	},
	navigationContract: {
		destinations: ["home", "search", "wallet"],
		labels: ["Katalog Produk", "Detail Belanja", "Keranjang & Checkout"],
		iconMapping: {
			home: "home",
			search: "search",
			wallet: "wallet",
		},
		ordering: ["home", "search", "wallet"],
		activeItemRule: "Highlight current shopping section",
	},
	canonicalShell: {
		version: 1,
		navigation: "top",
		statusBar: "none",
		density: "comfortable",
		activeDestinations: {
			"Katalog Produk": "home",
			"Detail Belanja": "search",
			"Keranjang & Checkout": "wallet",
		},
	},
	screenPlan: [
		{
			name: "Katalog Produk",
			role: "Grid produk dan filter kategori",
			order: 0,
		},
		{
			name: "Detail Belanja",
			role: "Deskripsi dan spesifikasi produk",
			order: 1,
		},
		{
			name: "Keranjang & Checkout",
			role: "Ringkasan pesanan dan pembayaran",
			order: 2,
		},
	],
};

export const portfolioBlueprint: StudioDesignBlueprint = {
	productIdentity: {
		productName: "Alex Pratama Portfolio",
		targetAudience: "Engineering Leads & Clients",
		platform: "web",
		visualDirection: "Monochrome technical craft showcase",
	},
	designTokens: {
		primary: "#171717",
		secondary: "#525252",
		background: "#0a0a0a",
		surface: "#171717",
		fontFamily: "Inter, sans-serif",
		radius: 6,
		border: "1px solid #262626",
		elevation: "none",
	},
	sharedComponents: {
		header: "Minimalist portfolio top header",
		navigation: "Clean horizontal text navigation",
		buttons: "Outlined minimalist buttons",
		inputs: "Contact form fields",
		cards: "Project showcase cards with tags",
		tabs: "Project type filter",
		icons: "Hairline stroke icons",
	},
	navigationContract: {
		destinations: ["home", "chart", "user"],
		labels: ["Karya & Proyek", "Studi Kasus", "Tentang & Kontak"],
		iconMapping: {
			home: "home",
			chart: "chart",
			user: "user",
		},
		ordering: ["home", "chart", "user"],
		activeItemRule: "Highlight active section label",
	},
	canonicalShell: {
		version: 1,
		navigation: "top",
		statusBar: "none",
		density: "comfortable",
		activeDestinations: {
			"Karya & Proyek": "home",
			"Studi Kasus": "chart",
			"Tentang & Kontak": "user",
		},
	},
	screenPlan: [
		{
			name: "Karya & Proyek",
			role: "Galeri karya dan proyek pilihan",
			order: 0,
		},
		{
			name: "Studi Kasus",
			role: "Dokumentasi arsitektur dan dampak teknis",
			order: 1,
		},
		{
			name: "Tentang & Kontak",
			role: "Biografi ringkas dan jalur kontak",
			order: 2,
		},
	],
};

export const marketingLandingBlueprint: StudioDesignBlueprint = {
	productIdentity: {
		productName: "NovaFlow AI",
		targetAudience: "Creative Product Teams",
		platform: "web",
		visualDirection: "Confident bold product launch",
	},
	designTokens: {
		primary: "#4f46e5",
		secondary: "#475569",
		background: "#ffffff",
		surface: "#f8fafc",
		fontFamily: "Inter, sans-serif",
		radius: 12,
		border: "1px solid #e2e8f0",
		elevation: "0 1px 3px rgba(0,0,0,0.05)",
	},
	sharedComponents: {
		header: "Marketing topbar with primary call-to-action",
		navigation: "Marketing product navigation links",
		buttons: "High-contrast primary CTA buttons",
		inputs: "Newsletter and early access email input",
		cards: "Feature demonstration and proof cards",
		tabs: "Feature category switcher",
		icons: "Precise inline SVG icons",
	},
	navigationContract: {
		destinations: ["home", "plus", "analytics"],
		labels: ["Fitur Utama", "Uji Coba Produk", "Paket & Harga"],
		iconMapping: {
			home: "home",
			plus: "plus",
			analytics: "analytics",
		},
		ordering: ["home", "plus", "analytics"],
		activeItemRule: "Underline or indicator on active page",
	},
	canonicalShell: {
		version: 1,
		navigation: "top",
		statusBar: "none",
		density: "comfortable",
		activeDestinations: {
			"Fitur Utama": "home",
			"Uji Coba Produk": "plus",
			"Paket & Harga": "analytics",
		},
	},
	screenPlan: [
		{
			name: "Fitur Utama",
			role: "Hero dan demonstrasi kemampuan produk",
			order: 0,
		},
		{
			name: "Uji Coba Produk",
			role: "Alur interaktif dan pratinjau live",
			order: 1,
		},
		{
			name: "Paket & Harga",
			role: "Struktur harga transparan dan FAQ",
			order: 2,
		},
	],
};
