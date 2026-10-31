import type { ScrapeMode } from "@/db/schema";
import type {
	CrawlSettings,
	DesignSettings,
	HtmlSettings,
	ImagesSettings,
} from "@/features/scrape/types/scrape-contract";
import { SCRAPE_LIMITS } from "@/features/scrape/types/scrape-contract";

// Advanced-parameter presentation. Labels describe what each setting actually
// does to the run, in plain Indonesian, while the underlying keys, ranges and
// defaults stay exactly as the backend contract defines them.

// Only the numeric and boolean keys of each settings contract can appear in a
// group, so a spec can never name a key the backend does not accept.
export type NumericParameterKey = "maxPages" | "maxDepth" | "waitMs";

export type ToggleParameterKey =
	| "mainContentOnly"
	| "followSubdomains"
	| "includeLinks"
	| "includeImages"
	| "includeIframes"
	| "measureResolution"
	| "classifyType";

export interface NumericParameterSpec {
	key: NumericParameterKey;
	label: string;
	unit: string;
	helper: string;
	min: number;
	max: number;
	scale?: number;
}

export interface ToggleParameterSpec {
	key: ToggleParameterKey;
	label: string;
	helper: string;
}

export interface AdvancedParameterGroup {
	key: string;
	title: string;
	description: string;
	numbers: NumericParameterSpec[];
	toggles: ToggleParameterSpec[];
	selects?: {
		key: keyof DesignSettings;
		label: string;
		helper: string;
		options: { value: string; label: string }[];
	}[];
}

export type SettingsForMode = {
	design: DesignSettings;
	crawl: CrawlSettings;
	html: HtmlSettings;
	images: ImagesSettings;
};

export type AnyScrapeSettings =
	| DesignSettings
	| CrawlSettings
	| HtmlSettings
	| ImagesSettings;

// Reads a spec's value out of the active settings object. Narrowing on the key
// keeps this type-safe without casting the settings object to a loose record.
export function readNumber(
	settings: AnyScrapeSettings,
	key: NumericParameterKey,
): number {
	if (key === "maxPages") return "maxPages" in settings ? settings.maxPages : 0;
	if (key === "maxDepth") return "maxDepth" in settings ? settings.maxDepth : 0;
	return "waitMs" in settings ? settings.waitMs : 0;
}

export function readToggle(
	settings: AnyScrapeSettings,
	key: ToggleParameterKey,
): boolean {
	switch (key) {
		case "mainContentOnly":
			return "mainContentOnly" in settings ? settings.mainContentOnly : false;
		case "followSubdomains":
			return "followSubdomains" in settings ? settings.followSubdomains : false;
		case "includeLinks":
			return "includeLinks" in settings ? settings.includeLinks : false;
		case "includeImages":
			return "includeImages" in settings ? settings.includeImages : false;
		case "includeIframes":
			return "includeIframes" in settings ? settings.includeIframes : false;
		case "measureResolution":
			return "measureResolution" in settings
				? settings.measureResolution
				: false;
		default:
			return "classifyType" in settings ? settings.classifyType : false;
	}
}

const CRAWL_GROUP: AdvancedParameterGroup = {
	key: "scope",
	title: "Cakupan penelusuran",
	description: "Batasi seberapa jauh crawl menjelajah sebelum berhenti.",
	numbers: [
		{
			key: "maxPages",
			label: "Maksimum halaman",
			unit: "halaman",
			helper: `Termasuk halaman awal. Batas sistem ${SCRAPE_LIMITS.maxPages} halaman.`,
			min: 1,
			max: SCRAPE_LIMITS.maxPages,
		},
		{
			key: "maxDepth",
			label: "Kedalaman penelusuran",
			unit: "level",
			helper: "Atur seberapa jauh crawler mengikuti tautan dari halaman awal.",
			min: 0,
			max: SCRAPE_LIMITS.maxDepth,
		},
	],
	toggles: [
		{
			key: "mainContentOnly",
			label: "Hanya konten utama",
			helper:
				"Lewati navigasi, sidebar, dan footer saat mengekstrak isi halaman.",
		},
		{
			key: "followSubdomains",
			label: "Ikuti subdomain",
			helper: "Izinkan crawl mengunjungi subdomain dari domain yang sama.",
		},
		{
			key: "includeLinks",
			label: "Simpan daftar link",
			helper: "Catat link yang ditemukan pada setiap halaman.",
		},
		{
			key: "includeImages",
			label: "Simpan daftar gambar",
			helper: "Catat gambar yang ditemukan pada setiap halaman.",
		},
	],
};

const HTML_GROUP: AdvancedParameterGroup = {
	key: "capture",
	title: "Pengambilan halaman",
	description: "Atur bagaimana halaman diambil sebelum disimpan.",
	numbers: [
		{
			key: "waitMs",
			label: "Waktu tunggu tambahan",
			unit: "detik",
			helper: `Gunakan jika konten website muncul beberapa saat setelah halaman dibuka. Maksimum ${SCRAPE_LIMITS.waitMs / 1000} detik.`,
			min: 0,
			max: SCRAPE_LIMITS.waitMs / 1000,
			scale: 1000,
		},
	],
	toggles: [
		{
			key: "includeIframes",
			label: "Sertakan konten tertanam",
			helper:
				"Ikutkan konten tambahan dari website yang sama, seperti formulir atau bagian halaman yang ditampilkan terpisah.",
		},
	],
};

