/** OpenAI-compatible chat helpers. Never log apiKey. */

export const LLM_PRESETS = {
  deepseek: { baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  siliconflow: { baseUrl: "https://api.siliconflow.cn/v1", model: "deepseek-ai/DeepSeek-V3" },
  custom: { baseUrl: "", model: "" },
  none: { baseUrl: "", model: "" },
};

export const LLM_LABELS = {
  deepseek: "DeepSeek",
  openai: "OpenAI",
  groq: "Groq",
  siliconflow: "SiliconFlow",
  custom: "自定义模型",
  none: "",
};

export const UNCONFIGURED_CHAT =
  "还没接模型。点浏览器工具栏的活树图标，填入 DeepSeek / OpenAI 的 API Key，问答才会真正读你的知识库。";

const SYSTEM_PROMPT = `你是「活树」，一棵个人知识树里的问答者。
你只能根据用户消息里提供的叶子（收藏的推文或笔记）、旁注、判断字段，以及「拐点清单」作答，不要编造这些材料里没有的事实，也不要动用你自己的世界知识去补全。
如果这些材料里没有答案，就直说这棵树上还没有，并可以指出最接近的枝或作者。
引用时用 @handle，或用枝路径（例如 人工智能/大模型）。
要区分：原文是收藏/点赞留下的推文或笔记；「旁注」和「判断」（升级/降级/观察/改口）是用户自己写的，不要把旁注说成原作者的话。
拐点状态只有用户确认后才会改变；不要把论文或事件自动当成已经跨过拐点。验证信号用来事后核对，不是拐点本身。
用中文回答，简洁，2～5 个短段。不要用 markdown 表格，不要用标题井号。`;

export function normalizeLlm(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  let provider = src.provider || "deepseek";
  if (!LLM_PRESETS[provider]) provider = "deepseek";
  const preset = LLM_PRESETS[provider];
  return {
    provider,
    apiKey: String(src.apiKey || "").trim(),
    baseUrl: String(src.baseUrl || preset.baseUrl || "").trim(),
    model: String(src.model || preset.model || "").trim(),
  };
}

export function isLlmConfigured(llm) {
  if (!llm) return false;
  if (!llm.provider || llm.provider === "none") return false;
  if (!String(llm.apiKey || "").trim()) return false;
  if (llm.provider === "custom" && !String(llm.baseUrl || "").trim()) return false;
  return true;
}

export function completionsUrls(baseUrl) {
  let b = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!b) b = "https://api.deepseek.com";
  if (b.endsWith("/chat/completions")) return [b];
  if (b.endsWith("/v1")) return [`${b}/chat/completions`];
  return [`${b}/chat/completions`, `${b}/v1/chat/completions`];
}

function leafLine(it, i) {
  let handle = it.author_handle ? "@" + String(it.author_handle).replace(/^@/, "") : it.author_name || "匿名";
  const path = it.tree_path || "未分类";
  const saved = String(it.saved_at || "").slice(0, 16).replace("T", " ");
  const text = String(it.text || "").replace(/\s+/g, " ").trim();
  const note = String(it.note || "").trim() || "无";
  const judgment = String(it.judgment || "").trim();
  const occurred = String(it.occurred_on || "").trim();
  let extra = "";
  if (judgment) extra += `\n判断：${judgment}`;
  if (occurred) extra += `\n对象：${occurred}`;
  return `${i + 1}. id=${it.id || ""} handle=${handle} path=${path} saved_at=${saved}\n原文：${text}\n旁注：${note}${extra}`;
}

export function buildUserPayload(question, hits, snapshot = "") {
  const list = (hits || []).map(leafLine).join("\n\n");
  const snap = String(snapshot || "").trim();
  const head = snap ? `${snap}\n\n` : "";
  return `${head}问题：\n${question}\n\n叶子（按相关程度排列，共 ${(hits || []).length} 条）：\n${list || "（没有检索到叶子）"}`;
}

