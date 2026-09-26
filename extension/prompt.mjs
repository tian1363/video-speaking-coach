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
      "这是第一轮。用户尝试只看自己记录的关键词，用英文把它们串成自己的复述。优先分析内容是否说清，不要逐句纠错。下一轮建议应引导用户按主题、重点、例子重讲。",
      "这是第二轮。重点分析结构或内容中最影响理解的一处问题。下一轮建议应引导用户独立重讲，并补上自己的看法。",
      "这是第三轮。比较三轮可观察到的变化，重点指出现在最值得改进的一处问题。下一次建议给出具体的小目标。"
    ][round];
    return `视频：《${title}》\n关键词：${keywords}\n三轮原话：\n${history}\n${instruction}\n你没有取得视频字幕或口播内容，只能依据用户提供的标题、关键词和原话分析。不要声称核对了视频，不要补写未经用户提及的情节、数据、人物或观点。\n只输出一个 JSON 对象，不要 Markdown 代码块，字段严格为 problem、why、example、nextStep，值均为字符串：\nproblem：用中文分析这一轮最影响理解的一处具体问题，引用用户实际说过的内容。\nwhy：用中文解释这个问题为什么影响听者理解，以及重讲时该补什么。\nexample：给出一段完整、连贯的英文重讲示例，至少三句，包含开头、展开和收束；不能只给短语或单句。示例只能改写和组织用户已提供的信息；信息不足时用 From what I remember 或类似说法标明这是用户的理解，不可编造视频事实。示例是用户完成本轮表达后的参考，不要求逐字照读。\nnextStep：用中文给一个下一轮可以立即执行的练习动作，可带一个聚焦问题。`;
  }
  throw new Error("未知请求类型");
}

export function parseRoundFeedback(raw) {
  const text = String(raw || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let data;
  try { data = JSON.parse(text.slice(start, end + 1)); } catch { throw new Error("反馈格式无效"); }
  const fields = ["problem", "why", "example", "nextStep"];
  if (!data || typeof data !== "object" || fields.some((key) => typeof data[key] !== "string" || !data[key].trim())) {
    throw new Error("反馈缺少必要内容");
  }
  const example = data.example.trim();
  const words = example.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
  const sentences = example.match(/[.!?](?:["']|$|\s)/g) || [];
  if (words.length < 30 || sentences.length < 3) throw new Error("重讲示例不完整");
  return `【现有问题】\n${data.problem.trim()}\n\n【为什么影响表达】\n${data.why.trim()}\n\n【完整重讲示例】\n${example}\n\n【下一轮怎么练】\n${data.nextStep.trim()}`;
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
