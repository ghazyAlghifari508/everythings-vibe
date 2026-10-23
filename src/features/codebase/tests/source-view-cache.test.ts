import { describe, expect, it } from "vitest";
import { buildSourceViewRows } from "../services/source-view";

/**
 * Two documents that share a template have the same length and the same head
 * and tail. A cache keyed on those properties alone hands one page the other
 * page's rows, which shows the wrong code for the file being read.
 */
function sameTemplateDocuments(): [string, string] {
	const head = "<html><head><title>Sama</title></head><body>";
	const tail = "</body></html>";
	const first = `${head}${"A".repeat(200)}1${"B".repeat(200)}${tail}`;
	const second = `${head}${"A".repeat(200)}2${"B".repeat(200)}${tail}`;
	return [first, second];
}

describe("source view cache identity", () => {
	it("never serves one document's rows for another document", () => {
		const [first, second] = sameTemplateDocuments();
		expect(first.length).toBe(second.length);

		const firstView = buildSourceViewRows({
			content: first,
			path: "page.txt",
			mode: "original",
			maxLines: 100,
		});
		const secondView = buildSourceViewRows({
			content: second,
			path: "page.txt",
			mode: "original",
			maxLines: 100,
		});

		expect(secondView.rows[0]?.text).not.toBe(firstView.rows[0]?.text);
		expect(secondView.rows[0]?.text).toContain("2");
		expect(secondView.originalContent).toBe(second);
	});

	it("keeps serving the same rows for the same document", () => {
		const [first] = sameTemplateDocuments();

		const firstView = buildSourceViewRows({
			content: first,
			path: "page.txt",
			mode: "original",
			maxLines: 100,
		});
		const repeatView = buildSourceViewRows({
			content: first,
			path: "page.txt",
			mode: "original",
			maxLines: 100,
		});

		expect(repeatView.rows).toEqual(firstView.rows);
	});
});
