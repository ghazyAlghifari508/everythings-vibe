// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PricingComponent } from "../components/pricing-card";
import { prdFyPlans } from "../data/pricing-data";

afterEach(cleanup);

describe("public pricing presentation", () => {
	it("does not call a plan popular without verified usage evidence", () => {
		render(<PricingComponent plans={prdFyPlans} onPlanSelect={() => {}} />);

		expect(screen.queryByText("Paling Laris")).toBeNull();
	});
});
