/**
 * Config reader/writer for ~/.everythings-vibe/config.json
 * Supports backward-compatible migration from legacy locations:
 * ~/.vibeeverything/config.json, ~/.prdfy/config.json, and ~/.novaplan/config.json.
 */

import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function getHomeDir(): string {
	return process.env.EVERYTHINGS_VIBE_HOME || homedir();
}

export function getConfigDir(): string {
	return (
		process.env.EVERYTHINGS_VIBE_CONFIG_DIR ||
		process.env.PRDFY_CONFIG_DIR ||
		join(getHomeDir(), ".everythings-vibe")
	);
}

export function getConfigFile(): string {
	return join(getConfigDir(), "config.json");
}

export function getLegacyConfigFiles(): string[] {
	const home = getHomeDir();
	return [
		join(home, ".vibeeverything", "config.json"),
		join(home, ".prdfy", "config.json"),
		join(home, ".novaplan", "config.json"),
	];
}

export interface CliConfig {
	apiKey?: string;
	apiUrl?: string;
}

function parseConfigFile(filePath: string): CliConfig | null {
	if (!existsSync(filePath)) return null;
	try {
		const parsed: unknown = JSON.parse(readFileSync(filePath, "utf-8"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return null;
		}
		const conf: CliConfig = {};
		const obj = parsed as Record<string, unknown>;
		if (typeof obj.apiKey === "string" && obj.apiKey.trim().length > 0) {
			conf.apiKey = obj.apiKey.trim();
		}
		if (typeof obj.apiUrl === "string" && obj.apiUrl.trim().length > 0) {
			conf.apiUrl = obj.apiUrl.trim();
		}
		return conf;
	} catch {
		return null;
	}
}

export function getConfig(): CliConfig {
	const canonicalFile = getConfigFile();
	const canonicalConfig = parseConfigFile(canonicalFile);
	if (canonicalConfig) {
		return canonicalConfig;
	}

	// Canonical config missing; check legacy paths in precedence order
	for (const legacyPath of getLegacyConfigFiles()) {
		const legacyConfig = parseConfigFile(legacyPath);
		if (legacyConfig && (legacyConfig.apiKey || legacyConfig.apiUrl)) {
			// Idempotently copy to canonical path without deleting the legacy file
			try {
				saveConfig(legacyConfig);
			} catch {
				// Non-fatal: if write fails (e.g. read-only homedir in test/container),
				// still return the valid legacy config in memory.
			}
			return legacyConfig;
		}
	}

	return {};
}

export function saveConfig(config: CliConfig): void {
	const configDir = getConfigDir();
	const configFile = getConfigFile();

	try {
		if (!existsSync(configDir)) {
			mkdirSync(configDir, { recursive: true, mode: 0o700 });
		}
	} catch (err) {
		throw new Error(
			`Cannot create config directory "${configDir}": ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	const existing = parseConfigFile(configFile) ?? {};
	const payload = JSON.stringify({ ...existing, ...config }, null, 2);
	const tempFile = `${configFile}.${process.pid}.${Date.now()}.tmp`;

	try {
		writeFileSync(tempFile, payload, { mode: 0o600 });
		try {
			chmodSync(tempFile, 0o600);
		} catch {}
		renameSync(tempFile, configFile);
		try {
			chmodSync(configFile, 0o600);
		} catch {}
	} catch (err) {
		try {
			if (existsSync(tempFile)) unlinkSync(tempFile);
		} catch {}
		throw new Error(
			`Cannot save config to "${configFile}": ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

export function getApiKey(): string {
	const envKey =
		process.env.EVERYTHINGS_VIBE_API_KEY ||
		process.env.VIBEEVERYTHING_API_KEY ||
		process.env.PRDFY_API_KEY;
	if (envKey && envKey.trim().length > 0) {
		return envKey.trim();
	}
	const config = getConfig();
	if (!config.apiKey) {
		throw new Error("API key not configured. Run: everythings-vibe login");
	}
	return config.apiKey;
}

export function getApiUrl(): string {
	const envUrl =
		process.env.EVERYTHINGS_VIBE_API_URL ||
		process.env.VIBEEVERYTHING_API_URL ||
		process.env.PRDFY_API_URL;
	if (envUrl && envUrl.trim().length > 0) {
		return envUrl.trim();
	}
	return getConfig().apiUrl || "http://localhost:3000";
}

/**
 * Resolve the API base URL for a single command invocation without
 * persisting anything: explicit flag wins, then env vars, then the
 * global config file. Sync tokens must never be stored — pass them
 * in-memory to the sync client instead of `saveConfig`. Validates protocol
 * and rejects non-http/https URLs fail-closed.
 */
export function resolveApiUrl(explicit?: string): string {
	const envUrl =
		process.env.EVERYTHINGS_VIBE_API_URL ||
		process.env.VIBEEVERYTHING_API_URL ||
		process.env.PRDFY_API_URL;
	const raw = explicit || envUrl || getApiUrl();
	try {
		const parsed = new URL(raw);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			throw new Error(
				`Invalid API URL protocol: "${parsed.protocol}". Only http: and https: are allowed.`,
			);
		}
		return parsed.origin;
	} catch (err) {
		if (
			err instanceof Error &&
			err.message.includes("Invalid API URL protocol")
		) {
			throw err;
		}
		throw new Error(`Invalid API URL: "${raw}"`);
	}
}
