// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioPrototypeDrawer } from "../components/preview/studio-prototype-pages";
import type { StudioPrototypeScreen } from "../types/studio-prototype";

const screens: StudioPrototypeScreen[] = [
	{
		id: "browse",
		name: "Jelajah",
		route: "/jelajah",
		destinationId: null,
		order: 0,
	},
	{
		id: "tickets",
		name: "Tiket Saya",
		route: "/tiket",
		destinationId: null,
		order: 1,
	},
];

afterEach(() => cleanup());

describe("Studio prototype page drawer", () => {
	it("opens, selects a page, and closes without a missing-trigger warning", () => {
		const onSelect = vi.fn();
		const onOpenChange = vi.fn();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const view = render(
			<StudioPrototypeDrawer
				open={false}
				onOpenChange={onOpenChange}
				screens={screens}
				currentId="browse"
				onSelect={onSelect}
			/>,
		);

		expect(screen.queryByRole("dialog")).toBeNull();

		view.rerender(
			<StudioPrototypeDrawer
				open={true}
				onOpenChange={onOpenChange}
				screens={screens}
				currentId="browse"
				onSelect={onSelect}
			/>,
		);

		expect(screen.getByRole("heading", { name: "Halaman (2)" })).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: /Tiket Saya/ }));

		expect(onSelect).toHaveBeenCalledWith("tickets");
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(
			warn.mock.calls.some(([message]) =>
				String(message).includes("PressResponder"),
			),
		).toBe(false);
	});
});
