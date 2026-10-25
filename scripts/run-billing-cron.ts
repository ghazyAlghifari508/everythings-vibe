import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

export interface CronInvocationOptions {
	endpointUrl?: string;
	secret?: string;
	timeoutMs?: number;
	fetchFn?: typeof fetch;
	logger?: {
		info: (msg: string) => void;
		error: (msg: string) => void;
	};
}

export interface CronInvocationResult {
	ok: boolean;
	status?: number;
	data?: unknown;
	error?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export function resolveCronEndpoint(customUrl?: string): URL {
	const raw =
		customUrl ||
		process.env.BILLING_CRON_URL ||
		(process.env.APP_URL
			? `${process.env.APP_URL.replace(/\/+$/, "")}/api/cron/billing`
			: "http://127.0.0.1:3000/api/cron/billing");

	try {
		const parsed = new URL(raw);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			throw new Error(
				`Unsupported protocol '${parsed.protocol}'. Must be http: or https:`,
			);
		}
		return parsed;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Invalid cron endpoint URL: ${message}`);
	}
}

// ponytail: single-shot invoker without retry queue; upgrade to durable queue when VPS runs background daemons.
export async function invokeBillingCron(
	options: CronInvocationOptions = {},
): Promise<CronInvocationResult> {
	const logger = options.logger ?? console;
	const timeoutMs =
		options.timeoutMs ??
		(process.env.CRON_TIMEOUT_MS
			? Number(process.env.CRON_TIMEOUT_MS)
			: DEFAULT_TIMEOUT_MS);
	const customFetch = options.fetchFn ?? fetch;

	let targetUrl: URL;
	try {
		targetUrl = resolveCronEndpoint(options.endpointUrl);
	} catch (urlErr) {
		const message = urlErr instanceof Error ? urlErr.message : String(urlErr);
		logger.error(`[billing-cron] ${message}`);
		return { ok: false, error: message };
	}

	const secret = (options.secret ?? process.env.CRON_BILLING_SECRET)?.trim();
	if (!secret) {
		const err = "CRON_BILLING_SECRET is missing or empty.";
		logger.error(`[billing-cron] ${err}`);
		return { ok: false, error: err };
	}

	const sanitizedEndpoint = `${targetUrl.origin}${targetUrl.pathname}`;
	logger.info(
		`[billing-cron] Invoking billing reminder endpoint: ${sanitizedEndpoint}`,
	);

	try {
		const res = await customFetch(targetUrl.toString(), {
			method: "GET",
			headers: {
				Authorization: `Bearer ${secret}`,
				Accept: "application/json",
			},
			signal: AbortSignal.timeout(timeoutMs),
		});

		if (!res.ok) {
			const statusMsg = `HTTP ${res.status} ${res.statusText}`.trim();
			logger.error(`[billing-cron] Invocation failed: ${statusMsg}`);
			return { ok: false, status: res.status, error: statusMsg };
		}

		const data = await res.json().catch(() => null);
		logger.info(
			`[billing-cron] Success (HTTP ${res.status}): ${JSON.stringify(data ?? {})}`,
		);
		return { ok: true, status: res.status, data };
	} catch (err: unknown) {
		const isTimeout =
			err instanceof Error &&
			(err.name === "TimeoutError" || err.name === "AbortError");
		const message = isTimeout
			? `request timed out after ${timeoutMs}ms`
			: err instanceof Error
				? err.message
				: String(err);
		logger.error(`[billing-cron] Invocation failed: ${message}`);
		return { ok: false, error: message };
	}
}

if (
	typeof process !== "undefined" &&
	process.argv[1] &&
	process.argv[1].endsWith("run-billing-cron.ts")
) {
	invokeBillingCron()
		.then((result) => {
			if (!result.ok) {
				process.exit(1);
			}
			process.exit(0);
		})
		.catch((err) => {
			console.error(
				"[billing-cron] Unexpected error:",
				err instanceof Error ? err.message : String(err),
			);
			process.exit(1);
		});
}
