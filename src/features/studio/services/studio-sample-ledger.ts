import { JSDOM } from "jsdom";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";

/**
 * Cross-screen sample-data consistency.
 *
 * The plan owns one sample ledger (`blueprint.sampleData`) and every screen is
 * built from it, so the same booking cannot show two prices or two order
 * references. A screen may only show an amount or a reference the ledger
 * declares; anything else is a concrete contract breach, reported so the frame
 * gets exactly one bounded correction instead of shipping drifted sample data.
 *
 * Only grouped amounts are checked (`Rp 2.850.000`, `Rp4.900.000`). Filter or
 * range labels such as `Rp1.5 Juta`, `Rp2 - 4 Juta` and `Rp5 Juta` carry no
 * thousands group, so they are ignored: they are UI affordances, not sample
 * records. The separator between the currency token and the digits is
 * normalised away, because markup decides whether the two end up in one text
 * node or two; the amount itself is compared exactly.
 */

const GROUPED_AMOUNT = /\d{1,3}(?:[.,]\d{3})+/;
// Bounded by a non-code character on both sides so a longer code that embeds a
// shorter shape (`JLJ-LBJ-88291` contains `LBJ-88291`) is reported once.
const REFERENCE_SHAPES = [
	/(?<![A-Z0-9-])[A-Z]{2,6}-[A-Z0-9]{2,8}-\d{3,}(?![A-Z0-9-])/g,
	/(?<![A-Z0-9-])[A-Z]{2,6}-\d{4,}(?![A-Z0-9-])/g,
];

const normalize = (value: string) => value.replace(/\s+/g, "");

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every currency-token occurrence, with the separator between token and digits removed. */
function currencyAmounts(text: string, currency: string): string[] {
	const pattern = new RegExp(`${escapeRegExp(currency)}\\s*\\d[\\d.,]*`, "g");
	return [...text.matchAll(pattern)].map((match) => normalize(match[0]));
}

function orderReferences(text: string): string[] {
	const found = new Set<string>();
	for (const shape of REFERENCE_SHAPES) {
		for (const match of text.matchAll(shape)) {
			found.add(match[0].replace(/^#+/, ""));
		}
	}
	return [...found];
}

/** Rendered text of the screen, without code samples the copy may quote. */
function renderableText(html: string): string {
	const dom = new JSDOM(html);
	try {
		const { document } = dom.window;
		for (const code of document.querySelectorAll("code,pre")) code.remove();
		return (document.body?.textContent ?? "").replace(/\u00a0/g, " ");
	} finally {
		dom.window.close();
	}
}

export function validateStudioSampleLedger(
	html: string,
	blueprint: StudioDesignBlueprint | null | undefined,
): string[] {
	const ledger = blueprint?.sampleData;
	if (!ledger) return [];
	const declaredPrices = new Map(
		(ledger.samplePrices ?? []).map((value) => [normalize(value), value]),
	);
	const declaredReferences = new Map(
		(ledger.sampleReferences ?? []).map((value) => [
			value.replace(/^#+/, "").toUpperCase(),
			value,
		]),
	);
	if (!declaredPrices.size && !declaredReferences.size) return [];
	const text = renderableText(html);
	const issues: string[] = [];
	if (declaredPrices.size) {
		const undeclared = new Set(
			currencyAmounts(text, ledger.currency ?? "Rp").filter(
				(amount) => GROUPED_AMOUNT.test(amount) && !declaredPrices.has(amount),
			),
		);
		if (undeclared.size)
			issues.push(
				`Harga di luar data contoh: ${[...undeclared].join(", ")}. Gunakan hanya ${[...declaredPrices.values()].join(", ")}.`,
			);
	}
	if (declaredReferences.size) {
		const undeclared = new Set(
			orderReferences(text).filter(
				(value) => !declaredReferences.has(value.toUpperCase()),
			),
		);
		if (undeclared.size)
			issues.push(
				`Referensi pesanan di luar data contoh: ${[...undeclared].join(", ")}. Gunakan hanya ${[...declaredReferences.values()].join(", ")}.`,
			);
	}
	return issues;
}
