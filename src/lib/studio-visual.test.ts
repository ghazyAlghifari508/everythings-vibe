import { afterAll, expect, it } from "vitest";
import { captureStudioVisual, closeStudioVisualBrowser } from "./studio-visual";

afterAll(closeStudioVisualBrowser);

it("captures actual full content bounds without executing generated scripts", async () => {
	const result = await captureStudioVisual(
		'<html><head><style>body{margin:0} main{height:1600px;background:#ddd}</style></head><body><main>Sample</main><script>document.body.innerHTML="<div style=height:9000px>Injected</div>"</script></body></html>',
		"mobile",
		null,
		[],
	);
	expect(result.width).toBe(390);
	expect(result.height).toBe(1600);
	expect(result.data.byteLength).toBeGreaterThan(100);
}, 60000);
