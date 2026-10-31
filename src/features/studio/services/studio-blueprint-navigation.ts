import {
	canonicalIconId,
	type StudioDesignBlueprint,
	validateBlueprint,
} from "./studio-design-blueprint";

export type StudioScreenRole = "primary" | "contextual";

export interface StudioScreenClassification {
	role: StudioScreenRole;
	reason: string;
	suggestedDestinationId?: string;
	suggestedLabel?: string;
	canonicalIcon?: string;
	parentDestinationId?: string | null;
}

const CONTEXTUAL_PREFIX_PATTERN =
	/^(?:detail|rincian|edit|ubah|update|konfirmasi|confirmation|checkout|sukses|success|pratinjau|preview|hapus|delete|status|invoice|kwitansi|receipt|step|langkah)\b/i;

const CONTEXTUAL_KEYWORD_PATTERN =
	/\b(?:detail|rincian|step|langkah|konfirmasi|confirmation|modal|dialog|popup|flow)\b/i;

const EXPLICIT_PRIMARY_HINT =
	/\b(?:navigasi|menu|navbar|bottom-?nav|sidebar|tab bar|tab baru|menu utama|primary navigation)\b/i;

const EXPLICIT_CONTEXTUAL_HINT =
	/\b(?:sub-?halaman|detail|rincian|flow|step|langkah|modal|dialog|popup|konfirmasi|halaman sekunder|contextual)\b/i;

export function normalizeDestinationId(
	name: string,
	existingDestinations: string[] = [],
): string {
	const base =
		name
			.toLowerCase()
			.normalize("NFKD")
			.replace(/\p{M}/gu, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 40) || "screen";

	if (!existingDestinations.includes(base)) return base;
	let counter = 2;
	while (existingDestinations.includes(`${base}-${counter}`)) {
		counter++;
	}
	return `${base}-${counter}`;
}

export function inferCanonicalIconId(
	name: string,
	description?: string | null,
): string {
	const text = `${name} ${description ?? ""}`.toLowerCase();
	if (/\b(?:home|dashboard|beranda|ikhtisar|utama)\b/.test(text)) return "home";
	if (/\b(?:catat|tambah|add|buat|entry|create|plus|baru)\b/.test(text))
		return "plus";
	if (/\b(?:cari|search|jelajah|explore|temukan)\b/.test(text)) return "search";
	if (
		/\b(?:user|profile|profil|akun|pelanggan|customer|member|pengguna)\b/.test(
			text,
		)
	)
		return "user";
	if (
		/\b(?:wallet|dompet|transaksi|bayar|payment|keuangan|kasir|kas|finance)\b/.test(
			text,
		)
	)
		return "wallet";
	if (/\b(?:chart|grafik|statistik|tren|performa)\b/.test(text)) return "chart";
	if (/\b(?:analytics|analisis|laporan|report|insight)\b/.test(text))
		return "analytics";
	if (
		/\b(?:calendar|kalender|jadwal|agenda|riwayat|history|waktu)\b/.test(text)
	)
		return "calendar";
	if (/\b(?:location|lokasi|peta|map|alamat|tracking|cabang)\b/.test(text))
		return "location";
	if (/\b(?:plane|travel|wisata|trip|tiket|booking|liburan)\b/.test(text))
		return "plane";
	if (
		/\b(?:settings|pengaturan|setelan|konfigurasi|preferences|opsi|system)\b/.test(
			text,
		)
	)
		return "settings";
	return canonicalIconId("circle");
}

function findParentDestinationId(
	screenName: string,
	blueprint: StudioDesignBlueprint,
): string | null {
	const words = screenName
		.toLowerCase()
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.split(/[^a-z0-9]+/g)
		.filter((w) => w.length > 2);

	const { destinations, labels } = blueprint.navigationContract;
	for (const word of words) {
		const labelIndex = labels.findIndex((l) => l.toLowerCase().includes(word));
		if (labelIndex >= 0 && destinations[labelIndex]) {
			return destinations[labelIndex];
		}
		const destMatch = destinations.find((d) => d.toLowerCase().includes(word));
		if (destMatch) return destMatch;
	}
	return null;
}

