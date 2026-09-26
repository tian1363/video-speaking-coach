import { askCoach, freeTranslate } from "./ai.mjs";
import { createSession, fallbackPrompt, nextSession, parseYouTubeVideo, sessionMarkdown } from "./core.mjs";

const $ = (id) => document.getElementById(id);
const labels = [
  { title: "先说出来", guide: "只看你记下的关键词，用语音把它们串成一段英文。先讲出自己的理解，不用追求完美。" },
  { title: "说清楚", guide: "按「主题 → 两个重点 → 例子」重讲一次，补上上一轮遗漏的内容。" },
  { title: "说自然", guide: "不看前两轮，独立讲清视频内容，再加入你自己的看法。" }
];
let session;
let attempts = [];
let selectedVideo;
let recognition;
let listening = false;
let speechBase = "";
let busy = false;
let saveTimer;
let statusTimer;
let aiConfigured = false;
let savedProvider = "openai";
let savedRegion = "cn";

function setStatus(message) {
  clearInterval(statusTimer);
  statusTimer = undefined;
  $("action-status").textContent = message;
}
function startAiWait() {
  setStatus("正在生成 AI 建议……已等待 0 秒");
  const startedAt = Date.now();
  statusTimer = setInterval(() => {
    $("action-status").textContent = `正在生成 AI 建议……已等待 ${Math.floor((Date.now() - startedAt) / 1000)} 秒`;
  }, 1000);
}
function setSpeechStatus(message) { $("speech-status").textContent = message; }
function updateAiState() {
  const changed = $("api-provider").value !== savedProvider || $("api-region").value !== savedRegion;
  $("ai-config-state").textContent = !aiConfigured ? "未设置" : changed ? "需保存" : "已设置";
  $("api-key").placeholder = aiConfigured ? "已保存；留空可保留原密钥" : "粘贴你的 API Key";
}

function defaultModel(provider) {
  return provider === "openai" ? "gpt-4.1-mini" : "qwen-plus";
}

function updateProviderUI(changeModel = false) {
  const provider = $("api-provider").value;
  const keyDestinations = {
    openai: { url: "https://platform.openai.com/api-keys", label: "前往 OpenAI 官网获取 API Key ↗", help: "将在新标签页打开 OpenAI 密钥管理页；创建后返回这里粘贴。" },
    bailian: { url: "https://bailian.console.aliyun.com/cn-beijing/model/settings/api-key", label: "前往百炼官网获取 API Key ↗", help: "将在新标签页打开百炼密钥管理页；创建前确认地域，回来后选择相同地域。" }
  };
  const destination = keyDestinations[provider];
  $("get-api-key").href = destination.url;
  $("get-api-key").textContent = destination.label;
  $("key-link-help").textContent = destination.help;
  $("api-region-row").hidden = provider === "openai";
  if (changeModel) $("api-model").value = defaultModel(provider);
  $("api-provider-help").textContent = provider === "openai"
    ? "只接受 OpenAI API 平台创建的密钥。"
    : "适用 sk-ws- 或普通 sk- 开头的百炼按量付费密钥。地域必须与创建密钥时一致。";
  updateAiState();
}

async function saveAiSettings() {
  const key = $("api-key").value.trim();
  const model = $("api-model").value.trim();
  const provider = $("api-provider").value;
  const region = $("api-region").value;
  const switched = provider !== savedProvider || region !== savedRegion;
  if (!key && (!aiConfigured || switched)) { $("ai-settings-status").textContent = switched ? "切换服务商或地域时，请重新填写对应的 API Key。" : "请先填写 API Key。"; return; }
  if (!model) { $("ai-settings-status").textContent = "请填写模型名称。"; return; }
  const settings = { userModel: model, userProvider: provider, userRegion: region };
  if (key) settings.userApiKey = key;
  try { await chrome.storage.session.set(settings); }
  catch { $("ai-settings-status").textContent = "设置暂时没保存成功，请重试。"; return; }
  $("api-key").value = "";
  aiConfigured = true;
  savedProvider = provider;
  savedRegion = region;
  updateAiState();
  $("ai-settings-status").textContent = "已保存。现在可以查词或获取 AI 建议；密钥不会显示在页面上。";
  $("ai-settings").open = false;
}

