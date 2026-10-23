import type {
	InspectorColorToken,
	InspectorElevationToken,
	InspectorRadiusToken,
	InspectorSurface,
	InspectorToken,
	InspectorTypeEntry,
	InspectorTypeface,
} from "./design-md-inspector";
import {
	firstCssLength,
	headerIndex,
	normalizeFontWeight,
	parseCount,
	parsePxOnly,
	parseTables,
} from "./design-md-parse-markdown";

// Token sections of an archived DESIGN.md. Only the measured columns of a table
// become values; everything the archive does not state stays empty.

export function parseColors(lines: string[]): InspectorColorToken[] {
	const tables = parseTables(lines);
	if (tables.length === 0) return [];
	const table = tables[0];
	if (!table) return [];
	const nameIdx = headerIndex(table.headers, /name/);
	const valueIdx = headerIndex(table.headers, /value/);
	const tokenIdx = headerIndex(table.headers, /token/);
	const roleIdx = headerIndex(table.headers, /role/);
	const confidenceIdx = headerIndex(table.headers, /confidence/);
	const colors: InspectorColorToken[] = [];
	for (const row of table.rows) {
		const cells = [...row];
		while (cells.length < 4) cells.push("");
		const confidence =
			confidenceIdx >= 0 ? (cells[confidenceIdx] ?? "").toLowerCase() : "";
		const entry: InspectorColorToken = {
			name: nameIdx >= 0 ? (cells[nameIdx] ?? "") : (cells[0] ?? ""),
			value: valueIdx >= 0 ? (cells[valueIdx] ?? "") : (cells[1] ?? ""),
			token: tokenIdx >= 0 ? (cells[tokenIdx] ?? "") : (cells[2] ?? ""),
			role: roleIdx >= 0 ? (cells[roleIdx] ?? "") : (cells[3] ?? ""),
			roleClass: "unknown",
			frequency: 0,
			rationale: "",
			confidence:
				confidence === "observed" ||
				confidence === "inferred" ||
				confidence === "unknown"
					? confidence
					: "unknown",
		};
		if (entry.name || entry.value || entry.token || entry.role)
			colors.push(entry);
	}
	return colors;
}

export function parseTypography(lines: string[]): InspectorTypeEntry[] {
	const tables = parseTables(lines);
	if (tables.length === 0) return [];
	const table = tables[0];
	if (!table) return [];
	const labelIdx = headerIndex(
		table.headers,
		/name|role|scale|style|element|level/,
	);
	const familyIdx = headerIndex(table.headers, /family|font|typeface/);
	const sizeIdx = headerIndex(table.headers, /size/);
	const weightIdx = headerIndex(table.headers, /weight/);
	const lineHeightIdx = headerIndex(table.headers, /line/);
	const letterSpacingIdx = headerIndex(
		table.headers,
		/letter|spacing|tracking/,
	);
	const entries: InspectorTypeEntry[] = [];
	for (const row of table.rows) {
		const label = labelIdx >= 0 ? (row[labelIdx] ?? "") : (row[0] ?? "");
		if (!label && row.every((cell) => cell.length === 0)) continue;
		const size = sizeIdx >= 0 ? (row[sizeIdx] ?? "") : "";
		entries.push({
			role: label,
			family: familyIdx >= 0 ? (row[familyIdx] ?? "") : "",
			size,
			sizePx: parsePxOnly(size),
			weight: weightIdx >= 0 ? (row[weightIdx] ?? "") : "",
			lineHeight: lineHeightIdx >= 0 ? (row[lineHeightIdx] ?? "") : "",
			letterSpacing: letterSpacingIdx >= 0 ? (row[letterSpacingIdx] ?? "") : "",
			frequency: 0,
			sample: "",
		});
	}
	return entries;
}

export function deriveTypefaces(
	entries: InspectorTypeEntry[],
): InspectorTypeface[] {
	const byFamily = new Map<string, InspectorTypeface>();
	for (const entry of entries) {
		if (!entry.family) continue;
		const existing = byFamily.get(entry.family) ?? {
			family: entry.family,
			stack: entry.family,
			weights: [],
			sizes: [],
			roles: [],
			lineHeights: [],
			letterSpacings: [],
			loadedEvidence: false,
			declaredFaces: [],
			uncertainty:
				"Parsed from an archived document, so the declared and rendered fonts are not verified.",
			sample: "",
		};
		const weight = normalizeFontWeight(entry.weight);
		if (weight && !existing.weights.includes(weight))
			existing.weights.push(weight);
		if (entry.size && !existing.sizes.includes(entry.size))
			existing.sizes.push(entry.size);
		if (entry.role && !existing.roles.includes(entry.role))
			existing.roles.push(entry.role);
		byFamily.set(entry.family, existing);
	}
	return [...byFamily.values()];
}

