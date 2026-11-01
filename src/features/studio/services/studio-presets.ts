export interface StudioThemeTokens {
	canvas: string;
	surface: string;
	ink: string;
	muted: string;
	border: string;
	primary: string;
	primaryForeground: string;
	secondary: string;
	secondaryForeground: string;
	hover: string;
	active: string;
	inputBg: string;
	fontFamily: string;
	radius: string;
}

export const STUDIO_DESIGN_PRESETS = [
	{
		id: "workspace",
		version: 1,
		name: "Workspace",
		description: "Netral, padat, struktur jelas",
		colors: ["#ffffff", "#0f172a", "#2563eb"],
		font: "Inter",
		radius: "8px",
		tokens: {
			canvas: "#ffffff",
			surface: "#f8fafc",
			ink: "#0f172a",
			muted: "#64748b",
			border: "#e2e8f0",
			primary: "#2563eb",
			primaryForeground: "#ffffff",
			secondary: "#f1f5f9",
			secondaryForeground: "#0f172a",
			hover: "#f1f5f9",
			active: "#dbeafe",
			inputBg: "#ffffff",
			fontFamily: "Inter, sans-serif",
			radius: "8px",
		},
	},
	{
		id: "editorial",
		version: 1,
		name: "Editorial",
		description: "Tipografi serif, ruang baca luas",
		colors: ["#faf8f5", "#292524", "#9a3412"],
		font: "Lora",
		radius: "4px",
		tokens: {
			canvas: "#faf8f5",
			surface: "#ffffff",
			ink: "#292524",
			muted: "#78716c",
			border: "#e7e5e4",
			primary: "#9a3412",
			primaryForeground: "#ffffff",
			secondary: "#f5f0eb",
			secondaryForeground: "#292524",
			hover: "#f5f0eb",
			active: "#ffedd5",
			inputBg: "#ffffff",
			fontFamily: "Lora, Georgia, serif",
			radius: "4px",
		},
	},
	{
		id: "midnight",
		version: 1,
		name: "Midnight",
		description: "Surface gelap, kontras tegas",
		colors: ["#101828", "#f9fafb", "#93c5fd"],
		font: "Manrope",
		radius: "12px",
		tokens: {
			canvas: "#101828",
			surface: "#1d2939",
			ink: "#f9fafb",
			muted: "#98a2b3",
			border: "#344054",
			primary: "#93c5fd",
			primaryForeground: "#0f172a",
			secondary: "#1f2a37",
			secondaryForeground: "#f9fafb",
			hover: "#1f2a37",
			active: "#1e3a5f",
			inputBg: "#101828",
			fontFamily: "Manrope, sans-serif",
			radius: "12px",
		},
	},
	{
		id: "jade",
		version: 1,
		name: "Jade",
		description: "Bersih, natural, kontemporer",
		colors: ["#f3f9f5", "#12372b", "#087f5b"],
		font: "Plus Jakarta Sans",
		radius: "10px",
		tokens: {
			canvas: "#f3f9f5",
			surface: "#ffffff",
			ink: "#12372b",
			muted: "#4d7265",
			border: "#d1e7dd",
			primary: "#087f5b",
			primaryForeground: "#ffffff",
			secondary: "#e6f4ea",
			secondaryForeground: "#12372b",
			hover: "#e8f5ee",
			active: "#d3efe0",
			inputBg: "#ffffff",
			fontFamily: "Plus Jakarta Sans, sans-serif",
			radius: "10px",
		},
	},
	{
		id: "orchid",
		version: 1,
		name: "Orchid",
		description: "Kreatif, modern, ekspresif",
		colors: ["#f8f5ff", "#2e1b4b", "#7c3aed"],
		font: "Outfit",
		radius: "14px",
		tokens: {
			canvas: "#f8f5ff",
			surface: "#ffffff",
			ink: "#2e1b4b",
			muted: "#6b5b82",
			border: "#e9d8fd",
			primary: "#7c3aed",
			primaryForeground: "#ffffff",
			secondary: "#f3e8ff",
			secondaryForeground: "#2e1b4b",
			hover: "#f5eefd",
			active: "#ede9fe",
			inputBg: "#ffffff",
			fontFamily: "Outfit, sans-serif",
			radius: "14px",
		},
	},
	{
		id: "rose",
		version: 1,
		name: "Rose",
		description: "Ekspresif, hangat, presisi",
		colors: ["#fff4f7", "#4a1933", "#be185d"],
		font: "DM Sans",
		radius: "8px",
		tokens: {
			canvas: "#fff4f7",
			surface: "#ffffff",
			ink: "#4a1933",
			muted: "#8b5e77",
			border: "#fce7f3",
			primary: "#be185d",
			primaryForeground: "#ffffff",
			secondary: "#fdf2f8",
			secondaryForeground: "#4a1933",
			hover: "#fdf2f8",
			active: "#fce7f3",
			inputBg: "#ffffff",
			fontFamily: "DM Sans, sans-serif",
			radius: "8px",
		},
	},
	{
		id: "amber",
		version: 1,
		name: "Amber",
		description: "Hangat, berwibawa, penuh karakter",
		colors: ["#fffbeb", "#422006", "#b45309"],
		font: "Newsreader",
		radius: "6px",
		tokens: {
			canvas: "#fffbeb",
			surface: "#ffffff",
			ink: "#422006",
			muted: "#785e3a",
			border: "#fde68a",
			primary: "#b45309",
			primaryForeground: "#ffffff",
			secondary: "#fef3c7",
			secondaryForeground: "#422006",
			hover: "#fef3c7",
			active: "#fde68a",
			inputBg: "#ffffff",
			fontFamily: "Newsreader, Georgia, serif",
			radius: "6px",
		},
	},
	{
		id: "arctic",
		version: 1,
		name: "Arctic",
		description: "Segar, teknis, jernih",
		colors: ["#f1fbff", "#123b49", "#0e7490"],
		font: "Space Grotesk",
		radius: "6px",
		tokens: {
			canvas: "#f1fbff",
			surface: "#ffffff",
			ink: "#123b49",
			muted: "#4b6b78",
			border: "#bae6fd",
			primary: "#0e7490",
			primaryForeground: "#ffffff",
			secondary: "#e0f2fe",
			secondaryForeground: "#123b49",
			hover: "#e0f2fe",
			active: "#bae6fd",
			inputBg: "#ffffff",
			fontFamily: "Space Grotesk, monospace",
			radius: "6px",
		},
	},
	{
		id: "graphite",
		version: 1,
		name: "Graphite",
		description: "Terkontrol, netral, profesional",
		colors: ["#fafafa", "#18181b", "#52525b"],
		font: "Geist",
		radius: "4px",
		tokens: {
			canvas: "#fafafa",
			surface: "#ffffff",
			ink: "#18181b",
			muted: "#71717a",
			border: "#e4e4e7",
			primary: "#52525b",
			primaryForeground: "#ffffff",
			secondary: "#f4f4f5",
			secondaryForeground: "#18181b",
			hover: "#f4f4f5",
			active: "#e4e4e7",
			inputBg: "#ffffff",
			fontFamily: "Geist, sans-serif",
			radius: "4px",
		},
	},
] as const;

export type StudioDesignPreset = (typeof STUDIO_DESIGN_PRESETS)[number];

export function getStudioPresetDesignMd(id: string): string | null {
	const preset = STUDIO_DESIGN_PRESETS.find((entry) => entry.id === id);
	if (!preset) return null;
	return `# ${preset.name} (System preset v${preset.version})
${preset.description}
Font: ${preset.font}
## Colors
| Name | Hex | Role |
| Canvas | ${preset.tokens.canvas} | Page background |
| Surface | ${preset.tokens.surface} | Elevated card surface |
| Ink | ${preset.tokens.ink} | Primary text |
| Muted | ${preset.tokens.muted} | Secondary text |
| Primary | ${preset.tokens.primary} | Brand accent |
| Secondary | ${preset.tokens.secondary} | Supporting accent |
| Border | ${preset.tokens.border} | Border hairline |
### Border Radius
| Element | Value |
| cards | ${preset.radius} |
| buttons | ${preset.radius} |
### Do
- Use an 8px spacing scale with 16px control padding and 24px section spacing.
- Keep all screens consistent with this reference; accessible contrast and readable type take priority.
- Use solid surfaces, structural borders and restrained elevation.`;
}
