import assert from "node:assert/strict";
import { test } from "vitest";
import { serializeAnalysisError } from "../services/analysis-diagnostics";

test("diagnostics preserve database cause codes without sensitive messages", () => {
	const cause = Object.assign(new Error("private repository content"), {
		code: "23514",
		detail: "secret token",
	});
	const error = new Error("query containing private output", { cause });
	assert.deepEqual(serializeAnalysisError(error), {
		errorName: "Error",
		databaseErrorCode: "23514",
		causeNames: ["Error", "Error"],
	});
	cause.cause = error;
	assert.equal(serializeAnalysisError(error).databaseErrorCode, "23514");
	assert.deepEqual(serializeAnalysisError("secret"), {
		errorName: "NonError",
		causeNames: [],
	});
});
