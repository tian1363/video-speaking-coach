import test from "node:test";
import assert from "node:assert/strict";
import { askCoach, freeTranslate, requestConfig } from "../extension/ai.mjs";

test("没有用户密钥时不发送 AI 请求", async () => {
  globalThis.chrome = { storage: { session: { get: async () => ({}) } } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("不应请求网络"); };
  try { await assert.rejects(askCoach({ mode: "question", question: "Hi" }), { code: "missing-key" }); }
  finally { globalThis.fetch = originalFetch; delete globalThis.chrome; }
});

test("用户密钥只发送给 OpenAI，失败时返回可分类错误", async () => {
  globalThis.chrome = { storage: { session: { get: async () => ({ userApiKey: "test-key", userModel: "test-model" }) } } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(options.headers.Authorization, "Bearer test-key");
    assert.equal(JSON.parse(options.body).store, false);
    return { ok: false, status: 401 };
  };
  try { await assert.rejects(askCoach({ mode: "question", question: "Hi" }), { code: "invalid-key" }); }
  finally { globalThis.fetch = originalFetch; delete globalThis.chrome; }
});

test("无权访问与密钥错误分开提示", async () => {
  globalThis.chrome = { storage: { session: { get: async () => ({ userApiKey: "test-key" }) } } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 403 });
  try { await assert.rejects(askCoach({ mode: "question", question: "Hi" }), { code: "access-denied" }); }
  finally { globalThis.fetch = originalFetch; delete globalThis.chrome; }
});

test("百炼工作空间密钥只路由到所选百炼地域", () => {
  const config = requestConfig({
    provider: "bailian", region: "cn", model: "qwen-plus", apiKey: "sk-ws-test",
    payload: { mode: "lookup", term: "screen", videoTitle: "Example" }
  });
  assert.equal(config.url, "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
  assert.equal(config.body.model, "qwen-plus");
  assert.equal(config.body.messages[1].role, "user");
  assert.equal(config.parse({ choices: [{ message: { content: "屏幕" } }] }), "屏幕");
  assert.throws(() => requestConfig({ provider: "openai", apiKey: "sk-sp-test", payload: { mode: "lookup", term: "screen" } }), { code: "wrong-provider" });
  assert.throws(() => requestConfig({ provider: "bailian-coding", apiKey: "sk-ws-test", payload: { mode: "lookup", term: "screen" } }), { code: "wrong-key-type" });
});

test("免密钥基础查词只发送查询词", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url.hostname, "api.mymemory.translated.net");
    assert.equal(url.searchParams.get("q"), "screen");
    assert.equal(url.searchParams.get("langpair"), "en|zh-CN");
    return { ok: true, json: async () => ({ responseStatus: 200, responseData: { translatedText: "屏幕" } }) };
  };
  try { assert.equal(await freeTranslate("screen"), "免费翻译（供参考）：screen → 屏幕"); }
  finally { globalThis.fetch = originalFetch; }
});
