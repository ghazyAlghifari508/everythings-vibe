import { expect, it } from "vitest";
import { listExternalDependencies } from "../services/studio-export";
import { applyStudioPhotoSlots } from "../services/studio-photo-slots";

const request = {
	id: "lake",
	subject: "Lake Batur",
	purpose: "Set the scene",
	query: "Lake Batur",
	aspect: "landscape" as const,
	alt: "Lake Batur at dawn",
	source: "stock" as const,
};
const photo = {
	url: "https://images.pexels.com/photos/25/photo.jpeg?auto=compress&h=800",
	source: "https://www.pexels.com/photo/lake-25/",
	creator: "Ada",
	alt: "Lake Batur at dawn",
	width: 1200,
	height: 800,
	provider: "Pexels",
};
const html =
	'<!doctype html><html><body><main data-studio-content><figure data-studio-photo="lake" style="aspect-ratio:3/2"><svg aria-label="Fake lake"></svg></figure><p>Route to the shore.</p></main></body></html>';

it("places the verified photo with source credit and an explicit online export dependency", () => {
	const placed = applyStudioPhotoSlots(html, [{ request, photo }], new Set());
	expect(placed.issues).toEqual([]);
	expect(placed.html).toContain("images.pexels.com/photos/25/photo.jpeg");
	expect(placed.html).toContain("www.pexels.com/photo/lake-25/");
	expect(placed.html).toContain("Foto: Ada · Pexels");
	expect(placed.html).not.toContain("Fake lake");
	expect(listExternalDependencies(placed.html)).toEqual([
		"images.pexels.com",
		"www.pexels.com",
	]);
});

it("names the licence next to an attributed photo and replaces it on a rerun", () => {
	const licensed = {
		...photo,
		provider: "Openverse",
		license: {
			name: "CC BY 2.0",
			url: "https://creativecommons.org/licenses/by/2.0/",
		},
	};
	const once = applyStudioPhotoSlots(
		html,
		[{ request, photo: licensed }],
		new Set(),
	);
	expect(once.issues).toEqual([]);
	expect(once.html).toContain("creativecommons.org/licenses/by/2.0/");
	expect(once.html).toContain("CC BY 2.0");
	// The reader gets the planned subject description, not a provider slug.
	expect(once.html).toContain('alt="Lake Batur at dawn"');
	const twice = applyStudioPhotoSlots(
		once.html,
		[{ request, photo: licensed }],
		new Set(),
	);
	expect(twice.issues).toEqual([]);
	expect(twice.html.match(/data-studio-photo-credit/g)).toHaveLength(1);
	expect(twice.html.match(/CC BY 2\.0/g)).toHaveLength(1);
});

it("preserves the authored slot and nearby content on timeout without a broken image", () => {
	const result = applyStudioPhotoSlots(
		html,
		[{ request, photo: "timeout" }],
		new Set(),
	);
	expect(result.issues).toEqual([]);
	expect(result.html).toContain("aspect-ratio:3/2");
	expect(result.html).toContain("Foto tidak tersedia");
	expect(result.html).toContain("Route to the shore.");
	expect(result.html).not.toContain("Fake lake");
});

it("rejects invented img, alternate candidates and CSS image sources", () => {
	const fabricated = html.replace(
		"</main>",
		'<img src="https://example.org/fake.jpg" srcset="https://example.org/fake2.jpg 2x"><div style="background:url(https://example.org/fake3.jpg)"></div></main>',
	);
	expect(applyStudioPhotoSlots(fabricated, [], new Set()).issues).toEqual(
		expect.arrayContaining([
			"Unapproved image reference.",
			"Use approved photo slots instead of CSS image URLs.",
		]),
	);
});
