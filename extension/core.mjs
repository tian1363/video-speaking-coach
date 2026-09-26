export function parseYouTubeVideo(rawUrl, title = "") {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    let id = "";
    if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
      else id = url.pathname.match(/^\/(?:shorts|live)\/([A-Za-z0-9_-]{11})(?:\/|$)/)?.[1] || "";
    } else if (host === "youtu.be" || host === "www.youtu.be") {
      id = url.pathname.match(/^\/([A-Za-z0-9_-]{11})(?:\/|$)/)?.[1] || "";
    }
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    return {
      id,
      url: `https://www.youtube.com/watch?v=${id}`,
      title: title.replace(/\s*-\s*YouTube\s*$/i, "").trim() || "YouTube 视频"
    };
  } catch {
    return null;
  }
}

export function createSession(video) {
  return {
    video,
    keywords: "",
    round: 0,
    transcripts: ["", "", ""],
    feedback: ["", "", ""],
    words: [],
    complete: false,
    updatedAt: Date.now()
  };
}

export function nextSession(session, transcript, feedback = "") {
  if (session.complete) throw new Error("练习已完成");
  const value = transcript.trim();
  if (!value) throw new Error("请先说或写下这一轮的英文复述");
  const transcripts = [...session.transcripts];
  const nextFeedback = [...session.feedback];
  transcripts[session.round] = value;
  nextFeedback[session.round] = feedback;
  const nextRound = session.round + 1;
  return {
    ...session,
    transcripts,
    feedback: nextFeedback,
    round: nextRound,
    complete: nextRound === 3,
    updatedAt: Date.now()
  };
}

export function fallbackPrompt(round) {
  if (round === 0) return "第一轮完成。想一想：视频最重要的观点是什么？第二轮试着按「主题 → 两个重点 → 例子」重新讲。";
  if (round === 1) return "第二轮完成。第三轮请不看前面的文字，独立讲清主题、重点和你的看法。";
  return "三轮练习完成。你的原话已保存。连接 AI 服务后可以获得针对内容、逻辑和表达的个性化反馈。";
}

export function sessionMarkdown(session) {
  const lines = [
    `# ${session.video.title} · 英语口语练习`,
    "",
    `视频：${session.video.url}`,
    `记录时间：${new Date(session.archivedAt || session.updatedAt).toLocaleString("zh-CN")}`,
    `进度：${session.transcripts.filter(Boolean).length} / 3`,
    "",
    "## 关键词",
    "",
    session.keywords || "（未记录）"
  ];
  session.transcripts.forEach((transcript, index) => {
    if (!transcript) return;
    lines.push("", `## 第 ${index + 1} 轮 · 我的原话`, "", transcript, "", "### 教练建议", "", session.feedback[index] || "（尚无建议）");
  });
  if (session.words.length) {
    lines.push("", "## 词汇积累", "");
    for (const { term, explanation } of session.words) lines.push(`- **${term}**：${explanation || "待解释"}`);
  }
  return `${lines.join("\n")}\n`;
}
