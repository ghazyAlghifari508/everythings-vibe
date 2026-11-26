// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioFrameRow } from "@/db/schema";
import {
	exportProjectAsZip,
	sanitizeFilename,
} from "../services/studio-export";

describe("studio-export", () => {
	describe("sanitizeFilename", () => {
		it("normalizes and sanitizes strings into safe filenames", () => {
			expect(sanitizeFilename("Dashboard & Analytics!")).toBe(
				"dashboard-analytics",
			);
			expect(sanitizeFilename("Screen #1 (Mobile)")).toBe("screen-1-mobile");
			expect(sanitizeFilename("   ")).toBe("screen");
		});

		it("limits filename length to 50 characters", () => {
			const longName = "a".repeat(100);
			expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(50);
		});
	});

	describe("exportProjectAsZip", () => {
		const mockFrames: StudioFrameRow[] = [
			{
				id: "f-1",
				projectId: "p-1",
				name: "Dashboard",
				description: "Main screen",
				viewport: "mobile",
				htmlCode: "<html><body>Dashboard Content</body></html>",
				status: "ready",
				order: 0,
				error: null,
				attempts: 0,
				visualHash: null,
				promptHash: null,
				originJobId: null,
				initialSlot: null,
				revision: 0,
				lastJobId: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: "f-2",
				projectId: "p-1",
				name: "Transactions",
				description: "List",
				viewport: "mobile",
				htmlCode: "<html><body>Transactions Content</body></html>",
				status: "ready",
				order: 1,
				error: null,
				attempts: 0,
				visualHash: null,
				promptHash: null,
				originJobId: null,
				initialSlot: null,
				revision: 0,
				lastJobId: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: "f-3",
				projectId: "p-1",
				name: "Failed Frame",
				description: "Failed",
				viewport: "mobile",
				htmlCode: null,
				status: "failed",
				order: 2,
				error: "Error",
				attempts: 1,
				visualHash: null,
				promptHash: null,
				originJobId: null,
				initialSlot: null,
				revision: 0,
				lastJobId: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		];

		beforeEach(() => {
			global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
			global.URL.revokeObjectURL = vi.fn();
		});

		it("exports a historic project whose row still carries a retired design skill", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async (url: string) =>
					Response.json({
						html: url.includes("f-1")
							? "<html><body>Dashboard Content</body></html>"
							: "<html><body>Transactions Content</body></html>",
					}),
				),
			);
			// `designSkillId` is retained legacy metadata on the project row; the
			// exporter reads the persisted frames, so a historic project exports
			// exactly like a current one.
			const legacyProject = {
				id: "p-legacy",
				title: "Legacy App",
				designSkillId: "impeccable",
			};
			await exportProjectAsZip(legacyProject.title, legacyProject.id, [
				mockFrames[0],
				mockFrames[1],
			]);
			expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
			vi.unstubAllGlobals();
		});

		it("rejects empty output rather than acknowledging a nonexistent download", async () => {
			await expect(
				exportProjectAsZip("Empty App", "p-1", []),
			).rejects.toThrow();
			expect(global.URL.createObjectURL).not.toHaveBeenCalled();
		});
		it("rejects unavailable required assets rather than exporting broken private references", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async (url: string) =>
					url.includes("document=1")
						? Response.json({
								html: '<html><body><img src="/api/studio/asset?id=asset-1&amp;cap=token"></body></html>',
							})
						: new Response(null, { status: 404 }),
				),
			);
			await expect(
				exportProjectAsZip("Sample", "p-1", [
					{
						...mockFrames[0],
						htmlCode:
							'<html><body><img src="/api/studio/asset?id=asset-1&amp;cap=token"></body></html>',
					},
				]),
			).rejects.toThrow();
			expect(global.URL.createObjectURL).not.toHaveBeenCalled();
			vi.unstubAllGlobals();
		});
	});
});
