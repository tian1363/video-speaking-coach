export function buildPrompt(body) {
  if (!body || typeof body !== "object") throw new Error("请求内容无效");
  const title = String(body.videoTitle || "未知视频").slice(0, 200);
  const keywords = String(body.keywords || "").slice(0, 1500);
  if (body.mode === "lookup") {
    const term = String(body.term || "").trim().slice(0, 100);
    if (!term) throw new Error("缺少要查询的词");
    return `用户正在练习描述视频《${title}》。关键词：${keywords}\n需要解释的词或中文表达：${term}\n请给当前语境下最适合的英文说法、简短中文释义、一个短英文例句。控制在80字以内。`;
  }
  const transcripts = Array.isArray(body.transcripts)
    ? body.transcripts.slice(0, 3).map((item) => String(item || "").slice(0, 5000))
    : ["", "", ""];
  const history = transcripts.map((text, index) => `第${index + 1}轮：${text || "尚未完成"}`).join("\n");
  if (body.mode === "question") {
    const question = String(body.question || "").trim().slice(0, 1000);
    if (!question) throw new Error("缺少问题");
    return `视频：《${title}》\n关键词：${keywords}\n用户复述：\n${history}\n用户问题：${question}\n先直接回答问题；若涉及视频事实且材料不足，说明不确定。最后用一句话鼓励用户继续当前轮。`;
  }
  if (body.mode === "round") {
    const round = Number(body.round);
    if (![0, 1, 2].includes(round) || !transcripts[round].trim()) throw new Error("轮次或复述内容无效");
    const instruction = [
      "这是第一轮。不要逐句纠错。指出用户已表达清楚的一点，提出一个最能帮助回忆或澄清内容的问题，再提示下一轮按主题、重点、例子重讲。",
      "这是第二轮。指出一处最重要的逻辑缺口，给出简短结构线索，并邀请用户第三轮独立重讲；不要代写整篇。",
      "这是第三轮。简要指出三轮可观察到的进步；给出一版保留用户原意、自然流畅的英文改述；解释最多两处关键表达改动；列出3到5个本次值得复习的词或短语；给出一条下次练习的具体目标。"
    ][round];
    return `视频：《${title}》\n关键词：${keywords}\n三轮原话：\n${history}\n${instruction}`;
  }
  throw new Error("未知请求类型");
}

export function extractText(response) {
  return (response.output || [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}
