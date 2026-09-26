import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const source = dirname(fileURLToPath(import.meta.url));
const root = resolve(source, "../..");
const output = resolve(source, "../assets");
const extension = resolve(root, "extension");
const profile = await mkdtemp(join(tmpdir(), "speaking-coach-assets-"));

const video = {
  id: "demo1234567",
  title: "演示视频 · Building a daily learning habit",
  url: "https://www.youtube.com/watch?v=demo1234567"
};

const transcripts = [
  "The video talks about building a learning habit. Small steps seem important.",
  "The speaker suggests starting with a small goal. First, choose a time. Then repeat it every day. For example, practise English for ten minutes after breakfast.",
  "The main idea is to make learning easy to repeat. A small daily action can become a habit. I would try a short English retelling after each video because it helps me remember and speak more clearly."
];
const feedback = [
  "【现有问题】\n你提到了学习习惯和小步骤，但还没有说明怎样开始。\n\n【为什么影响表达】\n听者知道主题，却缺少可执行的做法。\n\n【完整重讲示例】\nFrom what I remember, the video is about building a learning habit. Small steps seem important because they make it easier to begin. I would start with a small goal and try to repeat it every day.\n\n【下一轮怎么练】\n补上一个具体做法，再用自己的话重讲。",
  "【现有问题】\n你讲清了每天练十分钟的例子，但结尾还没有自己的看法。\n\n【为什么影响表达】\n补上一句个人选择，整段话会更完整。\n\n【完整重讲示例】\nThe speaker suggests starting with a small learning goal. First, I could choose a regular time and repeat the action every day. For example, I could practise English for ten minutes after breakfast. I think this would be easier for me to maintain than a large goal.\n\n【下一轮怎么练】\n离开笔记再讲一次，并用一句话说出你是否认同。",
  "【现有问题】\n你已经加入了个人做法；开头还可以更快点明核心观点。\n\n【为什么影响表达】\n先说结论，听者就更容易跟上后面的例子。\n\n【完整重讲示例】\nThe main idea is to make learning easy to repeat. A small daily action can gradually become a habit. After watching a video, I would give a short retelling in English because it helps me remember the content. It would also give me a simple way to practise speaking more clearly.\n\n【下一轮怎么练】\n下次先用一句话概括主旨，再展开两个重点。"
];

let browser;
try {
  browser = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  const worker = browser.serviceWorkers()[0] || await browser.waitForEvent("serviceworker", { timeout: 10000 });
  const extensionId = new URL(worker.url()).host;
  const youtube = await browser.newPage();
  await youtube.route("https://www.youtube.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: `<title>${video.title} - YouTube</title>` }));
  await youtube.goto(video.url);
  const panel = await browser.newPage();
  await panel.setViewportSize({ width: 500, height: 850 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  if (await panel.locator("#get-api-key").getAttribute("href") !== "https://platform.openai.com/api-keys") {
    throw new Error("OpenAI API Key link is not configured");
  }

  async function setDemo(round) {
    const record = {
      video, keywords: "daily learning\nsmall steps\nEnglish speaking practice",
      round, transcripts: transcripts.map((item, index) => index < round ? item : ""),
      feedback: feedback.map((item, index) => index < round ? item : ""),
      feedbackSource: ["ai", "ai", "ai"],
      words: [{ term: "habit", explanation: "习惯；something you do regularly" }],
      complete: round === 3, updatedAt: Date.now()
    };
    await panel.evaluate(async ({ key, record }) => {
      await chrome.storage.local.set({ [key]: record, lastVideo: record.video });
    }, { key: `session:${video.id}`, record });
    await panel.reload();
    await youtube.bringToFront();
    await panel.locator("#workspace").waitFor({ state: "visible" });
    // This page is opened as a tab for rendering; in the real side panel the
    // YouTube tab remains active, so its "away from YouTube" notice is absent.
    await panel.locator("#away-notice").evaluate((element) => { element.hidden = true; });
  }

  await setDemo(0);
  await panel.screenshot({ path: join(output, "demo-panel-overview.png") });

  await setDemo(1);
  await panel.locator(".practice-card").scrollIntoViewIfNeeded();
  await panel.screenshot({ path: join(output, "demo-panel-rounds.png") });

  await setDemo(3);
  await panel.evaluate(() => {
    document.body.style.zoom = "0.82";
    document.querySelector(".header").style.display = "none";
    document.querySelector("#ai-settings").style.display = "none";
    for (const element of document.querySelectorAll("#workspace > :not(.history-card)")) {
      element.style.display = "none";
    }
    window.scrollTo(0, 0);
  });
  await panel.screenshot({ path: join(output, "demo-panel-history.png") });

  await setDemo(0);
  await panel.locator("#ai-settings").evaluate((element) => { element.open = true; });
  await panel.locator("#api-provider").selectOption("bailian");
  if (await panel.locator("#get-api-key").getAttribute("href") !== "https://bailian.console.aliyun.com/cn-beijing/model/settings/api-key") {
    throw new Error("Bailian API Key link did not update with the provider");
  }
  await panel.locator("#api-key").evaluate((element) => { element.value = ""; });
  await panel.evaluate(() => window.scrollTo(0, 0));
  await panel.screenshot({ path: join(output, "demo-panel-settings.png") });

  const promo = await browser.newPage();
  const promoUrl = `file://${join(source, "promo.html")}`;
  for (const [mode, name, width, height] of [
    ["overview", "screenshot-01-overview.png", 1280, 800],
    ["rounds", "screenshot-02-rounds.png", 1280, 800],
    ["history", "screenshot-03-history-demo.png", 1280, 800],
    ["settings", "screenshot-04-settings.png", 1280, 800],
    ["small", "promo-small-440x280.png", 440, 280],
    ["marquee", "promo-marquee-1400x560.png", 1400, 560],
    ["icon", "store-icon-128.png", 128, 128]
  ]) {
    await promo.setViewportSize({ width, height });
    await promo.goto(`${promoUrl}?asset=${mode}`);
    await promo.locator("img").evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
    await promo.screenshot({ path: join(output, name), omitBackground: mode === "icon" });
  }
  const files = [
    ["store-icon-128.png", 128, 128],
    ["screenshot-01-overview.png", 1280, 800],
    ["screenshot-02-rounds.png", 1280, 800],
    ["screenshot-03-history-demo.png", 1280, 800],
    ["screenshot-04-settings.png", 1280, 800],
    ["promo-small-440x280.png", 440, 280],
    ["promo-marquee-1400x560.png", 1400, 560]
  ];
  const manifest = {
    provenance: "Generated from the local extension UI with fictional practice data in a temporary Chromium profile; no user history or API Key was used.",
    generatedAt: new Date().toISOString(),
    assets: await Promise.all(files.map(async ([file, width, height]) => ({
      file, width, height,
      sha256: createHash("sha256").update(await readFile(join(output, file))).digest("hex")
    })))
  };
  await writeFile(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log("Generated launch assets in", output);
} finally {
  await browser?.close();
  await rm(profile, { recursive: true, force: true });
}
