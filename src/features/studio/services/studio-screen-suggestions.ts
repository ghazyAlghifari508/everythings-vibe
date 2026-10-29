import type { StudioDesignMode } from "@/features/studio/types/studio-prompts";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";

/**
 * Next-screen suggestions are derived from data the workspace already loaded:
 * the shared blueprint screen plan, the navigation contract, the PRD, and the
 * frames on the canvas. Nothing here calls a model, so opening, panning, or
 * zooming the canvas can never trigger a generation request.
 */

export type StudioSuggestionIntent = "add_screen";

/** One next-screen bubble: compact label, full editable prompt, stable id. */
export interface StudioScreenSuggestion {
	id: string;
	label: string;
	prompt: string;
	intent: StudioSuggestionIntent;
	/** Why this screen was proposed; internal grounding, not decorative copy. */
	reason: string;
}

export interface StudioSuggestionInput {
	projectId: string;
	projectTitle: string;
	designMode: StudioDesignMode;
	/** Bumped whenever the shared blueprint is rewritten. */
	designBlueprintVersion: number;
	prdContent: string | null;
	prdContentHash: string | null;
	blueprint: StudioDesignBlueprint | null;
	frameNames: readonly string[];
	/** Frame descriptions hold the prompt that asked for each screen. */
	frameDescriptions?: readonly string[];
}

export const STUDIO_SCREEN_SUGGESTION_LIMIT = 4;
export const STUDIO_SUGGESTION_CACHE_LIMIT = 8;

const FOCUS = {
	profile:
		"Tampilkan identitas pengguna, ringkasan aktivitas, serta aksi mengubah data dan keluar.",
	settings:
		"Tampilkan preferensi aplikasi dalam grup yang jelas dengan kontrol simpan dan umpan balik.",
	notifications:
		"Tampilkan daftar pemberitahuan dengan status baca, waktu, dan state kosong.",
	activity:
		"Tampilkan jejak aktivitas terbaru dengan waktu, pelaku, dan detail perubahan.",
} as const;

interface StudioScreenRecipe {
	name: string;
	/** Omitted recipes apply to both platforms. */
	platforms?: readonly StudioDesignMode[];
	triggers: RegExp;
	focus: string;
}

/**
 * Domain capability lexicon, not a fixed carousel: a recipe only becomes a
 * suggestion when the project's own PRD mentions it, so unrelated projects
 * never share the same list.
 */
const SCREEN_RECIPES: readonly StudioScreenRecipe[] = [
	{
		name: "Catat Transaksi",
		triggers: /\b(transaksi|pemasukan|pengeluaran|pencatatan)\b/i,
		focus:
			"Sediakan formulir pencatatan dengan nominal, tanggal, kategori, sumber dana, catatan, dan daftar transaksi terbaru.",
	},
	{
		name: "Anggaran",
		triggers: /\b(anggaran|budget|batas pengeluaran)\b/i,
		focus:
			"Tampilkan daftar kategori anggaran dengan batas, realisasi, progres pemakaian, serta aksi mengubah batas.",
	},
	{
		name: "Laporan",
		triggers: /\b(laporan|report|analitik|analytics)\b/i,
		focus:
			"Tampilkan ringkasan periode, angka utama, grafik tren, rincian per kategori, dan aksi ekspor.",
	},
	{
		name: "Katalog",
		triggers: /\b(katalog|catalog|menu|produk)\b/i,
		focus:
			"Tampilkan daftar item dengan gambar, harga, kategori, pencarian, serta aksi membuka detail.",
	},
	{
		name: "Keranjang",
		triggers: /\b(keranjang|cart|belanja)\b/i,
		focus:
			"Tampilkan item terpilih dengan pengatur jumlah, subtotal, dan state kosong.",
	},
	{
		name: "Pembayaran",
		triggers: /\b(checkout|pembayaran|payment|bayar)\b/i,
		focus:
			"Tampilkan ringkasan pesanan, pilihan metode pembayaran, validasi input, dan status proses.",
	},
	{
		name: "Pesanan",
		triggers: /\b(pesanan|order|pengiriman|pelacakan|tracking)\b/i,
		focus:
			"Tampilkan status pesanan, riwayat perubahan status, estimasi, dan aksi tindak lanjut.",
	},
	{
		name: "Stok",
		triggers: /\b(stok|inventori|inventory|persediaan)\b/i,
		focus:
			"Tampilkan tabel stok per item, level minimum, peringatan menipis, dan aksi penyesuaian.",
	},
	{
		name: "Pelanggan",
		triggers: /\b(pelanggan|customer|klien|member)\b/i,
		focus:
			"Tampilkan daftar pelanggan dengan pencarian, status, nilai transaksi, dan aksi membuka detail.",
	},
	{
		name: "Jadwal",
		triggers: /\b(jadwal|kalender|calendar|booking|reservasi)\b/i,
		focus:
			"Tampilkan kalender dengan slot tersedia, detail jadwal, dan aksi memilih waktu.",
	},
	{
		name: "Profil",
		triggers: /\b(profil|profile|akun|account)\b/i,
		focus: FOCUS.profile,
	},
	{
		name: "Pengaturan",
		triggers: /\b(pengaturan|setting|preferensi|preference)\b/i,
		focus: FOCUS.settings,
	},
	{
		name: "Notifikasi",
		platforms: ["mobile"],
		triggers: /\b(notifikasi|notification|pemberitahuan)\b/i,
		focus: FOCUS.notifications,
	},
	{
		name: "Aktivitas",
		platforms: ["web"],
		triggers: /\b(aktivitas|activity|audit log)\b/i,
		focus: FOCUS.activity,
	},
	{
		name: "Masuk",
		triggers: /\b(masuk|login|daftar akun|register|sign in|sign up)\b/i,
		focus:
			"Tampilkan formulir masuk dengan validasi, lupa kata sandi, dan pilihan metode autentikasi.",
	},
];

