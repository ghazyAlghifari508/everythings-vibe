import type { ScrapeMode } from "@/db/schema";

// Raw pipeline strings are rewritten here so the progress panel reports what is
// happening without exposing capture metadata, raw URLs or library internals.
// An unknown string resolves to `null` on purpose: the caller falls back to the
// active stage label instead of inventing an activity that never happened.
const ACTIVITY_COPY: Record<string, string> = {
	"Membuka website": "Membuka website",
	"Halaman berhasil dimuat": "Halaman berhasil dimuat",
	"Menunggu resource halaman": "Memuat konten halaman",
	"Memuat konten lazy-load": "Memuat konten tambahan",
	"Menangkap DOM hasil render": "Membaca struktur halaman",
	"Capture halaman selesai": "Tampilan berhasil diambil",
	"Resource halaman gagal diambil": "Beberapa konten belum berhasil dimuat",
	"Iframe cross-origin dilewati": "Sebagian konten sematan dilewati",
	"Iframe terlalu besar dilewati": "Sebagian konten sematan terlalu besar",
	"Iframe tidak dapat diakses, dilewati":
		"Sebagian konten sematan tidak dapat diakses",
	"Menormalkan evidence visual": "Merapikan data tampilan",
	"Menganalisis evidence": "Memeriksa gaya dan komponen",
	"Menyusun DESIGN.md dari pengukuran browser":
		"Menyusun DESIGN.md dari pengukuran tampilan",
	"AI menyusun analisis design system": "Menyusun analisis desain",
	"Memvalidasi kesesuaian DESIGN.md dan evidence":
		"Memeriksa kesesuaian DESIGN.md",
	"DESIGN.md dari evidence tersimpan; AI enrichment tidak tersedia":
		"DESIGN.md tersimpan tanpa analisis tambahan",
	"Mengambil tampilan": "Mengambil tampilan halaman",
	"Menyiapkan HTML standalone": "Menyiapkan hasil HTML",
	"Menyiapkan resource preview": "Menyiapkan pratinjau halaman",
	"Menganalisis design system": "Memeriksa gaya dan komponen",
	"Analisis visual selesai": "Pemeriksaan gaya selesai",
	"Menyusun tabel dari evidence visual": "Menyusun tabel dari data tampilan",
	"Menyimpan index.html": "Menyimpan hasil HTML",
	"Menyimpan hasil": "Menyimpan hasil",
};

const VIEW_METADATA =
	/(\d{2,5})x(\d{2,5}),\s*(?:light|dark|auto)\s*\((\d+)\/(\d+)\)\s*$/i;
const RAW_URL = /^(?:https?:\/\/|\/\/|\/)\S+$/i;

function deviceForWidth(width: number): string {
	if (width <= 480) return "mobile";
	if (width <= 1024) return "tablet";
	return "desktop";
}

// Design mode wraps every capture activity as `${activity}: ${width}x${height},
// ${scheme} (${index}/${total})`. Only the device class and the view counter are
// useful to a reader, so the label is collapsed into one public sentence.
function resolveViewActivity(activity: string): string | null {
	const match = VIEW_METADATA.exec(activity);
	if (!match) return null;
	const width = Number(match[1]);
	if (!Number.isFinite(width) || width <= 0) return null;
	const device = deviceForWidth(width);
	const index = Number(match[3]);
	const total = Number(match[4]);
	const counted =
		Number.isInteger(index) &&
		Number.isInteger(total) &&
		total > 0 &&
		index >= 1 &&
		index <= total;
	return counted
		? `Memuat tampilan ${device} · ${index} dari ${total}`
		: `Memuat tampilan ${device}`;
}

export interface ScrapeActivityInput {
	activity?: string | null;
	mode: ScrapeMode;
}

export function resolveScrapeActivity({
	activity,
	mode,
}: ScrapeActivityInput): string | null {
	const raw = activity?.trim();
	if (!raw) return null;
	const view = resolveViewActivity(raw);
	if (view) return view;
	if (RAW_URL.test(raw))
		return mode === "images" ? "Memeriksa gambar" : "Memeriksa halaman";
	return ACTIVITY_COPY[raw] ?? null;
}
