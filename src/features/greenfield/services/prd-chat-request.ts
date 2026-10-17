/**
 * Request contract for `POST /api/chat` (PRD chat/generate/revise/resume).
 *
 * The body arrives untrusted, so every field is narrowed here instead of being
 * cast: bounds mirror the documented home-prompt contract, and partialContent
 * (persisted into PRD versions on resume) allows a full document.
 */
import {
	MAX_PREFERENCES_CHARS,
	MAX_PROMPT_LENGTH,
	MAX_RESUME_CONTENT_CHARS,
} from "@/lib/constants";

export type PrdChatMode = "chat" | "generate" | "revise" | "resume";

const PRD_CHAT_MODES: readonly PrdChatMode[] = [
	"chat",
	"generate",
	"revise",
	"resume",
];

export interface PrdChatRequest {
	message: string;
	displayMessage?: string;
	conversationId?: string;
	projectId?: string;
	mode: PrdChatMode;
	partialContent?: string;
	preferences: Record<string, unknown> | null;
	selectedVersionNum?: number;
	idempotencyKey?: string;
	attempt?: number;
	/**
	 * The user was shown the revision's impact on existing tasks and confirmed
	 * it. Without this the PRD lock still applies, so a revision can never
	 * change a locked document silently.
	 */
	confirmedImpact?: boolean;
}

export type PrdChatRequestResult =
	| { ok: true; data: PrdChatRequest }
	| { ok: false; response: Response };

function invalid(message: string): PrdChatRequestResult {
	return {
		ok: false,
		response: Response.json({ error: message }, { status: 400 }),
	};
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isSafeInteger(value)
		? value
		: undefined;
}

function asMode(value: unknown): PrdChatMode {
	return PRD_CHAT_MODES.find((mode) => mode === value) ?? "chat";
}

/** Narrow an untrusted JSON value to a plain object (arrays/null rejected). */
function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	return Object.fromEntries(Object.entries(value));
}

export async function parsePrdChatRequest(
	request: Request,
): Promise<PrdChatRequestResult> {
	const body = asRecord(await request.json());
	if (!body) return invalid("Message is required");

	const message = optionalString(body.message);
	if (!message?.trim()) return invalid("Message is required");
	if (message.length > MAX_PROMPT_LENGTH) {
		return invalid(
			`Message terlalu panjang (maksimal ${MAX_PROMPT_LENGTH} karakter).`,
		);
	}

	const partialContent = body.partialContent;
	if (
		partialContent !== undefined &&
		(typeof partialContent !== "string" ||
			partialContent.length > MAX_RESUME_CONTENT_CHARS)
	)
		return invalid("Konten resume tidak valid.");

	const rawPreferences = body.preferences;
	if (
		rawPreferences !== undefined &&
		(typeof rawPreferences !== "object" ||
			rawPreferences === null ||
			JSON.stringify(rawPreferences).length > MAX_PREFERENCES_CHARS)
	)
		return invalid("Preferences tidak valid.");

	return {
		ok: true,
		data: {
			message,
			displayMessage: optionalString(body.displayMessage),
			conversationId: optionalString(body.conversationId),
			projectId: optionalString(body.projectId),
			mode: asMode(body.mode),
			partialContent:
				typeof partialContent === "string" ? partialContent : undefined,
			preferences: asRecord(rawPreferences),
			selectedVersionNum: optionalNumber(body.selectedVersionNum),
			idempotencyKey: optionalString(body.idempotencyKey),
			attempt: optionalNumber(body.attempt),
			confirmedImpact: body.confirmedImpact === true,
		},
	};
}
