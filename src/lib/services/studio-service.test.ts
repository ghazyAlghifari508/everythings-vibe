import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createStudioProject,
	reviseStudioProject,
	sanitizeSvg,
	validateAndProcessLogo,
} from "./studio-service";

// Mock database
const mockDb = {
	insert: vi.fn(),
	select: vi.fn(),
	update: vi.fn(),
};

vi.mock("@/db", () => ({
	db: {
		insert: (...args: unknown[]) => mockDb.insert(...args),
		select: (...args: unknown[]) => mockDb.select(...args),
		update: (...args: unknown[]) => mockDb.update(...args),
	},
}));

vi.mock("./ai-orchestrator", () => ({
	selectModels: () => [],
	tryStreamWithFallback: async () => ({
		firstChunk: "<html><body><h1>Generated Page</h1></body></html>",
		generator: (async function* () {})(),
	}),
}));

describe("Studio Service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("validateAndProcessLogo", () => {
		it("accepts valid PNG logo", () => {
			const pngHeader = Buffer.from([
				0x89, 0x50, 0x4e, 0x47, 0x00, 0x00,
			]).toString("base64");
			const result = validateAndProcessLogo({
				filename: "my-logo.png",
				mimeType: "image/png",
				data: pngHeader,
			});
			expect(result.mimeType).toBe("image/png");
			expect(result.filename).toBe("my-logo.png");
			expect(result.byteLength).toBe(6);
		});

		it("accepts valid WebP logo", () => {
			const riff = Buffer.from("RIFF1234WEBPextra").toString("base64");
			const result = validateAndProcessLogo({
				filename: "logo.webp",
				mimeType: "image/webp",
				data: riff,
			});
			expect(result.mimeType).toBe("image/webp");
		});

		it("sanitizes and accepts valid SVG logo", () => {
			const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M0 0h10v10H0z"/></svg>`;
			const base64 = Buffer.from(rawSvg).toString("base64");
			const result = validateAndProcessLogo({
				filename: "logo.svg",
				mimeType: "image/svg+xml",
				data: base64,
			});
			const decoded = Buffer.from(result.data, "base64").toString("utf8");
			expect(decoded).not.toContain("<script>");
			expect(decoded).toContain("<path");
		});

		it("rejects .fig files", () => {
			expect(() =>
				validateAndProcessLogo({
					filename: "design.fig",
					mimeType: "image/png",
					data: Buffer.from("abc").toString("base64"),
				}),
			).toThrow(/fig/i);
		});

		it("rejects unsupported mime types", () => {
			expect(() =>
				validateAndProcessLogo({
					filename: "doc.txt",
					mimeType: "text/plain",
					data: Buffer.from("abc").toString("base64"),
				}),
			).toThrow(/tidak didukung/i);
		});

		it("rejects oversized logo files (> 2MB)", () => {
			const bigBuf = Buffer.alloc(2 * 1024 * 1024 + 10);
			expect(() =>
				validateAndProcessLogo({
					filename: "big.png",
					mimeType: "image/png",
					data: bigBuf.toString("base64"),
				}),
			).toThrow(/2MB/i);
		});
	});

	describe("sanitizeSvg", () => {
		it("removes script tags and event handlers", () => {
			const dirty = `<svg onload="alert(1)"><script>evil()</script><a href="javascript:void(0)">link</a></svg>`;
			const clean = sanitizeSvg(dirty);
			expect(clean).not.toContain("alert(1)");
			expect(clean).not.toContain("evil()");
			expect(clean).not.toContain("javascript:void(0)");
		});
	});

	describe("createStudioProject", () => {
		it("creates a web project with design mode stored", async () => {
			const mockProject = {
				id: "proj-1",
				userId: "user-1",
				title: "Landing Page",
				designMode: "web",
				designMd: null,
				logoAssetId: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			const mockRevision = {
				id: "rev-1",
				projectId: "proj-1",
				prompt: "Buat landing page",
				htmlCode: "<html><body><h1>Generated Page</h1></body></html>",
				version: 1,
				createdAt: new Date(),
			};

			mockDb.insert
				.mockReturnValueOnce({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([mockProject]),
					}),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([mockRevision]),
					}),
				});

			const result = await createStudioProject("user-1", {
				title: "Landing Page",
				prompt: "Buatkan landing page produk fintech yang elegan",
				designMode: "web",
			});

			expect(result.project.id).toBe("proj-1");
			expect(result.revision.version).toBe(1);
			expect(result.project.designMode).toBe("web");
		});

		it("creates a mobile project with attached DESIGN.md and logo", async () => {
			const pngHeader = Buffer.from([
				0x89, 0x50, 0x4e, 0x47, 0x00, 0x00,
			]).toString("base64");
			const mockAsset = {
				id: "asset-1",
				userId: "user-1",
				filename: "logo.png",
				mimeType: "image/png",
				byteLength: 6,
				data: pngHeader,
				createdAt: new Date(),
			};
			const mockProject = {
				id: "proj-2",
				userId: "user-1",
				title: "Mobile App",
				designMode: "mobile",
				designMd: "## Tokens - Colors\n| Canvas | #000000 |",
				logoAssetId: "asset-1",
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			const mockRevision = {
				id: "rev-2",
				projectId: "proj-2",
				prompt: "Buat aplikasi mobile",
				htmlCode: "<html><body><h1>Generated Page</h1></body></html>",
				version: 1,
				createdAt: new Date(),
			};

			// Insert asset
			mockDb.insert.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([mockAsset]),
				}),
			});
			// Insert project
			mockDb.insert.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([mockProject]),
				}),
			});
			// Update asset projectId
			mockDb.update.mockReturnValueOnce({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			});
			// Insert revision
			mockDb.insert.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([mockRevision]),
				}),
			});

			const result = await createStudioProject("user-1", {
				title: "Mobile App",
				prompt: "Buatkan antarmuka mobile e-commerce dengan tabs",
				designMode: "mobile",
				designMd: "## Tokens - Colors\n| Canvas | #000000 |",
				logo: {
					filename: "logo.png",
					mimeType: "image/png",
					data: pngHeader,
				},
			});

			expect(result.project.designMode).toBe("mobile");
			expect(result.project.logoAssetId).toBe("asset-1");
		});
	});

	describe("reviseStudioProject", () => {
		it("preserves project design mode and references when revising", async () => {
			const mockProject = {
				id: "proj-1",
				userId: "user-1",
				title: "Dashboard",
				designMode: "mobile",
				designMd: "## Tokens - Colors",
				logoAssetId: "asset-1",
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			const mockRevisions = [
				{
					id: "rev-1",
					projectId: "proj-1",
					prompt: "Initial prompt",
					htmlCode: "<html><body>v1</body></html>",
					version: 1,
					createdAt: new Date(),
				},
			];

			mockDb.select
				// getStudioProject -> project
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([mockProject]),
						}),
					}),
				})
				// getStudioProject -> revisions
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockResolvedValue(mockRevisions),
						}),
					}),
				});

			const mockNextRevision = {
				id: "rev-2",
				projectId: "proj-1",
				prompt: "Ubah tombol",
				htmlCode: "<html><body>v2</body></html>",
				version: 2,
				createdAt: new Date(),
			};

			mockDb.insert.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([mockNextRevision]),
				}),
			});

			mockDb.update.mockReturnValueOnce({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			});

			const revision = await reviseStudioProject(
				"proj-1",
				"user-1",
				"Ubah warna tombol jadi hijau",
			);

			expect(revision.version).toBe(2);
		});
	});
});
