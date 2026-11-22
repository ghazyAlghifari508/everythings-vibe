import { expect, it } from "vitest";
import { validateBlueprint } from "../services/studio-design-blueprint";
import { enforceDesignSystemOnHtml } from "../services/studio-design-system-html";
import { finalizeStudioFrameHtml } from "../services/studio-frame-finalize";
import { validateGeneratedHtml } from "../services/studio-generated-html-validation";

const plan = {
	compositionOwner: "model",
	productIdentity: {
		productName: "Studio Kaca",
		targetAudience: "Visitors",
		platform: "web",
		layoutIntent: "public-website",
		visualDirection: "Editorial",
	},
	designTokens: {
		primary: "#234567",
		secondary: "#555555",
		background: "#ffffff",
		surface: "#fafafa",
		fontFamily: "Arial",
		radius: 8,
		border: "1px solid #ddd",
		elevation: "none",
	},
	sharedComponents: {
		header: "Optional",
		navigation: "Text",
		buttons: "Solid",
		inputs: "Bordered",
		cards: "Flat",
		tabs: "Underline",
		icons: "Outline",
	},
	navigationContract: {
		destinations: ["work", "contact"],
		labels: ["Work", "Contact"],
		ordering: ["work", "contact"],
		iconMapping: {},
		activeItemRule: "Match screen",
	},
	screenPlan: [
		{
			name: "Selected Work",
			order: 0,
			role: "Projects",
			navigationRole: "primary",
			destinationId: "work",
		},
		{
			name: "Contact",
			order: 1,
			role: "Contact",
			navigationRole: "primary",
			destinationId: "contact",
		},
		{
			name: "Case Study",
			order: 2,
			role: "Read project",
			navigationRole: "contextual",
			parentDestinationId: "work",
		},
	],
};

function check(body: string, mobile = false, nested = false) {
	const result = validateBlueprint({
		...plan,
		productIdentity: mobile
			? {
					...plan.productIdentity,
					platform: "mobile",
					layoutIntent: "mobile-application",
				}
			: plan.productIdentity,
	});
	if (!result.ok) throw new Error(result.error);
	const screen = nested ? "Case Study" : "Selected Work";
	const viewport = mobile ? "mobile" : "web";
	const authored = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${body}<main data-studio-content><h1>Selected work</h1><p>Exhibition and identity design.</p></main></body></html>`;
	const { html } = finalizeStudioFrameHtml(
		enforceDesignSystemOnHtml(authored, null, null, result.blueprint),
		{ blueprint: result.blueprint, screen, tokens: null, viewport },
	);
	return {
		html,
		issues: validateGeneratedHtml(html, {
			blueprint: result.blueprint,
			viewport,
			expectTokens: false,
			screen,
		}),
	};
}

it("keeps flexible chrome and shared tokens without injecting a shell", () => {
	const { html, issues } = check(
		'<header data-studio-header><strong>Studio Kaca</strong><nav data-studio-navigation aria-label="Primary"><a data-destination="work" aria-current="page" href="#work">Work</a><a data-destination="contact" href="#contact">Contact</a></nav></header>',
	);
	expect(issues).toEqual([]);
	expect(html).toContain("--app-primary:#234567");
	expect(html).not.toContain("studio-canonical-style");
	expect(check("").issues).toEqual([]);
});

it("validates destination identity and separates navigation from actions", () => {
	expect(
		check('<a href="#other" data-destination="other">Unknown</a>').issues,
	).not.toEqual([]);
	expect(
		check(
			'<a href="#contact" data-destination="contact" data-studio-action="contact">Contact</a>',
		).issues,
	).not.toEqual([]);
	expect(
		check(
			"<header data-studio-header>Brand</header><header data-studio-header>Brand</header>",
		).issues,
	).not.toEqual([]);
	expect(
		validateBlueprint({
			...plan,
			navigationContract: {
				...plan.navigationContract,
				ctaDestination: "contact",
			},
		}).ok,
	).toBe(false);
});

it("allows a contextual parent affordance without forcing a tab bar or title row", () => {
	const back =
		'<a data-studio-back data-destination="work" href="#work">Back to work</a>';
	expect(check(back, true, true).issues).toEqual([]);
	expect(check(back, true).issues).not.toEqual([]);
	expect(check("", true, true).issues).toEqual([]);
});

it("accepts a distinct action linked to a planned screen", () => {
	const result = validateBlueprint({
		...plan,
		navigationContract: {
			...plan.navigationContract,
			primaryAction: {
				id: "request-estimate",
				label: "Request estimate",
				goal: "Start a commission",
				target: "Contact",
			},
		},
	});
	if (!result.ok) throw new Error(result.error);
	const html = enforceDesignSystemOnHtml(
		'<html><body><main data-studio-content><a data-studio-action="request-estimate" href="#request-estimate">Request estimate</a></main></body></html>',
		null,
		null,
		result.blueprint,
	);
	expect(
		validateGeneratedHtml(html, {
			blueprint: result.blueprint,
			viewport: "web",
			expectTokens: false,
		}),
	).toEqual([]);
});

it("rejects scripts in an otherwise valid authored document", () => {
	expect(
		check('<script src="https://cdn.tailwindcss.com"></script>').issues,
	).toContain("Model-owned screens must not execute scripts.");
});
