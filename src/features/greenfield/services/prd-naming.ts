/**
 * Project naming heuristics: derive a human-readable project name from the
 * user's raw prompt, synchronously (regex) at project creation and with AI
 * quality later in the chat SSE stream.
 *
 * Pure module — the AI call is a lazy dynamic import so this file stays
 * importable from anywhere without pulling the client in.
 */

/**
 * Filler words dropped before the fallback tail-word heuristic. Indonesian +
 * English prompt scaffolding, plus domain nouns that describe the artefact
 * rather than the product ("aplikasi", "app", "prd", "dokumen").
 */
const PROJECT_NAME_FILLERS = [
	"tolong",
	"coba",
	"bantu",
	"harap",
	"buatkan",
	"bikin",
	"generate",
	"tuliskan",
	"buat",
	"bikinin",
	"dong",
	"ya",
	"yaa",
	"gw",
	"saya",
	"kami",
	"aku",
	"gue",
	"sebuah",
	"satu",
	"suatu",
	"itu",
	"ini",
	"prd",
	"dokumen",
	"file",
	"untuk",
	"tentang",
	"dengan",
	"yang",
	"dan",
	"atau",
	"serta",
	"dari",
	"ke",
	"di",
	"pada",
	"adalah",
	"akan",
	"bisa",
	"juga",
	"the",
	"a",
	"an",
	"of",
	"and",
	"or",
	"for",
	"to",
	"in",
	"on",
	"with",
	"that",
	"this",
	"is",
	"are",
	"was",
	"be",
	"has",
	"have",
	"its",
	"it",
	"by",
	"from",
	"but",
	"not",
	"no",
	"so",
	"if",
	"membuat",
	"membangun",
	"menggunakan",
	"ada",
	"aplikasi",
	"website",
	"platform",
	"sistem",
	"web",
	"app",
	"apps",
	"mobile",
	"desktop",
	"software",
	"project",
	"proyek",
	"baru",
	"simple",
	"basic",
	"lengkap",
	"sederhana",
	"modern",
];

/**
 * Strip known PRD prompt boilerplate so name heuristics see only user content.
 * Compiled ask-flow prompts carry the raw idea followed by preference blocks
 * (`--- Preferensi ... ---`) whose trailing lines (e.g. `Deployment: Biarkan
 * AI yang memilih`) otherwise hijack the fallback tail-word heuristic.
 */
function stripPrdBoilerplate(message: string): string {
	let cleanMsg = message;
	cleanMsg = cleanMsg.replace(
		/Generate PRD lengkap berdasarkan informasi berikut:\s*/gi,
		"",
	);
	cleanMsg = cleanMsg.replace(
		/\s*Gunakan section markers sesuai standar./gi,
		"",
	);
	cleanMsg = cleanMsg.replace(
		/^Tolong buatkan PRD dengan spesifikasi berikut:\s*/im,
		"",
	);
	cleanMsg = cleanMsg.replace(
		/^Please generate a PRD with the following specifications:\s*/im,
		"",
	);
	cleanMsg = cleanMsg.replace(/\[Platform:.*?\]\s*/gi, "");
	const preferenceHeader = cleanMsg.match(
		/^\s*-{3,}\s*(?:Preferensi|Non-?Teknis|Non-?Technical|Technical)/im,
	);
	if (preferenceHeader?.index !== undefined) {
		cleanMsg = cleanMsg.slice(0, preferenceHeader.index);
	}
	cleanMsg = cleanMsg.replace(
		/^\s*(?:Frontend|Backend|Fullstack Framework|Database|Deployment)\s*:.*$/gim,
		"",
	);
	return cleanMsg.trim();
}

/**
 * Single source of truth for explicit product-name patterns (quoted name,
 * bernama/dinamakan/named/called X, CamelCase brand token). Shared by
 * deriveProjectNameSync and hasExplicitProductName so both accept exactly the
 * same captures.
 */
