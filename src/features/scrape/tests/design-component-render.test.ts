import { expect, it } from "vitest";
import { renderDesignMd } from "@/features/scrape/utils/design-md-render";
import { buildFixtureModel } from "@/lib/design-fixture";
import { escapeCell } from "../utils/design-md-markdown";

it("keeps measured component rules when AI supplies the same component name", () => {
	const model = buildFixtureModel();
	const observed = model.observedComponents[0];
	if (!observed) throw new Error("Fixture requires an observed component");
	const document = renderDesignMd(model, {
		componentPatterns: [
			{
				name: observed.name,
				description: "Sample inference",
				evidence: "Sample citation",
			},
		],
	});
	expect(document).toContain(escapeCell(observed.description));
	expect(document).toContain(escapeCell(observed.evidence));
	expect(document).toContain("Sample inference");
});

it("does not choose a mixed text/surface color as the default text color", () => {
	const model = buildFixtureModel();
	const text = model.colors.find((color) => color.role === "Base text");
	if (!text) throw new Error("Fixture requires base text evidence");
	const quickReference = renderDesignMd(model)
		.split("**Quick reference**")[1]
		?.split("Use the observed")[0];
	expect(quickReference).toContain(`- text: \`${text.value}\``);
});
