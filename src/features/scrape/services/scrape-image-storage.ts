import { createHash } from "node:crypto";
import { and, eq, sum } from "drizzle-orm";
import { scrapeImageAssets, scrapeImages, scrapes, users } from "@/db/schema";
import { SCRAPE_MAX_ASSET_BYTES } from "@/lib/constants";
import { ScrapeError } from "@/lib/design-errors";
import {
	isScrapeClaimCurrent,
	type ScrapeJobClaim,
	scrapeClaimPredicate,
} from "./scrape-job-service";

export const IMAGE_STORAGE_LIMITS = {
	scrapeBytes: 100_000_000,
	ownerBytes: 500_000_000,
};

export class ImageStorageError extends ScrapeError {
	constructor(
		readonly assetCode:
			| "INVALID_IMAGE"
			| "UNSAFE_SVG"
			| "IMAGE_TOO_LARGE"
			| "SCRAPE_STORAGE_QUOTA"
			| "OWNER_STORAGE_QUOTA",
		message: string,
	) {
		super(
			assetCode.endsWith("QUOTA") ? "STORAGE_FAILED" : "ASSET_FETCH_FAILED",
			message,
		);
	}
}

export function validateStoredImage(body: Buffer, declaredMime: string) {
	if (body.length > SCRAPE_MAX_ASSET_BYTES)
		throw new ImageStorageError(
			"IMAGE_TOO_LARGE",
			"Gambar melampaui batas ukuran.",
		);
	const mime = declaredMime.split(";")[0].trim().toLowerCase();
	if (
		mime === "image/svg+xml" ||
		/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(body.toString("utf8", 0, 512))
	)
		throw new ImageStorageError(
			"UNSAFE_SVG",
			"SVG tidak disimpan karena keamanan konten belum dapat diverifikasi.",
		);
	let mimeType: string | null = null;
	if (
		body.length >= 33 &&
		body.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) &&
		body.toString("ascii", 12, 16) === "IHDR"
	)
		mimeType = "image/png";
	else if (
		body.length >= 4 &&
		body[0] === 0xff &&
		body[1] === 0xd8 &&
		body[2] === 0xff &&
		body[body.length - 2] === 0xff &&
		body[body.length - 1] === 0xd9
	)
		mimeType = "image/jpeg";
	else if (
		body.length >= 14 &&
		["GIF87a", "GIF89a"].includes(body.toString("ascii", 0, 6)) &&
		body[body.length - 1] === 0x3b
	)
		mimeType = "image/gif";
	else if (
		body.length >= 20 &&
		body.toString("ascii", 0, 4) === "RIFF" &&
		body.toString("ascii", 8, 12) === "WEBP" &&
		["VP8 ", "VP8L", "VP8X"].includes(body.toString("ascii", 12, 16)) &&
		body.readUInt32LE(4) + 8 === body.length
	)
		mimeType = "image/webp";
	else if (
		body.length >= 24 &&
		body.toString("ascii", 4, 8) === "ftyp" &&
		body.readUInt32BE(0) <= body.length &&
		/avif|avis/.test(body.toString("ascii", 8, body.readUInt32BE(0)))
	)
		mimeType = "image/avif";
	else if (
		body.length >= 22 &&
		body.readUInt32LE(0) === 0x00010000 &&
		body.readUInt16LE(4) > 0
	)
		mimeType = "image/x-icon";
	if (
		!mimeType ||
		(mime !== mimeType &&
			!(mimeType === "image/x-icon" && mime === "image/vnd.microsoft.icon"))
	)
		throw new ImageStorageError(
			"INVALID_IMAGE",
			"Isi gambar tidak sesuai format yang diizinkan.",
		);
	return {
		mimeType,
		byteLength: body.length,
		sha256: createHash("sha256").update(body).digest("hex"),
	};
}

export function checkImageStorageQuota(
	bytes: number,
	scrapeBytes: number,
	ownerBytes: number,
	limits = IMAGE_STORAGE_LIMITS,
) {
	if (scrapeBytes + bytes > limits.scrapeBytes)
		throw new ImageStorageError(
			"SCRAPE_STORAGE_QUOTA",
			"Batas penyimpanan gambar per scrape tercapai.",
		);
	if (ownerBytes + bytes > limits.ownerBytes)
		throw new ImageStorageError(
			"OWNER_STORAGE_QUOTA",
			"Batas penyimpanan gambar akun tercapai. Hapus hasil lama sebelum mencoba lagi.",
		);
}