function findExplicitProductName(
	message: string,
): { explicit: string; isCamelToken: boolean } | null {
	const cleanMsg = stripPrdBoilerplate(message);

	// ponytail: explicit product-name beats word-salad heuristics.
	// 1) "Quoted name" (straight or typographic quotes)
	const quoted = cleanMsg.match(
		/["\u201C\u201D\u2018\u2019]([\w][\w .&-]{1,39})["\u201C\u201D\u2018\u2019]/,
	);
	// 2) bernama/dinamakan/named/called X
	const named = cleanMsg.match(
		/\b(?:bernama|dinamakan|dengan\s+nama|named|called)\s+([A-Za-z][\w-]{1,39})/i,
	);
	// 3) CamelCase brand token (HabitFlow, NovaPay) — min 2 humps
	const camel = cleanMsg.match(/\b([A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+)\b/);

	const explicit = quoted?.[1]?.trim() ?? named?.[1] ?? camel?.[1];
	if (!explicit || explicit.replace(/\s/g, "").length < 3) return null;
	return {
		explicit,
		isCamelToken: explicit === camel?.[1] && !/\s/.test(explicit),
	};
}

/**
 * True iff the user's message contains an EXPLICIT product-name pattern
 * (quoted name / bernama-X / CamelCase token). When true, the user gave an
 * intentional name — the async AI rename must not override it.
 */
export function hasExplicitProductName(message: string): boolean {
	return findExplicitProductName(message) !== null;
}

/**
 * Regex-only fallback: strip filler words and keep the last meaningful words.
 * Shared by the sync and async paths so both degrade identically when the
 * model is unavailable.
 */
function deriveNameFromFallback(message: string): string {
	let fallback = message.replace(/\[.*?\]\s*/g, "");
	const fillerRegex = new RegExp(
		`\\b(?:${PROJECT_NAME_FILLERS.join("|")})\\b`,
		"gi",
	);
	fallback = fallback
		.replace(fillerRegex, "")
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	if (fallback.length < 2) return "Project Baru";
	const words = fallback.split(" ").filter((w) => w.length > 1);
	if (words.length === 0) return "Project Baru";
	const tail = words.slice(-4);
	return (
		tail.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") ||
		"Project Baru"
	);
}

/**
 * Synchronous regex-only project name derivation.
 * Instant, no AI call. Used at project creation for speed.
 * AI-quality name comes later via deriveProjectName() in chat.ts SSE stream.
 */
export function deriveProjectNameSync(message: string): string {
	const match = findExplicitProductName(message);
	if (match) {
		const { explicit, isCamelToken } = match;
		const titled = isCamelToken
			? explicit
			: explicit
					.split(/\s+/)
					.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
					.join(" ");
		return titled.slice(0, 40).trim();
	}
	return deriveNameFromFallback(stripPrdBoilerplate(message));
}

/**
 * Derive a human-readable project name from the user's raw prompt.
 * Uses AI to extract the core app concept, with regex fallback if AI fails.
 */
export async function deriveProjectName(message: string): Promise<string> {
	// Reuse the same boilerplate cut as the sync path so the AI never sees the
	// compiled preference blocks (Deployment/Database lines) as the idea.
	const cleanMsg = stripPrdBoilerplate(message);

	// AI path: ask model to extract a short project title
	try {
		const { completeChat } = await import("@/lib/ai-client");
		const title = await completeChat(
			[
				{
					role: "system",
					content:
						"Extract a short project/app name (2-5 words) from the user's prompt. " +
						"Return ONLY the name, nothing else. No quotes, no punctuation, no explanation. " +
						"Use Title Case. Examples: 'Padel Booking', 'Kasir POS', 'LMS Gamifikasi', 'E-Commerce Marketplace'.",
				},
				{ role: "user", content: cleanMsg },
			],
			"oc/big-pickle",
		);
		const cleaned = title
			.trim()
			.replace(/^["']|["']$/g, "")
			.replace(/\.$/, "");
		if (cleaned.length >= 2 && cleaned.length <= 60) return cleaned;
	} catch {
		// Fall through to regex fallback
	}

	return deriveNameFromFallback(cleanMsg);
}
