/** Generate-PRD request text built from the compiled Ask handoff prompt. */
export function buildAutoPrdMessage(prompt: string): string {
	return `Generate PRD lengkap berdasarkan informasi berikut:\n\n${prompt}\n\nGunakan section markers sesuai standar.`;
}
