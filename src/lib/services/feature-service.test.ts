import { describe, expect, it } from "vitest";
import {
	FEATURE_TREE_MISSING_MESSAGE,
	findUnknownSubfeatureIds,
	formatFeatureTreeBlock,
	parseFeatureTreeJson,
} from "./feature-service";

interface MutableSubfeature {
	id: string;
	name: string;
	description: string;
}

interface MutableFeature {
	id: string;
	name: string;
	phase: number;
	description: string;
	subfeatures: MutableSubfeature[];
}

interface MutableTree {
	productName: string;
	features: MutableFeature[];
	createdAt: string;
}

function validTree(): MutableTree {
	return {
		productName: "Produk Contoh",
		features: [
			{
				id: "feat-1",
				name: "Akses Pengguna",
				phase: 1,
				description: "Pengguna masuk dan mengelola sesi.",
				subfeatures: [
					{
						id: "subfeat-1.1",
						name: "Masuk",
						description: "Pengguna masuk dengan kredensial.",
					},
					{
						id: "subfeat-1.2",
						name: "Keluar",
						description: "Pengguna mengakhiri sesi.",
					},
				],
			},
			{
				id: "feat-2",
				name: "Katalog",
				phase: 2,
				description: "Pengguna menelusuri item.",
				subfeatures: [
					{
						id: "subfeat-2.1",
						name: "Daftar",
						description: "Menampilkan daftar item.",
					},
					{
						id: "subfeat-2.2",
						name: "Cari",
						description: "Mencari item berdasarkan kata kunci.",
					},
				],
			},
		],
		createdAt: new Date().toISOString(),
	};
}

function requireParsed(source: string) {
	const parsed = parseFeatureTreeJson(source);
	if (!parsed) throw new Error("fixture failed to parse");
	return parsed;
}

describe("parseFeatureTreeJson", () => {
	it("accepts a well-formed tree", () => {
		const parsed = parseFeatureTreeJson(JSON.stringify(validTree()));
		expect(parsed?.productName).toBe("Produk Contoh");
		expect(parsed?.features).toHaveLength(2);
		expect(parsed?.features[0].subfeatures).toHaveLength(2);
	});

	it("rejects malformed JSON and empty shapes", () => {
		expect(parseFeatureTreeJson("{ not json")).toBeNull();
		expect(parseFeatureTreeJson(JSON.stringify({}))).toBeNull();
		expect(parseFeatureTreeJson(JSON.stringify({ features: [] }))).toBeNull();
	});

	it("rejects feature ids outside the feat-N format", () => {
		const tree = validTree();
		tree.features[0].id = "feature-1";
		expect(parseFeatureTreeJson(JSON.stringify(tree))).toBeNull();
	});

	it("rejects subfeature ids outside the subfeat-N.M format", () => {
		const tree = validTree();
		tree.features[0].subfeatures[0].id = "sub-1";
		expect(parseFeatureTreeJson(JSON.stringify(tree))).toBeNull();
	});

	it("rejects a subfeature whose prefix does not match its parent feature", () => {
		const tree = validTree();
		tree.features[0].subfeatures[0].id = "subfeat-2.1";
		expect(parseFeatureTreeJson(JSON.stringify(tree))).toBeNull();
	});

	it("rejects duplicate feature and subfeature ids", () => {
		const dupFeature = validTree();
		dupFeature.features[1].id = "feat-1";
		expect(parseFeatureTreeJson(JSON.stringify(dupFeature))).toBeNull();

		const dupSub = validTree();
		dupSub.features[1].subfeatures[0].id = "subfeat-1.1";
		expect(parseFeatureTreeJson(JSON.stringify(dupSub))).toBeNull();
	});

	it("rejects subfeature counts outside 2-5", () => {
		const one = validTree();
		one.features[0].subfeatures = [
			{
				id: "subfeat-1.1",
				name: "Masuk",
				description: "Pengguna masuk dengan kredensial.",
			},
		];
		expect(parseFeatureTreeJson(JSON.stringify(one))).toBeNull();

		const six = validTree();
		six.features[0].subfeatures = Array.from({ length: 6 }, (_, i) => ({
			id: `subfeat-1.${i + 1}`,
			name: `Sub ${i + 1}`,
			description: "Perilaku konkret.",
		}));
		expect(parseFeatureTreeJson(JSON.stringify(six))).toBeNull();
	});

	it("rejects phases outside 1-3", () => {
		const tree = validTree();
		tree.features[0].phase = 4;
		expect(parseFeatureTreeJson(JSON.stringify(tree))).toBeNull();
	});
});

describe("findUnknownSubfeatureIds", () => {
	it("returns ids with no entry in the tree", () => {
		const tree = requireParsed(JSON.stringify(validTree()));
		expect(
			findUnknownSubfeatureIds(["subfeat-1.1", "subfeat-9.9"], tree),
		).toEqual(["subfeat-9.9"]);
	});

	it("returns empty when every id is grounded", () => {
		const tree = requireParsed(JSON.stringify(validTree()));
		expect(
			findUnknownSubfeatureIds(["subfeat-1.1", "subfeat-2.2"], tree),
		).toEqual([]);
	});
});

describe("formatFeatureTreeBlock", () => {
	it("declares the 1:1 structure with the SSOT clause", () => {
		const tree = requireParsed(JSON.stringify(validTree()));
		const block = formatFeatureTreeBlock(tree);
		expect(block).toContain("DAFTAR FITUR & SUBFITUR WAJIB");
		expect(block).toContain("DILARANG");
		expect(block).toContain("feat-1");
		expect(block).toContain("subfeat-2.1");
		expect(block).toContain("Fase 1");
		expect(block).toContain("Fase 2");
	});
});

describe("FEATURE_TREE_MISSING_MESSAGE", () => {
	it("is actionable Indonesian copy pointing at the Fitur page", () => {
		expect(FEATURE_TREE_MISSING_MESSAGE).toMatch(/Fitur/);
		expect(FEATURE_TREE_MISSING_MESSAGE.length).toBeGreaterThan(20);
	});
});
