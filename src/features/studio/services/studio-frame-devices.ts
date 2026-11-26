import { z } from "zod";
import { STUDIO_DEVICES, type StudioDevice } from "../types/studio-renderer";
import {
	readStudioChatStorage,
	writeStudioChatStorage,
} from "./studio-chat-storage";

/**
 * Viewport choice is presentation metadata for one workspace session. It is
 * never written to the frame, its HTML, a revision, or the server.
 */
const frameDevicesSchema = z.record(z.string().min(1), z.enum(STUDIO_DEVICES));

export function studioFrameDeviceStorageKey(
	userId: string,
	projectId: string,
): string {
	return `studio-frame-devices:${userId}:${projectId}`;
}

export function readStudioFrameDevices(
	key: string,
	validFrameIds: readonly string[],
): Record<string, StudioDevice> {
	const raw = readStudioChatStorage(key);
	if (!raw) return {};
	try {
		const parsed = frameDevicesSchema.safeParse(JSON.parse(raw));
		if (!parsed.success) return {};
		const valid = new Set(validFrameIds);
		return Object.fromEntries(
			Object.entries(parsed.data).filter(([frameId]) => valid.has(frameId)),
		);
	} catch {
		return {};
	}
}

export function writeStudioFrameDevices(
	key: string,
	devices: Readonly<Record<string, StudioDevice>>,
): void {
	const parsed = frameDevicesSchema.safeParse(devices);
	writeStudioChatStorage(
		key,
		parsed.success ? JSON.stringify(parsed.data) : null,
	);
}
