import colorsCsv from "../skills/ui-ux-pro-max/data/colors.csv?raw";
import landingCsv from "../skills/ui-ux-pro-max/data/landing.csv?raw";
import productsCsv from "../skills/ui-ux-pro-max/data/products.csv?raw";
import tailwindCsv from "../skills/ui-ux-pro-max/data/stacks/html-tailwind.csv?raw";
import typographyCsv from "../skills/ui-ux-pro-max/data/typography.csv?raw";
import uxGuidelinesCsv from "../skills/ui-ux-pro-max/data/ux-guidelines.csv?raw";

function parseCsv(text: string): string[][] {
	const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
	return lines.map((line) => {
		const result: string[] = [];
		let current = "";
		let inQuotes = false;
		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			if (char === '"') {
				if (inQuotes && line[i + 1] === '"') {
					current += '"';
					i++;
				} else {
					inQuotes = !inQuotes;
				}
			} else if (char === "," && !inQuotes) {
				result.push(current.trim());
				current = "";
			} else {
				current += char;
			}
		}
		result.push(current.trim());
		return result;
	});
}

function tokenize(str: string): string[] {
	return str
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter((t) => t.length > 2);
}

function scoreMatch(text: string, queryTokens: string[]): number {
	const lower = text.toLowerCase();
	let score = 0;
	for (const token of queryTokens) {
		if (lower.includes(token)) score += 1;
	}
	return score;
}

export interface UiUxProMaxRecommendation {
	productType: string;
	primaryStyle: string;
	colorPalette: {
		primary: string;
		secondary: string;
		accent: string;
		background: string;
		foreground: string;
		notes: string;
	} | null;
	typography: {
		pairingName: string;
		headingFont: string;
		bodyFont: string;
		googleFontsUrl: string;
	} | null;
	landingPattern?: {
		name: string;
		sectionOrder: string;
		ctaPlacement: string;
	};
	highPriorityUxGuidelines: Array<{
		issue: string;
		description: string;
		doRule: string;
	}>;
	tailwindBestPractices: Array<{
		guideline: string;
		goodPractice: string;
	}>;
}

export function lookupUiUxProMaxDesignSystem(
	query: string,
	mode: "web" | "mobile" = "web",
): UiUxProMaxRecommendation {
	const tokens = tokenize(query);

	// 1. Products lookup
	const productRows = parseCsv(productsCsv).slice(1);
	let bestProduct = productRows[0];
	let bestProductScore = -1;
	for (const row of productRows) {
		const keywords = `${row[1] ?? ""} ${row[2] ?? ""}`;
		const score = scoreMatch(keywords, tokens);
		if (score > bestProductScore) {
			bestProductScore = score;
			bestProduct = row;
		}
	}
	const productType = bestProduct
		? (bestProduct[1] ?? "SaaS (General)")
		: "SaaS (General)";
	const primaryStyle = bestProduct
		? (bestProduct[3] ?? "Minimalism & Swiss Style")
		: "Minimalism & Swiss Style";

	// 2. Colors lookup
	const colorRows = parseCsv(colorsCsv).slice(1);
	const matchedColor =
		colorRows.find(
			(row) => row[1]?.toLowerCase() === productType.toLowerCase(),
		) ?? colorRows[0];
	const colorPalette = matchedColor
		? {
				primary: matchedColor[2] || "#2563EB",
				secondary: matchedColor[4] || "#3B82F6",
				accent: matchedColor[6] || "#EA580C",
				background: matchedColor[8] || "#F8FAFC",
				foreground: matchedColor[9] || "#1E293B",
				notes: matchedColor[18] || "",
			}
		: null;

	// 3. Typography lookup
	const typoRows = parseCsv(typographyCsv).slice(1);
	let bestTypo = typoRows[0];
	let bestTypoScore = -1;
	for (const row of typoRows) {
		const text = `${row[1] ?? ""} ${row[5] ?? ""} ${row[6] ?? ""}`;
		const score = scoreMatch(text, tokens);
		if (score > bestTypoScore) {
			bestTypoScore = score;
			bestTypo = row;
		}
	}
	const typography = bestTypo
		? {
				pairingName: bestTypo[1] ?? "Modern Professional",
				headingFont: bestTypo[3] ?? "Inter",
				bodyFont: bestTypo[4] ?? "Inter",
				googleFontsUrl: bestTypo[7] ?? "",
			}
		: null;

	// 4. Landing pattern lookup (for web)
	let landingPattern: UiUxProMaxRecommendation["landingPattern"];
	if (mode === "web") {
		const landingRows = parseCsv(landingCsv).slice(1);
		let bestLanding = landingRows[0];
		let bestLandingScore = -1;
		for (const row of landingRows) {
			const text = `${row[1] ?? ""} ${row[2] ?? ""}`;
			const score = scoreMatch(text, tokens);
			if (score > bestLandingScore) {
				bestLandingScore = score;
				bestLanding = row;
			}
		}
		if (bestLanding) {
			landingPattern = {
				name: bestLanding[1] ?? "Hero + Features + CTA",
				sectionOrder: bestLanding[3] ?? "",
				ctaPlacement: bestLanding[4] ?? "",
			};
		}
	}

	// 5. Critical UX Guidelines (Severity High or Critical)
	const uxRows = parseCsv(uxGuidelinesCsv).slice(1);
	const highPriorityUx = uxRows
		.filter(
			(row) =>
				(row[9] ?? "").toLowerCase() === "high" ||
				(row[9] ?? "").toLowerCase() === "critical",
		)
		.slice(0, 4)
		.map((row) => ({
			issue: row[2] ?? "",
			description: row[4] ?? "",
			doRule: row[5] ?? "",
		}));

	// 6. Tailwind best practices
	const tailwindRows = parseCsv(tailwindCsv).slice(1);
	const tailwindTips = tailwindRows.slice(0, 3).map((row) => ({
		guideline: row[2] ?? "",
		goodPractice: row[4] ?? "",
	}));

	return {
		productType,
		primaryStyle,
		colorPalette,
		typography,
		landingPattern,
		highPriorityUxGuidelines: highPriorityUx,
		tailwindBestPractices: tailwindTips,
	};
}

export function formatUiUxProMaxPlanningAddendum(
	rec: UiUxProMaxRecommendation,
): string {
	const lines: string[] = [
		`\n--- UI UX PRO MAX BOUNDED LOOKUP RECOMMENDATIONS (Planning Context) ---`,
		`Matched Product Domain: ${rec.productType}`,
		`Recommended Style: ${rec.primaryStyle}`,
	];

	if (rec.colorPalette) {
		lines.push(
			`Color Palette Tokens: primary=${rec.colorPalette.primary}, secondary=${rec.colorPalette.secondary}, accent=${rec.colorPalette.accent}, bg=${rec.colorPalette.background}, text=${rec.colorPalette.foreground}`,
		);
	}
	if (rec.typography) {
		lines.push(
			`Typography Pairing: ${rec.typography.pairingName} (Heading: ${rec.typography.headingFont}, Body: ${rec.typography.bodyFont})`,
		);
	}
	if (rec.landingPattern) {
		lines.push(
			`Recommended Page Pattern: ${rec.landingPattern.name} (Order: ${rec.landingPattern.sectionOrder})`,
		);
	}
	if (rec.highPriorityUxGuidelines.length > 0) {
		lines.push(`Core UX Invariants:`);
		for (const ux of rec.highPriorityUxGuidelines) {
			lines.push(`  - [${ux.issue}]: ${ux.doRule}`);
		}
	}
	lines.push(
		`-------------------------------------------------------------------------\n`,
	);
	return lines.join("\n");
}
