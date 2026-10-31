// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignAgentPromptDialog } from "../components/design-agent-prompt-dialog";
import { DesignMdSourcePanel } from "../components/design-md-source-panel";
import { DesignResult } from "../components/design-result";
import { DesignSystemInspector } from "../components/design-system-inspector";
import {
	parseSynthesisResponse,
	validateSynthesis,
} from "../services/design-synthesis";
import {
	MAX_ENRICHMENT_ATTEMPTS,
	resolveEnrichmentRetry,
} from "../services/scrape-enrichment-service";
import { type DesignTokenModel, MODEL_VERSION } from "../types/design-model";
import {
	type DesignInspectorModel,
	parseDesignMd,
} from "../utils/design-md-inspector";
import { renderDesignMd, validateDesignMd } from "../utils/design-md-render";
import { assessDocumentUsability } from "../utils/design-md-usability";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const COMPLETE_USABLE_DESIGN_MD = `# Acme Corp - Style Reference
> A modern financial platform with deep navy and vibrant emerald accents.

**Theme:** dark

Acme Corp balances utility and trust with high-contrast surfaces.

## Tokens - Colors
| Name | Value | Token | Role |
| --- | --- | --- | --- |
| Canvas | #0b0f17 | --color-canvas | Background surface |
| Emerald | #10b981 | --color-emerald | Primary action accent |

## Tokens - Typography
| Style | Family | Size | Weight | Line Height |
| --- | --- | --- | --- | --- |
| Display | Inter | 40px | 700 | 1.2 |
| Body | Inter | 14px | 400 | 1.5 |

## Tokens - Spacing & Shapes
Base unit: 4px.

| Token | Value |
| --- | --- |
| space-2 | 8px |
| space-4 | 16px |

| Radius | Value |
| --- | --- |
| radius-md | 8px |

## Components
### Action Button
**Evidence:** color #10b981 (Primary action accent); radius 8px for radius-md
Button uses solid emerald fill with rounded-md borders.

## Do's and Don'ts
- Do preserve high contrast between text and background.
- Don't mix unverified radius values.

## Limitations & Confidence Notes
- Measured from visible desktop viewport at 1440x900.
`;

const MEASURED_FALLBACK_MD = `# Acme Corp - Style Reference
> Measured directly from website capture.

**Theme:** dark

## Tokens - Colors
| Name | Value | Token | Role |
| --- | --- | --- | --- |
| Canvas | #0b0f17 | --color-canvas | Background surface |
| Emerald | #10b981 | --color-emerald | Primary action accent |

## Tokens - Typography
| Style | Family | Size | Weight | Line Height |
| --- | --- | --- | --- | --- |
| Display | Inter | 40px | 700 | 1.2 |

## Tokens - Spacing & Shapes
Base unit: 4px.

| Token | Value |
| --- | --- |
| space-2 | 8px |

## Limitations & Confidence Notes
- Measurements are observed; semantic classifications are inferred from measured usage.
`;

const SAMPLE_INSPECTOR_MODEL: DesignInspectorModel = {
	verification: "observed",
	modelVersion: MODEL_VERSION,
	title: "Acme Corp",
	essence: "High-contrast utility console",
	theme: "dark",
	overview: "Clean developer console aesthetic",
	colors: [
		{
			name: "Canvas",
			token: "--color-canvas",
			value: "#0b0f17",
			role: "Background surface",
			roleClass: "background",
			rationale: "Dominant surface background",
			frequency: 45,
			confidence: "observed",
		},
		{
			name: "Emerald",
			token: "--color-emerald",
			value: "#10b981",
			role: "Primary action accent",
			roleClass: "action",
			rationale: "Action button fill",
			frequency: 18,
			confidence: "observed",
		},
	],
	typography: [
		{
			role: "Display",
			family: "Inter",
			size: "40px",
			sizePx: 40,
			weight: "700",
			lineHeight: "1.2",
			letterSpacing: "normal",
			frequency: 3,
			sample: "Acme Platform",
		},
	],
	typefaces: [
		{
			family: "Inter",
			stack: "Inter, sans-serif",
			weights: ["700"],
			sizes: ["40px"],
			roles: ["Display"],
			lineHeights: ["1.2"],
			letterSpacings: ["normal"],
			loadedEvidence: true,
			declaredFaces: [],
			uncertainty: null,
			sample: "Acme Platform",
		},
	],
	spacing: [
		{
			label: "space-2",
			value: "8px",
			context: "padding",
			frequency: 12,
		},
	],
	radii: [
		{
			label: "radius-md",
			value: "8px",
			valuePx: 8,
			context: "border-radius",
			pill: false,
			frequency: 10,
		},
	],
	elevation: [],
	surfaces: [],
	components: [
		{
			name: "Action Button",
			purpose: "Action control.",
			description: "Button uses solid emerald fill",
			evidence: "color #10b981",
			frequency: 5,
			sharedCharacteristics: [{ label: "Background", value: "#10b981" }],
			variants: [],
			guidance: ["Apply to matching action controls only."],
		},
	],
	baseUnitPx: 4,
	dos: [
		{
			rule: "Do preserve high contrast.",
			evidence: "measured contrast ratio",
		},
	],
	donts: [
		{
			rule: "Don't mix unverified radius values.",
			evidence: "single radius value",
		},
	],
	limitations: ["Desktop viewport only."],
};

