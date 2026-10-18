import { describe, expect, it } from "vitest";
import type { StudioDesignBlueprint } from "../services/studio-design-blueprint";
import { validateBlueprint } from "../services/studio-design-blueprint";
import { enforceDesignSystemOnHtml } from "../services/studio-design-system-html";
import {
	areNavigationStructuresConsistent,
	extractNavigationStructure,
	validateGeneratedHtml,
} from "../services/studio-generated-html-validation";

const blueprint: StudioDesignBlueprint = {
	productIdentity: {
		productName: "Aplikasi Contoh",
		targetAudience: "Umum",
		platform: "mobile",
		visualDirection: "Bersih",
	},
	designTokens: {
		primary: "#0f0f0f",
		secondary: "#606060",
		background: "#ffffff",
		surface: "#f8f8f8",
		fontFamily: "system-ui",
		radius: 12,
		border: "1px solid #d3d3d3",
		elevation: "none",
	},
	sharedComponents: {
		header: "Bar",
		navigation: "Tabs",
		buttons: "Ink",
		inputs: "8px",
		cards: "12px",
		tabs: "Seg",
		icons: "Lucide",
	},
	navigationContract: {
		destinations: ["alpha", "beta"],
		labels: ["Alpha", "Beta"],
		iconMapping: { alpha: "home", beta: "user" },
		ordering: ["alpha", "beta"],
		activeItemRule: "Tandai item aktif",
	},
	screenPlan: [
		{ name: "Alpha", role: "Layar utama", order: 0 },
		{ name: "Beta", role: "Layar kedua", order: 1 },
	],
};

function validMobile(inner: string): string {
	return enforceDesignSystemOnHtml(
		`<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${inner}</body></html>`,
		null,
		null,
		blueprint,
	);
}

describe("validateGeneratedHtml output contract", () => {
	it("menolak penanda markdown yang tersisa di luar blok code", () => {
		const html = validMobile(
			"<nav>Alpha Beta</nav><main><p>```</p><p>Konten</p></main>",
		);
		const issues = validateGeneratedHtml(html, {
			blueprint,
			viewport: "mobile",
			expectTokens: false,
		});
		expect(issues.length).toBeGreaterThan(0);
	});

	it("menerima blok code yang sah tanpa false positive", () => {
		const html = validMobile(
			"<nav>Alpha Beta</nav><main><pre><code>```contoh```</code></pre></main>",
		);
		expect(
			validateGeneratedHtml(html, {
				blueprint,
				viewport: "mobile",
				expectTokens: false,
			}),
		).toEqual([]);
	});

	it("menolak body tanpa konten renderable", () => {
		const issues = validateGeneratedHtml(
			"<html><head></head><body>   </body></html>",
			{ blueprint: null, viewport: "web", expectTokens: false },
		);
		expect(issues.length).toBeGreaterThan(0);
	});

	it("menolak dokumen tanpa penutup body yang eksplisit", () => {
		const issues = validateGeneratedHtml(
			"<html><head></head><body><p>Konten</p></html>",
			{ blueprint: null, viewport: "web", expectTokens: false },
		);
		expect(issues.length).toBeGreaterThan(0);
	});

	it("menolak lebar tetap yang melampaui viewport mobile kanonis", () => {
		const html = validMobile(
			'<nav>Alpha Beta</nav><main style="width:500px">Konten</main>',
		);
		const issues = validateGeneratedHtml(html, {
			blueprint,
			viewport: "mobile",
			expectTokens: false,
		});
		expect(issues.some((issue) => issue.toLowerCase().includes("lebar"))).toBe(
			true,
		);
	});

	it("menolak label navigasi di luar urutan kontrak", () => {
		const html = validMobile("<nav>Beta Alpha</nav>");
		const issues = validateGeneratedHtml(html, {
			blueprint,
			viewport: "mobile",
			expectTokens: false,
		});
		expect(issues.length).toBeGreaterThan(0);
	});

	it("menolak label yang hanya muncul di luar elemen nav", () => {
		const html = validMobile("<nav>Menu</nav><main><p>Alpha Beta</p></main>");
		const issues = validateGeneratedHtml(html, {
			blueprint,
			viewport: "mobile",
			expectTokens: false,
		});
		expect(issues.length).toBeGreaterThan(0);
	});

	it("menolak tab set penuh yang diduplikasi di dua nav", () => {
		const html = validMobile("<nav>Alpha Beta</nav><nav>Alpha Beta</nav>");
		const issues = validateGeneratedHtml(html, {
			blueprint,
			viewport: "mobile",
			expectTokens: false,
		});
		expect(issues.length).toBeGreaterThan(0);
	});
});

describe("konsistensi navigasi lintas frame", () => {
	it("mengekstrak label terstruktur dari nav", () => {
		const structure = extractNavigationStructure(
			validMobile("<nav>Alpha Beta</nav>"),
			blueprint,
		);
		expect(structure.labels).toEqual(["Alpha", "Beta"]);
		expect(structure.navCount).toBe(1);
	});

	it("menganggap dua frame konsisten bila struktur sama dan hanya status aktif beda", () => {
		const first = extractNavigationStructure(
			validMobile('<nav><a aria-current="page">Alpha</a><a>Beta</a></nav>'),
			blueprint,
		);
		const second = extractNavigationStructure(
			validMobile('<nav><a>Alpha</a><a aria-current="page">Beta</a></nav>'),
			blueprint,
		);
		expect(areNavigationStructuresConsistent(first, second)).toBe(true);
	});

	it("mendeteksi drift urutan dan label antar frame", () => {
		const first = extractNavigationStructure(
			validMobile("<nav>Alpha Beta</nav>"),
			blueprint,
		);
		const reordered = extractNavigationStructure(
			validMobile("<nav>Beta Alpha</nav>"),
			blueprint,
		);
		const relabeled = extractNavigationStructure(
			validMobile("<nav>Alpha Gamma</nav>"),
			blueprint,
		);
		expect(areNavigationStructuresConsistent(first, reordered)).toBe(false);
		expect(areNavigationStructuresConsistent(first, relabeled)).toBe(false);
	});
});

describe("validateBlueprint navigation contract", () => {
	it("menolak ordering yang bukan permutasi destinasi", () => {
		const mismatch = {
			...blueprint,
			navigationContract: {
				...blueprint.navigationContract,
				ordering: ["beta", "gamma"],
			},
		};
		expect(validateBlueprint(mismatch).ok).toBe(false);
	});

	it("menolak ordering dengan panjang berbeda dari destinasi", () => {
		const short = {
			...blueprint,
			navigationContract: {
				...blueprint.navigationContract,
				ordering: ["alpha"],
			},
		};
		expect(validateBlueprint(short).ok).toBe(false);
	});
});
