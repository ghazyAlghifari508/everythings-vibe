export function card(overrides: Record<string, unknown> = {}) {
	return {
		id: "task-1",
		type: "task" as const,
		featureName: "Ekspor Ringkasan",
		name: "Tambah tombol ekspor di halaman rekomendasi",
		description: "",
		status: "pending" as const,
		dependencies: [],
		startedAt: null,
		completedAt: null,
		...overrides,
	};
}
export const columns = {
	pending: [card()],
	in_progress: [
		card({
			id: "task-2",
			name: "Kirim ringkasan ke clipboard",
			status: "in_progress" as const,
			subtaskCount: 4,
			subtaskCompleted: 1,
		}),
	],
	completed: [card({ id: "task-3", status: "completed" as const })],
	failed: [],
};