export function describeHttpError(status, bodyText) {
  const body = String(bodyText || "").slice(0, 240);
  if (status === 401 || status === 403) {
    return "API Key 无效或没有权限。请打开活树图标，检查密钥是否填对。";
  }
  if (status === 429) {
    return "模型额度用尽或请求过频，请稍后再问，或换一把密钥。";
  }
  if (status >= 500) {
    return "模型服务暂时不可用，请稍后再试。";
  }
  if (status === 404) {
    return "找不到对话接口，请检查 Base URL 或模型名。";
  }
  return `模型接口返回 ${status}${body ? "：" + body : "。"}`;
}

function readContent(data) {
  const choice = data?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "string" ? p : p?.text || ""))
      .join("")
      .trim();
  }
  return "";
}

export async function callChatCompletions(llm, question, hits, timeoutMs = 45000, snapshot = "") {
  const urls = completionsUrls(llm.baseUrl);
  const model = llm.model || LLM_PRESETS[llm.provider]?.model || "deepseek-chat";
  const body = JSON.stringify({
    model,
    temperature: 0.3,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPayload(question, hits, snapshot) },
    ],
  });
  let lastErr = null;
  for (let i = 0; i < urls.length; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(urls[i], {
        method: "POST",
        headers: {
          Authorization: "Bearer " + llm.apiKey,
          "Content-Type": "application/json",
        },
        body,
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (res.status === 404 && i < urls.length - 1) {
        lastErr = new Error(describeHttpError(404, text));
        continue;
      }
      if (!res.ok) {
        throw new Error(describeHttpError(res.status, text));
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("模型返回了无法解析的内容。");
      }
      const content = readContent(data);
      if (!content) throw new Error("模型没有返回文字。");
      return content;
    } catch (err) {
      if (err?.name === "AbortError") {
        throw new Error("模型响应超时（45 秒），请稍后再问。");
      }
      if (err?.message && /API Key|额度|接口|找不到|无法解析|没有返回|不可用/.test(err.message)) {
        throw err;
      }
      lastErr = err;
      if (i === urls.length - 1) {
        throw new Error("连不上模型服务，请检查网络或 Base URL。");
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error("连不上模型服务，请检查网络或 Base URL。");
}

/** Generic chat call with custom system + user messages (no knowledge-tree binding). */
export async function callRawMessages(llm, system, user, { temperature = 0.4, timeoutMs = 45000 } = {}) {
  const urls = completionsUrls(llm.baseUrl);
  const model = llm.model || LLM_PRESETS[llm.provider]?.model || "deepseek-chat";
  const body = JSON.stringify({
    model,
    temperature,
    messages: [
      { role: "system", content: String(system || "") },
      { role: "user", content: String(user || "") },
    ],
  });
  let lastErr = null;
  for (let i = 0; i < urls.length; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(urls[i], {
        method: "POST",
        headers: {
          Authorization: "Bearer " + llm.apiKey,
          "Content-Type": "application/json",
        },
        body,
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (res.status === 404 && i < urls.length - 1) {
        lastErr = new Error(describeHttpError(404, text));
        continue;
      }
      if (!res.ok) {
        throw new Error(describeHttpError(res.status, text));
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("模型返回了无法解析的内容。");
      }
      const content = readContent(data);
      if (!content) throw new Error("模型没有返回文字。");
      return content;
    } catch (err) {
      if (err?.name === "AbortError") {
        throw new Error("模型响应超时（45 秒），请稍后再试。");
      }
      if (err?.message && /API Key|额度|接口|找不到|无法解析|没有返回|不可用/.test(err.message)) {
        throw err;
      }
      lastErr = err;
      if (i === urls.length - 1) {
        throw new Error("连不上模型服务，请检查网络或 Base URL。");
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error("连不上模型服务，请检查网络或 Base URL。");
}
