// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, expect, it } from "vitest";
import { useStudioFrameDevices } from "../hooks/use-studio-frame-devices";
import {
	readStudioFrameDevices,
	studioFrameDeviceStorageKey,
	writeStudioFrameDevices,
} from "../services/studio-frame-devices";

const key = studioFrameDeviceStorageKey("user-1", "project-1");
const frameIds = ["frame-1", "frame-2"];

function Probe() {
	const { frameDevices, setFrameDevice } = useStudioFrameDevices({
		userId: "user-1",
		projectId: "project-1",
		frameIds,
	});
	return (
		<>
			<output data-testid="devices">{JSON.stringify(frameDevices)}</output>
			<button
				type="button"
				onClick={() => setFrameDevice("frame-1", "tablet")}
			>
				set
			</button>
		</>
	);
}

beforeEach(() => sessionStorage.clear());

it("renders server markup without the session viewport preference", () => {
	writeStudioFrameDevices(key, { "frame-1": "desktop" });
	const html = renderToString(<Probe />);
	// A stored preset must not reach the first render: the server cannot read it
	// and a mismatch here is the hydration error observed in P12 browser QA.
	expect(html).toContain("{}");
	expect(html).not.toContain("desktop");
});

it("adopts the stored preference after mount and keeps writing it back", () => {
	writeStudioFrameDevices(key, { "frame-1": "desktop" });
	render(<Probe />);
	expect(JSON.parse(screen.getByTestId("devices").textContent ?? "{}")).toEqual(
		{ "frame-1": "desktop" },
	);
	expect(readStudioFrameDevices(key, frameIds)).toEqual({ "frame-1": "desktop" });

	fireEvent.click(screen.getByRole("button", { name: "set" }));
	expect(readStudioFrameDevices(key, frameIds)).toEqual({
		"frame-1": "tablet",
	});
});