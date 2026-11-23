import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { studioFrames, studioProjects } from "@/db/schema";
import type { StudioPrototypeLoaderData } from "../types/studio-prototype";
import { StudioFrameError } from "./studio-frame-errors";
import { deriveStudioPrototypeScreens } from "./studio-prototype-screens";

export async function readStudioPrototypeShell(
	projectId: string,
	userId: string,
): Promise<StudioPrototypeLoaderData> {
	const [project] = await db
		.select({
			id: studioProjects.id,
			title: studioProjects.title,
			designBlueprint: studioProjects.designBlueprint,
		})
		.from(studioProjects)
		.where(
			and(eq(studioProjects.id, projectId), eq(studioProjects.userId, userId)),
		)
		.limit(1);
	if (!project) throw new StudioFrameError("STUDIO_NOT_FOUND");
	const frames = await db
		.select({
			id: studioFrames.id,
			name: studioFrames.name,
			status: studioFrames.status,
			htmlCode: studioFrames.htmlCode,
			viewport: studioFrames.viewport,
			order: studioFrames.order,
		})
		.from(studioFrames)
		.where(eq(studioFrames.projectId, project.id))
		.orderBy(asc(studioFrames.order));
	const screens = deriveStudioPrototypeScreens(frames, project.designBlueprint);
	return {
		projectId: project.id,
		title: project.title,
		screens,
		viewports: Object.fromEntries(
			frames
				.filter((frame) => screens.some((screen) => screen.id === frame.id))
				.map((frame) => [frame.id, frame.viewport]),
		),
	};
}
