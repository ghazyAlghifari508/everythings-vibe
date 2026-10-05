// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenIncompleteSync } from "./screen-incomplete-sync";

afterEach(() => {
	cleanup();
});

describe("ScreenIncompleteSync", () => {
	it("explains that the repository is not fully synced and offers a restart", () => {
		render(
			<ScreenIncompleteSync
				projectName="<sample repo>"
				onStartSync={() => {}}
			/>,
		);
		expect(
			screen.getByText("Repository belum selesai disinkronkan"),
		).toBeDefined();
		expect(
			screen.getByText(
				/Setup repository ini belum selesai\. Mulai ulang sync untuk melanjutkan\./,
			),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: /Mulai ulang sync/i }),
		).toBeDefined();
	});

	it("does not create a session on render, only on explicit click", () => {
		const onStartSync = vi.fn();
		const { rerender } = render(
			<ScreenIncompleteSync
				projectName="<sample repo>"
				onStartSync={onStartSync}
			/>,
		);
		expect(onStartSync).not.toHaveBeenCalled();
		rerender(
			<ScreenIncompleteSync
				projectName="<sample repo>"
				onStartSync={onStartSync}
			/>,
		);
		expect(onStartSync).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: /Mulai ulang sync/i }));
		expect(onStartSync).toHaveBeenCalledTimes(1);
	});

	it("disables the restart button while a session is starting", () => {
		render(
			<ScreenIncompleteSync
				projectName="<sample repo>"
				isStarting
				onStartSync={() => {}}
			/>,
		);
		const button = screen.getByRole("button");
		expect(button).toHaveProperty("disabled", true);
		expect(button.textContent).toContain("Menyiapkan...");
	});
});
