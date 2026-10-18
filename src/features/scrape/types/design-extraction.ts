export interface DesignExtraction {
	colors: { role: string; value: string }[];
	typography: { family: string }[];
	layout_patterns: string[];
	components: string[];
	typographyRoles?: {
		role: string;
		family: string;
		weight: string;
		size: string;
		lineHeight: string;
		letterSpacing: string;
	}[];
	ctaButtons?: {
		text?: string;
		family: string;
		weight: string;
		size: string;
		bg: string;
		color: string;
		radius: string;
		padding: string;
		border: string;
	}[];
	tokens?: {
		spacing: string[];
		radii: string[];
		shadows: string[];
		maxWidths: string[];
		lineHeights: string[];
		letterSpacing: string[];
		cssVariables: Record<string, string>;
	};
	metadata: {
		title?: string;
		description?: string;
		theme?: "light" | "dark" | "unknown";
		pagesAnalyzed: string[];
		pagesFailed: number;
	};
}
