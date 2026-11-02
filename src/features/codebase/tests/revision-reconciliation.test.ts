import { describe, expect, it } from "vitest";
import { reconcileTasks } from "../services/revision-reconciliation";

describe("reconcileTasks", () => {
	it("preserves in_progress and completed tasks without resetting status or deleting notes", () => {
		const existing = [
			{
				id: "t1",
				title: "Frontend auth UI",
				description: "Notes: handled via modal",
				status: "in_progress",
				subtasks: [{ name: "Form", status: "completed" }],
				priority: "high",
				covers: ["AC-1.1"],
				surfaces: ["Login"],
				featureName: "Auth",
				order: 0,
			},
			{
				id: "t2",
				title: "Backend auth endpoint",
				description: "Notes: JWT handler done",
				status: "completed",
				subtasks: [{ name: "Endpoint", status: "completed" }],
				priority: "high",
				covers: ["AC-1.2"],
				surfaces: [],
				featureName: "Auth",
				order: 1,
			},
			{
				id: "t3",
				title: "Old pending task",
				description: "Unstarted",
				status: "pending",
				subtasks: [],
				priority: "medium",
				covers: ["AC-1.3"],
				surfaces: [],
				featureName: "Auth",
				order: 2,
			},
		];

		const proposed = {
			features: [
				{
					name: "Auth",
					tasks: [
						{
							name: "Frontend auth UI",
							description: "Updated notes: support OAuth",
							priority: "high" as const,
							covers: ["AC-1.1", "AC-1.4"],
							surfaces: ["Login"],
							subtasks: [{ name: "Form", description: "", details: [] }],
						},
						{
							name: "New OAuth callback",
							description: "Handle callback route",
							priority: "medium" as const,
							covers: ["AC-1.4"],
							surfaces: [],
							subtasks: [],
						},
					],
				},
			],
		};

		const result = reconcileTasks(existing, proposed);

		// Item categorization
		const actions = result.items.map((i) => ({
			name: i.name,
			action: i.action,
		}));
		expect(actions).toContainEqual({
			name: "Frontend auth UI",
			action: "modified",
		});
		expect(actions).toContainEqual({
			name: "New OAuth callback",
			action: "added",
		});
		expect(actions).toContainEqual({
			name: "Backend auth endpoint",
			action: "needs_review",
		});
		expect(actions).toContainEqual({
			name: "Old pending task",
			action: "superseded",
		});

		// Final tasks to persist
		const finalAuthUi = result.tasksToPersist.find(
			(t) => t.title === "Frontend auth UI",
		);
		expect(finalAuthUi?.status).toBe("in_progress"); // NEVER reset to To Do
		expect(finalAuthUi?.subtasks).toEqual([
			{ name: "Form", status: "completed" },
		]); // Preserves subtask completion

		const completedBackend = result.tasksToPersist.find(
			(t) => t.title === "Backend auth endpoint",
		);
		expect(completedBackend).toBeDefined();
		expect(completedBackend?.status).toBe("completed"); // Kept intact

		const addedOauth = result.tasksToPersist.find(
			(t) => t.title === "New OAuth callback",
		);
		expect(addedOauth?.status).toBe("pending");
	});
});
