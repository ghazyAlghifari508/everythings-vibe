import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
	assembleCanonicalShell,
	validateCanonicalShell,
} from "../services/studio-canonical-shell";
import {
	type StudioDesignBlueprint,
	validateBlueprint,
} from "../services/studio-design-blueprint";
import { enforceDesignSystemOnHtml } from "../services/studio-design-system-html";
import { extractDesignSystemTokens } from "../services/studio-design-tokens";
import { validateGeneratedHtml } from "../services/studio-generated-html-validation";

const doc = (html: string) => new JSDOM(html).window.document;

describe("Studio Quality Evaluation - Lifecycle & Revisions (Cases D-F)", () => {
	// Case D: Custom DESIGN.md
	describe("Case D: Custom DESIGN.md tokens precedence", () => {
		const customDesignMd = `# Design System Specification
## Tokens — Colors
| Name | Hex | Role |
|------|-----|------|
| Purple Primary | #9333ea | Primary brand accent |
| Slate Canvas | #0f172a | Canvas background |
| Dark Surface | #1e293b | Card surface |

## Tokens — Typography
Font: Plus Jakarta Sans
`;

		const baseBlueprint: StudioDesignBlueprint = {
			productIdentity: {
				productName: "VibeCustom",
				targetAudience: "Creative Teams",
				platform: "mobile",
				visualDirection: "Dark modern",
			},
			designTokens: {
				primary: "#000000",
				secondary: "#666666",
				background: "#ffffff",
				surface: "#f5f5f5",
				fontFamily: "Arial",
				radius: 4,
				border: "1px solid #ccc",
				elevation: "none",
			},
			sharedComponents: {
				header: "Header",
				navigation: "Nav",
				buttons: "Btn",
				inputs: "Inp",
				cards: "Crd",
				tabs: "Tab",
				icons: "Icn",
			},
			navigationContract: {
				destinations: ["home", "settings"],
				labels: ["Home", "Settings"],
				iconMapping: { home: "home", settings: "settings" },
				ordering: ["home", "settings"],
				activeItemRule: "Active indicator",
			},
			canonicalShell: {
				version: 1,
				navigation: "bottom",
				statusBar: "none",
				density: "comfortable",
				activeDestinations: { Home: "home", Settings: "settings" },
			},
			screenPlan: [
				{ name: "Home", role: "Main screen", order: 0 },
				{ name: "Settings", role: "Settings screen", order: 1 },
			],
		};

		it("guarantees custom reference colors and typography survive and override blueprint defaults", () => {
			const tokens = extractDesignSystemTokens(customDesignMd);
			expect(tokens).not.toBeNull();
			if (!tokens) throw new Error("Expected tokens to parse");

			const rawHtml =
				'<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content><h1>Dark App</h1><button data-primary>Action</button></main></body></html>';

			const enforced = enforceDesignSystemOnHtml(
				rawHtml,
				tokens,
				null,
				baseBlueprint,
			);
			const assembled = assembleCanonicalShell(
				enforced,
				baseBlueprint,
				"Home",
				tokens,
			);

			expect(assembled).toContain("--color-primary: #9333ea");
			expect(assembled).toContain("--canvas-bg: #0f172a");
			expect(assembled).toContain("Plus Jakarta Sans");

			expect(assembled).toContain("--app-primary:#9333ea");
			expect(assembled).toContain("--app-canvas:#0f172a");
			expect(assembled).toContain("Plus Jakarta Sans");

			const issues = validateGeneratedHtml(assembled, {
				blueprint: baseBlueprint,
				viewport: "mobile",
				expectTokens: true,
			});
			expect(issues).toEqual([]);
		});
	});

	// Case E: Legacy Studio project compatibility
	describe("Case E: Legacy Studio project compatibility", () => {
		const legacyBlueprintRaw = {
			productIdentity: {
				productName: "LegacyApp",
				targetAudience: "Existing Users",
				platform: "mobile",
				visualDirection: "Classic mobile",
			},
			designTokens: {
				primary: "#3b82f6",
				secondary: "#6b7280",
				background: "#ffffff",
				surface: "#f9fafb",
				fontFamily: "system-ui",
				radius: 8,
				border: "1px solid #e5e7eb",
				elevation: "none",
			},
			sharedComponents: {
				header: "Standard Header",
				navigation: "Standard Bottom Tabs",
				buttons: "Solid Button",
				inputs: "Outlined Input",
				cards: "Rounded Card",
				tabs: "Tabs",
				icons: "Icons",
			},
			navigationContract: {
				destinations: ["beranda", "riwayat"],
				labels: ["Beranda", "Riwayat"],
				iconMapping: { beranda: "home", riwayat: "calendar" },
				ordering: ["beranda", "riwayat"],
				activeItemRule: "Active highlight",
			},
			screenPlan: [
				{ name: "Beranda", role: "Halaman utama", order: 0 },
				{ name: "Riwayat", role: "Daftar histori", order: 1 },
			],
		};

		it("automatically normalizes legacy blueprint to versioned canonical shell without breaking historical frames", () => {
			const validation = validateBlueprint(legacyBlueprintRaw);
			expect(validation.ok).toBe(true);
			if (!validation.ok) throw new Error(validation.error);

			const upgraded = validation.blueprint;
			expect(upgraded.canonicalShell).toEqual({
				version: 1,
				navigation: "bottom",
				statusBar: "none",
				density: "comfortable",
				activeDestinations: {
					Beranda: "beranda",
					Riwayat: "riwayat",
				},
			});

			const legacyHtml =
				'<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div><h2>Riwayat Transaksi</h2><p>Januari 2024</p></div></body></html>';

			const assembled = assembleCanonicalShell(
				legacyHtml,
				upgraded,
				"Riwayat",
				null,
			);
			expect(
				validateCanonicalShell(assembled, upgraded, "Riwayat", null),
			).toEqual([]);

			const d = doc(assembled);
			expect(
				d
					.querySelector('nav a[aria-current="page"]')
					?.getAttribute("data-destination"),
			).toBe("riwayat");
			expect(d.querySelector("[data-studio-content]")?.textContent).toContain(
				"Riwayat Transaksi",
			);
		});
	});

	// Case F: Revision consistency
	describe("Case F: Single-frame revision preserves common design identity", () => {
		const blueprint: StudioDesignBlueprint = {
			productIdentity: {
				productName: "FinPlan",
				targetAudience: "Users",
				platform: "mobile",
				visualDirection: "Minimalist",
			},
			designTokens: {
				primary: "#10b981",
				secondary: "#64748b",
				background: "#ffffff",
				surface: "#f8fafc",
				fontFamily: "Inter, sans-serif",
				radius: 12,
				border: "1px solid #e2e8f0",
				elevation: "none",
			},
			sharedComponents: {
				header: "Header",
				navigation: "Nav",
				buttons: "Btn",
				inputs: "Inp",
				cards: "Card",
				tabs: "Tab",
				icons: "Icon",
			},
			navigationContract: {
				destinations: ["home", "wallet"],
				labels: ["Home", "Wallet"],
				iconMapping: { home: "home", wallet: "wallet" },
				ordering: ["home", "wallet"],
				activeItemRule: "Rule",
			},
			canonicalShell: {
				version: 1,
				navigation: "bottom",
				statusBar: "none",
				density: "comfortable",
				activeDestinations: { Home: "home", Wallet: "wallet" },
			},
			screenPlan: [
				{ name: "Home", role: "Dashboard", order: 0 },
				{ name: "Wallet", role: "Dompet", order: 1 },
			],
		};

		it("revising one screen preserves canonical header, nav and tokens identical to other screens", () => {
			const initialHome = assembleCanonicalShell(
				'<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content><p>Original balance</p></main></body></html>',
				blueprint,
				"Home",
				null,
			);
			const initialWallet = assembleCanonicalShell(
				'<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content><p>Cards list</p></main></body></html>',
				blueprint,
				"Wallet",
				null,
			);

			const revisedHome = assembleCanonicalShell(
				'<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content><p>Updated balance with filter: Rp 25.000.000</p><div class="quick-actions"><button data-primary>Transfer</button></div></main></body></html>',
				blueprint,
				"Home",
				null,
			);

			const dOriginal = doc(initialHome);
			const dRevised = doc(revisedHome);
			const dWallet = doc(initialWallet);

			expect(dOriginal.querySelector("nav")?.innerHTML).toBe(
				dRevised.querySelector("nav")?.innerHTML,
			);
			expect(
				dRevised
					.querySelector('nav a[aria-current="page"]')
					?.getAttribute("data-destination"),
			).toBe("home");
			expect(
				dWallet
					.querySelector('nav a[aria-current="page"]')
					?.getAttribute("data-destination"),
			).toBe("wallet");

			expect(dRevised.querySelector("#studio-canonical-style")?.innerHTML).toBe(
				dWallet.querySelector("#studio-canonical-style")?.innerHTML,
			);

			expect(
				dRevised.querySelector("[data-studio-content]")?.textContent,
			).toContain("Updated balance with filter: Rp 25.000.000");
		});
	});
});
