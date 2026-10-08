import { describe, expect, it } from "vitest";
import { extractDesignFromHtml } from "./design-extraction";

const sampleHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Acme Studio — Modern Creative Tools</title>
  <meta name="description" content="Build aesthetic apps with Acme.">
  <style>
    @font-face {
      font-family: 'Geist';
      font-weight: 100 900;
    }
    :root {
      --brand-primary: #6366f1;
      --bg-surface: #0f172a;
      --spacing-card: 24px;
      --radius-btn: 12px;
    }
    body {
      background-color: #0f172a;
      color: #f8fafc;
      font-family: 'Geist', sans-serif;
    }
    h1 {
      font-family: 'Geist', sans-serif;
      font-size: 56px;
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -0.02em;
    }
    h2 {
      font-family: 'Geist', sans-serif;
      font-size: 32px;
      font-weight: 700;
      line-height: 1.2;
    }
    p {
      font-size: 16px;
      font-weight: 400;
      line-height: 1.5;
    }
    .btn-cta {
      background-color: #6366f1;
      color: #ffffff;
      font-weight: 600;
      font-size: 16px;
      border-radius: 12px;
      padding: 12px 24px;
      border: 1px solid #4f46e5;
    }
    .card {
      background-color: #1e293b;
      border-radius: 16px;
      padding: 24px;
    }
  </style>
</head>
<body>
  <header>
    <nav>
      <a href="/features">Features</a>
      <a href="/pricing">Pricing</a>
    </nav>
  </header>
  <main>
    <section class="hero">
      <h1>Design systems made effortless</h1>
      <p>Export production tokens, guidelines, and components directly.</p>
      <button class="btn-cta">Start free trial</button>
    </section>
    <section class="features">
      <h2>Core primitives</h2>
      <div class="card">
        <h3>Design tokens</h3>
        <p>Colors, typography, and elevation scales.</p>
      </div>
    </section>
  </main>
  <footer>
    <p>© 2026 Acme Corp</p>
  </footer>
</body>
</html>`;

describe("extractDesignFromHtml", () => {
	it("extracts structured DesignExtraction from HTML and styles", () => {
		const extraction = extractDesignFromHtml(
			sampleHtml,
			"https://acme.example.com",
		);

		// Colors
		expect(extraction.colors.length).toBeGreaterThan(0);
		expect(
			extraction.colors.some((c) =>
				["#6366f1", "#0f172a", "#1e293b", "#ffffff"].includes(
					c.value.toLowerCase(),
				),
			),
		).toBe(true);

		// Typography
		expect(extraction.typography.length).toBeGreaterThan(0);
		expect(
			extraction.typography.some((f) =>
				f.family.toLowerCase().includes("geist"),
			),
		).toBe(true);

		// Typography roles
		expect(extraction.typographyRoles).toBeDefined();
		expect(extraction.typographyRoles?.some((r) => r.role === "h1")).toBe(true);

		// CTA Buttons
		expect(extraction.ctaButtons).toBeDefined();
		expect(extraction.ctaButtons?.length).toBeGreaterThan(0);
		const cta = extraction.ctaButtons?.[0];
		expect(cta?.text).toBe("Start free trial");
		expect(cta?.bg.toLowerCase()).toBe("#6366f1");

		// Font faces
		expect(extraction.fontFaces).toBeDefined();
		expect(
			extraction.fontFaces?.some((f) =>
				f.family.toLowerCase().includes("geist"),
			),
		).toBe(true);

		// Components
		expect(extraction.components).toContain("navigation/header");
		expect(extraction.components).toContain("hero section");
		expect(extraction.components).toContain("button/CTA");
		expect(extraction.components).toContain("card");
		expect(extraction.components).toContain("footer");

		// Tokens
		expect(extraction.tokens?.cssVariables["--brand-primary"]).toBe("#6366f1");
		expect(extraction.tokens?.radii).toContain("12px");

		// Metadata
		expect(extraction.metadata.title).toBe(
			"Acme Studio — Modern Creative Tools",
		);
		expect(extraction.metadata.description).toBe(
			"Build aesthetic apps with Acme.",
		);
		expect(extraction.confidence_score).toBeGreaterThan(0);
	});
});