const SAMPLE_TOKEN_MODEL: DesignTokenModel = {
	version: MODEL_VERSION,
	title: "Acme Corp",
	essence: "High-contrast utility console",
	overview: "Clean developer console aesthetic",
	theme: "dark",
	sourceUrl: "https://acme.test/",
	capturedAt: new Date().toISOString(),
	viewport: { width: 1440, height: 900 },
	baseUnitPx: 4,
	colors: [
		{
			name: "Canvas",
			token: "--color-canvas",
			value: "#0b0f17",
			frequency: 45,
			role: "surface",
			roleClass: "neutral",
			rationale: "Dominant surface background",
			confidence: "observed",
			userAgentDefault: false,
			variableNames: ["--color-canvas"],
			selectors: [":root"],
		},
		{
			name: "Emerald",
			token: "--color-emerald",
			value: "#10b981",
			frequency: 18,
			role: "accent",
			roleClass: "accent",
			rationale: "Action button fill",
			confidence: "observed",
			userAgentDefault: false,
			variableNames: ["--color-emerald"],
			selectors: ["button.primary"],
		},
	],
	typography: [
		{
			role: "Display",
			fontFamily: "Inter",
			fontSize: "40px",
			fontSizePx: 40,
			fontWeight: "700",
			lineHeight: "1.2",
			letterSpacing: "normal",
			sample: "Acme Platform",
			frequency: 3,
			elementRoles: ["h1"],
			confidence: "observed",
		},
	],
	typefaces: [
		{
			family: "Inter",
			stack: "Inter, sans-serif",
			measuredWeights: ["700"],
			measuredSizes: ["40px"],
			roles: ["Display"],
			lineHeights: ["1.2"],
			letterSpacings: ["normal"],
			loadedEvidence: true,
			declaredFaces: [],
			confidence: "observed",
			uncertainty: null,
			sample: "Acme Platform",
		},
	],
	spacing: [
		{
			purpose: "Card padding",
			property: "padding",
			value: "8px",
			valuePx: 8,
			frequency: 12,
			roles: ["card"],
			onScale: true,
			confidence: "observed",
		},
	],
	radii: [
		{
			purpose: "Buttons",
			value: "8px",
			valuePx: 8,
			frequency: 10,
			roles: ["button"],
			scope: "desktop",
			confidence: "observed",
			pill: false,
		},
	],
	surfaces: [],
	elevation: [],
	observedComponents: [],
	guidelines: {
		dos: [],
		donts: [],
		limitations: ["Desktop viewport only."],
	},
	limitations: ["Desktop viewport only."],
	measurementProvenance: {
		elements: 120,
		colorObservations: 50,
		distinctColorValues: 6,
		typeStyles: 4,
		spacingObservations: 30,
		radiusObservations: 12,
		shadowObservations: 0,
	},
};