export function parseSpacingShapes(lines: string[]): {
	spacing: InspectorToken[];
	radii: InspectorRadiusToken[];
	elevation: InspectorElevationToken[];
	baseUnitPx: number;
} {
	const spacing: InspectorToken[] = [];
	const radii: InspectorRadiusToken[] = [];
	const elevation: InspectorElevationToken[] = [];
	let baseUnitPx = Number.NaN;
	const baseMatch = lines
		.map((line) =>
			line.replace(/[*`]/g, "").match(/base\s*(?:unit)?\s*[:=]\s*([\d.]+px)/i),
		)
		.find((match) => match !== null);
	if (baseMatch?.[1]) baseUnitPx = Number.parseFloat(baseMatch[1]);
	for (const table of parseTables(lines)) {
		const headerText = table.headers.join(" ").toLowerCase();
		const isRadii = /radius|radii|round|shape|context/.test(headerText);
		const isSpacing =
			/spac|gap|padding|margin|unit|size|scale|token|value|purpose|property|context|measured/.test(
				headerText,
			);
		if (!isRadii && !isSpacing) continue;
		const purposeIdx = headerIndex(
			table.headers,
			/purpose|context|token|radius|label|name/,
		);
		const propertyIdx = headerIndex(table.headers, /property/);
		const valueIdx = headerIndex(table.headers, /value/);
		const measuredIdx = headerIndex(table.headers, /measured/);
		for (const row of table.rows) {
			const label = purposeIdx >= 0 ? (row[purposeIdx] ?? "") : (row[0] ?? "");
			const rawValue = valueIdx >= 0 ? (row[valueIdx] ?? "") : (row[1] ?? "");
			if (!label && !rawValue) continue;
			// The canonical table carries the purpose in the first column, so a
			// radius row is routed by its label as well as the table header.
			if (isRadii || /radius|radii|round/.test(label)) {
				const value = firstCssLength(rawValue) || rawValue;
				const frequency =
					measuredIdx >= 0 ? parseCount(row[measuredIdx] ?? "") : 0;
				radii.push({
					label,
					value,
					valuePx: parsePxOnly(rawValue),
					context: frequency > 0 ? `${frequency} element` : "",
					frequency,
					// An archived document states the shape in its own words. The
					// annotation is the only pill evidence an archive carries.
					pill: /fully rounded|pill/i.test(rawValue),
				});
			} else {
				const property = propertyIdx >= 0 ? (row[propertyIdx] ?? "") : "";
				const frequency =
					measuredIdx >= 0 ? parseCount(row[measuredIdx] ?? "") : 0;
				spacing.push({
					label,
					value: rawValue,
					context:
						property || frequency > 0
							? `${property || "measured"} on ${frequency} element`
							: "",
					frequency,
				});
			}
		}
	}
	// Archived documents may list a spacing scale as bullets rather than a table.
	const seen = new Set(spacing.map((token) => token.label));
	for (const rawLine of lines) {
		if (spacing.length >= 24) break;
		const bullet = rawLine.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/)?.[1];
		if (!bullet) continue;
		const token = bullet.match(/`?(--[\w-]+)`?\s*:\s*`?([\d.]+px)`?/);
		if (!token?.[1] || !token[2] || seen.has(token[1])) continue;
		seen.add(token[1]);
		spacing.push({
			label: token[1],
			value: token[2],
			context: "",
			frequency: 0,
		});
	}
	return { spacing, radii, elevation, baseUnitPx };
}

export function parseSurfaces(lines: string[]): InspectorSurface[] {
	const surfaces: InspectorSurface[] = [];
	for (const table of parseTables(lines)) {
		const headerText = table.headers.join(" ").toLowerCase();
		if (!/level|value|purpose|measured/.test(headerText)) continue;
		const levelIdx = headerIndex(table.headers, /level/);
		const valueIdx = headerIndex(table.headers, /value/);
		const measuredIdx = headerIndex(table.headers, /measured/);
		const purposeIdx = headerIndex(table.headers, /purpose|role/);
		table.rows.forEach((row, rowIndex) => {
			const value = valueIdx >= 0 ? (row[valueIdx] ?? "") : "";
			if (!value) return;
			const level = levelIdx >= 0 ? parseCount(row[levelIdx] ?? "") : rowIndex;
			const frequency =
				measuredIdx >= 0 ? parseCount(row[measuredIdx] ?? "") : 0;
			const roles =
				purposeIdx >= 0
					? (row[purposeIdx] ?? "")
							.split(",")
							.map((role) => role.trim())
							.filter((role) => role.length > 0)
					: [];
			surfaces.push({ value, level, frequency, roles });
		});
	}
	return surfaces;
}

export function parseElevation(lines: string[]): InspectorElevationToken[] {
	const elevation: InspectorElevationToken[] = [];
	for (const table of parseTables(lines)) {
		const headerText = table.headers.join(" ").toLowerCase();
		if (!/shadow/.test(headerText)) continue;
		const shadowIdx = headerIndex(table.headers, /shadow/);
		const measuredIdx = headerIndex(table.headers, /measured/);
		const notesIdx = headerIndex(table.headers, /note/);
		for (const row of table.rows) {
			const value = shadowIdx >= 0 ? (row[shadowIdx] ?? "") : "";
			if (!value) continue;
			elevation.push({
				value,
				frequency: measuredIdx >= 0 ? parseCount(row[measuredIdx] ?? "") : 0,
				roles: [],
				usageNote: notesIdx >= 0 ? (row[notesIdx] ?? "") : "",
				confidence: "unknown",
			});
		}
	}
	return elevation;
}
