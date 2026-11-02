import { describe, expect, it } from "vitest";
import { errorReports, feedback } from "./schema";

describe("Feedback & Error Report Schema & Migration Definitions", () => {
	it("1. defines handlingStatus column on feedback with default 'new' and not-null constraint", () => {
		expect(feedback.handlingStatus.dataType).toBe("string");
		expect(feedback.handlingStatus.default).toBe("new");
		expect(feedback.handlingStatus.notNull).toBe(true);
	});

	it("2. defines archivedAt column on feedback as nullable timestamp", () => {
		expect(feedback.archivedAt.dataType).toBe("date");
		expect(feedback.archivedAt.notNull).toBe(false);
	});

	it("3. defines handlingStatus column on errorReports with default 'new' and not-null constraint", () => {
		expect(errorReports.handlingStatus.dataType).toBe("string");
		expect(errorReports.handlingStatus.default).toBe("new");
		expect(errorReports.handlingStatus.notNull).toBe(true);
	});

	it("4. defines archivedAt column on errorReports as nullable timestamp", () => {
		expect(errorReports.archivedAt.dataType).toBe("date");
		expect(errorReports.archivedAt.notNull).toBe(false);
	});

	it("5. supports standard payload insertion without requiring handlingStatus or archivedAt", () => {
		// Validating Drizzle type inference for user submission flows
		type NewFeedback = typeof feedback.$inferInsert;
		type NewErrorReport = typeof errorReports.$inferInsert;

		const userFeedback: NewFeedback = {
			id: "fb-test-1",
			message: "Simple user feedback",
		};
		expect(userFeedback.id).toBe("fb-test-1");
		expect(userFeedback.handlingStatus).toBeUndefined();
		expect(userFeedback.archivedAt).toBeUndefined();

		const systemError: NewErrorReport = {
			id: "err-test-1",
			errorMessage: "Unhandled promise rejection",
		};
		expect(systemError.id).toBe("err-test-1");
		expect(systemError.handlingStatus).toBeUndefined();
		expect(systemError.archivedAt).toBeUndefined();
	});
});