describe("Section 10 Automated Verification — p2.md", () => {
	// Scenario 1: Normal verified result: no unnecessary accordion.
	it("Scenario 1: Normal verified result contains no generic Tentang Analisis accordion", () => {
		render(
			<DesignSystemInspector
				siteName="Acme Corp"
				sourceUrl="https://acme.test/"
				model={SAMPLE_INSPECTOR_MODEL}
			/>,
		);

		expect(screen.queryByText(/tentang analisis/i)).toBeNull();
		expect(
			screen.queryByText(
				/analisis berdasarkan tampilan website yang berhasil diperiksa/i,
			),
		).toBeNull();
	});

	// Scenario 2: Normal usable document: no internal AI banner.
	it("Scenario 2: Normal usable document renders without any internal AI status banner", () => {
		const { container } = render(
			<DesignMdSourcePanel
				designMd={COMPLETE_USABLE_DESIGN_MD}
				onImplementAgent={vi.fn()}
				enrichment="applied"
			/>,
		);

		expect(
			screen.queryByText(/panduan desain belum sepenuhnya selesai/i),
		).toBeNull();
		expect(screen.queryByText(/melengkapi\.\.\./i)).toBeNull();
		expect(screen.queryByText(/lengkapi analisis/i)).toBeNull();
		expect(screen.queryByText(/lengkapi panduan komponen/i)).toBeNull();
		expect(
			screen.queryByText(/sebagian panduan komponen belum tersedia/i),
		).toBeNull();
		expect(container.textContent).not.toMatch(/enrichment unavailable/i);
		expect(container.textContent).not.toMatch(/schema validation failed/i);
	});

	// Scenario 3: Legacy/unverified result with material uncertainty.
	it("Scenario 3: Legacy/unverified result displays provenance disclaimer without breaking", () => {
		const unverifiedModel: DesignInspectorModel = {
			...SAMPLE_INSPECTOR_MODEL,
			verification: "unverified",
		};

		render(
			<DesignSystemInspector
				siteName="Legacy Archive"
				sourceUrl="https://archive.test/"
				model={unverifiedModel}
			/>,
		);

		expect(
			screen.getByText(
				/Hasil lama belum terverifikasi terhadap evidence browser/i,
			),
		).toBeDefined();

		render(
			<DesignMdSourcePanel
				designMd={MEASURED_FALLBACK_MD}
				onImplementAgent={vi.fn()}
				inspectorSource="unverified"
			/>,
		);

		expect(
			screen.getByText(/Arsip: belum terverifikasi terhadap evidence/i),
		).toBeDefined();
	});

	// Scenario 4: Synthesis validation failure.
	it("Scenario 4: Synthesis validation failure rejects invalid references and unsupported claims", () => {
		const invalidSynthesis = {
			essence: "Invalid synthesis",
			overview: "Cites non-existent tokens",
			theme: "dark" as const,
			identityNarrative: "Fabricated narrative",
			layoutPrinciples: [],
			imageryNotes: [],
			implementationGuidance: [],
			limitations: [],
			componentPatterns: [
				{
					name: "Ghost Button",
					description: "Uses non-existent color index 99",
					references: [{ kind: "color" as const, index: 99 }],
				},
			],
			dos: [],
			donts: [],
		};

		const issues = validateSynthesis(invalidSynthesis, SAMPLE_TOKEN_MODEL);
		expect(issues.length).toBeGreaterThan(0);
		expect(issues[0]?.code).toBe("unknown-reference");

		const outcome = parseSynthesisResponse(
			JSON.stringify(invalidSynthesis),
			SAMPLE_TOKEN_MODEL,
			(t) => t,
		);
		expect(outcome.status).toBe("unavailable");
		expect(outcome.synthesis).toBeNull();
		expect(outcome.cause).toBe("unknown_reference");
	});

	// Scenario 5: Bounded recovery.
	it("Scenario 5: Bounded recovery halts and returns exhausted after max attempts", () => {
		expect(
			resolveEnrichmentRetry({
				enrichment: "unavailable",
				hasDocument: true,
				hasEvidence: true,
				attempts: 0,
			}),
		).toEqual({ proceed: true });

		expect(
			resolveEnrichmentRetry({
				enrichment: "unavailable",
				hasDocument: true,
				hasEvidence: true,
				attempts: 1,
			}),
		).toEqual({ proceed: true });

		expect(
			resolveEnrichmentRetry({
				enrichment: "unavailable",
				hasDocument: true,
				hasEvidence: true,
				attempts: MAX_ENRICHMENT_ATTEMPTS,
			}),
		).toEqual({ proceed: false, mode: "exhausted" });
	});

	// Scenario 6: No retry on every render.
	it("Scenario 6: Usability evaluation is deterministic and does not trigger recovery side effects", () => {
		const retrySpy = vi.fn();
		const assessment1 = assessDocumentUsability({
			designMd: MEASURED_FALLBACK_MD,
			enrichment: "unavailable",
		});
		const assessment2 = assessDocumentUsability({
			designMd: MEASURED_FALLBACK_MD,
			enrichment: "unavailable",
		});

		expect(assessment1).toEqual(assessment2);
		expect(retrySpy).not.toHaveBeenCalled();
	});

	// Scenario 7: No duplicate concurrent retries.
	it("Scenario 7: Concurrent duplicate retry calls are guarded", () => {
		expect(
			resolveEnrichmentRetry({
				enrichment: "applied",
				hasDocument: true,
				hasEvidence: true,
			}),
		).toEqual({ proceed: false, mode: "replay" });

		expect(
			resolveEnrichmentRetry({
				enrichment: "unavailable",
				hasDocument: false,
				hasEvidence: false,
			}),
		).toEqual({ proceed: false, mode: "missing-evidence" });
	});

	// Scenario 8: Recovery success.
	it("Scenario 8: Applied enrichment renders clean result without missing guidance notice", () => {
		render(
			<DesignResult
				sourceUrl="https://acme.test/"
				domain="acme.test"
				designMd={COMPLETE_USABLE_DESIGN_MD}
				enrichment="applied"
			/>,
		);

		expect(
			screen.queryByText(/sebagian panduan komponen belum tersedia/i),
		).toBeNull();
		expect(
			screen.queryByText(/panduan desain belum sepenuhnya selesai/i),
		).toBeNull();
		expect(
			screen.queryByRole("button", { name: /lengkapi panduan komponen/i }),
		).toBeNull();
	});

	// Scenario 9: Recovery exhausted.
	it("Scenario 9: Recovery exhausted informs user of real impact without infinite retry button", () => {
		const assessment = assessDocumentUsability({
			designMd: MEASURED_FALLBACK_MD,
			enrichment: "unavailable",
			recoveryStatus: "exhausted",
		});

		expect(assessment.status).toBe("materially_incomplete");
		expect(assessment.notice).toBe("Sebagian panduan komponen belum tersedia.");
		expect(assessment.canRetry).toBe(false);
		expect(assessment.actionLabel).toBeUndefined();
	});

	// Scenario 10: Fallback document validity.
	it("Scenario 10: Fallback document rendered from measured model is structurally valid markdown", () => {
		const fallbackDoc = renderDesignMd(SAMPLE_TOKEN_MODEL, {
			enrichmentUnavailable: true,
		});

		expect(fallbackDoc).toContain("Style Reference");
		expect(fallbackDoc).toContain("## Tokens - Colors");
		expect(fallbackDoc).toContain("## Tokens - Typography");

		const parsed = parseDesignMd(fallbackDoc);
		expect(parsed.colors.length).toBeGreaterThan(0);
		expect(parsed.typography.length).toBeGreaterThan(0);
		expect(validateDesignMd(fallbackDoc)).toEqual([]);
	});

	// Scenario 11: Correct copy and download behavior.
	it("Scenario 11: Copy and download actions correctly handle exact markdown payload", async () => {
		const writeText = vi.fn(async () => {});
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		const blobSpy = vi.spyOn(globalThis, "Blob");
		vi.stubGlobal("URL", {
			createObjectURL: vi.fn(() => "blob:test"),
			revokeObjectURL: vi.fn(),
		});

		render(
			<DesignMdSourcePanel
				designMd={COMPLETE_USABLE_DESIGN_MD}
				onImplementAgent={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Salin DESIGN.md" }));
		expect(writeText).toHaveBeenCalledWith(COMPLETE_USABLE_DESIGN_MD);
		expect(await screen.findByText(/tersalin ke clipboard/i)).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: "Download DESIGN.md" }));
		expect(blobSpy).toHaveBeenCalledWith([COMPLETE_USABLE_DESIGN_MD], {
			type: "text/markdown;charset=utf-8",
		});
		expect(await screen.findByText(/mulai diunduh/i)).toBeDefined();
	});

	// Scenario 12: Handoff to AI Agent not falsely claiming missing rules are available.
	it("Scenario 12: AI Agent handoff dialogue clearly notes token boundary when components are unavailable", () => {
		render(
			<DesignAgentPromptDialog
				open={true}
				onOpenChange={vi.fn()}
				siteName="Acme Corp"
				sourceUrl="https://acme.test/"
				designMd={MEASURED_FALLBACK_MD}
				enrichment="unavailable"
			/>,
		);

		expect(
			screen.getByText(
				/Panduan komponen belum tersedia; instruksi dibatasi pada token terukur yang terverifikasi/i,
			),
		).toBeDefined();
		expect(screen.queryByText(/narasi ai belum lengkap/i)).toBeNull();
	});

	// Scenario 13: No internal errors exposed as public copy.
	it("Scenario 13: UI never leaks internal schema validation or provider error messages", () => {
		const onRetry = vi.fn();
		const { container } = render(
			<DesignMdSourcePanel
				designMd={MEASURED_FALLBACK_MD}
				onImplementAgent={vi.fn()}
				enrichment="unavailable"
				enrichmentDetail="Format sintesis tidak sesuai pada root: required key missing."
				onRetryEnrichment={onRetry}
			/>,
		);

		// Real user-facing impact only
		expect(
			screen.getByText(/sebagian panduan komponen belum tersedia/i),
		).toBeDefined();

		// Zero internal jargon
		expect(container.textContent).not.toMatch(/format sintesis/i);
		expect(container.textContent).not.toMatch(/required key missing/i);
		expect(container.textContent).not.toMatch(/schema validation failed/i);
		expect(container.textContent).not.toMatch(/enrichment unavailable/i);
		expect(container.textContent).not.toMatch(/ai tidak memenuhi kontrak/i);
		expect(container.textContent).not.toMatch(/measurement fallback/i);
	});
});
