import { eq } from "drizzle-orm";
import { afterEach } from "vitest";
import { db } from "@/db";
import { studioFrames, studioProjects, users } from "@/db/schema";
import { indexStudioElements } from "../services/studio-element-document";
import { prepareStudioElementRevision } from "../services/studio-element-revision";
import type { StudioElementRequest } from "../types/studio-element";

const owners: string[] = [];
export const html =
	'<!doctype html><html><head></head><body><nav>Navbar</nav><main><section id="hero">Hero</section><section id="stats"><h2>Statistics</h2></section><section id="projects">Projects</section></main><footer>Contact</footer></body></html>';
export async function fixture(source = html, revision = 5) {
	const userId = crypto.randomUUID();
	owners.push(userId);
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	const [project] = await db
		.insert(studioProjects)
		.values({ userId, title: "Portfolio" })
		.returning();
	const frames = await db
		.insert(studioFrames)
		.values(
			[0, 1].map((order) => ({
				projectId: project.id,
				name: `Frame ${order}`,
				order,
				htmlCode: source,
				status: "ready",
				revision,
			})),
		)
		.returning();
	const context = {
		projectId: project.id,
		frameId: frames[0].id,
		baseRevision: revision,
	};
	const entry = indexStudioElements(source, context).elements.find(
		(item) => item.selector === "#stats",
	);
	if (!entry) throw new Error("Missing target");
	return {
		userId,
		project,
		frames,
		input: {
			requestId: crypto.randomUUID(),
			prompt: "Hapus section ini saja. Pertahankan bagian lain.",
			target: { ...entry, bounds: { x: 0, y: 20, width: 100, height: 50 } },
		},
	};
}
export async function stored(frameId: string) {
	const [frame] = await db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.id, frameId));
	return frame;
}
export async function prepareWithRevision(
	userId: string,
	input: StudioElementRequest,
) {
	const revision = await prepareStudioElementRevision(userId, input);
	if (!revision) throw new Error("Expected a revision for changed content");
	return revision;
}

afterEach(async () => {
	for (const id of owners.splice(0))
		await db.delete(users).where(eq(users.id, id));
});
