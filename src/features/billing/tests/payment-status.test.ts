import { describe, expect, it } from "vitest";
import { getPaymentStatusInfo } from "../utils/payment-status";

describe("Payment status presentation mapping", () => {
	it("maps success and gateway settlement statuses to Berhasil", () => {
		expect(getPaymentStatusInfo("success").label).toBe("Berhasil");
		expect(getPaymentStatusInfo("settlement").label).toBe("Berhasil");
		expect(getPaymentStatusInfo("capture").label).toBe("Berhasil");
		expect(getPaymentStatusInfo("success").className).toContain("text-emerald");
	});

	it("preserves pending as Menunggu", () => {
		expect(getPaymentStatusInfo("pending").label).toBe("Menunggu");
		expect(getPaymentStatusInfo("pending").className).toContain("text-amber");
	});

	it("distinguishes cancelled from failed", () => {
		expect(getPaymentStatusInfo("cancel").label).toBe("Dibatalkan");
		expect(getPaymentStatusInfo("cancelled").label).toBe("Dibatalkan");
		expect(getPaymentStatusInfo("cancel").className).toContain("text-zinc");
	});

	it("distinguishes expired from failed", () => {
		expect(getPaymentStatusInfo("expire").label).toBe("Kedaluwarsa");
		expect(getPaymentStatusInfo("expired").label).toBe("Kedaluwarsa");
		expect(getPaymentStatusInfo("expire").className).toContain("text-zinc");
	});

	it("distinguishes refunds and chargebacks", () => {
		expect(getPaymentStatusInfo("refund").label).toBe("Dikembalikan");
		expect(getPaymentStatusInfo("partial_refund").label).toBe(
			"Dikembalikan sebagian",
		);
		expect(getPaymentStatusInfo("chargeback").label).toBe(
			"Sengketa pembayaran",
		);
		expect(getPaymentStatusInfo("partial_chargeback").label).toBe(
			"Sengketa pembayaran",
		);
		expect(getPaymentStatusInfo("refund").className).toContain("text-blue");
		expect(getPaymentStatusInfo("chargeback").className).toContain(
			"text-purple",
		);
	});

	it("maps failed and deny to Gagal", () => {
		expect(getPaymentStatusInfo("failed").label).toBe("Gagal");
		expect(getPaymentStatusInfo("deny").label).toBe("Gagal");
		expect(getPaymentStatusInfo("failed").className).toContain("text-rose");
	});

	it("safely falls back for unknown statuses", () => {
		expect(getPaymentStatusInfo("custom_status").label).toBe("custom_status");
		expect(getPaymentStatusInfo(null).label).toBe("Gagal");
		expect(getPaymentStatusInfo(undefined).label).toBe("Gagal");
	});
});
