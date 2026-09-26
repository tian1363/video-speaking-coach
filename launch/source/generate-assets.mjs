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
  "你已经说出了主题。下一轮试着补上一个具体做法和例子。",
  "结构更清楚了。第三轮可以少看笔记，用自己的话连接各个重点。",
  "第三轮加入了你的看法，表达更连贯。下次试着用一句话先概括视频的核心观点。"
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
      feedbackSource: ["fallback", "fallback", "fallback"],
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
