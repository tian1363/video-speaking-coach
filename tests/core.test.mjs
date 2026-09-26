import test from "node:test";
import assert from "node:assert/strict";
import { createSession, nextSession, parseYouTubeVideo, sessionMarkdown } from "../extension/core.mjs";
import { buildPrompt, extractText } from "../server/index.mjs";
import { parseRoundFeedback } from "../extension/prompt.mjs";

test("仅关联有效 YouTube 视频，不把普通页面当视频", () => {
  const video = parseYouTubeVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12", "Test - YouTube");
  assert.equal(video.id, "dQw4w9WgXcQ");
  assert.equal(video.url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(video.title, "Test");
  assert.equal(parseYouTubeVideo("https://www.youtube.com/", "Home"), null);
  assert.equal(parseYouTubeVideo("https://notyoutube.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parseYouTubeVideo("https://youtu.be/dQw4w9WgXcQ")?.id, "dQw4w9WgXcQ");
  assert.equal(parseYouTubeVideo("https://youtube.com/shorts/dQw4w9WgXcQ")?.id, "dQw4w9WgXcQ");
});

test("三轮练习保留各轮原话并在第三轮完成", () => {
  const video = parseYouTubeVideo("https://youtu.be/dQw4w9WgXcQ");
  let session = createSession(video);
  for (let round = 0; round < 3; round++) {
    session = nextSession(session, `Round ${round + 1}`, `Feedback ${round + 1}`);
    assert.equal(session.round, round + 1);
  }
  assert.equal(session.complete, true);
  assert.deepEqual(session.transcripts, ["Round 1", "Round 2", "Round 3"]);
  assert.throws(() => nextSession(session, "extra"));
});

test("导出的 Markdown 包含视频、关键词、三轮原话和建议", () => {
  const video = parseYouTubeVideo("https://youtu.be/dQw4w9WgXcQ", "Example");
  let session = createSession(video);
  session.keywords = "music, memory";
  session.words.push({ term: "muse", explanation: "灵感来源" });
  for (let round = 0; round < 3; round++) session = nextSession(session, `Round ${round + 1}`, `Advice ${round + 1}`);
  const markdown = sessionMarkdown(session);
  assert.match(markdown, /https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ/);
  assert.match(markdown, /music, memory/);
  assert.match(markdown, /第 3 轮 · 我的原话[\s\S]*Round 3[\s\S]*Advice 3/);
  assert.match(markdown, /muse.*灵感来源/);
});

test("教练提示词只使用已给素材，输出解析读取消息文字", () => {
  const prompt = buildPrompt({ mode: "round", round: 0, videoTitle: "Travel", keywords: "train", transcripts: ["I saw a train."] });
  assert.match(prompt, /I saw a train/);
  assert.match(prompt, /不要逐句纠错/);
  assert.throws(() => buildPrompt({ mode: "round", round: 2, transcripts: [] }));
  assert.equal(extractText({ output: [{ type: "message", content: [{ type: "output_text", text: "Try again." }] }] }), "Try again.");
});

test("每轮反馈需要完整示例，并保留固定四段结构", () => {
  const feedback = parseRoundFeedback(JSON.stringify({
    problem: "只说了主题，没有解释原因。",
    why: "听者不知道这个习惯为什么有用。",
    example: "From what I remember, the video is about building a small daily learning habit. The speaker suggests starting with one simple action and repeating it at the same time each day. I would try a short English retelling after breakfast because it feels easy to remember and repeat.",
    nextStep: "下一轮先说主题，再补一个具体例子。"
  }));
  assert.match(feedback, /【现有问题】[\s\S]*【为什么影响表达】[\s\S]*【完整重讲示例】[\s\S]*【下一轮怎么练】/);
  assert.match(feedback, /From what I remember/);
  assert.throws(() => parseRoundFeedback(JSON.stringify({ problem: "缺少原因", why: "听不明白", example: "It is a habit.", nextStep: "重讲" })), /重讲示例不完整/);
});