const IMAGES_GROUP: AdvancedParameterGroup = {
	key: "images",
	title: "Analisis gambar",
	description: "Tentukan seberapa detail setiap gambar diperiksa.",
	numbers: [
		{
			key: "waitMs",
			label: "Waktu tunggu tambahan",
			unit: "detik",
			helper: `Gunakan jika konten website muncul beberapa saat setelah halaman dibuka. Maksimum ${SCRAPE_LIMITS.waitMs / 1000} detik.`,
			min: 0,
			max: SCRAPE_LIMITS.waitMs / 1000,
			scale: 1000,
		},
	],
	toggles: [
		{
			key: "measureResolution",
			label: "Periksa ukuran asli gambar",
			helper:
				"Catat lebar dan tinggi gambar agar lebih mudah memilih aset yang sesuai.",
		},
		{
			key: "classifyType",
			label: "Kelompokkan ikon dan logo",
			helper:
				"Bantu membedakan ikon dan logo menggunakan informasi yang tersedia pada halaman.",
		},
	],
};

export const ADVANCED_PARAMETER_GROUPS: Record<
	ScrapeMode,
	AdvancedParameterGroup[]
> = {
	design: [
		{
			key: "design",
			title: "Cakupan analisis desain",
			description: `Setiap tampilan diambil bergiliran, maksimum ${SCRAPE_LIMITS.designViews} kombinasi. Lebih banyak tampilan dan analisis mendalam memerlukan pemrosesan lebih lama.`,
			numbers: [],
			toggles: [],
			selects: [
				{
					key: "viewport",
					label: "Tampilan yang dianalisis",
					helper: "Desktop, mobile, atau keduanya pada URL yang sama.",
					options: [
						{ value: "desktop", label: "Desktop" },
						{ value: "mobile", label: "Mobile" },
						{ value: "both", label: "Desktop + Mobile" },
					],
				},
				{
					key: "theme",
					label: "Tema",
					helper:
						"Mengatur preferensi warna browser, bukan tombol tema website. Dukungan tema situs belum tentu tersedia.",
					options: [
						{ value: "auto", label: "Otomatis" },
						{ value: "light", label: "Terang" },
						{ value: "dark", label: "Gelap" },
						{ value: "both", label: "Terang + Gelap" },
					],
				},
				{
					key: "depth",
					label: "Kedalaman analisis",
					helper:
						"Mendalam menggandakan batas sampel elemen, pemindaian DOM, font, dan CSS variables per tampilan.",
					options: [
						{ value: "standard", label: "Standar" },
						{ value: "detailed", label: "Mendalam" },
					],
				},
				{
					key: "focus",
					label: "Fokus analisis",
					helper:
						"Pilih panduan lengkap, token visual tanpa analisis komponen, atau treatment komponen yang teramati.",
					options: [
						{ value: "complete", label: "Lengkap" },
						{ value: "visual-tokens", label: "Token visual" },
						{ value: "components", label: "Komponen" },
					],
				},
				{
					key: "codeReference",
					label: "Format panduan kode",
					helper:
						"Format contoh kode pada DESIGN.md yang diunduh dan diserahkan ke agent.",
					options: [
						{ value: "css", label: "CSS" },
						{ value: "tailwind-v4", label: "Tailwind v4" },
						{ value: "both", label: "CSS + Tailwind v4" },
					],
				},
			],
		},
	],
	crawl: [CRAWL_GROUP],
	html: [HTML_GROUP],
	images: [IMAGES_GROUP],
};

// crawl.urlRegex is free text, so it is described separately from the numeric
// and toggle groups instead of being forced into a shape that does not fit.
export const URL_FILTER_SPEC = {
	key: "urlRegex",
	label: "Filter URL (opsional)",
	helper:
		"Pola regex untuk membatasi URL yang diproses. Halaman awal selalu diproses.",
} as const;

export interface ParameterIssue {
	key: string;
	message: string;
}

// A numeric field is empty or NaN while the user is mid-edit. That is reported
// as an actionable message instead of being silently coerced to 0, and a value
// outside the contract range is named with its real bound.
export function validateNumericParameter(
	spec: NumericParameterSpec,
	raw: number,
): ParameterIssue | null {
	if (!Number.isFinite(raw))
		return {
			key: spec.key,
			message: `${spec.label} harus berupa angka.`,
		};
	if (!Number.isInteger(raw))
		return {
			key: spec.key,
			message: `${spec.label} harus berupa angka bulat.`,
		};
	if (raw < spec.min || raw > spec.max)
		return {
			key: spec.key,
			message: `${spec.label} harus antara ${spec.min} dan ${spec.max} ${spec.unit}.`,
		};
	return null;
}

export function toDisplayValue(
	spec: NumericParameterSpec,
	internalValue: number,
): number {
	if (!Number.isFinite(internalValue)) return internalValue;
	return spec.scale ? Math.round(internalValue / spec.scale) : internalValue;
}

export function fromDisplayValue(
	spec: NumericParameterSpec,
	displayValue: number,
): number {
	if (!Number.isFinite(displayValue)) return displayValue;
	return spec.scale ? Math.round(displayValue * spec.scale) : displayValue;
}

export function validateParameterGroup(
	group: AdvancedParameterGroup,
	settings: AnyScrapeSettings,
): ParameterIssue[] {
	return group.numbers.flatMap((spec) => {
		const internal = readNumber(settings, spec.key);
		const display = toDisplayValue(spec, internal);
		const issue = validateNumericParameter(spec, display);
		return issue ? [issue] : [];
	});
}
