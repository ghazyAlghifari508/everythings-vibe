import { expect, it } from "vitest";
import { FIXTURE } from "@/lib/design-fixture";
import { buildDesignModel } from "../services/design-model";
import { partitionDesignViews } from "../services/design-shared-context";
import { renderDesignMd, validateDesignMd } from "../utils/design-md-render";

it("partitions identical semantic facts without pooling frequencies or losing source contexts", () => {
	const mobile = structuredClone(FIXTURE);
	mobile.viewport = { width: 390, height: 844 };
	for (const element of mobile.elements) {
		if (element.role === "cta") element.properties["border-radius"] = "16px";
	}
	const model = buildDesignModel({ ...FIXTURE, additionalViews: [mobile] });
	const original = structuredClone(model);
	const { shared, specific } = partitionDesignViews(model.views ?? []);
	expect(shared.colors.map((token) => token.value)).toEqual(
		model.views?.[0]?.model.colors.map((token) => token.value),
	);
	expect(specific.every((view) => view.model.colors.length === 0)).toBe(true);
	expect(
		shared.observedComponents.some((component) =>
			component.roles.includes("body"),
		),
	).toBe(true);
	expect(
		shared.observedComponents.some((component) =>
			component.roles.includes("cta"),
		),
	).toBe(false);
	expect(
		specific.map(
			(view) =>
				view.model.radii.find((token) => token.roles.includes("cta"))?.value,
		),
	).toEqual(["8px", "16px"]);
	expect(model).toEqual(original);
	const document = renderDesignMd(model);
	expect(validateDesignMd(document)).toEqual([]);
	const colors = document.split("## Tokens - Colors")[1]?.split("\n## ")[0];
	expect(colors?.match(/#155eef/g)).toHaveLength(1);
});

it("never labels a value missing in another view as shared", () => {
	const mobile = structuredClone(FIXTURE);
	mobile.viewport = { width: 390, height: 844 };
	mobile.elements = mobile.elements.filter((element) => element.role !== "cta");
	const model = buildDesignModel({ ...FIXTURE, additionalViews: [mobile] });
	const { shared, specific } = partitionDesignViews(model.views ?? []);
	expect(
		shared.observedComponents.some((component) =>
			component.roles.includes("cta"),
		),
	).toBe(false);
	expect(
		specific[0]?.model.observedComponents.some((component) =>
			component.roles.includes("cta"),
		),
	).toBe(true);
	expect(
		specific[1]?.model.observedComponents.some((component) =>
			component.roles.includes("cta"),
		),
	).toBe(false);
});

it("partitions guidelines and limitations only when their complete evidence is shared", () => {
	const model = buildDesignModel({
		...FIXTURE,
		additionalViews: [structuredClone(FIXTURE)],
	});
	const views = model.views ?? [];
	const first = views[0];
	const second = views[1];
	if (!first || !second) throw new Error("Expected two captures");
	first.model.guidelines = {
		dos: [
			{ rule: "shared", evidence: "same" },
			{ rule: "scoped", evidence: "first" },
		],
		donts: [],
		limitations: [],
	};
	second.model.guidelines = {
		dos: [
			{ rule: "shared", evidence: "same" },
			{ rule: "scoped", evidence: "second" },
		],
		donts: [],
		limitations: [],
	};
	first.model.limitations = ["shared", "first"];
	second.model.limitations = ["shared", "second"];
	const original = structuredClone(views);
	const { shared, specific } = partitionDesignViews(views);
	expect(shared.guidelines.dos).toEqual([{ rule: "shared", evidence: "same" }]);
	expect(specific.map((view) => view.model.guidelines.dos)).toEqual([
		[{ rule: "scoped", evidence: "first" }],
		[{ rule: "scoped", evidence: "second" }],
	]);
	expect(shared.limitations).toEqual(["shared"]);
	expect(specific.map((view) => view.model.limitations)).toEqual([
		["first"],
		["second"],
	]);
	expect(views).toEqual(original);
	const document = renderDesignMd(model);
	const limitations =
		document.split("## Limitations & Confidence Notes")[1]?.split("\n## ")[0] ??
		"";
	expect(limitations).toContain("- shared");
	expect(limitations).toContain("first");
	expect(limitations).toContain("second");
});
