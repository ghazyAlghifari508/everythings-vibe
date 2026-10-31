import { expect } from "vitest";
import { db } from "@/db";
import { scrapeDocuments, scrapes, users } from "@/db/schema";
import { StudioReferenceError } from "../services/studio-design-reference.server";

// Shared harness for the Studio design-reference suites. Both the compatibility
// matrix and the archived-format suite run the real pipeline against a fake
// orchestrator, so the recording/answering behaviour lives here once.

export interface StudioProviderCall {
	role: string;
	content: string;
}

export const studioProvider = {
	messages: [] as StudioProviderCall[][],
	labels: [] as string[],
};

export function resetStudioProvider(): void {
	studioProvider.messages = [];
	studioProvider.labels = [];
}

// Mirrors the requested screen count so the pipeline never needs a corrective
// round, and repeats the planned nav labels in every frame reply.
export const studioProviderMock = {
	selectModels: () => [],
	tryStreamWithFallback: async (
		_models: unknown,
		messages: StudioProviderCall[],
	) => {
		studioProvider.messages.push(messages);
		if (messages[0]?.content.includes("planning application screens")) {
			const requested = /exactly (\d+)/.exec(messages[1]?.content ?? "");
			const count = Number(requested?.[1] ?? 2);
			const viewport = "web";
			const screens = Array.from({ length: count }, (_, order) => ({
				name: `Screen ${order}`,
				description: "Sample",
				viewport,
				order,
			}));
			studioProvider.labels = screens.map((screen) => screen.name);
			const destinations = screens.map((_, order) => `screen-${order}`);
			return {
				firstChunk: JSON.stringify({
					projectTitle: "Sample",
					screens,
					blueprint: {
						productIdentity: {
							productName: "Sample",
							targetAudience: "General",
							platform: viewport,
							visualDirection: "Clean",
						},
						designTokens: {
							primary: "#0f0f0f",
							secondary: "#606060",
							ink: "#111111",
							muted: "#555555",
							onPrimary: "#ffffff",
							background: "#ffffff",
							surface: "#f8f8f8",
							fontFamily: "Arial",
							radius: 12,
							border: "1px solid #d3d3d3",
							elevation: "none",
						},
						sharedComponents: {
							header: "Bar",
							navigation: "Tabs",
							buttons: "Ink",
							inputs: "8px",
							cards: "12px",
							tabs: "Seg",
							icons: "Lucide",
						},
						navigationContract: {
							destinations,
							labels: screens.map((screen) => screen.name),
							iconMapping: {},
							ordering: destinations,
							activeItemRule: "Highlight active",
						},
						screenPlan: screens.map((screen) => ({
							name: screen.name,
							role: screen.description,
							order: screen.order,
						})),
					},
				}),
				generator: (async function* () {})(),
			};
		}
		return {
			firstChunk: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><nav>${studioProvider.labels
				.map((label) => `<a href="#">${label}</a>`)
				.join("")}</nav><main>Konten</main></body></html>`,
			generator: (async function* () {})(),
		};
	},
};

export async function createStudioUser(): Promise<string> {
	const userId = crypto.randomUUID();
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	return userId;
}

export async function insertCompletedScrape(
	userId: string,
	designMd: string,
): Promise<string> {
	const [scrape] = await db
		.insert(scrapes)
		.values({
			userId,
			sourceUrl: "https://acme.example/pricing",
			domain: "acme.example",
			mode: "design",
			status: "completed",
		})
		.returning();
	if (!scrape) throw new Error("scrape row not created");
	await db.insert(scrapeDocuments).values({ scrapeId: scrape.id, designMd });
	return scrape.id;
}

// The document head is the cheapest proof that this exact reference — not a
// default, and not another user's reference — reached the model.
export function documentHead(designMd: string): string {
	return designMd.trim().slice(0, 40);
}

export function aiCalls(kind: "planning" | "frame"): StudioProviderCall[][] {
	return studioProvider.messages.filter((messages) =>
		kind === "planning"
			? messages[0]?.content.includes("planning application screens")
			: !messages[0]?.content.includes("planning application screens"),
	);
}

export async function referenceFailure(
	run: Promise<unknown>,
): Promise<StudioReferenceError> {
	const error = await run.catch((cause: unknown) => cause);
	expect(error).toBeInstanceOf(StudioReferenceError);
	if (error instanceof StudioReferenceError) return error;
	throw error;
}
