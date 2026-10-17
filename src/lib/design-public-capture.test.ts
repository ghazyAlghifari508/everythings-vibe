import { expect, it } from "vitest";
import {
	closeRenderBrowser,
	renderPage,
} from "@/features/scrape/services/render-page";
import { inspectorFromEvidence } from "./design-md-inspector";
import { designIssues, generateDesignMd } from "./prompts-design-md";

it("verifies public capture measurements agree with the document and inspector", async () => {
	const urls = process.env.SCRAPE_VERIFY_URLS?.split(",").filter(Boolean) ?? [];
	for (const url of urls) {
		try {
			const captured = await renderPage(url, { mode: "design" });
			expect(captured.visualEvidence).toBeDefined();
			if (!captured.visualEvidence) throw new Error("No evidence");
			const { document } = await generateDesignMd(captured.visualEvidence);
			expect(designIssues(document, captured.visualEvidence)).toEqual([]);
			const inspector = inspectorFromEvidence(captured.visualEvidence);
			expect(
				inspector?.colors.every((color) => document.includes(color.value)),
			).toBe(true);
			console.info(
				JSON.stringify({
					sourceUrl: captured.finalUrl,
					status: captured.status,
					observations: captured.visualEvidence.elements.length,
					palette: inspector?.colors,
					typography: inspector?.typography,
					fontFaces: captured.visualEvidence.fonts,
					limitations: captured.visualEvidence.limitations,
				}),
			);
		} catch (error) {
			if (
				error instanceof Error &&
				"code" in error &&
				error.code === "WEBSITE_BLOCKED"
			)
				console.info(
					JSON.stringify({
						sourceUrl: url,
						blocked: true,
						reason: error.message,
					}),
				);
			else throw error;
		} finally {
			await closeRenderBrowser();
		}
	}
}, 300000);