export async function persistScrapeImage(
	claim: ScrapeJobClaim,
	image: Omit<typeof scrapeImages.$inferInsert, "scrapeId" | "userId">,
	asset?: { body: Buffer; contentType: string },
) {
	const verified = asset
		? validateStoredImage(asset.body, asset.contentType)
		: null;
	const { db } = await import("@/db");
	return db.transaction(async (tx) => {
		await tx
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, claim.userId))
			.for("update");
		const [lease] = await tx
			.select({
				id: scrapes.id,
				jobToken: scrapes.jobToken,
				leaseExpiresAt: scrapes.leaseExpiresAt,
			})
			.from(scrapes)
			.where(scrapeClaimPredicate(claim))
			.for("update");
		if (
			!lease ||
			!isScrapeClaimCurrent(lease, claim.token, new Date()) ||
			claim.signal?.aborted
		)
			throw new ScrapeError(
				"STORAGE_FAILED",
				"Job lease sudah tidak berlaku.",
				{ failureReason: "lease-lost" },
			);
		const [existing] = await tx
			.select()
			.from(scrapeImages)
			.where(
				and(
					eq(scrapeImages.userId, claim.userId),
					eq(scrapeImages.scrapeId, claim.id),
					eq(scrapeImages.url, image.url),
				),
			);
		if (existing?.assetId) return existing;
		let assetId: string | null = null;
		if (asset && verified) {
			const [duplicate] = await tx
				.select({ id: scrapeImageAssets.id })
				.from(scrapeImageAssets)
				.where(
					and(
						eq(scrapeImageAssets.userId, claim.userId),
						eq(scrapeImageAssets.scrapeId, claim.id),
						eq(scrapeImageAssets.sha256, verified.sha256),
					),
				);
			assetId = duplicate?.id ?? null;
			if (!assetId) {
				const [ownerUsage] = await tx
					.select({ bytes: sum(scrapeImageAssets.byteLength) })
					.from(scrapeImageAssets)
					.where(eq(scrapeImageAssets.userId, claim.userId));
				const [scrapeUsage] = await tx
					.select({ bytes: sum(scrapeImageAssets.byteLength) })
					.from(scrapeImageAssets)
					.where(
						and(
							eq(scrapeImageAssets.userId, claim.userId),
							eq(scrapeImageAssets.scrapeId, claim.id),
						),
					);
				checkImageStorageQuota(
					verified.byteLength,
					Number(scrapeUsage?.bytes ?? 0),
					Number(ownerUsage?.bytes ?? 0),
				);
				const [stored] = await tx
					.insert(scrapeImageAssets)
					.values({
						...verified,
						userId: claim.userId,
						scrapeId: claim.id,
						body: asset.body,
					})
					.returning({ id: scrapeImageAssets.id });
				assetId = stored.id;
			}
		}
		const values = {
			...image,
			status: assetId ? ("completed" as const) : ("failed" as const),
			assetId,
			userId: claim.userId,
			scrapeId: claim.id,
		};
		const [saved] = await tx
			.insert(scrapeImages)
			.values(values)
			.onConflictDoUpdate({
				target: [scrapeImages.userId, scrapeImages.scrapeId, scrapeImages.url],
				set: values,
			})
			.returning();
		return saved;
	});
}

export async function readStoredScrapeImage(
	userId: string,
	scrapeId: string,
	imageId: string,
) {
	const { db } = await import("@/db");
	const [asset] = await db
		.select({
			body: scrapeImageAssets.body,
			mimeType: scrapeImageAssets.mimeType,
			byteLength: scrapeImageAssets.byteLength,
		})
		.from(scrapeImages)
		.innerJoin(
			scrapeImageAssets,
			and(
				eq(scrapeImages.assetId, scrapeImageAssets.id),
				eq(scrapeImageAssets.userId, userId),
				eq(scrapeImageAssets.scrapeId, scrapeId),
			),
		)
		.where(
			and(
				eq(scrapeImages.id, imageId),
				eq(scrapeImages.userId, userId),
				eq(scrapeImages.scrapeId, scrapeId),
			),
		);
	return asset ?? null;
}
