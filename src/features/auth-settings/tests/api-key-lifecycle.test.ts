import { describe, expect, it } from "vitest";
import {
	AUTO_API_KEY_GRACE_HOUR_BOUNDS,
	AUTO_API_KEY_NAME_PREFIX,
	AUTO_API_KEY_SUPERSEDE_GRACE_HOURS_ENV,
	AUTO_API_KEY_TTL_DAY_BOUNDS,
	AUTO_API_KEY_TTL_DAYS_ENV,
	buildAutoKeyName,
	DEFAULT_AUTO_API_KEY_SUPERSEDE_GRACE_HOURS,
	DEFAULT_AUTO_API_KEY_TTL_DAYS,
	describeKeyLifecycle,
	isAutomaticKey,
	isExpiredKey,
	nextAutoKeyExpiry,
	resolveAutoApiKeyPolicy,
	supersedeCutoff,
} from "../services/api-key-lifecycle";
import {
	API_KEY_SCOPES,
	AUTO_API_KEY_SCOPES,
	isApiKeyScope,
} from "../types/api-key-scopes";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const NOW = new Date("2026-01-15T00:00:00.000Z");

describe("automatic handoff credential policy", () => {
	it("defaults to one bounded credential that outlives an implementation cycle", () => {
		const policy = resolveAutoApiKeyPolicy({});

		expect(DEFAULT_AUTO_API_KEY_TTL_DAYS).toBe(30);
		expect(DEFAULT_AUTO_API_KEY_SUPERSEDE_GRACE_HOURS).toBe(72);
		expect(policy.ttlMs).toBe(30 * DAY_MS);
		expect(policy.supersedeGraceMs).toBe(72 * HOUR_MS);
		// A grace longer than the TTL would make superseding meaningless.
		expect(policy.supersedeGraceMs).toBeLessThan(policy.ttlMs);
	});

	// Both knobs are read from `process.env` at request time, so a malformed or
	// hostile value must never widen a credential beyond the documented bounds.
	it.each([
		{ env: {}, expected: DEFAULT_AUTO_API_KEY_TTL_DAYS },
		{ env: { [AUTO_API_KEY_TTL_DAYS_ENV]: "7" }, expected: 7 },
		{
			env: { [AUTO_API_KEY_TTL_DAYS_ENV]: "0" },
			expected: AUTO_API_KEY_TTL_DAY_BOUNDS.min,
		},
		{
			env: { [AUTO_API_KEY_TTL_DAYS_ENV]: "-5" },
			expected: AUTO_API_KEY_TTL_DAY_BOUNDS.min,
		},
		{
			env: { [AUTO_API_KEY_TTL_DAYS_ENV]: "3650" },
			expected: AUTO_API_KEY_TTL_DAY_BOUNDS.max,
		},
		{
			env: { [AUTO_API_KEY_TTL_DAYS_ENV]: "" },
			expected: DEFAULT_AUTO_API_KEY_TTL_DAYS,
		},
		{
			env: { [AUTO_API_KEY_TTL_DAYS_ENV]: "abc" },
			expected: DEFAULT_AUTO_API_KEY_TTL_DAYS,
		},
		{
			env: { [AUTO_API_KEY_TTL_DAYS_ENV]: "Infinity" },
			expected: DEFAULT_AUTO_API_KEY_TTL_DAYS,
		},
	])("resolves the TTL from %j", ({ env, expected }) => {
		expect(resolveAutoApiKeyPolicy(env).ttlMs).toBe(expected * DAY_MS);
	});

	it.each([
		{ env: {}, expected: DEFAULT_AUTO_API_KEY_SUPERSEDE_GRACE_HOURS },
		{ env: { [AUTO_API_KEY_SUPERSEDE_GRACE_HOURS_ENV]: "6" }, expected: 6 },
		{
			env: { [AUTO_API_KEY_SUPERSEDE_GRACE_HOURS_ENV]: "-1" },
			expected: AUTO_API_KEY_GRACE_HOUR_BOUNDS.min,
		},
		{
			env: { [AUTO_API_KEY_SUPERSEDE_GRACE_HOURS_ENV]: "9000" },
			expected: AUTO_API_KEY_GRACE_HOUR_BOUNDS.max,
		},
	])("resolves the supersede grace from %j", ({ env, expected }) => {
		expect(resolveAutoApiKeyPolicy(env).supersedeGraceMs).toBe(
			expected * HOUR_MS,
		);
	});

	// Least privilege for the credential pasted into an external agent: it gets
	// exactly the documented CLI scopes, nothing grantable by hand.
	it("binds the lifetime rule to the handoff scope set", () => {
		const policy = resolveAutoApiKeyPolicy({});

		expect(policy.scopes).toEqual(AUTO_API_KEY_SCOPES);
		expect(policy.scopes).toEqual([...API_KEY_SCOPES]);
		expect(policy.scopes).not.toContain("admin");
		expect(policy.scopes.every(isApiKeyScope)).toBe(true);
	});
});

