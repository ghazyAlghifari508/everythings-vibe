import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionMocks = vi.hoisted(() => ({
	getSession:
		vi.fn<
			(input: { headers: Headers }) => Promise<{
				user: { id: string; email: string; bannedAt?: Date; isAdmin?: boolean };
			} | null>
		>(),
	getRequestHeaders: vi.fn<() => Headers>(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerOnlyFn: <T>(handler: T) => handler,
	createServerFn: () => ({ handler: <T>(handler: T) => handler }),
}));
vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: sessionMocks.getRequestHeaders,
}));
vi.mock("@/lib/auth", () => ({
	auth: { api: { getSession: sessionMocks.getSession } },
}));

import { requireAdmin, requireUser } from "@/lib/session";

describe("shared session authorization contract", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		sessionMocks.getRequestHeaders.mockReturnValue(new Headers());
	});

	it("rejects missing sessions in both actual guards", async () => {
		sessionMocks.getSession.mockResolvedValue(null);
		await expect(requireUser()).rejects.toThrow("Unauthorized");
		await expect(requireAdmin()).rejects.toThrow("Unauthorized");
	});

	it("forwards supplied headers and returns the authenticated identity", async () => {
		const headers = new Headers({ cookie: "session=sample" });
		const user = { id: "owner", email: "owner@example.test" };
		sessionMocks.getSession.mockResolvedValue({ user });
		await expect(requireUser(headers)).resolves.toEqual(user);
		expect(sessionMocks.getSession).toHaveBeenCalledWith({ headers });
		expect(sessionMocks.getRequestHeaders).not.toHaveBeenCalled();
	});

	it("rejects a banned admin through both guards", async () => {
		sessionMocks.getSession.mockResolvedValue({
			user: {
				id: "banned",
				email: "banned@example.test",
				isAdmin: true,
				bannedAt: new Date(),
			},
		});
		await expect(requireUser()).rejects.toThrow("Forbidden");
		await expect(requireAdmin()).rejects.toThrow("Forbidden");
	});

	it("rejects a non-admin and accepts the existing admin flag", async () => {
		const user = { id: "member", email: "member@example.test" };
		sessionMocks.getSession.mockResolvedValue({ user });
		await expect(requireAdmin()).rejects.toThrow("Forbidden");
		const admin = { ...user, isAdmin: true };
		sessionMocks.getSession.mockResolvedValue({ user: admin });
		await expect(requireAdmin()).resolves.toEqual(admin);
	});
});
