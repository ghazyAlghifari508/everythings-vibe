function capitalize(label: string): string {
	return label.length === 0
		? label
		: label.charAt(0).toUpperCase() + label.slice(1);
}

export function displaySiteName(domain: string): string {
	const host = domain.trim().toLowerCase();
	if (!host) return "";
	const labels = host.split(".").filter(Boolean);
	const withoutWww =
		labels.length > 1 && labels[0] === "www" ? labels.slice(1) : labels;
	const label = withoutWww[0] ?? "";
	return capitalize(label);
}
