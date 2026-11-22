import { describe, expect, it } from "vitest";
import { statusIcons } from "@/components/ui/status-indicator";
import { getPaymentStatusInfo } from "../utils/payment-status";

describe("Payment status presentation mapping", () => {
	it("maps success and gateway settlement statuses to Berhasil", () => {
		for (const status of ["success", "settlement", "capture", "paid"]) {
			const info = getPaymentStatusInfo(status);
			expect(info.label).toBe("Berhasil");
			expect(info.tone).toBe("success");
			expect(info.icon).toBe(statusIcons.success);
		}
	});

	it("preserves pending as Menunggu without treating it as failure", () => {
		const info = getPaymentStatusInfo("pending");
		expect(info.label).toBe("Menunggu");
		expect(info.tone).toBe("warning");
		expect(info.icon).toBe(statusIcons.pending);
	});

	it("distinguishes cancelled from failed", () => {
		for (const status of ["cancel", "cancelled"]) {
			expect(getPaymentStatusInfo(status).label).toBe("Dibatalkan");
			expect(getPaymentStatusInfo(status).tone).toBe("neutral");
			expect(getPaymentStatusInfo(status).icon).toBe(statusIcons.released);
		}
		expect(getPaymentStatusInfo("failed").tone).toBe("danger");
	});

	it("distinguishes expired from failed", () => {
		for (const status of ["expire", "expired"]) {
			expect(getPaymentStatusInfo(status).label).toBe("Kedaluwarsa");
			expect(getPaymentStatusInfo(status).tone).toBe("neutral");
		}
	});

	it("keeps refunds neutral and chargebacks distinct", () => {
		expect(getPaymentStatusInfo("refund").label).toBe("Dikembalikan");
		expect(getPaymentStatusInfo("partial_refund").label).toBe(
			"Dikembalikan sebagian",
		);
		expect(getPaymentStatusInfo("refund").tone).toBe("neutral");
		expect(getPaymentStatusInfo("chargeback").label).toBe(
			"Sengketa pembayaran",
		);
		expect(getPaymentStatusInfo("chargeback").tone).toBe("warning");
		expect(getPaymentStatusInfo("chargeback").icon).toBe(statusIcons.alert);
	});

	it("maps failed and deny to Gagal", () => {
		for (const status of ["failed", "deny"]) {
			const info = getPaymentStatusInfo(status);
			expect(info.label).toBe("Gagal");
			expect(info.tone).toBe("danger");
			expect(info.icon).toBe(statusIcons.failed);
		}
	});

	it("safely falls back for unknown statuses", () => {
		expect(getPaymentStatusInfo("custom_status").label).toBe("custom_status");
		expect(getPaymentStatusInfo(null).label).toBe("Gagal");
		expect(getPaymentStatusInfo(undefined).label).toBe("Gagal");
		expect(getPaymentStatusInfo(null).tone).toBe("neutral");
	});
});
