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
