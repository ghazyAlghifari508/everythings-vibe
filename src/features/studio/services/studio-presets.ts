export const STUDIO_DESIGN_PRESETS = [
	{
		id: "workspace",
		version: 1,
		name: "Workspace",
		description: "Netral, padat, struktur jelas",
		colors: ["#ffffff", "#0f172a", "#2563eb"],
		font: "Inter",
		radius: "8px",
	},
	{
		id: "editorial",
		version: 1,
		name: "Editorial",
		description: "Tipografi serif, ruang baca luas",
		colors: ["#faf8f5", "#292524", "#9a3412"],
		font: "Lora",
		radius: "4px",
	},
	{
		id: "midnight",
		version: 1,
		name: "Midnight",
		description: "Surface gelap, kontras tegas",
		colors: ["#101828", "#f9fafb", "#93c5fd"],
		font: "Manrope",
		radius: "12px",
	},
] as const;

export function getStudioPresetDesignMd(id: string): string | null {
	const preset = STUDIO_DESIGN_PRESETS.find((entry) => entry.id === id);
	if (!preset) return null;
	return `# ${preset.name} (System preset v${preset.version})
${preset.description}
Font: ${preset.font}
## Colors
| Name | Hex | Role |
| Canvas | ${preset.colors[0]} | Page background |
| Ink | ${preset.colors[1]} | Primary text |
| Primary | ${preset.colors[2]} | Brand accent |
### Border Radius
| Element | Value |
| cards | ${preset.radius} |
| buttons | ${preset.radius} |
### Do
- Use an 8px spacing scale with 16px control padding and 24px section spacing.
- Keep all screens consistent with this reference; accessible contrast and readable type take priority.
- Use solid surfaces, structural borders and restrained elevation.`;
}
