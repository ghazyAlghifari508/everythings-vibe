// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioFrameRow } from "@/db/schema";
import { exportProjectAsZip, sanitizeFilename } from "./studio-export";

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
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		];

		beforeEach(() => {
			global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
			global.URL.revokeObjectURL = vi.fn();
		});

		it("exports ready frames into ZIP archive and triggers download", async () => {
			const clickSpy = vi.fn();
			vi.spyOn(document.body, "appendChild");
			vi.spyOn(document.body, "removeChild");

			// Mock HTMLAnchorElement click
			const originalCreateElement = document.createElement.bind(document);
			vi.spyOn(document, "createElement").mockImplementation((tagName) => {
				const el = originalCreateElement(tagName);
				if (tagName === "a") {
					el.click = clickSpy;
				}
				return el;
			});

			await exportProjectAsZip("Finance Mobile App", mockFrames);

			expect(global.URL.createObjectURL).toHaveBeenCalled();
			expect(clickSpy).toHaveBeenCalled();
		});

		it("rejects empty output rather than acknowledging a nonexistent download", async () => {
			await expect(exportProjectAsZip("Empty App", [])).rejects.toThrow();
			expect(global.URL.createObjectURL).not.toHaveBeenCalled();
		});
		it("rejects unavailable required assets rather than exporting broken private references", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response(null, { status: 404 })),
			);
			await expect(
				exportProjectAsZip("Sample", [
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
