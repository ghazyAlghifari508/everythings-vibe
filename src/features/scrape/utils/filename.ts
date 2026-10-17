export function safeScrapeFilename(
	domain: string,
	ext: string,
	sourceUrl?: string,
	suffix?: string,
): string {
	let base = domain.replace(/[^a-zA-Z0-9.-]/g, "-").toLowerCase();
	if (sourceUrl) {
		try {
			const parsed = new URL(sourceUrl);
			const segments = parsed.pathname.split("/").filter(Boolean);
			if (segments.length > 0) {
				const pathPart = segments
					.slice(0, 3)
					.join("-")
					.replace(/[^a-zA-Z0-9.-]/g, "-")
					.toLowerCase();
				if (pathPart) base = `${base}-${pathPart}`;
			}
		} catch {
			// ignore invalid URL
		}
	}
	const combined = suffix ? `${base}-${suffix}` : base;
	return `${combined || "site"}.${ext}`;
}
