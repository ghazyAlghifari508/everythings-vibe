// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { ScreenConnectPromptStep } from "../components/workspace/screen-connect-prompt-step";

afterEach(cleanup);
test("an active upload without a browser token never offers a replacement credential", () => {
	render(
		<ScreenConnectPromptStep
			projectName="Repository"
			payload={null}
			isStarting={false}
			status={{
				projectId: "repo",
				sessionId: "session",
				status: "uploading",
				expiresAt: new Date(0).toISOString(),
			}}
			onRequestNewToken={() => {
				throw new Error("must not renew");
			}}
		/>,
	);
	expect(screen.queryByRole("button")).toBeNull();
});
test("a completed upload never exposes its still-valid credential or billing lock", () => {
	render(
		<ScreenConnectPromptStep
			projectName="Repository"
			isStarting={false}
			transportComplete
			payload={{
				projectId: "repo",
				sessionId: "session",
				apiBaseUrl: "https://test.local",
				syncToken: "secret",
				syncCommand: "sync",
				cliMinVersion: "2.0.0",
				expiresAt: new Date(Date.now() + 60000).toISOString(),
			}}
			lockedPrompt={{
				variant: "insufficient",
				title: "Blocked",
				description: "Credits",
			}}
			onRequestNewToken={() => {
				throw new Error("must not renew");
			}}
		/>,
	);
	expect(screen.queryByRole("button")).toBeNull();
	expect(screen.queryByTestId("locked-prompt-region")).toBeNull();
});
