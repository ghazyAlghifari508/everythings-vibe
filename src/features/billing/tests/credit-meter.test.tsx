// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CreditMeter } from "../components/credit-meter";

afterEach(cleanup);

function segments() {
	return {
		used: screen.getByTestId("credit-meter-used"),
		reserved: screen.getByTestId("credit-meter-reserved"),
	};
}

describe("CreditMeter presentation", () => {
	it("exposes meter semantics with used, reserved, and available values", () => {
		render(
			<CreditMeter allocation={105} used={80} reserved={20} available={5} />,
		);
		const meter = screen.getByRole("meter");
		expect(meter.getAttribute("aria-valuetext")).toContain(
			"80 / 105, 20 direservasi, sisa 5 kredit",
		);
		expect(screen.getByText("80 / 105")).toBeTruthy();
		expect(screen.getByText(/20 direservasi/)).toBeTruthy();
	});

	it.each([
		[49, "success"],
		[50, "warning"],
		[85, "danger"],
	] as const)("uses the threshold tone at %i%% usage", (used, tone) => {
		render(
			<CreditMeter
				allocation={100}
				used={used}
				reserved={0}
				available={100 - used}
			/>,
		);
		expect(segments().used.getAttribute("data-tone")).toBe(tone);
	});

	it("renders a neutral reservation segment beside the used segment", () => {
		render(
			<CreditMeter allocation={105} used={80} reserved={20} available={5} />,
		);
		const { used, reserved } = segments();
		expect(used.style.width).toBe("76.19047619047619%");
		expect(reserved.style.width).toBe("19.047619047619047%");
		expect(reserved.getAttribute("data-tone")).toBe("neutral");
		expect(screen.getByText(/belum dipotong/)).toBeTruthy();
	});

	it("shows an exhaustion message at full quota without a purchase popup", () => {
		render(
			<CreditMeter allocation={105} used={105} reserved={0} available={0} />,
		);
		expect(screen.getByText(/Kredit periode ini habis/)).toBeTruthy();
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("keeps a loading state readable when canonical values are absent", () => {
		render(<CreditMeter />);
		expect(screen.getByRole("meter").getAttribute("aria-valuetext")).toContain(
			"belum tersedia",
		);
		expect(screen.getByText("Data kredit sedang dimuat.")).toBeTruthy();
		expect(segments().used.style.width).toBe("0%");
	});

	it("never renders a broken width for zero allocation", () => {
		render(<CreditMeter allocation={0} used={0} reserved={0} available={0} />);
		expect(segments().used.style.width).toBe("0%");
		expect(segments().reserved.style.width).toBe("0%");
	});

	it("does not warn an exempt account about exhaustion", () => {
		render(
			<CreditMeter
				allocation={100}
				used={100}
				reserved={0}
				available={0}
				exempt
			/>,
		);
		expect(
			screen.getByText("Akun bebas biaya. Kredit tidak dipotong."),
		).toBeTruthy();
	});

	it("explains forfeited credits on an expired subscription", () => {
		render(
			<CreditMeter
				allocation={105}
				used={80}
				reserved={0}
				available={0}
				paused
			/>,
		);
		expect(screen.getByText(/Masa aktif habis/)).toBeTruthy();
	});
});
