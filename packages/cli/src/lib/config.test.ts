import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getApiKey,
	getApiUrl,
	getConfig,
	getConfigFile,
	resolveApiUrl,
	saveConfig,
} from "./config.js";

describe("packages/cli config", () => {
	let testHome: string;
	let configDir: string;

	beforeEach(() => {
		testHome = join(
			tmpdir(),
			`ev-cfg-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		mkdirSync(testHome, { recursive: true });
		configDir = join(testHome, ".everythings-vibe");
		vi.stubEnv("EVERYTHINGS_VIBE_HOME", testHome);
		vi.stubEnv("EVERYTHINGS_VIBE_CONFIG_DIR", configDir);
		vi.stubEnv("EVERYTHINGS_VIBE_API_KEY", "");
		vi.stubEnv("VIBEEVERYTHING_API_KEY", "");
		vi.stubEnv("PRDFY_API_KEY", "");
		vi.stubEnv("EVERYTHINGS_VIBE_API_URL", "");
		vi.stubEnv("VIBEEVERYTHING_API_URL", "");
		vi.stubEnv("PRDFY_API_URL", "");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		try {
			rmSync(testHome, { recursive: true, force: true });
		} catch {}
	});

	it("returns empty config when no file exists", () => {
		expect(getConfig()).toEqual({});
	});

	it("saves and reads canonical config correctly", () => {
		saveConfig({
			apiKey: "test-key-123",
			apiUrl: "https://api.everythings-vibe.com",
		});
		const file = getConfigFile();
		expect(existsSync(file)).toBe(true);
		expect(getConfig()).toEqual({
			apiKey: "test-key-123",
			apiUrl: "https://api.everythings-vibe.com",
		});
	});

	it("preserves secure file permissions (0o600 on file, 0o700 on dir) on POSIX", () => {
		saveConfig({ apiKey: "secret-key" });
		const dirStat = statSync(configDir);
		const fileStat = statSync(getConfigFile());
		if (process.platform !== "win32") {
			expect(dirStat.mode & 0o777).toBe(0o700);
			expect(fileStat.mode & 0o777).toBe(0o600);
		}
	});

	it("falls back to legacy .vibeeverything and migrates idempotently without deleting legacy file", () => {
		const legacyDir = join(testHome, ".vibeeverything");
		mkdirSync(legacyDir, { recursive: true });
		const legacyFile = join(legacyDir, "config.json");
		writeFileSync(
			legacyFile,
			JSON.stringify({
				apiKey: "legacy-vibe-key",
				apiUrl: "https://legacy.example.com",
			}),
		);

		// Initially canonical config does not exist
		expect(existsSync(getConfigFile())).toBe(false);

		// Reading config should discover legacy and copy to canonical
		const cfg = getConfig();
		expect(cfg).toEqual({
			apiKey: "legacy-vibe-key",
			apiUrl: "https://legacy.example.com",
		});

		// Canonical file now exists with migrated contents
		expect(existsSync(getConfigFile())).toBe(true);
		const canonicalContents = JSON.parse(
			readFileSync(getConfigFile(), "utf-8"),
		);
		expect(canonicalContents).toEqual(cfg);

		// Legacy file was NOT deleted
		expect(existsSync(legacyFile)).toBe(true);
	});

	it("falls back to legacy .prdfy when .vibeeverything is absent", () => {
		const prdfyDir = join(testHome, ".prdfy");
		mkdirSync(prdfyDir, { recursive: true });
		const prdfyFile = join(prdfyDir, "config.json");
		writeFileSync(
			prdfyFile,
			JSON.stringify({
				apiKey: "prdfy-old-key",
				apiUrl: "https://prdfy.example.com",
			}),
		);

		const cfg = getConfig();
		expect(cfg.apiKey).toBe("prdfy-old-key");
		expect(existsSync(prdfyFile)).toBe(true);
		expect(existsSync(getConfigFile())).toBe(true);
	});

	it("getApiKey prefers EVERYTHINGS_VIBE_API_KEY over VIBEEVERYTHING_API_KEY and PRDFY_API_KEY", () => {
		vi.stubEnv("PRDFY_API_KEY", "prdfy-key");
		expect(getApiKey()).toBe("prdfy-key");

		vi.stubEnv("VIBEEVERYTHING_API_KEY", "vibe-key");
		expect(getApiKey()).toBe("vibe-key");

		vi.stubEnv("EVERYTHINGS_VIBE_API_KEY", "canonical-key");
		expect(getApiKey()).toBe("canonical-key");
	});

	it("throws helpful error when API key is missing", () => {
		expect(() => getApiKey()).toThrow(
			"API key not configured. Run: everythings-vibe login",
		);
	});

	it("getApiUrl resolves env vars with canonical precedence", () => {
		expect(getApiUrl()).toBe("http://localhost:3000");

		vi.stubEnv("PRDFY_API_URL", "https://prdfy.test");
		expect(getApiUrl()).toBe("https://prdfy.test");

		vi.stubEnv("VIBEEVERYTHING_API_URL", "https://vibeeverything.test");
		expect(getApiUrl()).toBe("https://vibeeverything.test");

		vi.stubEnv("EVERYTHINGS_VIBE_API_URL", "https://everythings-vibe.test");
		expect(getApiUrl()).toBe("https://everythings-vibe.test");
	});

	it("resolveApiUrl honors explicit flag and enforces http/https protocol", () => {
		expect(resolveApiUrl("https://override.example.com")).toBe(
			"https://override.example.com",
		);
		expect(() => resolveApiUrl("ftp://invalid.com")).toThrow(
			"Invalid API URL protocol",
		);
	});
});
