import { afterEach, describe, expect, it, vi } from "vitest";
import * as elementHttp from "../services/studio-element-http";
import { StudioFrameError } from "../services/studio-frame-errors";
import { POST } from "../services/studio-frame-http";

vi.mock("@/lib/session", () => ({
	requireUser: async () => ({ id: "user-123" }),
}));
vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: () => new Headers(),
}));
afterEach(() => vi.restoreAllMocks());

describe("scoped revision HTTP boundary", () => {
	it("returns a scoped revision conflict through the HTTP error contract", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(elementHttp, "mutateStudioElementHttp").mockRejectedValueOnce(
			new StudioFrameError("STUDIO_STALE_REVISION"),
		);
		const res = await POST({
			request: new Request("https://app.test/api/studio/frame", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Origin: "https://app.test",
				},
				body: JSON.stringify({
					action: "element-transition",
					projectId: "proj-1",
					revisionId: crypto.randomUUID(),
					transition: "apply",
				}),
			}),
		});
		expect(res.status).toBe(409);
		expect(await res.json()).toMatchObject({ code: "STUDIO_STALE_REVISION" });
	});
	it("rejects cross-origin and missing-origin scoped mutations before executing them", async () => {
		const mutation = vi.spyOn(elementHttp, "mutateStudioElementHttp");
		for (const origin of ["https://evil.test", null]) {
			const headers = new Headers({ "Content-Type": "application/json" });
			if (origin) headers.set("Origin", origin);
			const res = await POST({
				request: new Request("https://app.test/api/studio/frame", {
					method: "POST",
					headers,
					body: JSON.stringify({
						action: "element-transition",
						projectId: "proj-1",
						revisionId: crypto.randomUUID(),
						transition: "apply",
					}),
				}),
			});
			expect(res.status).toBe(403);
		}
		expect(mutation).not.toHaveBeenCalled();
	});
});
