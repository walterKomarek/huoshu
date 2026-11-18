function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const PRESETS = {
  deepseek: { baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  siliconflow: { baseUrl: "https://api.siliconflow.cn/v1", model: "deepseek-ai/DeepSeek-V3" },
  custom: { baseUrl: "", model: "" },
  none: { baseUrl: "", model: "" },
};

const LABELS = {
  deepseek: "DeepSeek",
  openai: "OpenAI",
  groq: "Groq",
  siliconflow: "SiliconFlow",
  custom: "自定义模型",
  none: "",
};

const EXT_VERSION = chrome.runtime.getManifest().version;

document.getElementById("openApp").addEventListener("click", () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("app/index.html") + "?v=" + EXT_VERSION,
  });
});
document.getElementById("openMobile")?.addEventListener("click", () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("app/mobile.html") + "?v=" + EXT_VERSION,
  });
});

document.getElementById("reloadTabs").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "reloadAppTabs" }, () => {
    window.close();
  });
});

chrome.runtime.sendMessage({ type: "items", limit: 5 }, (res) => {
  const box = document.getElementById("recent");
  if (chrome.runtime.lastError || !res || res.error) {
    box.innerHTML = '<p class="empty">活树还没醒来。</p>';
    return;
  }
  const items = res.items || [];
  if (!items.length) {
    box.innerHTML = '<p class="empty">还没有从时间线存入过。</p>';
    return;
  }
  box.innerHTML =
    "<ul>" +
    items
      .map((r) => {
        const who = r.author_handle ? "@" + String(r.author_handle).replace(/^@/, "") : "";
        const text = (r.summary || r.text || "").slice(0, 80);
        return `<li>${escapeHtml(text)}<small>${escapeHtml(who)} ${escapeHtml(r.tree_path || "")}</small></li>`;
      })
      .join("") +
    "</ul>";
});

const providerEl = document.getElementById("llmProvider");
const keyEl = document.getElementById("llmKey");
const baseEl = document.getElementById("llmBase");
const modelEl = document.getElementById("llmModel");
const customEl = document.getElementById("customFields");
const statusEl = document.getElementById("llmStatus");

function currentLlm() {
  const provider = providerEl.value || "deepseek";
  const preset = PRESETS[provider] || PRESETS.deepseek;
  return {
    provider,
    apiKey: keyEl.value.trim(),
    baseUrl: provider === "custom" ? baseEl.value.trim() : preset.baseUrl,
    model: provider === "custom" ? modelEl.value.trim() : preset.model,
  };
}

function configured(llm) {
  if (!llm || llm.provider === "none") return false;
  if (!llm.apiKey) return false;
  if (llm.provider === "custom" && !llm.baseUrl) return false;
  return true;
}

function renderStatus(llm) {
  if (configured(llm)) {
    const name = LABELS[llm.provider] || llm.provider;
    statusEl.textContent = "对话已接 " + name;
  } else {
    statusEl.textContent = "还没填 API Key，问答只能搜索";
  }
}

function toggleCustom() {
  customEl.hidden = providerEl.value !== "custom";
}

function applyLlm(llm) {
  providerEl.value = llm.provider || "deepseek";
  keyEl.value = llm.apiKey || "";
  const preset = PRESETS[providerEl.value] || PRESETS.deepseek;
  baseEl.value = llm.baseUrl || preset.baseUrl;
  modelEl.value = llm.model || preset.model;
  toggleCustom();
  renderStatus(llm);
}

async function saveLlm() {
  const llm = currentLlm();
  await chrome.storage.local.set({ llm });
  renderStatus(llm);
}

providerEl.addEventListener("change", () => {
  const preset = PRESETS[providerEl.value] || PRESETS.deepseek;
  if (providerEl.value !== "custom") {
    baseEl.value = preset.baseUrl;
    modelEl.value = preset.model;
  }
  toggleCustom();
  saveLlm();
});

let saveT = null;
function scheduleSave() {
  clearTimeout(saveT);
  saveT = setTimeout(saveLlm, 400);
}
keyEl.addEventListener("input", scheduleSave);
baseEl.addEventListener("input", scheduleSave);
modelEl.addEventListener("input", scheduleSave);
document.getElementById("llmSave").addEventListener("click", saveLlm);

chrome.storage.local.get("llm", (data) => {
  const raw = data.llm || {};
  const provider = raw.provider || "deepseek";
  const preset = PRESETS[provider] || PRESETS.deepseek;
  applyLlm({
    provider,
    apiKey: raw.apiKey || "",
    baseUrl: raw.baseUrl || preset.baseUrl,
    model: raw.model || preset.model,
  });
});


/* —— 前沿 𝕏 源 —— */
const xHandlesEl = document.getElementById("xHandles");
const xBearerEl = document.getElementById("xBearer");
const xStatusEl = document.getElementById("xStatus");

function loadXSources() {
  chrome.runtime.sendMessage({ type: "getFrontierSources" }, (res) => {
    if (chrome.runtime.lastError || !res || res.error) {
      xStatusEl.textContent = "读不到前沿源配置";
      return;
    }
    xHandlesEl.value = (res.handles || []).map((h) => "@" + h.replace(/^@/, "")).join(", ");
    chrome.storage.local.get(["xBearerToken"], (data) => {
      xBearerEl.value = data.xBearerToken || "";
      xStatusEl.textContent = res.xBearerConfigured
        ? `已接 X API · 缓冲 ${res.xBufferCount || 0} 条`
        : `浏览采集模式 · 缓冲 ${res.xBufferCount || 0} 条（打开相关账号主页即可收入）`;
    });
  });
}

document.getElementById("xSave").addEventListener("click", () => {
  const handles = xHandlesEl.value;
  const token = xBearerEl.value.trim();
  chrome.runtime.sendMessage({ type: "setFrontierXHandles", handles }, () => {
    chrome.runtime.sendMessage({ type: "setXBearerToken", token }, () => {
      xStatusEl.textContent = "已保存前沿源";
      loadXSources();
    });
  });
});

loadXSources();
