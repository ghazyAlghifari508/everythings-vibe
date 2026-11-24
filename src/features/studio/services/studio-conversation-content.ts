import type {
	StudioMessageFrame,
	StudioMessageProgress,
} from "../types/studio-conversation";
import { STUDIO_ADD_FRAME_PLACEHOLDER_NAME } from "./studio-composer-intent";
import {
	bold,
	hasInteractiveFacts,
	observedItems,
	PROTOTYPE_LIMITATION,
	plain,
	quoted,
	sentence,
} from "./studio-conversation-text";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";

type BlueprintScreen = StudioDesignBlueprint["screenPlan"][number];

const SCREEN_TEXT_LIMIT = 220;
const DIRECTION_LIMIT = 240;
const REQUEST_QUOTE_LIMIT = 140;

function failureLine(progress: StudioMessageProgress): string {
	if (progress.recovery === "planning")
		return "Brief belum berhasil diubah menjadi daftar layar. Pulihkan dari canvas.";
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

function blueprintEntry(
	blueprint: StudioDesignBlueprint | null | undefined,
	name: string,
) {
	return blueprint?.screenPlan.find((screen) => screen.name === name);
}

/** Frames this turn reports on; rows written before frame results existed fall back to names. */
function reportedScreens(
	progress: StudioMessageProgress,
): StudioMessageFrame[] {
	if (progress.frames) return progress.frames;
	const failed = new Set(progress.failedScreens ?? []);
	return progress.screenNames
		.filter((name) => name !== STUDIO_ADD_FRAME_PLACEHOLDER_NAME)
		.map((name, index) => ({
			frameId: `legacy-${index}`,
			name,
			viewport: "web" as const,
			revision: 0,
			status: failed.has(name)
				? ("failed" as const)
				: progress.phase === "completed"
					? ("ready" as const)
					: ("pending" as const),
		}));
}

function describeScreen(
	screen: StudioMessageFrame,
	blueprint: StudioDesignBlueprint | null | undefined,
): string {
	const purpose = screenPurpose(blueprintEntry(blueprint, screen.name));
	const observed = observedItems(screen.facts);
	const lines = [
		`- **${plain(screen.name)}**${purpose ? `: ${sentence(purpose)}` : ""}`,
	];
	if (observed.length)
		lines.push(`  - Terlihat di layar: ${observed.join("; ")}.`);
	return lines.join("\n");
}

function limitationBlock(screens: readonly StudioMessageFrame[]): string[] {
	return screens.some((screen) => hasInteractiveFacts(screen.facts))
		? [PROTOTYPE_LIMITATION]
		: [];
}

function initialBody(
	progress: StudioMessageProgress,
	blueprint: StudioDesignBlueprint | null | undefined,
	ready: readonly StudioMessageFrame[],
): string[] {
	if (!ready.length) return [];
	const identity = blueprint?.productIdentity;
	if (!blueprint || !identity)
		return [
			`**Layar yang dibuat**\n\n${ready.map((screen) => `- **${plain(screen.name)}**`).join("\n")}`,
		];
	const rationale = blueprint.initialScope?.rationale;
	const intro = `**${plain(identity.productName)}** dirancang untuk ${plain(identity.targetAudience)}.${rationale ? ` ${sentence(plain(rationale))}` : ""}`;
	const known = ready.flatMap((screen) => {
		const entry = blueprintEntry(blueprint, screen.name);
		return entry ? [entry] : [];
	});
	const single = ready.length === 1;
	const detail = single
		? [describeScreen(ready[0], blueprint).replace(/^- /, "")]
		: [
				`**Layar yang dibuat**\n\n${ready.map((screen) => describeScreen(screen, blueprint)).join("\n")}`,
			];
	return [
		intro,
		`**Arah visual:** ${sentence(plain(identity.visualDirection, DIRECTION_LIMIT))}`,
		...detail,
		...[navigationSentence(known)].flatMap((line) => (line ? [line] : [])),
		...limitationBlock(ready),
		...deferredBlock(progress),
	];
}

function addedRelation(
	name: string,
	blueprint: StudioDesignBlueprint | null | undefined,
): string {
	const entry = blueprintEntry(blueprint, name);
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
	return entry.navigationRole === "contextual" && parent
		? `Layar ini terhubung dari **${plain(parent)}**.`
		: entry.navigationRole === "primary" && siblings.length
			? `Layar ini masuk ke navigasi utama bersama ${bold(siblings)}.`
			: "";
}

function addBody(
	blueprint: StudioDesignBlueprint | null | undefined,
	ready: readonly StudioMessageFrame[],
): string[] {
	if (!ready.length) return [];
	const product = blueprint?.productIdentity.productName;
	const target = product ? ` **${plain(product)}**` : " proyek ini";
	const lead = `${bold(ready.map((screen) => screen.name))} sudah ditambahkan ke${target}.`;
	const details = ready.map((screen) => {
		const purpose = screenPurpose(blueprintEntry(blueprint, screen.name));
		const relation = addedRelation(screen.name, blueprint);
		const observed = observedItems(screen.facts);
		return {
			name: screen.name,
			text: [purpose ? sentence(purpose) : "", relation]
				.filter(Boolean)
				.join(" "),
			observed,
		};
	});
	const body =
		ready.length === 1
			? [
					details[0].text,
					details[0].observed.length
						? `Terlihat di layar: ${details[0].observed.join("; ")}.`
						: "",
				].filter(Boolean)
			: [
					details
						.map(({ name, text, observed }) =>
							[
								`- **${plain(name)}**${text ? `: ${text}` : ""}`,
								observed.length
									? `  - Terlihat di layar: ${observed.join("; ")}.`
									: "",
							]
								.filter(Boolean)
								.join("\n"),
						)
						.join("\n"),
				];
	return [lead, ...body, ...limitationBlock(ready)];
}

function changeLine(screen: StudioMessageFrame): string {
	const name = `**${plain(screen.name)}**`;
	const changes = screen.changes;
	if (!changes)
		return `${name} diperbarui. Versi sebelumnya tidak tersedia untuk dibandingkan, jadi detail perubahannya tidak dapat dirinci.`;
	if (changes.kind === "identical")
		return `${name}: hasil revisi identik dengan versi sebelumnya, tidak ada perubahan yang terdeteksi.`;
	if (changes.kind === "markup")
		return `${name}: teks yang tampil tidak berubah; hanya markup atau gaya yang berbeda.`;
	const parts = [
		changes.added.length
			? `teks baru ${quoted(changes.added.slice(0, 3))}`
			: "",
		changes.removed.length
			? `teks yang tidak lagi tampil ${quoted(changes.removed.slice(0, 3))}`
			: "",
	].filter(Boolean);
	return `${name}: ${parts.join("; ")}.`;
}

function reviseBody(
	phase: StudioMessageProgress["phase"],
	request: string,
	ready: readonly StudioMessageFrame[],
): string[] {
	const quote = request.trim()
		? [`Perubahan yang diminta: “${plain(request, REQUEST_QUOTE_LIMIT)}”`]
		: [];
	if (!ready.length) return phase === "failed" ? quote : [];
	const lines = ready.map(changeLine);
	return [
		...quote,
		lines.length === 1
			? lines[0]
			: `**Perubahan yang terdeteksi**\n\n${lines.map((line) => `- ${line}`).join("\n")}`,
	];
}

/**
 * Builds the assistant explanation from persisted facts only: the blueprint the
 * existing planning response already produced, the job outcome and what the
 * committed frame HTML contains. It never calls a model, never describes
 * anything the data lacks, and never narrates status. While nothing explainable
 * exists the content is empty and the conversation shows its own status line,
 * so a progress transition can never replace an authored explanation with a
 * shorter template.
 */
export function composeStudioAssistantContent(input: {
	progress: StudioMessageProgress;
	blueprint: StudioDesignBlueprint | null | undefined;
	request: string;
}): string {
	const { progress, blueprint, request } = input;
	const kind = progress.kind ?? "initial";
	const screens = reportedScreens(progress);
	const ready = screens.filter((screen) => screen.status === "ready");
	const body =
		kind === "initial"
			? initialBody(progress, blueprint, ready)
			: kind === "add"
				? addBody(blueprint, ready)
				: reviseBody(progress.phase, request, ready);
	const failure =
		progress.phase === "failed" || progress.phase === "partial"
			? [failureLine(progress)]
			: [];
	return [...body, ...failure].join("\n\n");
}
