export async function adminDb() {
	const { db } = await import("@/db");
	const {
		users,
		subscriptions,
		sessions,
		projects,
		prdVersions,
		acVersions,
		tasks,
		feedback,
		errorReports,
		payments,
	} = await import("@/db/schema");
	return {
		db,
		users,
		subscriptions,
		sessions,
		projects,
		prdVersions,
		acVersions,
		tasks,
		feedback,
		errorReports,
		payments,
	};
}
