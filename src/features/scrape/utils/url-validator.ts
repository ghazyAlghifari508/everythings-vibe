// The SSRF destination validator moved to src/lib so both the shared fetch
// transport and the scrape crawl pipeline use one implementation.
export {
	isBlockedRequestUrl,
	isPrivateIp,
	normalizeUrl,
	parseAndValidateFormat,
	validateUrl,
} from "@/lib/url-validator";
