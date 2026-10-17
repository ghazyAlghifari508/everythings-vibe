/**
 * Persists AC content without re-running the AI (save-recovery path).
 * Throws with the server's message so the caller can surface a toast.
 */
export async function saveAcContent(
	projectId: string,
	content: string,
): Promise<void> {
	const response = await fetch("/api/ac/save", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ projectId, content }),
	});
	const data = await response.json();
	if (!response.ok) throw new Error(data.error || "Gagal menyimpan AC");
}