const PLATFORM_FALLBACK: Record<
	StudioDesignMode,
	readonly { name: string; focus: string }[]
> = {
	mobile: [
		{ name: "Profil", focus: FOCUS.profile },
		{ name: "Pengaturan", focus: FOCUS.settings },
		{ name: "Notifikasi", focus: FOCUS.notifications },
	],
	web: [
		{ name: "Profil", focus: FOCUS.profile },
		{ name: "Pengaturan", focus: FOCUS.settings },
		{ name: "Aktivitas", focus: FOCUS.activity },
	],
};

const GENERIC_FOCUS =
	"Tampilkan konten utama layar ini lengkap dengan data, state kosong, dan aksi utamanya.";

export function normalizeStudioScreenName(raw: string): string {
	return raw
		.toLowerCase()
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

function tokensOf(raw: string): string[] {
	const normalized = normalizeStudioScreenName(raw);
	return normalized ? normalized.split(" ") : [];
}

/**
 * Two names describe the same screen when one token set contains the other, so
 * "Riwayat" is not proposed next to an existing "Riwayat Transaksi" and
 * "Transaksi" is not proposed next to "Catat Transaksi".
 */
function isSameScreen(a: readonly string[], b: readonly string[]): boolean {
	if (a.length === 0 || b.length === 0) return false;
	const shared = a.filter((token) => b.includes(token)).length;
	return shared > 0 && (shared === a.length || shared === b.length);
}

function cleanScreenName(raw: string): string {
	return raw.replace(/\s+/g, " ").trim().slice(0, 60);
}

function sentence(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return GENERIC_FOCUS;
	return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function formatTarget(projectTitle: string): string {
	const title = projectTitle.trim();
	return title ? ` untuk ${title}` : "";
}

function buildPrompt(
	input: StudioSuggestionInput,
	name: string,
	focus: string,
) {
	return [
		`Buat satu halaman ${name}${formatTarget(input.projectTitle)}.`,
		sentence(focus),
		"Ikuti desain, navigasi, dan komponen aplikasi yang sudah ada.",
		"Jangan mengubah halaman lain.",
	].join(" ");
}

function suggestionId(name: string): string {
	return `add-screen:${normalizeStudioScreenName(name).replace(/\s+/g, "-")}`;
}

/** FNV-1a over the joined history keeps the revision key short. */
function hashText(value: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16);
}

interface SuggestionCandidate {
	name: string;
	focus: string;
	reason: string;
}

function collectCandidates(
	input: StudioSuggestionInput,
): SuggestionCandidate[] {
	const candidates: SuggestionCandidate[] = [];
	const blueprint = input.blueprint;

	if (blueprint) {
		for (const screen of [...blueprint.screenPlan].sort(
			(a, b) => a.order - b.order,
		))
			candidates.push({
				name: screen.name,
				focus: screen.role,
				reason: "Rencana layar blueprint belum ada di canvas",
			});
		for (const label of blueprint.navigationContract.labels)
			candidates.push({
				name: label,
				focus: GENERIC_FOCUS,
				reason: "Destinasi navigasi belum punya layar",
			});
	}

	const prd = input.prdContent ?? "";
	const previousRequests = (input.frameDescriptions ?? []).join("\n");
	const pushRecipeMatches = (text: string, reason: (hit: string) => string) => {
		if (!text.trim()) return;
		for (const recipe of SCREEN_RECIPES) {
			if (recipe.platforms && !recipe.platforms.includes(input.designMode))
				continue;
			const hit = text.match(recipe.triggers)?.[0];
			if (!hit) continue;
			candidates.push({
				name: recipe.name,
				focus: recipe.focus,
				reason: reason(hit.toLowerCase()),
			});
		}
	};
	pushRecipeMatches(prd, (hit) => `PRD menyebut "${hit}"`);
	pushRecipeMatches(
		previousRequests,
		(hit) => `Permintaan halaman sebelumnya menyebut "${hit}"`,
	);

	for (const fallback of PLATFORM_FALLBACK[input.designMode])
		candidates.push({
			...fallback,
			reason: "Layar dasar yang belum ada di canvas",
		});

	return candidates;
}

export function deriveStudioScreenSuggestions(
	input: StudioSuggestionInput,
): StudioScreenSuggestion[] {
	const taken = input.frameNames.map(tokensOf).filter((t) => t.length > 0);
	const suggestions: StudioScreenSuggestion[] = [];

	for (const candidate of collectCandidates(input)) {
		if (suggestions.length >= STUDIO_SCREEN_SUGGESTION_LIMIT) break;
		const name = cleanScreenName(candidate.name);
		const tokens = tokensOf(name);
		if (tokens.length === 0) continue;
		if (taken.some((existing) => isSameScreen(tokens, existing))) continue;
		if (
			suggestions.some((entry) => isSameScreen(tokens, tokensOf(entry.label)))
		)
			continue;
		taken.push(tokens);
		suggestions.push({
			// The label already carries "Buat", so the id keys off the screen name.
			id: suggestionId(name),
			label: `Buat ${name}`,
			prompt: buildPrompt(input, name, candidate.focus),
			intent: "add_screen",
			reason: candidate.reason,
		});
	}

	return suggestions;
}

/**
 * Stable project-content revision. Frame names carry add/rename/delete, so the
 * key changes with the canvas; the PRD hash and blueprint version cover plan
 * edits without re-reading the documents.
 */
export function studioSuggestionRevision(input: StudioSuggestionInput): string {
	return [
		input.projectId,
		input.designMode,
		input.designBlueprintVersion,
		input.prdContentHash ?? `len-${input.prdContent?.length ?? 0}`,
		normalizeStudioScreenName(input.projectTitle),
		input.frameNames.map(normalizeStudioScreenName).join("|"),
		hashText((input.frameDescriptions ?? []).join("\n")),
	].join("::");
}

// Keyed by revision, which already contains the project id, so a shared SSR
// module cache can never return another project's suggestions.
const suggestionCache = new Map<string, StudioScreenSuggestion[]>();

/**
 * Revision cache: identical project content returns the same array instance, so
 * a status poll or a re-render never recomputes and never re-renders the row.
 */
export function getStudioScreenSuggestions(
	input: StudioSuggestionInput,
): StudioScreenSuggestion[] {
	const revision = studioSuggestionRevision(input);
	const cached = suggestionCache.get(revision);
	if (cached) return cached;
	const suggestions = deriveStudioScreenSuggestions(input);
	if (suggestionCache.size >= STUDIO_SUGGESTION_CACHE_LIMIT) {
		const oldest = suggestionCache.keys().next();
		if (!oldest.done) suggestionCache.delete(oldest.value);
	}
	suggestionCache.set(revision, suggestions);
	return suggestions;
}
