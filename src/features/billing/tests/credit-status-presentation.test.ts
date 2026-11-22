import { describe, expect, it } from "vitest";
import { statusIcons } from "@/components/ui/status-indicator";
import { getStatusBadge, getStatusLabel } from "../utils/credit-usage-status";

describe("Credit status presentation mapping", () => {
	it("keeps reserved and quoted distinct from failure", () => {
		expect(getStatusBadge("reserved").tone).toBe("warning");
		expect(getStatusBadge("quoted").tone).toBe("neutral");
		expect(getStatusBadge("failed").tone).toBe("danger");
	});

	it("never presents released credits as a paid charge", () => {
		const released = getStatusBadge("released");
		expect(released.label).toBe("Dilepas");
		expect(released.tone).toBe("neutral");
		expect(released.icon).toBe(statusIcons.released);
	});

	it("separates in-progress stages without inventing a payment state", () => {
		expect(getStatusLabel("running")).toBe("Diproses");
		expect(getStatusLabel("settling")).toBe("Menyelesaikan");
		expect(getStatusBadge("running").tone).toBe("neutral");
		expect(getStatusBadge("running").icon).toBe(statusIcons.processing);
	});
});