describe("handoff credential timestamps", () => {
	const policy = resolveAutoApiKeyPolicy({});

	it("computes the new expiry and the supersede cutoff from one clock", () => {
		expect(nextAutoKeyExpiry(NOW, policy).getTime()).toBe(
			NOW.getTime() + 30 * DAY_MS,
		);
		expect(supersedeCutoff(NOW, policy).getTime()).toBe(
			NOW.getTime() + 72 * HOUR_MS,
		);
		// The replacement always outlives the key it replaces.
		expect(supersedeCutoff(NOW, policy) < nextAutoKeyExpiry(NOW, policy)).toBe(
			true,
		);
	});

	// Two handoffs in the same millisecond would otherwise render as one
	// indistinguishable row in Settings.
	it("names a minted credential inside the reserved namespace, uniquely", () => {
		const first = buildAutoKeyName(NOW);
		const second = buildAutoKeyName(NOW);

		expect(first.startsWith(AUTO_API_KEY_NAME_PREFIX)).toBe(true);
		expect(second).not.toBe(first);
		expect(isAutomaticKey(first)).toBe(true);
	});

	it.each([
		{ name: "auto-cli-1730000000000-abcd1234", automatic: true },
		{ name: "auto-cli-", automatic: true },
		{ name: "Auto-cli-1", automatic: false },
		{ name: "my-auto-cli-key", automatic: false },
		{ name: "Claude Code CLI", automatic: false },
		{ name: "", automatic: false },
	])("classifies $name -> automatic:$automatic", ({ name, automatic }) => {
		expect(isAutomaticKey(name)).toBe(automatic);
	});

	it("never reads the prefix from a missing name", () => {
		expect(isAutomaticKey(null)).toBe(false);
		expect(isAutomaticKey(undefined)).toBe(false);
	});
});

describe("expiry predicates", () => {
	it.each([
		{ expiresAt: null, expired: false },
		{ expiresAt: undefined, expired: false },
		{ expiresAt: new Date(NOW.getTime() - 1), expired: true },
		{ expiresAt: NOW, expired: true },
		{ expiresAt: new Date(NOW.getTime() + 1), expired: false },
		{ expiresAt: "2020-01-01T00:00:00.000Z", expired: true },
		{ expiresAt: "2999-01-01T00:00:00.000Z", expired: false },
		// A corrupt deadline fails closed instead of becoming permanent access.
		{ expiresAt: "not-a-date", expired: true },
	])("isExpiredKey(%j) -> $expired", ({ expiresAt, expired }) => {
		expect(isExpiredKey(expiresAt, NOW)).toBe(expired);
	});

	it.each([
		{
			name: "auto-cli-1-a",
			expiresAt: new Date(NOW.getTime() + DAY_MS),
			source: "automatic",
			state: "active",
		},
		{
			name: "auto-cli-1-b",
			expiresAt: new Date(NOW.getTime() - DAY_MS),
			source: "automatic",
			state: "expired",
		},
		{
			name: "auto-cli-legacy",
			expiresAt: null,
			source: "automatic",
			state: "no-expiry",
		},
		{
			name: "Manual key",
			expiresAt: null,
			source: "manual",
			state: "no-expiry",
		},
		{
			name: "Manual key",
			expiresAt: new Date(NOW.getTime() - DAY_MS),
			source: "manual",
			state: "expired",
		},
		{
			name: "Manual key",
			expiresAt: "garbage",
			source: "manual",
			state: "expired",
		},
	])("describes $name with $expiresAt as $source/$state", ({
		name,
		expiresAt,
		source,
		state,
	}) => {
		const lifecycle = describeKeyLifecycle({ name, expiresAt }, NOW);

		expect(lifecycle.kind).toBe(source);
		expect(lifecycle.state).toBe(state);
	});
});