export function classifyStudioScreenRole(input: {
	screenName: string;
	screenDescription?: string | null;
	prompt?: string | null;
	blueprint: StudioDesignBlueprint;
	existingFrames?: readonly { name: string }[];
	designMode?: "web" | "mobile";
}): StudioScreenClassification {
	const name = input.screenName.trim();
	const hintText =
		`${input.screenDescription ?? ""} ${input.prompt ?? ""}`.trim();
	const navContract = input.blueprint.navigationContract;
	const isMobile =
		input.designMode === "mobile" ||
		input.blueprint.productIdentity.platform === "mobile";

	// 1. Explicit user instructions take highest precedence
	if (EXPLICIT_CONTEXTUAL_HINT.test(hintText)) {
		const parentId = findParentDestinationId(name, input.blueprint);
		return {
			role: "contextual",
			reason: "Instruksi pengguna secara eksplisit menandai layar sekunder.",
			parentDestinationId: parentId,
		};
	}

	if (EXPLICIT_PRIMARY_HINT.test(hintText)) {
		if (navContract.destinations.length >= 8) {
			return {
				role: "contextual",
				reason: "Batas navigasi utama tercapai (maksimal 8 destinasi).",
				parentDestinationId: findParentDestinationId(name, input.blueprint),
			};
		}
		const destId = normalizeDestinationId(name, navContract.destinations);
		return {
			role: "primary",
			reason: "Instruksi pengguna secara eksplisit meminta navigasi utama.",
			suggestedDestinationId: destId,
			suggestedLabel: name,
			canonicalIcon: inferCanonicalIconId(name, input.screenDescription),
		};
	}

	// 2. Contextual pattern checks (prefixes and keywords)
	if (
		CONTEXTUAL_PREFIX_PATTERN.test(name) ||
		CONTEXTUAL_KEYWORD_PATTERN.test(name)
	) {
		const parentId = findParentDestinationId(name, input.blueprint);
		return {
			role: "contextual",
			reason: `Pola nama "${name}" teridentifikasi sebagai layar kontekstual.`,
			parentDestinationId: parentId,
		};
	}

	// 3. Navigation capacity constraints
	if (navContract.destinations.length >= 8) {
		return {
			role: "contextual",
			reason: "Batas navigasi utama tercapai (maksimal 8 destinasi).",
			parentDestinationId: findParentDestinationId(name, input.blueprint),
		};
	}

	if (isMobile && navContract.destinations.length >= 5) {
		return {
			role: "contextual",
			reason:
				"Navigasi bottom bar mobile optimal maksimal 5 tab; layar dialihkan ke peran kontekstual.",
			parentDestinationId: findParentDestinationId(name, input.blueprint),
		};
	}

	// 4. Default: Primary destination
	const destId = normalizeDestinationId(name, navContract.destinations);
	return {
		role: "primary",
		reason: `Layar "${name}" diklasifikasikan sebagai destinasi navigasi utama.`,
		suggestedDestinationId: destId,
		suggestedLabel: name,
		canonicalIcon: inferCanonicalIconId(name, input.screenDescription),
	};
}

export function extendStudioBlueprintWithScreen(input: {
	blueprint: StudioDesignBlueprint;
	screenName: string;
	screenRole: StudioScreenClassification;
	screenDescription?: string | null;
}): StudioDesignBlueprint {
	const { blueprint, screenName, screenRole, screenDescription } = input;
	const name = screenName.trim();
	const existingScreenNames = new Set(blueprint.screenPlan.map((s) => s.name));
	if (existingScreenNames.has(name)) {
		return blueprint;
	}

	const nextOrder =
		blueprint.screenPlan.reduce((max, s) => Math.max(max, s.order), -1) + 1;
	const updatedScreenPlan = [
		...blueprint.screenPlan,
		{
			name,
			role:
				screenDescription?.trim() ||
				(screenRole.role === "primary"
					? "Destinasi navigasi utama"
					: "Layar kontekstual aplikasi"),
			order: nextOrder,
		},
	];

	if (screenRole.role === "contextual") {
		const parentId = screenRole.parentDestinationId ?? null;
		const activeDestinations = {
			...(blueprint.canonicalShell?.activeDestinations ?? {}),
			[name]: parentId,
		};
		const candidate = {
			...blueprint,
			screenPlan: updatedScreenPlan,
			canonicalShell: blueprint.canonicalShell
				? {
						...blueprint.canonicalShell,
						activeDestinations,
					}
				: undefined,
		};
		const validated = validateBlueprint(candidate);
		if (!validated.ok) throw new Error(validated.error);
		return validated.blueprint;
	}

	// Primary role: extend navigationContract & activeDestinations
	const destinationId =
		screenRole.suggestedDestinationId ||
		normalizeDestinationId(name, blueprint.navigationContract.destinations);
	const label = screenRole.suggestedLabel || name;
	const icon =
		screenRole.canonicalIcon || inferCanonicalIconId(name, screenDescription);

	const destinations = [
		...blueprint.navigationContract.destinations,
		destinationId,
	];
	const labels = [...blueprint.navigationContract.labels, label];
	const iconMapping = {
		...blueprint.navigationContract.iconMapping,
		[destinationId]: icon,
	};

	// Determine ordering: place before trailing "settings" if present, else append
	const currentOrdering = [...blueprint.navigationContract.ordering];
	const lastItem = currentOrdering[currentOrdering.length - 1];
	let ordering: string[];
	if (
		lastItem &&
		/settings|pengaturan|profil|profile/i.test(lastItem) &&
		!/settings|pengaturan|profil|profile/i.test(destinationId)
	) {
		ordering = [...currentOrdering.slice(0, -1), destinationId, lastItem];
	} else {
		ordering = [...currentOrdering, destinationId];
	}

	const activeDestinations = {
		...(blueprint.canonicalShell?.activeDestinations ?? {}),
		[name]: destinationId,
	};

	const candidate = {
		...blueprint,
		navigationContract: {
			...blueprint.navigationContract,
			destinations,
			labels,
			ordering,
			iconMapping,
		},
		screenPlan: updatedScreenPlan,
		canonicalShell: blueprint.canonicalShell
			? {
					...blueprint.canonicalShell,
					activeDestinations,
				}
			: undefined,
	};

	const validated = validateBlueprint(candidate);
	if (!validated.ok) throw new Error(validated.error);
	return validated.blueprint;
}
