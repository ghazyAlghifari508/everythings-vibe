import { describe, expect, it } from "vitest";
import { crawlWebsite } from "@/features/scrape/services/crawl-website";
import { crawlSettingsSchema } from "@/features/scrape/types/scrape-contract";

function settings(overrides = {}) {
	return crawlSettingsSchema.parse(overrides);
}

describe("structured extraction", () => {
	it("decodes HTML entities in text and headings", async () => {
		const pages = await crawlWebsite(
			"https://sample.example/",
			settings({ maxDepth: 0 }),
			{
				load: async (url) => ({
					html: "<html><head><title>A &amp; B</title></head><body><main><h1>Harga &lt;Murah&gt;</h1><p>Diskon &quot;50%&quot; &amp; gratis &copy; 2024</p></main></body></html>",
					status: 200,
					finalUrl: url,
				}),
				robots: async () => "",
			},
		);
		const content = pages[0].content;
		expect(content).not.toBeNull();
		expect(content?.text).not.toContain("&amp;");
		expect(content?.text).not.toContain("&lt;");
		expect(content?.text).not.toContain("&quot;");
		expect(content?.text).toContain("&");
		expect(content?.headings.join(" ")).toContain("<Murah>");
	});

	it("preserves heading levels instead of flattening", async () => {
		const pages = await crawlWebsite(
			"https://sample.example/",
			settings({ maxDepth: 0 }),
			{
				load: async (url) => ({
					html: "<html><body><main><h1>Pricing</h1><h2>Choose a plan</h2><h2>FAQ</h2></main></body></html>",
					status: 200,
					finalUrl: url,
				}),
				robots: async () => "",
			},
		);
		const content = pages[0].content;
		expect(content).not.toBeNull();
		expect(content?.headings).toEqual(["Pricing", "Choose a plan", "FAQ"]);
		expect(content?.headingLevels).toEqual([
			{ level: 1, text: "Pricing" },
			{ level: 2, text: "Choose a plan" },
			{ level: 2, text: "FAQ" },
		]);
	});

	it("builds content sections from headings", async () => {
		const pages = await crawlWebsite(
			"https://sample.example/",
			settings({ maxDepth: 0 }),
			{
				load: async (url) => ({
					html: "<html><body><main><h2>Plans</h2><p>Starter Pro</p><h2>Questions</h2><p>How to pay?</p></main></body></html>",
					status: 200,
					finalUrl: url,
				}),
				robots: async () => "",
			},
		);
		const sections = pages[0].content?.sections ?? [];
		expect(sections.length).toBeGreaterThanOrEqual(2);
		expect(sections[0].title).toBe("Plans");
		expect(sections[0].text).toContain("Starter");
		expect(sections[1].title).toBe("Questions");
	});

	it("splits internal and external links from observed hrefs", async () => {
		const pages = await crawlWebsite(
			"https://sample.example/",
			settings({ maxDepth: 0 }),
			{
				load: async (url) => ({
					html: '<html><body><main><a href="/pricing">Pricing</a><a href="https://luar.example.net/x">Luar</a></main></body></html>',
					status: 200,
					finalUrl: url,
				}),
				robots: async () => "",
			},
		);
		const content = pages[0].content;
		expect(content?.internalLinks).toContain("https://sample.example/pricing");
		expect(content?.externalLinks).toContain("https://luar.example.net/x");
		expect(content?.outgoingPages).toContain("https://sample.example/pricing");
		expect(content?.outgoingPages).not.toContain("https://luar.example.net/x");
	});

	it("reads description regardless of attribute order and og fallback", async () => {
		const reversed = await crawlWebsite(
			"https://sample.example/",
			settings({ maxDepth: 0 }),
			{
				load: async (url) => ({
					html: '<html><head><meta content="Deskripsi &amp; ringkas" name="description"></head><body><main><p>Isi</p></main></body></html>',
					status: 200,
					finalUrl: url,
				}),
				robots: async () => "",
			},
		);
		expect(reversed[0].content?.description).toContain("Deskripsi & ringkas");

		const og = await crawlWebsite(
			"https://sample.example/",
			settings({ maxDepth: 0 }),
			{
				load: async (url) => ({
					html: '<html><head><meta property="og:description" content="OG deskripsi"></head><body><main><p>Isi</p></main></body></html>',
					status: 200,
					finalUrl: url,
				}),
				robots: async () => "",
			},
		);
		expect(og[0].content?.description).toBe("OG deskripsi");
	});

	it("prefers role=main content when mainContentOnly", async () => {
		const pages = await crawlWebsite(
			"https://sample.example/",
			settings({ maxDepth: 0, mainContentOnly: true }),
			{
				load: async (url) => ({
					html: '<html><body><nav>Navigasi promo</nav><div role="main"><h1>Konten utama</h1><p>Isi penting</p></div></body></html>',
					status: 200,
					finalUrl: url,
				}),
				robots: async () => "",
			},
		);
		expect(pages[0].content?.text).toContain("Isi penting");
		expect(pages[0].content?.text).not.toContain("Navigasi promo");
	});
});
