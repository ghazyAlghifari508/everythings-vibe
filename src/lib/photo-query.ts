/**
 * Provider search queries are not prose. Both approved providers rank a short
 * subject phrase higher than a sentence describing the desired composition;
 * a verbose query such as "Labuan Bajo Padar Island landscape Indonesia"
 * returned zero Openverse results while "Labuan Bajo" returned 178.
 *
 * This is search-term normalization, not design guidance: it never decides
 * whether a photograph belongs on a screen or what the layout looks like.
 */
const STOP_TERMS = new Set([
	"photo",
	"photos",
	"foto",
	"gambar",
	"image",
	"images",
	"photograph",
	"photography",
	"landscape",
	"scenery",
	"pemandangan",
	"background",
	"wallpaper",
	"stock",
	"public",
	"subject",
	"view",
	"resolution",
	"high",
	"free",
	"with",
	"from",
	"about",
	"using",
]);

export function normalizePhotoQuery(raw: string): string {
	const terms = raw
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s-]/gu, " ")
		.split(/\s+/)
		.filter((term) => term.length >= 3 && !STOP_TERMS.has(term));
	return [...new Set(terms)].slice(0, 2).join(" ");
}
