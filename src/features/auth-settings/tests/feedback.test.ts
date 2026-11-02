import { describe, expect, it } from "vitest";
import {
	FEEDBACK_DEFAULT_ERROR_MESSAGE,
	FEEDBACK_SUCCESS_MESSAGES,
	getFeedbackSuccessMessage,
	parseFeedbackBody,
} from "@/features/auth-settings/services/feedback";
import { FEEDBACK_MAX_MESSAGE_CHARS } from "@/features/auth-settings/types/settings-constants";

describe("parseFeedbackBody", () => {
	it("accepts a bounded message with default type", () => {
		expect(parseFeedbackBody({ message: "<sample feedback>" })).toEqual({
			message: "<sample feedback>",
			type: "general",
		});
	});

	it("accepts the known feedback types", () => {
		for (const type of ["general", "bug", "feature"] as const) {
			expect(parseFeedbackBody({ message: "<sample>", type })).toEqual({
				message: "<sample>",
				type,
			});
		}
	});

	it("rejects non-object payloads and missing or non-string messages", () => {
		for (const body of [null, [], "text", 123, {}, { message: "" }]) {
			expect(() => parseFeedbackBody(body)).toThrow();
		}
		expect(() => parseFeedbackBody({ message: 123 })).toThrow();
		expect(() => parseFeedbackBody({ message: {} })).toThrow();
	});

	it("rejects unknown types and oversized messages", () => {
		expect(() =>
			parseFeedbackBody({ message: "<sample>", type: "admin" }),
		).toThrow();
		expect(() =>
			parseFeedbackBody({
				message: "x".repeat(FEEDBACK_MAX_MESSAGE_CHARS + 1),
			}),
		).toThrow();
	});
});

describe("feedback copy contracts", () => {
	it("returns approved success copy for each feedback type", () => {
		expect(getFeedbackSuccessMessage("general")).toBe(
			"Masukan berhasil dikirim. Terima kasih sudah membantu kami meningkatkan everythings-vibe.",
		);
		expect(getFeedbackSuccessMessage("bug")).toBe(
			"Laporan bug berhasil dikirim. Laporanmu sudah tercatat dan dapat ditinjau oleh tim.",
		);
		expect(getFeedbackSuccessMessage("feature")).toBe(
			"Usulan fitur berhasil dikirim. Masukanmu sudah tercatat untuk dipertimbangkan.",
		);
		expect(FEEDBACK_SUCCESS_MESSAGES.general).toBe(
			"Masukan berhasil dikirim. Terima kasih sudah membantu kami meningkatkan everythings-vibe.",
		);
		expect(FEEDBACK_SUCCESS_MESSAGES.bug).toBe(
			"Laporan bug berhasil dikirim. Laporanmu sudah tercatat dan dapat ditinjau oleh tim.",
		);
		expect(FEEDBACK_SUCCESS_MESSAGES.feature).toBe(
			"Usulan fitur berhasil dikirim. Masukanmu sudah tercatat untuk dipertimbangkan.",
		);
	});

	it("provides approved failure copy for connection/generic errors", () => {
		expect(FEEDBACK_DEFAULT_ERROR_MESSAGE).toBe(
			"Pesan belum berhasil dikirim. Periksa koneksi lalu coba lagi.",
		);
	});
});
