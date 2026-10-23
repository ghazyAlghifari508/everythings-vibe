export function studioWorkerFailure(error: unknown, stage: string) {
	const cause =
		error instanceof Error &&
		"code" in error &&
		typeof error.code === "string" &&
		/^[A-Z0-9_]+$/.test(error.code)
			? error.code
			: error instanceof Error
				? error.name
				: "UnknownError";
	return {
		scope: "studio",
		stage,
		code: `STUDIO_WORKER_${stage.replaceAll("-", "_").toUpperCase()}_FAILED`,
		cause,
		// Exception messages can contain prompts or connection strings; retain only source locations.
		stack:
			process.env.NODE_ENV !== "production" && error instanceof Error
				? error.stack?.split("\n").flatMap((line) => {
						const location = line.match(
							/(?:file:\/\/\/)?(?:[A-Za-z]:[\\/]|\/)[^\s()?#]+:\d+:\d+/,
						)?.[0];
						return location && !location.includes("://")
							? [location]
							: location?.startsWith("file:///")
								? [location]
								: [];
					})
				: undefined,
	};
}
