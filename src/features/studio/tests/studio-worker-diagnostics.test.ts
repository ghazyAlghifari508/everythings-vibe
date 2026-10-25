import assert from "node:assert/strict";
import { it } from "vitest";
import { studioWorkerFailure } from "../services/studio-worker-diagnostics";

it("retains category and stack locations without exception payloads", () => {
	const error = Object.assign(new Error("postgres://secret prompt document"), {
		code: "ERR_UNKNOWN_FILE_EXTENSION",
	});
	const diagnostic = studioWorkerFailure(error, "module-load");
	assert.equal(diagnostic.cause, "ERR_UNKNOWN_FILE_EXTENSION");
	assert.equal(diagnostic.code, "STUDIO_WORKER_MODULE_LOAD_FAILED");
	assert.ok(diagnostic.stack?.length);
	assert.ok(!JSON.stringify(diagnostic).includes("secret"));
	assert.equal(
		studioWorkerFailure("private", "database").code,
		"STUDIO_WORKER_DATABASE_FAILED",
	);
});
