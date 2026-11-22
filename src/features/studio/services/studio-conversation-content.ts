import type { StudioMessageProgress } from "../types/studio-conversation";
import { STUDIO_ADD_FRAME_PLACEHOLDER_NAME } from "./studio-composer-intent";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";

type BlueprintScreen = StudioDesignBlueprint["screenPlan"][number];

const SCREEN_TEXT_LIMIT = 220;
const DIRECTION_LIMIT = 240;
const REQUEST_QUOTE_LIMIT = 140;

/** Model- and user-authored text is placed inline in Markdown, so strip syntax that could restructure it. */
function plain(value: string, limit?: number): string {
	const text = value
		.replace(/[*_`<>[\]]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	return limit && text.length > limit
		? `${text.slice(0, limit - 1).trimEnd()}…`
		: text;
}

function sentence(value: string): string {
	return /[.!?…]$/.test(value) ? value : `${value}.`;
}

function bold(names: readonly string[]): string {
	return names.map((name) => `**${plain(name)}**`).join(", ");
}

function failureLine(progress: StudioMessageProgress): string {
	if (progress.recovery === "planning")
		return "Rencana layar belum berhasil disusun. Pulihkan perencanaan di canvas.";
	const hint =
		progress.recovery === "resubmit"
			? "Versi sebelumnya tetap tersimpan. Pilih layar terbaru lalu kirim ulang instruksi."
			: progress.ready > 0
				? "Pulihkan dari canvas; layar yang sudah selesai tetap tersedia."
				: "Pulihkan dari canvas.";
	if (progress.phase !== "partial")
		return `Permintaan belum berhasil diproses. ${hint}`;
	const missing = progress.failedScreens?.length
		? bold(progress.failedScreens)
		: `${Math.max(progress.failed, progress.total - progress.ready)} layar`;
	return `${missing} belum berhasil diproses. ${hint}`;
}

function deferredBlock(progress: StudioMessageProgress): string[] {
	if (!progress.deferred?.length) return [];
	return [
		`**Belum tercakup di batch awal**\n\n${progress.deferred.map((item) => `- ${plain(item)}`).join("\n")}\n\nMinta layar tambahan lewat chat.`,
	];
}

function navigationSentence(screens: readonly BlueprintScreen[]) {
	const primary = screens
		.filter((screen) => screen.navigationRole === "primary")
		.map((screen) => screen.name);
	const contextual = screens
		.filter((screen) => screen.navigationRole === "contextual")
		.map((screen) => screen.name);
	if (primary.length > 1 && contextual.length)
		return `Navigasi utama menghubungkan ${bold(primary)}, sedangkan ${bold(contextual)} memakai navigasi kontekstual dari halaman induknya.`;
	if (primary.length > 1)
		return `Navigasi utama menghubungkan ${bold(primary)}.`;
	if (contextual.length)
		return `${bold(contextual)} memakai navigasi kontekstual dari halaman induknya.`;
	return null;
}

function screenPurpose(entry: BlueprintScreen | undefined): string | null {
	return entry
		? plain(entry.composition?.primaryTask ?? entry.role, SCREEN_TEXT_LIMIT)
		: null;
}

function initialPlan(
	progress: StudioMessageProgress,
	blueprint: StudioDesignBlueprint | null | undefined,
): string[] {
	if (!progress.screenNames.length) return [];
	const identity = blueprint?.productIdentity;
	if (!blueprint || !identity)
		return [
			`**Layar yang dirancang**\n\n${progress.screenNames.map((name) => `- ${plain(name)}`).join("\n")}`,
		];
	const rationale = blueprint.initialScope?.rationale;
	const intro = `Saya merancang **${plain(identity.productName)}** untuk ${plain(identity.targetAudience)}.${rationale ? ` ${sentence(plain(rationale))}` : ""}`;
	const entries = progress.screenNames.map((name) => ({
		name,
		entry: blueprint.screenPlan.find((screen) => screen.name === name),
	}));
	const list = entries
		.map(({ name, entry }) => {
			const purpose = screenPurpose(entry);
			return purpose
				? `- **${plain(name)}:** ${purpose}`
				: `- **${plain(name)}**`;
		})
		.join("\n");
	const known = entries.flatMap(({ entry }) => (entry ? [entry] : []));
	return [
		intro,
		`**Arah visual:** ${sentence(plain(identity.visualDirection, DIRECTION_LIMIT))}`,
		`**Alur utama desain**\n\n${list}`,
		...[navigationSentence(known)].flatMap((line) => (line ? [line] : [])),
	];
}

function addedScreen(
	name: string,
	blueprint: StudioDesignBlueprint | null | undefined,
): string {
	const entry = blueprint?.screenPlan.find((screen) => screen.name === name);
	if (!blueprint || !entry) return "";
	const contract = blueprint.navigationContract;
	const parent = entry.parentDestinationId
		? contract.labels[contract.destinations.indexOf(entry.parentDestinationId)]
		: undefined;
	const siblings = blueprint.screenPlan
		.filter(
			(screen) => screen.name !== name && screen.navigationRole === "primary",
		)
		.map((screen) => screen.name);
	const relation =
		entry.navigationRole === "contextual" && parent
			? `Layar ini terhubung dari **${plain(parent)}**.`
			: entry.navigationRole === "primary" && siblings.length
				? `Layar ini masuk ke navigasi utama bersama ${bold(siblings)}.`
				: "";
	return [sentence(screenPurpose(entry) ?? ""), relation]
		.filter((part) => part && part !== ".")
		.join(" ");
}

function addBody(
	progress: StudioMessageProgress,
	blueprint: StudioDesignBlueprint | null | undefined,
): string[] {
	const names = progress.screenNames.filter(
		(name) => name !== STUDIO_ADD_FRAME_PLACEHOLDER_NAME,
	);
	const product = blueprint?.productIdentity.productName;
	const target = product ? ` **${plain(product)}**` : " proyek ini";
	if (!names.length) return [`Menyiapkan layar baru untuk${target}.`];
	const lead =
		progress.phase === "completed"
			? `${bold(names)} sudah ditambahkan ke${target}.`
			: `Menyiapkan ${bold(names)} untuk${target}.`;
	const details = names.map((name) => ({
		name,
		text: addedScreen(name, blueprint),
	}));
	if (names.length === 1) return [lead, details[0].text].filter(Boolean);
	const list = details
		.filter(({ text }) => text)
		.map(({ name, text }) => `- **${plain(name)}:** ${text}`)
		.join("\n");
	return list ? [lead, list] : [lead];
}

function reviseBody(progress: StudioMessageProgress, request: string) {
	const quote = request.trim()
		? [`Perubahan yang diminta: “${plain(request, REQUEST_QUOTE_LIMIT)}”`]
		: [];
	const names = bold(progress.screenNames);
	if (progress.phase === "failed") return quote;
	if (progress.phase === "completed")
		return [...quote, `Revisi pada ${names} sudah diterapkan.`];
	if (progress.phase === "partial")
		return [...quote, "Sebagian revisi sudah diterapkan."];
	return [...quote, `Menerapkan revisi pada ${names}.`];
}

/**
 * Builds the assistant turn from persisted facts only: the blueprint the existing
 * planning response already produced, the job outcome and the real frame results.
 * It never calls a model and never describes anything the data does not contain.
 */
export function composeStudioAssistantContent(input: {
	progress: StudioMessageProgress;
	blueprint: StudioDesignBlueprint | null | undefined;
	request: string;
}): string {
	const { progress, blueprint, request } = input;
	const kind = progress.kind ?? "initial";
	if (progress.phase === "planning")
		return "Menyusun rencana layar dari brief Anda.";
	if (progress.phase === "queued" && !progress.screenNames.length)
		return "Permintaan diterima. Perancangan dimulai begitu giliran tiba; pekerjaan lain yang sedang berjalan tetap dilanjutkan.";
	if (progress.phase === "failed")
		return [
			...(kind === "revise" ? reviseBody(progress, request) : []),
			failureLine(progress),
		].join("\n\n");
	const body =
		kind === "initial"
			? initialPlan(progress, blueprint)
			: kind === "add"
				? addBody(progress, blueprint)
				: reviseBody(progress, request);
	const tail =
		progress.phase === "partial"
			? [failureLine(progress)]
			: progress.phase === "completed"
				? []
				: [
						kind === "revise"
							? "Hasil revisi tampil di canvas begitu selesai."
							: "Layar muncul di canvas begitu selesai dibuat.",
					];
	return [
		...body,
		...(kind === "initial" ? deferredBlock(progress) : []),
		...tail,
	].join("\n\n");
}
