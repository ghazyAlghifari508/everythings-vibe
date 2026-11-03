import {
	FEEDBACK_MAX_MESSAGE_CHARS,
	FEEDBACK_TYPES,
} from "@/features/auth-settings/types/settings-constants";

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export interface FeedbackPayload {
	message: string;
	type: FeedbackType;
}

export const FEEDBACK_SUCCESS_MESSAGES: Record<FeedbackType, string> = {
	general:
		"Masukan berhasil dikirim. Terima kasih sudah membantu kami meningkatkan everythings-vibe.",
	bug: "Laporan bug berhasil dikirim. Laporanmu sudah tercatat dan dapat ditinjau oleh tim.",
	feature:
		"Usulan fitur berhasil dikirim. Masukanmu sudah tercatat untuk dipertimbangkan.",
};

export const FEEDBACK_DEFAULT_ERROR_MESSAGE =
	"Pesan belum berhasil dikirim. Periksa koneksi lalu coba lagi.";

export function getFeedbackSuccessMessage(type: FeedbackType): string {
	return FEEDBACK_SUCCESS_MESSAGES[type] ?? FEEDBACK_SUCCESS_MESSAGES.general;
}

export function parseFeedbackBody(body: unknown): FeedbackPayload {
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		throw new Error("Format payload feedback tidak valid.");
	}
	const record = body as { message?: unknown; type?: unknown };
	const { message, type } = record;
	if (typeof message !== "string") {
		throw new Error("Pesan feedback harus berupa teks.");
	}
	const trimmed = message.trim();
	if (trimmed.length === 0) {
		throw new Error("Pesan feedback tidak boleh kosong.");
	}
	if (trimmed.length > FEEDBACK_MAX_MESSAGE_CHARS) {
		throw new Error(
			`Pesan feedback maksimal ${FEEDBACK_MAX_MESSAGE_CHARS} karakter.`,
		);
	}
	if (type === undefined || type === null) {
		return { message: trimmed, type: "general" };
	}
	if (typeof type !== "string") {
		throw new Error("Tipe feedback tidak valid.");
	}
	const normalized = type.trim() as FeedbackType;
	if (!(FEEDBACK_TYPES as readonly string[]).includes(normalized)) {
		throw new Error("Tipe feedback tidak valid.");
	}
	return { message: trimmed, type: normalized };
}
