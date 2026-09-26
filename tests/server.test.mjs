import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server/index.mjs";

test("本地接口只接受扩展来源并转发练习文字", async () => {
  let upstreamRequest;
  const server = createServer({
    apiKey: "test-only",
    model: "test-model",
    fetchImpl: async (_url, options) => {
      upstreamRequest = JSON.parse(options.body);
      return new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "请补充一个例子。" }] }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/coach`;
  try {
    const payload = { mode: "round", round: 0, videoTitle: "Test", keywords: "topic", transcripts: ["My first summary."] };
    const denied = await fetch(url, { method: "POST", headers: { Origin: "https://example.com", "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    assert.equal(denied.status, 403);
    const accepted = await fetch(url, { method: "POST", headers: { Origin: `chrome-extension://${"a".repeat(32)}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { message: "请补充一个例子。" });
    assert.match(upstreamRequest.input, /My first summary/);
    assert.equal(upstreamRequest.store, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
