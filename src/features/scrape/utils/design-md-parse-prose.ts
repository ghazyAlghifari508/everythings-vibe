import type {
	InspectorComponent,
	InspectorGuideline,
} from "./design-md-inspector";

// Prose sections of an archived DESIGN.md: rules, theme narrative, component
// notes and the confidence caveats the archive recorded.

export function parseGuidelines(lines: string[]): {
	dos: InspectorGuideline[];
	donts: InspectorGuideline[];
} {
	const dos: InspectorGuideline[] = [];
	const donts: InspectorGuideline[] = [];
	for (const rawLine of lines) {
		const bullet = rawLine.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/);
		if (!bullet?.[1]) continue;
		const raw = bullet[1].trim();
		if (!raw || /^_?evidence/i.test(raw)) continue;
		const text = raw.replace(/\*\*/g, "").replace(/^_|_$/g, "").trim();
		const negative = /^(don't|dont|do\s+not)\b/i.test(text);
		// The canonical document labels each rule so the raw markdown stays
		// readable; the label is redundant once grouped, so it is not shown twice.
		const display = text
			.replace(/^(?:don't|dont|do\s+not|do)\s*:\s*/i, "")
			.trim();
		if (!display) continue;
		if (negative) donts.push({ rule: display, evidence: "" });
		else dos.push({ rule: display, evidence: "" });
	}
	return { dos, donts };
}

export function parseThemeOverview(
	lines: string[],
	fallback: { theme: "light" | "dark" | "unknown"; overview: string },
): { theme: "light" | "dark" | "unknown"; overview: string } {
	let theme = fallback.theme;
	const overviewLines: string[] = fallback.overview ? [fallback.overview] : [];
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#") || line.startsWith("|")) continue;
		const themeMatch = line.replace(/\*\*/g, "").match(/^theme\s*:\s*(\w+)/i);
		if (themeMatch) {
			const value = (themeMatch[1] ?? "").toLowerCase();
			theme = value === "light" || value === "dark" ? value : "unknown";
			continue;
		}
		if (/^measured from /i.test(line)) continue;
		if (/^analysis scope:/i.test(line)) continue;
		if (/^-+\s*captured /i.test(line)) continue;
		overviewLines.push(line.replace(/\*\*/g, ""));
	}
	return { theme, overview: overviewLines.join("\n").trim() };
}

export function parseComponents(lines: string[]): InspectorComponent[] {
	const components: InspectorComponent[] = [];
	let current: {
		name: string;
		description: string[];
		evidence: string;
	} | null = null;
	for (const rawLine of lines) {
		const heading = rawLine.match(/^###\s+(.*)$/);
		if (heading) {
			if (current?.name)
				components.push({
					name: current.name,
					description: current.description.join(" ").trim(),
					evidence: current.evidence,
					frequency: 0,
				});
			current = {
				name: (heading[1] ?? "").trim(),
				description: [],
				evidence: "",
			};
			continue;
		}
		if (!current) continue;
		const line = rawLine.trim();
		if (!line) continue;
		const evidence = line.match(/^\*\*Evidence:\*\*\s*(.*)$/);
		if (evidence) {
			current.evidence = (evidence[1] ?? "").trim();
			continue;
		}
		if (/^reuse this treatment/i.test(line)) continue;
		if (line.startsWith("|")) continue;
		current.description.push(line.replace(/\*\*/g, ""));
	}
	if (current?.name)
		components.push({
			name: current.name,
			description: current.description.join(" ").trim(),
			evidence: current.evidence,
			frequency: 0,
		});
	return components.filter(
		(component) => component.name || component.description,
	);
}

export function parseLimitations(lines: string[], version: number): string[] {
	const current = version >= 2;
	const items: string[] = [];
	for (const rawLine of lines) {
		if (rawLine.trim().startsWith("#")) continue;
		const bullet = rawLine.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/)?.[1];
		if (bullet) {
			const text = bullet.trim();
			if (text.length > 0) items.push(text);
			continue;
		}
		if (!current) {
			const text = rawLine.replace(/^\s*[-*]\s*/, "").trim();
			if (text.length > 0) items.push(text);
		}
	}
	return items;
}