async function clearAiSettings() {
  try { await chrome.storage.session.remove(["userApiKey", "userModel", "userProvider", "userRegion"]); }
  catch { $("ai-settings-status").textContent = "暂时无法清除密钥，请重试。"; return; }
  $("api-key").value = "";
  aiConfigured = false;
  savedProvider = "openai";
  savedRegion = "cn";
  updateAiState();
  $("ai-settings-status").textContent = "密钥已清除。基础查词仍可使用。";
}
function resizeKeywords() {
  const field = $("keywords");
  field.style.height = "auto";
  field.style.height = `${field.scrollHeight}px`;
}

async function recentVideo() {
  const stored = await chrome.storage.local.get(null);
  if (stored.lastVideo) return stored.lastVideo;
  return Object.entries(stored)
    .filter(([key, value]) => key.startsWith("session:") && value?.video)
    .map(([, value]) => value)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]?.video || null;
}

async function save() {
  if (!session) return;
  session.updatedAt = Date.now();
  await chrome.storage.local.set({ [`session:${session.video.id}`]: session });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void save(); }, 300);
}

function addText(parent, tag, value, className = "") {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function exportName(record) {
  const date = new Date(record.archivedAt || record.updatedAt).toISOString().slice(0, 10);
  return `speaking-${record.video.id}-${date}`;
}

function downloadMarkdown(record) {
  const blob = new Blob([sessionMarkdown(record)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${exportName(record)}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus("Markdown 已下载。可在 Notion 的“导入 → Text & Markdown”中选择该文件，或把它放进 Obsidian 仓库。");
}

async function copyMarkdown(record) {
  await navigator.clipboard.writeText(sessionMarkdown(record));
  setStatus("已复制 Markdown，可粘贴到 Notion 或 Obsidian。");
}

async function sendToObsidian(record) {
  const vault = prompt("请输入 Obsidian 仓库名称或仓库 ID：");
  if (!vault?.trim()) return;
  await navigator.clipboard.writeText(sessionMarkdown(record));
  const uri = `obsidian://new?vault=${encodeURIComponent(vault.trim())}&name=${encodeURIComponent(exportName(record))}&clipboard`;
  await chrome.tabs.create({ url: uri });
  setStatus("已请求 Obsidian 从剪贴板创建笔记。请在浏览器提示中确认打开 Obsidian。");
}

function render() {
  if (!session) return;
  $("keywords").value = session.keywords;
  resizeKeywords();
  $("video-link").textContent = session.video.title;
  $("video-link").href = session.video.url;
  const index = Math.min(session.round, 2);
  $("round-badge").textContent = session.complete ? "已完成" : `第 ${session.round + 1} 轮`;
  $("progress").textContent = `${session.transcripts.filter(Boolean).length} / 3`;
  $("round-title").textContent = session.complete ? "完成了三轮复述" : labels[index].title;
  $("round-guide").textContent = session.complete ? "下面可以回看三轮原话和反馈。" : labels[index].guide;
  $("transcript").value = session.complete ? "" : session.transcripts[index];
  $("transcript").disabled = session.complete;
  $("record").disabled = session.complete || !speechSupported();
  $("submit").disabled = session.complete;
  $("submit").textContent = session.complete ? "练习已完成" : session.round === 2 ? "完成练习" : "完成这一轮";
  if (!speechSupported()) setSpeechStatus("当前浏览器没有提供语音识别；可使用系统听写或直接输入。 ");
  const history = $("history");
  history.replaceChildren();
  session.transcripts.forEach((transcript, round) => {
    if (!transcript) return;
    const item = document.createElement("div");
    item.className = "history-item";
    addText(item, "strong", `第 ${round + 1} 轮 · 我的原话`);
    addText(item, "p", transcript);
    if (session.feedback[round]) addText(item, "p", session.feedback[round], "feedback");
    history.append(item);
  });
  if (!history.childNodes.length) addText(history, "p", "完成第一轮后，练习记录会显示在这里。", "minor");
  const lastRound = session.transcripts.findLastIndex(Boolean);
  $("advice-card").hidden = lastRound < 0;
  if (lastRound >= 0) {
    $("latest-advice").textContent = session.feedback[lastRound] || "这轮已保存。点击下方按钮获取 AI 建议。";
    $("refresh-advice").textContent = session.feedbackSource?.[lastRound] === "ai" ? "重新生成 AI 建议" : "获取 AI 建议";
  }
  $("completed-actions").hidden = !session.complete;
  $("restart").hidden = lastRound < 0;
  $("past-attempts").hidden = attempts.length === 0;
  const attemptList = $("attempt-list");
  attemptList.replaceChildren();
  attempts.toReversed().forEach((attempt, reverseIndex) => {
    const item = document.createElement("div");
    item.className = "history-item";
    addText(item, "strong", `${new Date(attempt.archivedAt || attempt.updatedAt).toLocaleString("zh-CN")} · ${attempt.transcripts.filter(Boolean).length} / 3 轮`);
    const button = addText(item, "button", "下载这次记录", "button secondary");
    button.type = "button";
    button.addEventListener("click", () => downloadMarkdown(attempts[attempts.length - 1 - reverseIndex]));
    attemptList.append(item);
  });
  const list = $("word-list");
  list.replaceChildren();
  session.words.forEach(({ term, explanation }) => addText(list, "span", explanation ? term : `待解释 · ${term}`, "word-chip"));
}

function speechSupported() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function stopSpeech() {
  if (recognition && listening) recognition.stop();
}

async function toggleSpeech() {
  if (listening) { stopSpeech(); return; }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition || session.complete) return;
  const permission = await navigator.permissions.query({ name: "microphone" }).catch(() => null);
  if (permission?.state !== "granted") {
    $("mic-consent").hidden = false;
    setSpeechStatus("语音输入需要麦克风权限。请先阅读下方说明，再决定是否授权。");
    return;
  }
  $("mic-consent").hidden = true;
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;
  speechBase = $("transcript").value.trim();
  let recognitionError = false;
  recognition.onstart = () => {
    listening = true;
    $("record").textContent = "停止语音输入";
    setSpeechStatus("正在听。说完后点停止，再检查转写是否准确。");
  };
  recognition.onresult = (event) => {
    const parts = [];
    for (let index = 0; index < event.results.length; index++) parts.push(event.results[index][0].transcript.trim());
    $("transcript").value = [speechBase, parts.join(" ")].filter(Boolean).join(" ").trim();
  };
  recognition.onerror = (event) => {
    recognitionError = true;
    const messages = {
      "not-allowed": "麦克风权限未开启。可前往授权页，或直接输入英文。",
      "service-not-allowed": "浏览器没有允许语音识别。请检查麦克风设置，或直接输入英文。",
      "no-speech": "没有听到声音，请靠近麦克风再试一次。",
      "audio-capture": "没有找到可用的麦克风，请检查设备连接。",
      network: "语音识别暂时无法联网，请稍后重试或直接输入英文。"
    };
    setSpeechStatus(messages[event.error] || "语音输入中断了。可以重试，或直接修改文字。");
  };
  recognition.onend = () => {
    listening = false;
    $("record").textContent = "开始语音输入";
    if (!recognitionError) setSpeechStatus("转写已结束。请检查文字，确认后提交这一轮。");
  };
  try { recognition.start(); } catch { setSpeechStatus("暂时无法开始语音输入。可以重试，或直接输入英文。"); }
}

async function coach(payload) {
  try { return { text: await askCoach(payload), online: true }; }
  catch (error) { return { text: "", online: false, error: error.code || "service" }; }
}

function coachError(response) {
  const providerName = savedProvider === "openai" ? "OpenAI" : "阿里云百炼";
  const messages = {
    "missing-key": "要使用 AI 建议，请在上方“AI 教练设置”中填写自己的 API Key。",
    "invalid-key": savedProvider === "openai"
      ? "OpenAI 未接受这把 API Key。请确认它是在 OpenAI API 平台创建、完整复制，且仍有效。"
      : "百炼未接受这把 API Key。请确认密钥类型、所属地域和套餐状态与设置一致。",
    "access-denied": `${providerName}拒绝了这次访问。请检查账号和模型调用权限。`,
    "wrong-provider": "这看起来是百炼套餐密钥，不能用于 OpenAI。请在“AI 教练设置”中切换服务商。",
    "wrong-key-type": "这把密钥不适用于百炼普通 API。请使用 sk-ws- 或普通 sk- 开头的按量付费密钥。",
    region: "请选择与百炼密钥一致的地域。",
    provider: "请选择正确的 AI 服务商。",
    "rate-limit": "AI 请求暂时太多，或账号额度已用完。请稍后再试。",
    model: "这个模型暂时无法使用。请在“AI 教练设置”中检查模型名称。",
    network: "暂时连不上 AI 服务。请检查网络，稍后再试。",
    empty: "AI 没有返回建议，请重试一次。",
    format: "AI 这次没有给出完整的重讲示例。原话已保存，请点击“获取 AI 建议”重试。",
    service: "AI 暂时无法回答，请稍后重试。"
  };
  return messages[response.error] || messages.service;
}

async function submitRound() {
  if (busy || session.complete) return;
  stopSpeech();
  const transcript = $("transcript").value.trim();
  if (!transcript) { setStatus("请先说或写下这一轮的英文复述。"); return; }
  busy = true;
  $("submit").disabled = true;
  startAiWait();
  const round = session.round;
  const transcripts = [...session.transcripts];
  transcripts[round] = transcript;
  const response = await coach({ mode: "round", round, videoTitle: session.video.title, keywords: session.keywords, transcripts });
  session = nextSession(session, transcript, response.online ? response.text : fallbackPrompt(round));
  session.feedbackSource ||= ["", "", ""];
  session.feedbackSource[round] = response.online ? "ai" : "fallback";
  await save();
  busy = false;
  render();
  setStatus(response.online ? "AI 建议已保存。" : `本轮已保存，当前显示练习提示。${coachError(response)}`);
}

async function refreshAdvice() {
  const round = session.transcripts.findLastIndex(Boolean);
  if (busy || round < 0) return;
  busy = true;
  $("refresh-advice").disabled = true;
  startAiWait();
  const response = await coach({ mode: "round", round, videoTitle: session.video.title, keywords: session.keywords, transcripts: session.transcripts });
  if (response.online) {
    session.feedback[round] = response.text;
    session.feedbackSource ||= ["", "", ""];
    session.feedbackSource[round] = "ai";
    await save();
    render();
    setStatus("AI 建议已更新。");
  } else setStatus(coachError(response));
  $("refresh-advice").disabled = false;
  busy = false;
}

async function restartPractice() {
  if (busy || !session.transcripts.some(Boolean)) return;
  if (!confirm("重新开始三轮练习？本次记录会保留在“过往练习”中。")) return;
  stopSpeech();
  clearTimeout(saveTimer);
  const previous = { ...session, archivedAt: Date.now() };
  attempts.push(previous);
  const fresh = createSession(selectedVideo);
  fresh.keywords = session.keywords;
  fresh.words = [...session.words];
  await chrome.storage.local.set({ [`attempts:${selectedVideo.id}`]: attempts, [`session:${selectedVideo.id}`]: fresh });
  session = fresh;
  render();
  setStatus("已开始新一轮练习。上一轮尝试保存在下方“过往练习”中。");
}

async function lookupWord() {
  const term = $("word").value.trim();
  if (!term || busy) return;
  busy = true;
  $("lookup").disabled = true;
  $("word-result").textContent = "正在查词……";
  const response = aiConfigured
    ? await coach({ mode: "lookup", term, videoTitle: session.video.title, keywords: session.keywords })
    : { online: false, error: "missing-key" };
  let explanation = response.online ? response.text : "";
  if (!response.online) {
    try { explanation = await freeTranslate(term); }
    catch { explanation = ""; }
  }
  $("word-result").textContent = explanation
    ? `${explanation}${response.online ? "" : `\n${response.error === "missing-key" ? "需要结合视频语境的解释？请在上方设置 API Key。" : coachError(response)}`}`
    : "现在没查到这个词。请检查拼写，稍后再试；你的输入还在这里。";
  if (explanation) {
    const existing = session.words.find((word) => word.term.toLowerCase() === term.toLowerCase());
    if (existing) existing.explanation = explanation;
    else session.words.push({ term, explanation });
    await save();
    render();
  }
  $("lookup").disabled = false;
  busy = false;
}

async function askQuestion() {
  const question = $("question").value.trim();
  if (!question || busy) return;
  busy = true;
  $("ask").disabled = true;
  $("question-result").textContent = "正在回答……";
  const response = await coach({ mode: "question", question, round: session.round, videoTitle: session.video.title, keywords: session.keywords, transcripts: session.transcripts });
  $("question-result").textContent = response.online ? response.text : coachError(response);
  $("ask").disabled = false;
  busy = false;
}

async function deleteSession() {
  if (!confirm("删除这段视频的关键词、词汇和三轮复述记录？")) return;
  stopSpeech();
  clearTimeout(saveTimer);
  await chrome.storage.local.remove([`session:${selectedVideo.id}`, `attempts:${selectedVideo.id}`, "lastVideo"]);
  attempts = [];
  session = createSession(selectedVideo);
  render();
  setStatus("本地练习记录已删除。");
}

async function loadVideo(video) {
  stopSpeech();
  if (!video) {
    const previous = session?.video || await recentVideo();
    if (previous) {
      if (!session || session.video.id !== previous.id) await loadVideo(previous);
      $("away-notice").hidden = false;
      $("return-video").href = previous.url;
      $("empty").hidden = true;
      $("workspace").hidden = false;
      return;
    }
    $("empty").hidden = false;
    $("workspace").hidden = true;
    return;
  }
  if (session && saveTimer) await save();
  clearTimeout(saveTimer);
  saveTimer = undefined;
  $("away-notice").hidden = true;
  if (session?.video.id === video.id) {
    session.video = video;
    $("video-link").textContent = video.title;
    $("video-link").href = video.url;
    return;
  }
  selectedVideo = video;
  await chrome.storage.local.set({ lastVideo: video });
  const key = `session:${video.id}`;
  const attemptKey = `attempts:${video.id}`;
  const stored = await chrome.storage.local.get([key, attemptKey]);
  attempts = stored[attemptKey] || [];
  session = stored[key] || createSession(video);
  session.video = video;
  $("empty").hidden = true;
  $("workspace").hidden = false;
  render();
  setStatus("");
}

async function init() {
  const { userApiKey, userModel, userProvider, userRegion } = await chrome.storage.session.get(["userApiKey", "userModel", "userProvider", "userRegion"]);
  const unsupportedProvider = userProvider && !["openai", "bailian"].includes(userProvider);
  if (unsupportedProvider) await chrome.storage.session.remove(["userApiKey", "userModel", "userProvider", "userRegion"]);
  aiConfigured = Boolean(userApiKey) && !unsupportedProvider;
  savedProvider = unsupportedProvider ? "openai" : userProvider || "openai";
  savedRegion = userRegion || "cn";
  $("api-provider").value = savedProvider;
  $("api-region").value = savedRegion;
  $("api-model").value = unsupportedProvider ? defaultModel(savedProvider) : userModel || defaultModel(savedProvider);
  updateProviderUI();
  if (unsupportedProvider) $("ai-settings-status").textContent = "此前选择的服务方式已停用。请重新选择 OpenAI 或百炼普通 API Key。";
  if (userApiKey?.startsWith("sk-ws-") && savedProvider === "openai") {
    $("api-provider").value = "bailian";
    updateProviderUI(true);
    $("ai-settings-status").textContent = "检测到百炼密钥前缀。请选择密钥所属地域，重新填写 Key 并保存。";
    $("ai-settings").open = true;
  }
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await loadVideo(parseYouTubeVideo(activeTab?.url || "", activeTab?.title || ""));
  $("keywords").addEventListener("input", () => { resizeKeywords(); session.keywords = $("keywords").value; scheduleSave(); });
  window.addEventListener("resize", resizeKeywords);
  $("record").addEventListener("click", () => { void toggleSpeech(); });
  $("open-mic-permission").addEventListener("click", async () => {
    await chrome.tabs.create({ url: chrome.runtime.getURL("microphone.html") });
    setSpeechStatus("已打开麦克风授权页。授权后回到视频，再点击“开始语音输入”。");
  });
  $("submit").addEventListener("click", () => { void submitRound(); });
  $("save-ai-settings").addEventListener("click", () => { void saveAiSettings(); });
  $("clear-ai-settings").addEventListener("click", () => { void clearAiSettings(); });
  $("api-provider").addEventListener("change", () => updateProviderUI(true));
  $("api-region").addEventListener("change", updateAiState);
  $("refresh-advice").addEventListener("click", () => { void refreshAdvice(); });
  $("restart").addEventListener("click", () => { void restartPractice(); });
  $("download-markdown").addEventListener("click", () => downloadMarkdown(session));
  $("copy-markdown").addEventListener("click", () => { void copyMarkdown(session).catch(() => setStatus("暂时无法复制。请试试“下载 Markdown”。")); });
  $("send-obsidian").addEventListener("click", () => { void sendToObsidian(session).catch(() => setStatus("暂时无法打开 Obsidian。请试试“下载 Markdown”。")); });
  $("lookup").addEventListener("click", () => { void lookupWord(); });
  $("ask").addEventListener("click", () => { void askQuestion(); });
  $("delete").addEventListener("click", () => { void deleteSession(); });
  for (const [id, action] of [["word", lookupWord], ["question", askQuestion]]) {
    $(id).addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); void action(); } });
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "session" && changes.selectedVideo) void loadVideo(changes.selectedVideo.newValue);
  });
}

void init();
