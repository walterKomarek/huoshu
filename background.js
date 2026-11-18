/** 活树 service worker — sole writer of chrome.storage.local. */
import { classify, matchUserTree } from "./classifier.js";
import { buildSeed, SEED_HANDLES, SEED_SOURCE_IDS } from "./seed.js";
import { addNodeInStore, renameNodeInStore, deleteNodeInStore } from "./tree-ops.js";
import {
  normalizeLlm,
  isLlmConfigured,
  LLM_LABELS,
  UNCONFIGURED_CHAT,
  callChatCompletions,
  callRawMessages,
} from "./llm.js";
import { fetchEvents } from "./frontier-events.js";
import {
  implantSkeleton,
  missingSkeletonPaths,
  seedJudgmentCollections,
  normalizeStatus,
  normalizeKind,
  normalizeJudgment,
  isJudgmentBranch,
  decorateFrontierFeed,
  compileJudgmentSnapshot,
  inflectionChatSnapshot,
  JUDGMENT_CHOICES,
  NOTE_TEMPLATE,
  CHAT_PRESETS,
} from "./judgment.js";

const KEYS = ["items", "events", "chats", "tree_nodes", "inited", "inflections", "nodes"];
const FLAG_KEYS = ["skeletonInstalled", "skeletonBannerDismissed", "judgmentSeeded"];

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}+08:00`;
}

function todayPrefix() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function shanghaiYmd() {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  return { y: get("year"), m: get("month"), d: get("day") };
}

function short(s, n) {
  s = String(s || "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length <= n ? s : s.slice(0, n) + "…";
}


function unique(arr) {
  const out = [];
  for (const x of arr || []) {
    const s = String(x || "").trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

function whoOf(item) {
  const h = item?.author_handle;
  if (h) return "@" + String(h).replace(/^@/, "");
  if (item?.author_name) return item.author_name;
  return "一条笔记";
}

function ingestMessage(item) {
  let who = item.author_handle;
  if (who) who = "@" + String(who).replace(/^@/, "");
  else who = item.author_name || "一段文字";
  const path = item.tree_path || "未分类";
  if (item.source === "x") {
    return `收藏了 ${who} 关于「${short(item.summary || item.text || "", 18)}」的推文，挂到 ${path}`;
  }
  if (item.source === "frontier") {
    return `从前沿存入了 ${who} 的「${short(item.summary || item.text || "", 18)}」，挂到 ${path}`;
  }
  if (item.source === "xhs") {
    return `收藏了小红书上 ${who} 的「${short(item.summary || item.text || "", 18)}」，挂到 ${path}`;
  }
  return `存入了 ${who} 的一段文字，挂到 ${path}`;
}

const STATUS_RE = /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/([^/\s]+)\/status\/(\d+)/i;
const XHS_NOTE_RE = /(?:xiaohongshu\.com|xhslink\.com)\/(?:explore|discovery\/item|item)\/([a-zA-Z0-9]+)/i;
const XHS_SHORT_RE = /(?:https?:\/\/)?(?:www\.)?xhslink\.com\/\S+/i;
const XHS_ANY_RE = /https?:\/\/(?:www\.)?(?:xiaohongshu\.com|xhslink\.com)\/[^\s，。]+/i;

function parseStatusUrl(url) {
  const m = STATUS_RE.exec(url || "");
  if (!m) return [null, null];
  return [m[1], m[2]];
}

function extractUrlFromBlob(blob) {
  const s = String(blob || "");
  const xhs = s.match(XHS_ANY_RE);
  if (xhs) return xhs[0];
  const tw = s.match(/(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/[^\s]+\/status\/\d+/i);
  return tw ? tw[0] : "";
}

function parseXhsId(url) {
  const m = XHS_NOTE_RE.exec(url || "");
  return m ? m[1] : "";
}

function looksLikeXhs(url, text) {
  const blob = `${url || ""} ${text || ""}`;
  return /xiaohongshu\.com|xhslink\.com|小红书/.test(blob);
}

function emptyStore() {
  return { items: [], events: [], chats: [], tree_nodes: [], inited: false, inflections: [], nodes: [] };
}

async function loadStore() {
  const data = await chrome.storage.local.get(KEYS);
  return {
    items: Array.isArray(data.items) ? data.items : [],
    events: Array.isArray(data.events) ? data.events : [],
    chats: Array.isArray(data.chats) ? data.chats : [],
    tree_nodes: Array.isArray(data.tree_nodes) ? data.tree_nodes : [],
    inited: !!data.inited,
    inflections: Array.isArray(data.inflections) ? data.inflections : [],
    nodes: Array.isArray(data.nodes) ? data.nodes : [],
  };
}

async function saveStore(store) {
  await chrome.storage.local.set({
    items: store.items,
    events: store.events,
    chats: store.chats,
    tree_nodes: store.tree_nodes,
    inited: store.inited,
    inflections: store.inflections || [],
    nodes: store.nodes || [],
  });
}

function cloneItem(item) {
  if (!item) return null;
  return {
    ...item,
    tags: Array.isArray(item.tags) ? [...item.tags] : [],
    inflection_ids: Array.isArray(item.inflection_ids) ? [...item.inflection_ids] : [],
  };
}

let chain = Promise.resolve();
function locked(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => {},
    () => {}
  );
  return run;
}

function clearSeedContent(store) {
  const handles = new Set(
    (SEED_HANDLES || []).map((h) => String(h).replace(/^@/, "")).filter(Boolean)
  );
  const sourceIds = new Set(SEED_SOURCE_IDS || []);
  const dropIds = new Set();
  store.items = (store.items || []).filter((it) => {
    const h = String(it.author_handle || "").replace(/^@/, "");
    const isSeed =
      it.raw?.seed === true ||
      it.fromSeed === true ||
      handles.has(h) ||
      (it.source_id && sourceIds.has(it.source_id));
    if (isSeed) {
      dropIds.add(it.id);
      return false;
    }
    return true;
  });
  store.events = (store.events || []).filter((ev) => {
    if (ev.item_id && dropIds.has(ev.item_id)) return false;
    if (ev.type === "chat") return false;
    const msg = String(ev.message || "");
    if (msg.includes("看见一条脊线：留下，比刷新更近")) return false;
    if (msg.includes("问了活树：留下，是否能比刷新更近")) return false;
    for (const h of handles) {
      if (h && msg.includes("@" + h)) return false;
    }
    return true;
  });
  store.chats = [];
}

async function ensureInit() {
  const store = await loadStore();
  const extra = await chrome.storage.local.get(["seedCleared"]);
  let dirty = false;

  if (!store.inited || !store.tree_nodes.length) {
    const seed = buildSeed();
    if (!store.tree_nodes.length) store.tree_nodes = seed.tree_nodes;
    if (!store.inited) {
      store.items = [];
      store.events = [];
      store.chats = [];
    }
    store.inited = true;
    dirty = true;
  }

  if (!extra.seedCleared) {
    clearSeedContent(store);
    await chrome.storage.local.set({ seedCleared: true });
    dirty = true;
  }

  // One-time: ensure top-level 具身智能 exists for older installs
  if (!store.tree_nodes.some((n) => n.path === "具身智能" || n.title === "具身智能")) {
    store.tree_nodes.push({
      path: "具身智能",
      title: "具身智能",
      parent: null,
      sort: 5,
      description: "人形、VLA、世界模型与机器人基座",
      created_at: nowIso(),
    });
    dirty = true;
  }

  const flags = await chrome.storage.local.get(["judgmentSeeded"]);
  const beforeInf = (store.inflections || []).length;
  const beforeNodes = (store.nodes || []).length;
  const seeded = seedJudgmentCollections(
    store.inflections,
    store.nodes,
    nowIso,
    !!flags.judgmentSeeded
  );
  store.inflections = seeded.inflections;
  store.nodes = seeded.nodes;
  if (!flags.judgmentSeeded) {
    await chrome.storage.local.set({ judgmentSeeded: true });
    dirty = true;
  } else if (seeded.inflections.length !== beforeInf || seeded.nodes.length !== beforeNodes) {
    dirty = true;
  }

  if (dirty) await saveStore(store);
  return store;
}

function addEvent(store, type, message, itemId = null, ts = null, extra = null) {
  const ev = {
    id: newId(),
    ts: ts || nowIso(),
    type,
    item_id: itemId,
    message,
  };
  if (extra && typeof extra === "object") Object.assign(ev, extra);
  store.events.push(ev);
  return ev;
}

function ensurePath(store, path) {
  if (!path) return;
  const parts = String(path)
    .split("/")
    .filter(Boolean);
  const acc = [];
  let parent = null;
  const ts = nowIso();
  const existing = new Set(store.tree_nodes.map((n) => n.path));
  parts.forEach((part, i) => {
    acc.push(part);
    const p = acc.join("/");
    if (!existing.has(p)) {
      store.tree_nodes.push({
        path: p,
        title: part,
        parent,
        sort: 100 + i,
        description: "",
        created_at: ts,
      });
      existing.add(p);
    }
    parent = p;
  });
}

function findBySource(store, source, sourceId) {
  if (!sourceId) return null;
  return store.items.find((it) => it.source === source && it.source_id === sourceId) || null;
}

function getItem(store, id) {
  return store.items.find((it) => it.id === id) || null;
}

function listItems(store, path = null, q = null, limit = 50) {
  let out = store.items.slice();
  if (path) {
    out = out.filter(
      (it) => it.tree_path === path || String(it.tree_path || "").startsWith(path + "/")
    );
  }
  if (q) {
    const needle = String(q).toLowerCase();
    out = out.filter((it) => {
      const tags = Array.isArray(it.tags) ? it.tags.join(" ") : it.tags || "";
      const blob = [it.text, it.summary, it.note, tags, it.author_name, it.author_handle]
        .join(" ")
        .toLowerCase();
      return blob.includes(needle);
    });
  }
  out.sort((a, b) => String(b.saved_at || "").localeCompare(String(a.saved_at || "")));
  return out.slice(0, Math.max(1, Math.min(200, Number(limit) || 50))).map(cloneItem);
}

function stats(store) {
  const prefix = todayPrefix();
  const total = store.items.length;
  const today = store.items.filter((it) => String(it.saved_at || "").startsWith(prefix)).length;
  return { total, today };
}

function nestedTree(store) {
  const nodes = store.tree_nodes.slice().sort((a, b) => {
    const sa = a.sort ?? 0;
    const sb = b.sort ?? 0;
    if (sa !== sb) return sa - sb;
    return String(a.path).localeCompare(String(b.path));
  });
  const counts = {};
  for (const it of store.items) {
    const p = it.tree_path || "";
    counts[p] = (counts[p] || 0) + 1;
  }
  function rollup(path) {
    let n = counts[path] || 0;
    for (const [p, c] of Object.entries(counts)) {
      if (p !== path && p.startsWith(path + "/")) n += c;
    }
    return n;
  }
  const byParent = new Map();
  for (const n of nodes) {
    const key = n.parent ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(n);
  }
  function build(parent) {
    const out = [];
    for (const n of byParent.get(parent) || []) {
      out.push({
        path: n.path,
        title: n.title,
        description: n.description,
        count: rollup(n.path),
        children: build(n.path),
      });
    }
    return out;
  }
  const s = stats(store);
  return { nodes: build(null), total: s.total, today: s.today };
}

function listEvents(store, limit = 50) {
  const n = Math.max(1, Math.min(200, Number(limit) || 50));
  return store.events
    .slice()
    .sort((a, b) => String(b.ts).localeCompare(String(a.ts)) || String(b.id).localeCompare(String(a.id)))
    .slice(0, n);
}

function reSplit(q) {
  const parts = String(q).match(/[A-Za-z][A-Za-z0-9_]+|[\u4e00-\u9fff]{2,4}/g) || [];
  const extra = [];
  for (const part of parts) {
    if (!/^[A-Za-z0-9]/.test(part) && part.length >= 3) extra.push(part.slice(0, 2));
  }
  const out = [];
  for (const part of [...parts, ...extra]) {
    if (part.length >= 2 && !out.includes(part)) out.push(part);
  }
  return out.slice(0, 16);
}

function searchItems(store, q, path = null, limit = 8) {
  q = (q || "").trim();
  if (!q) return listItems(store, path, null, limit);
  const scored = new Map();
  const tokens = reSplit(q);
  const needles = [q, ...tokens.filter((t) => t.length >= 2)];
  for (const needle of needles) {
    const nlow = needle.toLowerCase();
    for (const it of store.items) {
      const tags = Array.isArray(it.tags) ? it.tags.join(" ") : it.tags || "";
      const blob = [it.text || "", it.summary || "", it.note || "", tags].join(" ").toLowerCase();
      if (!blob.includes(nlow)) continue;
      const count = blob.split(nlow).length - 1;
      const score = count * (needle === q ? 4 : 2) + 1;
      scored.set(it.id, (scored.get(it.id) || 0) + score);
    }
  }
  const ids = [...scored.keys()].sort((a, b) => scored.get(b) - scored.get(a));
  const byId = new Map(store.items.map((it) => [it.id, it]));
  const out = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) continue;
    if (
      path &&
      !(item.tree_path === path || String(item.tree_path || "").startsWith(path + "/"))
    ) {
      continue;
    }
    out.push(cloneItem(item));
    if (out.length >= limit) break;
  }
  if (out.length < 3 && out.length) {
    let branch = out[0].tree_path || "";
    if (branch.includes("/")) branch = branch.split("/").slice(0, -1).join("/");
    const seen = new Set(out.map((x) => x.id));
    for (const it of listItems(store, branch || null, null, limit)) {
      if (!seen.has(it.id)) {
        out.push(it);
        seen.add(it.id);
      }
      if (out.length >= limit) break;
    }
  }
  if (!out.length) return listItems(store, path, null, limit);
  return out;
}

function quoteOf(it, n = 90) {
  const t = String(it.text || "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length <= n ? t : t.slice(0, n) + "…";
}

function doIngest(store, payload) {
  payload = payload || {};
  let text = String(payload.text || "").trim();
  let url = String(payload.url || "").trim();
  let handle = String(payload.author_handle || "").replace(/^@/, "");
  let sourceId = String(payload.source_id || "").trim() || null;
  let source = ["x", "paste", "note", "youtube", "frontier", "xhs"].includes(payload.source)
    ? payload.source
    : "paste";

  if (!url) {
    const found = extractUrlFromBlob(text);
    if (found) url = found;
  }

  if (url) {
    const [h, sid] = parseStatusUrl(url);
    if (h && !handle) handle = h;
    if (sid && !sourceId) {
      sourceId = sid;
      source = "x";
    }
    const xhsId = parseXhsId(url);
    if (xhsId && !sourceId) sourceId = xhsId;
    if (looksLikeXhs(url, text) && source !== "x") {
      source = "xhs";
      if (!payload.tags) payload.tags = [];
      if (!payload.tags.includes("小红书")) payload.tags = ["小红书", ...payload.tags];
      if (!handle && !payload.author_name) {
        payload.author_name = payload.author_name || "小红书";
      }
    }
  }

  if (!text && !url) {
    const err = new Error("需要正文或链接");
    err.code = 400;
    throw err;
  }
  if (!text) text = `（仅链接）${url}`;

  if (sourceId) {
    const existing = findBySource(store, source, sourceId);
    if (existing) return { ...cloneItem(existing), deduped: true, ok: true };
  }

  const extra = `${payload.author_name || ""} ${handle} ${url}`;
  const classified = classify(text, extra);
  const preferred = String(payload.preferred_path || payload.tree_path || "").trim();
  const tags = unique([...(payload.tags || []), ...classified.tags]).slice(0, 5);
  const item = {
    id: newId(),
    source,
    source_id: sourceId,
    url,
    author_name: String(payload.author_name || "").trim() || handle || "匿名",
    author_handle: handle,
    text,
    created_at: payload.created_at || nowIso(),
    saved_at: nowIso(),
    tree_path: matchUserTree(store, {
      text,
      tags,
      extra,
      hintPath: String(payload.tree_path || "").trim(),
      preferredPath: String(payload.preferred_path || "").trim(),
    }),
    tags,
    summary: classified.summary,
    note: "",
    judgment: normalizeJudgment(payload.judgment),
    inflection_ids: unique(payload.inflection_ids || []).slice(0, 12),
    occurred_on: String(payload.occurred_on || "").trim(),
    raw: payload.raw != null ? payload.raw : payload,
  };
  if (!store.tree_nodes.some((n) => n.path === item.tree_path)) {
    ensurePath(store, item.tree_path);
  }
  store.items.push(item);
  addEvent(store, "ingest", ingestMessage(item), item.id, item.saved_at);
  if (item.judgment) {
    addEvent(
      store,
      "judgment",
      `给 ${whoOf(item)} 记了判断：${item.judgment}`,
      item.id,
      item.saved_at,
      { judgment: item.judgment }
    );
  }
  return { ...cloneItem(item), deduped: false, ok: true };
}

function doPatch(store, id, note, treePath, extra = null) {
  const cur = getItem(store, id);
  if (!cur) {
    const err = new Error("未找到");
    err.code = 404;
    throw err;
  }
  const fields = extra && typeof extra === "object" ? extra : {};
  function hasField(k) {
    return Object.prototype.hasOwnProperty.call(fields, k) && fields[k] !== undefined;
  }
  if (note != null && note !== (cur.note || "")) {
    cur.note = note;
    addEvent(store, "note", `给 ${whoOf(cur)} 写了一则旁注`, id);
  }
  if (treePath != null && treePath !== cur.tree_path) {
    const from = cur.tree_path || "未分类";
    ensurePath(store, treePath);
    cur.tree_path = treePath;
    addEvent(store, "refile", `把 ${whoOf(cur)} 从 ${from} 移到 ${treePath}`, id);
  }
  if (hasField("judgment")) {
    const j = normalizeJudgment(fields.judgment);
    if (j !== (cur.judgment || "")) {
      cur.judgment = j;
      if (j) {
        addEvent(
          store,
          "judgment",
          `给 ${whoOf(cur)} 记了判断：${j}`,
          id,
          null,
          { judgment: j }
        );
      }
    }
  }
  if (hasField("inflection_ids")) {
    cur.inflection_ids = unique(fields.inflection_ids || []).slice(0, 12);
  }
  if (hasField("occurred_on")) {
    cur.occurred_on = String(fields.occurred_on || "").trim();
  }
  return cloneItem(cur);
}

function doDelete(store, id) {
  const cur = getItem(store, id);
  if (!cur) {
    const err = new Error("未找到");
    err.code = 404;
    throw err;
  }
  store.items = store.items.filter((it) => it.id !== id);
  addEvent(store, "refile", `从树上摘下了 ${whoOf(cur)}`, id);
  return { ok: true };
}

async function loadLlm() {
  const data = await chrome.storage.local.get("llm");
  return normalizeLlm(data.llm);
}

function llmStatusPayload(llm) {
  const configured = isLlmConfigured(llm);
  const label = LLM_LABELS[llm.provider] || llm.provider || "";
  return { configured, provider: llm.provider, label };
}

function citationsOf(hits) {
  return hits.slice(0, 6).map((it) => ({
    id: it.id,
    author_handle: it.author_handle || "",
    author_name: it.author_name || "",
    tree_path: it.tree_path || "",
    url: it.url || "",
    quote: quoteOf(it),
  }));
}

async function doChat(store, message, path) {
  message = String(message || "").trim();
  if (!message) {
    const err = new Error("请写一句问话");
    err.code = 400;
    throw err;
  }
  const user = {
    id: newId(),
    ts: nowIso(),
    role: "user",
    content: message,
    citations: [],
  };
  store.chats.push(user);
  const hits = searchItems(store, message, path || null, 8);
  const citations = citationsOf(hits);
  const snapshot = inflectionChatSnapshot(store.inflections, store.items, store.nodes);
  const llm = await loadLlm();
  let answer;
  if (!isLlmConfigured(llm)) {
    answer = UNCONFIGURED_CHAT;
  } else {
    try {
      answer = await callChatCompletions(llm, message, hits, 45000, snapshot);
    } catch (err) {
      answer = err?.message || "问模型时出错。";
    }
  }
  const rec = {
    id: newId(),
    ts: nowIso(),
    role: "assistant",
    content: answer,
    citations,
  };
  store.chats.push(rec);
  addEvent(store, "chat", `问了活树：${short(message, 24)}`);
  return { ...rec };
}

function dateLabelOf() {
  const { y, m, d } = shanghaiYmd();
  return `${y}年${m}月${d}日`;
}

function doCompile(store, path, { snapshot = false } = {}) {
  path = String(path || "").trim();
  const { y, m, d } = shanghaiYmd();
  const label = dateLabelOf();
  if (snapshot || isJudgmentBranch(path)) {
    const md = compileJudgmentSnapshot({
      items: store.items,
      inflections: store.inflections,
      nodes: store.nodes,
      treeNodes: store.tree_nodes,
      dateLabel: label,
    });
    const evLabel = snapshot ? "判断快照" : path;
    addEvent(store, "compile", `编译了「${evLabel}」，导出判断快照`);
    return { path: path || "判断快照", markdown: md, count: (store.inflections || []).length, snapshot: true };
  }
  const items = listItems(store, path || null, null, 200);
  const title = path ? path.split("/").pop() : "活树";
  const lines = [
    `# ${title}`,
    "",
    `> 从活树编译 · ${y}年${m}月${d}日 · ${items.length} 条`,
    "",
  ];
  if (path) {
    lines.push(`枝：\`${path}\``);
    lines.push("");
  }
  if (!items.length) lines.push("这一枝还是空的。");
  for (const it of items) {
    let who = it.author_handle || it.author_name || "匿名";
    if (it.author_handle) who = "@" + String(it.author_handle).replace(/^@/, "");
    lines.push(`## ${who}`);
    const meta = [it.tree_path || "", String(it.saved_at || "").slice(0, 16).replace("T", " "), it.url || ""]
      .filter(Boolean)
      .join(" · ");
    if (meta) {
      lines.push(`*${meta}*`);
      lines.push("");
    }
    if (it.summary) {
      lines.push(`**摘要** ${it.summary}`);
      lines.push("");
    }
    lines.push(it.text || "");
    lines.push("");
    if (it.note) {
      lines.push(`**旁注** ${it.note}`);
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }
  const md = lines.join("\n").replace(/\s+$/, "") + "\n";
  const chapterLabel = path || "整棵树";
  addEvent(store, "compile", `编译了「${chapterLabel}」这一章，共 ${items.length} 条`);
  return { path, markdown: md, count: items.length };
}

function listChats(store, limit = 40) {
  return store.chats
    .slice()
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
    .slice(0, Math.max(1, Math.min(200, Number(limit) || 40)))
    .map((c) => ({
      ...c,
      citations: Array.isArray(c.citations) ? c.citations : [],
    }));
}


/* —— 前沿：本地缓存 + 远程/ arXiv 刷新 + 每天 9 点 —— */
const FRONTIER_KEY = "frontierFeed";
const FRONTIER_META_KEY = "frontierMeta";
const FRONTIER_ALARM = "frontierDaily9";
const DEFAULT_FRONTIER_URL = ""; // 可在 storage.frontierUrl 覆盖

function shanghaiParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  return {
    y: get("year"),
    m: get("month"),
    d: get("day"),
    hour: Number(hour),
    minute: Number(get("minute")),
  };
}

function ymdShanghai(d = new Date()) {
  const { y, m, d: day } = shanghaiParts(d);
  return `${y}-${m}-${day}`;
}

function daysAgoYmd(n) {
  const ms = Date.now() - n * 24 * 3600 * 1000;
  return ymdShanghai(new Date(ms));
}

function stripXml(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseArxivAtom(xml) {
  const entries = [];
  const blocks = String(xml || "").split("<entry>").slice(1);
  for (const block of blocks) {
    const idMatch = block.match(/<id>([^<]+)<\/id>/);
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const summaryMatch = block.match(/<summary>([\s\S]*?)<\/summary>/);
    const publishedMatch = block.match(/<published>([^<]+)<\/published>/);
    const authors = [...block.matchAll(/<name>([^<]+)<\/name>/g)].map((m) => m[1].trim());
    const idUrl = (idMatch?.[1] || "").trim();
    const arxivId = idUrl.split("/abs/").pop() || idUrl.split("/").pop() || "";
    if (!arxivId) continue;
    const title = stripXml(titleMatch?.[1] || "");
    const summary = stripXml(summaryMatch?.[1] || "");
    const published = (publishedMatch?.[1] || "").slice(0, 10);
    const who = authors.slice(0, 3).join(", ") + (authors.length > 3 ? " 等" : "");
    const low = (title + " " + summary).toLowerCase();
    const tags = [];
    const dataLayer =
      /teleop|teleoperation|遥操作|egocentric|open x-embodiment|\boxe\b|synthetic robot|cross-embodiment|data engine|human demonstration|human video|\bumi\b|robot dataset|retargeting|retarget/.test(
        low
      );
    if (
      /具身|embodied|vla|vision-language-action|humanoid|人形|world model|世界模型|机器人/.test(low) ||
      dataLayer
    ) {
      if (/vla|vision-language-action/.test(low)) tags.push("VLA");
      if (/world model|世界模型/.test(low)) tags.push("世界模型");
      if (/humanoid|人形/.test(low)) tags.push("人形");
      if (dataLayer) tags.push("数据层");
      if (!tags.length) tags.push("具身智能");
      if (!tags.includes("具身智能")) tags.unshift("具身智能");
    } else {
      tags.push("AI");
    }
    entries.push({
      id: `arxiv-${arxivId}`,
      date: published,
      who: who || "arXiv",
      role: "arXiv 近刊",
      title,
      why: summary.slice(0, 220) + (summary.length > 220 ? "…" : ""),
      url: `https://arxiv.org/abs/${arxivId}`,
      source: "arxiv",
      kind: "paper",
      tags: tags.slice(0, 4),
    });
  }
  return entries;
}

async function fetchBundledFrontier() {
  const url = chrome.runtime.getURL("app/frontier.json") + "?t=" + Date.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error("本地前沿读不到");
  return await res.json();
}

async function fetchRemoteFrontier(url) {
  const res = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("远程前沿 " + res.status);
  const data = await res.json();
  if (!data || !Array.isArray(data.items)) throw new Error("远程前沿格式不对");
  return data;
}

async function fetchOneArxivQuery(query, max = 10) {
  const url =
    "https://export.arxiv.org/api/query?search_query=" +
    encodeURIComponent(query) +
    "&start=0&max_results=" +
    max +
    "&sortBy=submittedDate&sortOrder=descending";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("arXiv " + res.status);
  return parseArxivAtom(await res.text());
}

async function fetchArxivFrontier() {
  // 多路查询再合并，减少单一 query 漏掉新文
  const queries = [
    '(all:"embodied" OR all:VLA OR all:"vision-language-action" OR all:"world model" OR all:humanoid) AND (cat:cs.RO OR cat:cs.AI OR cat:cs.LG OR cat:cs.CV)',
    '(all:humanoid OR all:VLA OR all:"world-action" OR all:"world action") AND cat:cs.RO',
    '(ti:embodied OR abs:embodied OR ti:VLA OR abs:"world model") AND (cat:cs.RO OR cat:cs.AI OR cat:cs.LG)',
    '(all:teleoperation OR all:teleop OR all:egocentric OR all:"Open X-Embodiment" OR all:"synthetic robot" OR all:"cross-embodiment" OR all:"data engine" OR all:"human demonstration" OR all:"human video" OR all:UMI OR all:"robot dataset" OR all:retargeting) AND (cat:cs.RO OR cat:cs.AI OR cat:cs.LG OR cat:cs.CV)',
    'cat:cs.RO',
  ];
  const merged = new Map();
  const errors = [];
  for (const q of queries) {
    try {
      const batch = await fetchOneArxivQuery(q, 12);
      for (const it of batch) {
        if (!merged.has(it.id)) merged.set(it.id, it);
      }
    } catch (e) {
      errors.push(e?.message || String(e));
    }
  }
  if (!merged.size) {
    throw new Error(errors[0] || "arXiv 无结果");
  }

  let items = [...merged.values()].sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || ""))
  );

  // 优先近 7 日；若不足再放宽到 14 日；再不足取最新 12 条
  const since7 = daysAgoYmd(7);
  const since14 = daysAgoYmd(14);
  let use = items.filter((it) => !it.date || it.date >= since7);
  let windowDays = 7;
  if (use.length < 6) {
    use = items.filter((it) => !it.date || it.date >= since14);
    windowDays = 14;
  }
  if (use.length < 4) {
    use = items.slice(0, 12);
    windowDays = 0;
  }
  use = use.slice(0, 16);

  // 过滤掉与具身/机器人明显无关的 cs.RO 宽搜噪音（保留有标签命中的）
  const soft = use.filter((it) => {
    const tags = (it.tags || []).join(" ");
    if (/具身|VLA|世界模型|人形|数据层/.test(tags)) return true;
    const blob = `${it.title || ""} ${it.why || ""}`.toLowerCase();
    return /embodied|vla|humanoid|world model|world-action|robot|manipulation|loco|policy|gripper|hand motion|egocentric|teleop|teleoperation|open x-embodiment|cross-embodiment|data engine|retarget|umi|demonstration|robot dataset|synthetic robot/.test(
      blob
    );
  });
  if (soft.length >= 4) use = soft.slice(0, 14);

  const asOf = ymdShanghai();
  const newest = use[0]?.date || asOf;
  const oldest = use[use.length - 1]?.date || newest;
  const window =
    windowDays > 0
      ? `近${windowDays === 7 ? "七" : "十四"}日（截至 ${Number(asOf.slice(5, 7))}月${Number(asOf.slice(8, 10))}日）`
      : `最新一批（截至 ${Number(asOf.slice(5, 7))}月${Number(asOf.slice(8, 10))}日）`;

  return {
    as_of: asOf,
    window,
    note: `自动从 arXiv 多路检索具身 / VLA / 世界模型 / 人形 / 数据层（遥操作·egocentric·OXE 等）相关近刊（条目日期约 ${oldest} ~ ${newest}）。周末投稿少时列表可能与工作日相同，属正常。`,
    items: use,
    source_kind: "arxiv",
    fetched_at: nowIso(),
    newest_date: newest,
    oldest_date: oldest,
  };
}


const DEFAULT_X_HANDLES = [
  "adcock_brett",      // Figure AI founder
  "Figure_robot",      // Figure
  "UnitreeRobotics",   // 宇树
  "elonmusk",          // Optimus / Tesla
  "Physical_Int",      // Physical Intelligence (π0)
  "DrJimFan",          // NVIDIA / embodied
  "svlevine",          // Sergey Levine
  "chelseabfinn",      // Chelsea Finn
  "hardmaru",
  "_akhaliq",          // paper shares
  "robotics",
];

const EMBODIED_RE =
  /具身|embodied|vla|vision-language-action|world model|世界模型|humanoid|人形|robot|机器人|optimus|unitree|manipulat|loco-?manip|egocentric|gripper|quadruped|dexterous|physical.?ai|具身智能|teleop|teleoperation|遥操作|open.?x.?embodiment|cross.?embodiment|data.?engine|retarget|umi|robot.?dataset|synthetic.?robot|human.?demonstration/i;

function isEmbodiedBlob(text) {
  return EMBODIED_RE.test(String(text || ""));
}

function hfTags(blob, embodied) {
  const tags = embodied ? ["具身智能", "HF"] : ["HF精选"];
  if (/vla/i.test(blob)) tags.push("VLA");
  if (/world model|世界模型/i.test(blob)) tags.push("世界模型");
  if (/humanoid|人形/i.test(blob)) tags.push("人形");
  if (/teleop|egocentric|open.?x|cross.?embodiment|data.?engine|retarget|umi|robot.?dataset|demonstration|synthetic.?robot|遥操作/i.test(blob)) {
    tags.push("数据层");
  }
  if (!embodied && /agent/i.test(blob)) tags.push("Agent");
  return [...new Set(tags)].slice(0, 4);
}

function mapHfRow(row, date) {
  const paper = row.paper || row;
  const id = String(paper.id || row.id || "").trim();
  if (!id) return null;
  const title = String(row.title || paper.title || "").trim();
  const summary = String(row.summary || paper.summary || "").trim();
  if (!title) return null;
  const blob = title + "\n" + summary;
  const authors = Array.isArray(paper.authors)
    ? paper.authors.map((a) => a.name || a).filter(Boolean)
    : [];
  const published = String(paper.publishedAt || row.publishedAt || date).slice(0, 10);
  const embodied = isEmbodiedBlob(blob);
  return {
    id: "hf-" + id,
    date: published,
    who: authors.slice(0, 3).join(", ") + (authors.length > 3 ? " 等" : ""),
    role: "Hugging Face Daily Papers",
    title,
    why: (summary || title).slice(0, 280) + ((summary || "").length > 280 ? "…" : ""),
    url: `https://huggingface.co/papers/${id}`,
    source: "huggingface",
    kind: "paper",
    tags: hfTags(blob, embodied),
    _embodied: embodied,
  };
}

async function fetchHuggingFaceFrontier() {
  const asOf = ymdShanghai();
  const dates = [asOf, daysAgoYmd(1), daysAgoYmd(2), daysAgoYmd(3)];
  const merged = new Map();
  for (const date of dates) {
    try {
      const url = `https://huggingface.co/api/daily_papers?date=${date}&limit=40`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const list = await res.json();
      if (!Array.isArray(list)) continue;
      for (const row of list) {
        const item = mapHfRow(row, date);
        if (item && !merged.has(item.id)) merged.set(item.id, item);
      }
    } catch {
      /* ignore one day */
    }
  }
  const all = [...merged.values()].sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || ""))
  );
  const embodied = all.filter((x) => x._embodied);
  const rest = all.filter((x) => !x._embodied);
  // 具身优先，其余补足，保证用户能看到 HF 条目
  const picked = [...embodied, ...rest].slice(0, 12).map(({ _embodied, ...it }) => it);
  return picked;
}

async function loadXHandles() {
  const data = await chrome.storage.local.get(["frontierXHandles"]);
  if (Array.isArray(data.frontierXHandles) && data.frontierXHandles.length) {
    return data.frontierXHandles
      .map((h) => String(h || "").replace(/^@/, "").trim())
      .filter(Boolean);
  }
  return DEFAULT_X_HANDLES.slice();
}

async function loadXBuffer() {
  const data = await chrome.storage.local.get(["frontierXBuffer"]);
  const buf = Array.isArray(data.frontierXBuffer) ? data.frontierXBuffer : [];
  const since = daysAgoYmd(5);
  return buf.filter((it) => !it.date || it.date >= since);
}

async function saveXBuffer(items) {
  const trimmed = (items || []).slice(0, 80);
  await chrome.storage.local.set({ frontierXBuffer: trimmed });
}

/** Optional: X API v2 user timeline if bearer token configured. */
async function fetchXApiFrontier(handles) {
  const data = await chrome.storage.local.get(["xBearerToken"]);
  const token = String(data.xBearerToken || "").trim();
  if (!token) return [];

  const out = [];
  for (const handle of handles.slice(0, 12)) {
    try {
      const uRes = await fetch(
        `https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=name`,
        { headers: { Authorization: "Bearer " + token }, cache: "no-store" }
      );
      if (!uRes.ok) continue;
      const uJson = await uRes.json();
      const uid = uJson?.data?.id;
      const name = uJson?.data?.name || handle;
      if (!uid) continue;
      const tRes = await fetch(
        `https://api.x.com/2/users/${uid}/tweets?max_results=5&tweet.fields=created_at,text&exclude=retweets,replies`,
        { headers: { Authorization: "Bearer " + token }, cache: "no-store" }
      );
      if (!tRes.ok) continue;
      const tJson = await tRes.json();
      for (const tw of tJson.data || []) {
        const text = String(tw.text || "").trim();
        if (!text || !isEmbodiedBlob(text)) continue;
        const date = String(tw.created_at || "").slice(0, 10);
        out.push({
          id: "x-" + tw.id,
          date,
          who: name,
          role: "@" + handle,
          title: text.slice(0, 90) + (text.length > 90 ? "…" : ""),
          why: text,
          url: `https://x.com/${handle}/status/${tw.id}`,
          source: "x",
          kind: "paper",
          tags: ["具身智能", "𝕏"],
        });
      }
    } catch {
      /* skip handle */
    }
  }
  return out;
}

function mergeFrontierItems(lists) {
  const map = new Map();
  for (const list of lists) {
    for (const it of list || []) {
      if (!it?.id) continue;
      if (!map.has(it.id)) map.set(it.id, it);
    }
  }
  return [...map.values()].sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || ""))
  );
}

async function loadStoredFrontier() {
  const data = await chrome.storage.local.get([FRONTIER_KEY, FRONTIER_META_KEY]);
  const raw = data[FRONTIER_KEY] || null;
  return {
    feed: raw ? decorateFrontierFeed(raw) : null,
    meta: data[FRONTIER_META_KEY] || null,
  };
}


async function saveFrontier(feed, meta) {
  const decorated = feed ? decorateFrontierFeed(feed) : feed;
  if (feed && decorated) {
    feed.items = decorated.items;
  }
  await chrome.storage.local.set({
    [FRONTIER_KEY]: decorated,
    [FRONTIER_META_KEY]: meta,
  });
}

async function refreshFrontier({ force = false } = {}) {
  const { feed: oldFeed, meta: oldMeta } = await loadStoredFrontier();
  const today = ymdShanghai();
  if (!force && oldFeed && oldMeta?.as_of === today) {
    return { feed: oldFeed, meta: oldMeta, skipped: true };
  }

  const cfg = await chrome.storage.local.get(["frontierUrl"]);
  const remoteUrl = String(cfg.frontierUrl || DEFAULT_FRONTIER_URL || "").trim();

  let feed = null;
  let error = null;
  const tried = [];

  if (remoteUrl) {
    try {
      feed = await fetchRemoteFrontier(remoteUrl);
      feed.source_kind = "remote";
      feed.fetched_at = nowIso();
      tried.push("remote");
    } catch (e) {
      error = e?.message || String(e);
      tried.push("remote:fail");
    }
  }

  if (!feed) {
    const parts = [];
    const handles = await loadXHandles();

    try {
      const arxivFeed = await fetchArxivFrontier();
      parts.push(arxivFeed.items || []);
      tried.push("arxiv:" + (arxivFeed.items || []).length);
    } catch (e) {
      error = e?.message || String(e);
      tried.push("arxiv:fail");
    }

    try {
      const hf = await fetchHuggingFaceFrontier();
      parts.push(hf);
      tried.push("hf:" + hf.length);
    } catch (e) {
      tried.push("hf:fail");
    }

    // 𝕏 暂不采集：没有 API 时跳过

    const paperItems = mergeFrontierItems(parts)
      .map((it) => ({ ...it, kind: it.kind || "paper" }))
      .slice(0, 24);

    let eventItems = [];
    try {
      eventItems = await fetchEvents({ asOf: ymdShanghai() });
      tried.push("events:" + eventItems.length);
    } catch (e) {
      tried.push("events:fail");
    }

    const items = [...paperItems, ...eventItems];
    if (items.length) {
      const asOf = ymdShanghai();
      const sources = [];
      if (tried.some((t) => t.startsWith("arxiv:") && !t.includes("fail"))) sources.push("arXiv");
      if (tried.some((t) => t.startsWith("hf:") && !t.includes("fail"))) sources.push("HuggingFace");
      if (eventItems.length) sources.push("行业事件");
      const dates = items.map((x) => x.date).filter(Boolean).sort();
      const newest = dates[dates.length - 1] || paperItems[0]?.date || asOf;
      const oldest = dates[0] || newest;
      const paperN = paperItems.length;
      const eventN = eventItems.length;
      feed = {
        as_of: asOf,
        window: `近几日综合（截至 ${Number(asOf.slice(5, 7))}月${Number(asOf.slice(8, 10))}日）`,
        note: `来源：${sources.join(" + ") || "综合"}（arXiv + HF + 行业事件）。论文 ${paperN} · 事件 ${eventN}。条目约 ${oldest} ~ ${newest}。`,
        items,
        source_kind: "multi",
        fetched_at: nowIso(),
        newest_date: newest,
        oldest_date: oldest,
        paper_count: paperN,
        event_count: eventN,
      };
    }
  }

  if (!feed) {
    try {
      feed = await fetchBundledFrontier();
      feed.source_kind = "bundled";
      feed.fetched_at = nowIso();
      tried.push("bundled");
    } catch (e) {
      error = e?.message || String(e);
      tried.push("bundled:fail");
    }
  }

  if (!feed) {
    if (oldFeed) {
      return {
        feed: oldFeed,
        meta: oldMeta,
        error: error || "前沿更新失败，仍显示缓存",
        skipped: false,
      };
    }
    throw new Error(error || "前沿更新失败");
  }

  if (!feed.as_of) feed.as_of = today;
  if (!feed.fetched_at) feed.fetched_at = nowIso();

  const newIds = new Set((feed.items || []).map((x) => x.id));
  const oldIds = new Set((oldFeed?.items || []).map((x) => x.id));
  let added = 0;
  for (const id of newIds) if (!oldIds.has(id)) added += 1;
  let removed = 0;
  for (const id of oldIds) if (!newIds.has(id)) removed += 1;
  const sameContent = added === 0 && removed === 0 && newIds.size > 0;

  const oldById = new Map((oldFeed?.items || []).map((x) => [x.id, x]));
  for (const it of feed.items || []) {
    const oldBlurb = String(oldById.get(it.id)?.blurb || "").trim();
    // 仅复用已有足够中文的要点（非占位），避免英文残留或失败占位继续带下去
    if (
      oldBlurb &&
      oldBlurb !== FRONTIER_BLURB_PLACEHOLDER &&
      countCjkChars(oldBlurb) >= 4 &&
      needsFrontierBlurb(it)
    ) {
      it.blurb = oldBlurb;
    }
  }
  try {
    await annotateFrontierBlurbs(feed);
  } catch {
    /* 未配置或失败时不回退英文 why；UI 显示中文提示 */
  }

  const allItems = Array.isArray(feed.items) ? feed.items : [];
  const paperCount = allItems.filter((x) => (x.kind || "paper") !== "event").length;
  const eventCount = allItems.filter((x) => x.kind === "event").length;
  const meta = {
    as_of: feed.as_of,
    fetched_at: feed.fetched_at,
    source_kind: feed.source_kind || "unknown",
    count: allItems.length,
    paper_count: feed.paper_count ?? paperCount,
    event_count: feed.event_count ?? eventCount,
    tried,
    added,
    removed,
    same_content: sameContent,
    newest_date: feed.newest_date || null,
  };
  await saveFrontier(feed, meta);
  return { feed, meta, skipped: false, error: null, sameContent, added, removed };
}

function countCjkChars(s) {
  return (String(s || "").match(/[\u4e00-\u9fff]/g) || []).length;
}

const FRONTIER_BLURB_PLACEHOLDER = "（更新前沿后生成中文要点）";

function needsFrontierBlurb(it) {
  const b = String(it?.blurb || "").trim();
  if (!b || b === FRONTIER_BLURB_PLACEHOLDER) return true;
  return countCjkChars(b) < 4;
}

async function annotateFrontierBlurbs(feed) {
  const items = feed.items || [];
  // 无要点、中文占位、或要点几乎没有中文（英文残留）→ 需要重写；论文与事件一并处理
  const need = items.filter(needsFrontierBlurb);
  if (!need.length) return;
  const llm = await loadLlm();
  if (!isLlmConfigured(llm)) {
    // 未配置：留空，由 UI 显示中文提示，绝不回退英文 why
    for (const it of need) it.blurb = "";
    return;
  }

  const PLACEHOLDER = FRONTIER_BLURB_PLACEHOLDER;
  const list = need
    .map((it, i) => `${i + 1}. 标题：${it.title || ""}
摘要：${String(it.why || "").slice(0, 400)}`)
    .join("\n\n");
  const system =
    "你给前沿论文与行业事件写中文一句话要点。必须用简体中文；禁止英文句子；每条不超过 100 字。只写最核心主张，不要作者名、不要套话、不要编号以外的前言。";
  const user =
    "对下面每条各写一行，格式必须是：编号. 要点\n" + list;
  try {
    const raw = await callRawMessages(llm, system, user, { temperature: 0.2, timeoutMs: 90000 });
    const lines = String(raw || "").split(/\n+/);
    for (const line of lines) {
      const m = line.trim().match(/^(\d+)[.、)\s]+(.+)$/);
      if (!m) continue;
      const idx = Number(m[1]) - 1;
      const text = m[2].trim().slice(0, 100);
      // 解析后仍无中文则丢弃，不写入英文
      if (need[idx] && text && countCjkChars(text) >= 4) need[idx].blurb = text;
    }
  } catch {
    /* 已配置但中途失败：下方填中文占位 */
  }
  for (const it of need) {
    if (countCjkChars(it.blurb) < 4) {
      it.blurb = PLACEHOLDER;
    }
  }
}

async function getFrontier() {
  const { feed, meta } = await loadStoredFrontier();
  if (feed) return { feed, meta, from: "cache" };
  const res = await refreshFrontier({ force: true });
  return { feed: res.feed, meta: res.meta, from: "fresh", error: res.error || null };
}


const FRONTIER_SUMMARY_KEY = "frontierSummaries";

const FRONTIER_SUMMARY_SYSTEM = `你是科研与产业情报分析助手。用户会给你一篇前沿论文/实验条目（标题、作者、摘要或说明、标签）。
请用中文写一份简洁、有判断力的点评，帮助读者快速判断值不值得深读。
严格按下面四个小标题输出（不要用 markdown 井号，用「【】」即可）：

【一句话】用一句话点明它在做什么、解决什么问题。
【值得关注】2～4 条要点：方法/数据/结果里真正新的地方，或可复用的思路。
【可能颠覆什么】它挑战了哪些既有做法、假设或产品路径；若冲击有限，也要诚实说「增量改进、未颠覆」。
【谁该看】适合哪类人优先读（研究者 / 工程师 / 投资或产品等），一句话即可。
【是否触及拐点】一句话判断：这条是触及拐点（写明可能属于哪类：默认路径 / 数据飞轮 / 世界模型 / 评测标准 / 创始人路线等），还是只是演示或增量论文。不要把演示自动说成已经跨过拐点。

不要编造条目里没有的实验结果。语气冷静、具体，避免空话。全文控制在 280～450 字。必须用简体中文。`;

async function loadFrontierSummaries() {
  const data = await chrome.storage.local.get([FRONTIER_SUMMARY_KEY]);
  return data[FRONTIER_SUMMARY_KEY] && typeof data[FRONTIER_SUMMARY_KEY] === "object"
    ? data[FRONTIER_SUMMARY_KEY]
    : {};
}

async function summarizeFrontierItem(item, { force = false } = {}) {
  item = item || {};
  const id = String(item.id || "").trim();
  if (!id) {
    const err = new Error("缺少前沿条目 id");
    err.code = 400;
    throw err;
  }

  const cache = await loadFrontierSummaries();
  if (!force && cache[id]?.text) {
    return { id, summary: cache[id].text, cached: true, at: cache[id].at || null };
  }

  const llm = await loadLlm();
  if (!isLlmConfigured(llm)) {
    return {
      id,
      summary: UNCONFIGURED_CHAT,
      cached: false,
      unconfigured: true,
    };
  }

  const tags = Array.isArray(item.tags) ? item.tags.join("、") : "";
  const user = [
    `标题：${item.title || "（无）"}`,
    `作者/来源：${item.who || ""} ${item.role ? "· " + item.role : ""}`.trim(),
    `日期：${item.date || ""}`,
    `标签：${tags || "无"}`,
    `链接：${item.url || "无"}`,
    "",
    `说明/摘要：`,
    item.why || item.text || "（无）",
  ].join("\n");

  let text;
  try {
    text = await callRawMessages(llm, FRONTIER_SUMMARY_SYSTEM, user, {
      temperature: 0.35,
      timeoutMs: 50000,
    });
  } catch (err) {
    text = err?.message || "总结失败。";
    return { id, summary: text, cached: false, error: true };
  }

  cache[id] = { text, at: nowIso() };
  // keep cache bounded
  const keys = Object.keys(cache);
  if (keys.length > 80) {
    keys
      .sort((a, b) => String(cache[a].at || "").localeCompare(String(cache[b].at || "")))
      .slice(0, keys.length - 80)
      .forEach((k) => delete cache[k]);
  }
  await chrome.storage.local.set({ [FRONTIER_SUMMARY_KEY]: cache });
  return { id, summary: text, cached: false, at: cache[id].at };
}


function nextNineAmShanghaiMs() {
  const now = new Date();
  const sp = shanghaiParts(now);
  // Build a Date that represents next 09:00 in Shanghai by iterative search
  // Offset: Shanghai is UTC+8
  const utcNow = now.getTime();
  // Current Shanghai as minutes from Shanghai midnight
  const shanghaiMin = sp.hour * 60 + sp.minute;
  const targetMin = 9 * 60;
  let deltaMin = targetMin - shanghaiMin;
  if (deltaMin <= 2) deltaMin += 24 * 60; // already past 9:00 → tomorrow
  return utcNow + deltaMin * 60 * 1000;
}

async function scheduleFrontierAlarm() {
  try {
    await chrome.alarms.clear(FRONTIER_ALARM);
    const when = nextNineAmShanghaiMs();
    await chrome.alarms.create(FRONTIER_ALARM, {
      when,
      periodInMinutes: 24 * 60,
    });
  } catch {
    /* alarms permission missing */
  }
}

chrome.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm?.name !== FRONTIER_ALARM) return;
  locked(async () => {
    try {
      await refreshFrontier({ force: true });
    } catch {
      /* ignore network errors on alarm */
    }
    await scheduleFrontierAlarm();
  });
});



function failHttp(message, code) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

function getInflection(store, id) {
  return (store.inflections || []).find((x) => x.id === id) || null;
}

function createInflection(store, payload) {
  payload = payload || {};
  const title = String(payload.title || "").trim();
  if (!title) failHttp("请写拐点标题", 400);
  const status = normalizeStatus(payload.status);
  if (status === "已跨过") failHttp("新建时不要直接标为已跨过，请先保存再确认状态", 400);
  const it = {
    id: newId(),
    kind: normalizeKind(payload.kind),
    title,
    description: String(payload.description || "").trim(),
    status: status === "已跨过" ? "未发生" : status,
    occurred_on: String(payload.occurred_on || "").trim(),
    after_action: String(payload.after_action || "").trim(),
    verification: String(payload.verification || "").trim(),
    node_id: payload.node_id || null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  if (!store.inflections) store.inflections = [];
  store.inflections.push(it);
  return it;
}

function updateInflection(store, id, payload) {
  const it = getInflection(store, id);
  if (!it) failHttp("未找到这条拐点", 404);
  payload = payload || {};
  if (payload.title != null) {
    const title = String(payload.title || "").trim();
    if (!title) failHttp("请写拐点标题", 400);
    it.title = title;
  }
  if (payload.description != null) it.description = String(payload.description || "").trim();
  if (payload.after_action != null) it.after_action = String(payload.after_action || "").trim();
  if (payload.verification != null) it.verification = String(payload.verification || "").trim();
  if (payload.occurred_on != null) it.occurred_on = String(payload.occurred_on || "").trim();
  if (payload.kind != null) it.kind = normalizeKind(payload.kind);
  if (payload.node_id !== undefined) it.node_id = payload.node_id || null;
  // status is only changed via setInflectionStatus
  it.updated_at = nowIso();
  return it;
}

function deleteInflection(store, id) {
  const it = getInflection(store, id);
  if (!it) failHttp("未找到这条拐点", 404);
  store.inflections = (store.inflections || []).filter((x) => x.id !== id);
  for (const item of store.items || []) {
    if (Array.isArray(item.inflection_ids)) {
      item.inflection_ids = item.inflection_ids.filter((x) => x !== id);
    }
  }
  return { ok: true };
}

function setInflectionStatus(store, id, status, occurredOn) {
  const it = getInflection(store, id);
  if (!it) failHttp("未找到这条拐点", 404);
  const next = normalizeStatus(status);
  if (next === it.status) {
    if (occurredOn != null) it.occurred_on = String(occurredOn || "").trim();
    it.updated_at = nowIso();
    return it;
  }
  if (next === "已跨过") {
    const who = occurredOn != null ? String(occurredOn || "").trim() : it.occurred_on;
    if (who) it.occurred_on = who;
  } else if (occurredOn != null) {
    it.occurred_on = String(occurredOn || "").trim();
  }
  const prev = it.status;
  it.status = next;
  it.updated_at = nowIso();
  addEvent(
    store,
    "inflection",
    `把拐点「${it.title}」从「${prev}」标为「${next}」${it.occurred_on ? "（发生在 " + it.occurred_on + "）" : ""}`,
    null,
    null,
    { inflection_id: it.id, from_status: prev, to_status: next }
  );
  return it;
}

function getKeyNode(store, id) {
  return (store.nodes || []).find((x) => x.id === id) || null;
}

function createKeyNode(store, payload) {
  payload = payload || {};
  const title = String(payload.title || "").trim();
  if (!title) failHttp("请写节点名", 400);
  const node = {
    id: newId(),
    title,
    aliases: unique(payload.aliases || []),
    note: String(payload.note || "").trim(),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  if (!store.nodes) store.nodes = [];
  store.nodes.push(node);
  return node;
}

function updateKeyNode(store, id, payload) {
  const node = getKeyNode(store, id);
  if (!node) failHttp("未找到这个关键节点", 404);
  payload = payload || {};
  if (payload.title != null) {
    const title = String(payload.title || "").trim();
    if (!title) failHttp("请写节点名", 400);
    node.title = title;
  }
  if (payload.aliases != null) node.aliases = unique(payload.aliases || []);
  if (payload.note != null) node.note = String(payload.note || "").trim();
  node.updated_at = nowIso();
  return node;
}

function deleteKeyNode(store, id) {
  const node = getKeyNode(store, id);
  if (!node) failHttp("未找到这个关键节点", 404);
  store.nodes = (store.nodes || []).filter((x) => x.id !== id);
  for (const it of store.inflections || []) {
    if (it.node_id === id) it.node_id = null;
  }
  return { ok: true };
}

async function dispatch(msg) {
  const type = msg?.type;

  if (type === "llmStatus") {
    const llm = await loadLlm();
    return llmStatusPayload(llm);
  }
  if (type === "saveLlm") {
    const llm = normalizeLlm(msg.llm || msg);
    await chrome.storage.local.set({
      llm: {
        provider: llm.provider,
        apiKey: llm.apiKey,
        baseUrl: llm.baseUrl,
        model: llm.model,
      },
    });
    return { ok: true, ...llmStatusPayload(llm) };
  }
  if (type === "reloadAppTabs") {
    const n = await reloadExtensionTabs();
    return { ok: true, reloaded: n };
  }
  if (type === "getFrontier") {
    const res = await getFrontier();
    return { ok: true, ...res };
  }
  if (type === "refreshFrontier") {
    const res = await refreshFrontier({ force: true });
    return { ok: true, ...res };
  }
  if (type === "setFrontierUrl") {
    const url = String(msg.url || "").trim();
    await chrome.storage.local.set({ frontierUrl: url });
    return { ok: true, frontierUrl: url };
  }
  if (type === "getFrontierUrl") {
    const data = await chrome.storage.local.get(["frontierUrl"]);
    return { ok: true, frontierUrl: data.frontierUrl || "" };
  }
  if (type === "summarizeFrontier") {
    const res = await summarizeFrontierItem(msg.item || msg, { force: !!msg.force });
    return { ok: true, ...res };
  }
  if (type === "getFrontierSources") {
    const handles = await loadXHandles();
    const data = await chrome.storage.local.get(["xBearerToken", "frontierXHandles"]);
    const buf = await loadXBuffer();
    return {
      ok: true,
      handles,
      xBearerConfigured: !!String(data.xBearerToken || "").trim(),
      xBufferCount: buf.length,
    };
  }
  if (type === "setFrontierXHandles") {
    const handles = (Array.isArray(msg.handles) ? msg.handles : String(msg.handles || "").split(/[\s,，;；]+/))
      .map((h) => String(h || "").replace(/^@/, "").trim())
      .filter(Boolean);
    await chrome.storage.local.set({ frontierXHandles: handles });
    return { ok: true, handles };
  }
  if (type === "setXBearerToken") {
    const token = String(msg.token || "").trim();
    await chrome.storage.local.set({ xBearerToken: token });
    return { ok: true, configured: !!token };
  }
  if (type === "ingestXFrontier") {
    // content script pushes recent posts from watched handles
    const incoming = Array.isArray(msg.items) ? msg.items : [];
    const buf = await loadXBuffer();
    const map = new Map(buf.map((x) => [x.id, x]));
    for (const raw of incoming) {
      const handle = String(raw.author_handle || "").replace(/^@/, "");
      const sid = String(raw.source_id || raw.id || "").trim();
      if (!handle || !sid) continue;
      const text = String(raw.text || "").trim();
      if (!text) continue;
      if (!isEmbodiedBlob(text) && !(raw.force === true)) continue;
      const id = "x-" + sid;
      map.set(id, {
        id,
        date: String(raw.created_at || raw.date || nowIso()).slice(0, 10),
        who: String(raw.author_name || handle),
        role: "@" + handle,
        title: text.slice(0, 90) + (text.length > 90 ? "…" : ""),
        why: text,
        url: raw.url || `https://x.com/${handle}/status/${sid}`,
        source: "x",
        tags: ["具身智能", "𝕏"],
      });
    }
    const next = [...map.values()].sort((a, b) =>
      String(b.date || "").localeCompare(String(a.date || ""))
    );
    await saveXBuffer(next);
    return { ok: true, count: next.length };
  }

  const store = await ensureInit();
  let result;
  let dirty = false;

  switch (type) {
    case "health": {
      const s = stats(store);
      result = {
        ok: true,
        name: "活树",
        total: s.total,
        today: s.today,
        version: chrome.runtime.getManifest().version,
      };
      break;
    }
    case "tree":
      result = nestedTree(store);
      break;
    case "timeline":
      result = { events: listEvents(store, msg.limit ?? 50) };
      break;
    case "items":
      result = { items: listItems(store, msg.path || null, msg.q || null, msg.limit ?? 50) };
      break;
    case "item": {
      const it = getItem(store, msg.id);
      if (!it) {
        const err = new Error("未找到");
        err.code = 404;
        throw err;
      }
      result = cloneItem(it);
      break;
    }
    case "patchItem":
      result = doPatch(store, msg.id, msg.note, msg.tree_path, {
        judgment: msg.judgment,
        inflection_ids: msg.inflection_ids,
        occurred_on: msg.occurred_on,
      });
      dirty = true;
      break;
    case "deleteItem":
      result = doDelete(store, msg.id);
      dirty = true;
      break;
    case "ingest":
      result = doIngest(store, msg.payload || msg);
      dirty = true;
      break;
    case "addNode": {
      const node = addNodeInStore(store, msg.parent || null, msg.title, nowIso);
      addEvent(store, "refile", `新长了一枝「${node.title}」`);
      result = { node, ...nestedTree(store) };
      dirty = true;
      break;
    }
    case "renameNode": {
      const renamed = renameNodeInStore(store, msg.path, msg.title);
      addEvent(store, "refile", `把「${renamed.oldTitle}」改成「${renamed.node.title}」`);
      result = { oldPath: renamed.oldPath, newPath: renamed.newPath, ...nestedTree(store) };
      dirty = true;
      break;
    }
    case "deleteNode": {
      const deleted = deleteNodeInStore(store, msg.path, nowIso);
      addEvent(store, "refile", `剪掉了「${deleted.title}」，${deleted.moved} 条移到「${deleted.dest}」`);
      result = { dest: deleted.dest, moved: deleted.moved, ...nestedTree(store) };
      dirty = true;
      break;
    }
    case "chat":
      result = await doChat(store, msg.message, msg.path);
      dirty = true;
      break;
    case "compile":
      result = doCompile(store, msg.path, { snapshot: !!msg.snapshot });
      dirty = true;
      break;
    case "implantSkeleton": {
      const res = implantSkeleton(store.tree_nodes, nowIso);
      store.tree_nodes = res.nodes;
      await chrome.storage.local.set({ skeletonInstalled: true, skeletonBannerDismissed: true });
      if (res.added.length) {
        addEvent(store, "refile", `植入了跟进骨架：${res.added.join("、")}`);
      }
      result = { ok: true, added: res.added, ...nestedTree(store) };
      dirty = true;
      break;
    }
    case "skeletonStatus": {
      const missing = missingSkeletonPaths(store.tree_nodes);
      const flags = await chrome.storage.local.get(["skeletonInstalled", "skeletonBannerDismissed"]);
      result = {
        ok: true,
        installed: missing.length === 0,
        missing,
        showBanner: missing.length > 0 && !flags.skeletonBannerDismissed,
      };
      break;
    }
    case "dismissSkeletonBanner":
      await chrome.storage.local.set({ skeletonBannerDismissed: true });
      result = { ok: true };
      break;
    case "judgmentMeta":
      result = {
        ok: true,
        noteTemplate: NOTE_TEMPLATE,
        chatPresets: CHAT_PRESETS,
        judgments: JUDGMENT_CHOICES,
      };
      break;
    case "listInflections":
      result = { ok: true, inflections: (store.inflections || []).slice() };
      break;
    case "createInflection": {
      const it = createInflection(store, msg.payload || msg);
      result = { ok: true, inflection: it };
      dirty = true;
      break;
    }
    case "updateInflection": {
      const it = updateInflection(store, msg.id, msg.payload || msg);
      result = { ok: true, inflection: it };
      dirty = true;
      break;
    }
    case "deleteInflection": {
      deleteInflection(store, msg.id);
      result = { ok: true };
      dirty = true;
      break;
    }
    case "setInflectionStatus": {
      const it = setInflectionStatus(store, msg.id, msg.status, msg.occurred_on);
      result = { ok: true, inflection: it };
      dirty = true;
      break;
    }
    case "listKeyNodes":
      result = { ok: true, nodes: (store.nodes || []).slice() };
      break;
    case "createKeyNode": {
      const node = createKeyNode(store, msg.payload || msg);
      result = { ok: true, node };
      dirty = true;
      break;
    }
    case "updateKeyNode": {
      const node = updateKeyNode(store, msg.id, msg.payload || msg);
      result = { ok: true, node };
      dirty = true;
      break;
    }
    case "deleteKeyNode": {
      deleteKeyNode(store, msg.id);
      result = { ok: true };
      dirty = true;
      break;
    }
    case "chats":
      result = { chats: listChats(store) };
      break;
    default: {
      const err = new Error("未知操作");
      err.code = 400;
      throw err;
    }
  }
  if (dirty) await saveStore(store);
  return result;
}

async function reloadExtensionTabs() {
  const origin = chrome.runtime.getURL("");
  let n = 0;
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id != null && tab.url && tab.url.startsWith(origin)) {
        try {
          await chrome.tabs.reload(tab.id);
          n += 1;
        } catch {
          /* tab may have closed */
        }
      }
    }
  } catch {
    /* tabs permission missing */
  }
  return n;
}

async function rememberVersionAndReload({ force = false } = {}) {
  const version = chrome.runtime.getManifest().version;
  const data = await chrome.storage.local.get("extVersion");
  if (force || data.extVersion !== version) {
    await chrome.storage.local.set({ extVersion: version });
    await reloadExtensionTabs();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  locked(async () => {
    await ensureInit();
    await scheduleFrontierAlarm();
    try { await refreshFrontier({ force: false }); } catch { /* ignore */ }
    await rememberVersionAndReload({ force: true });
  });
});
chrome.runtime.onStartup.addListener(() => {
  locked(async () => {
    await ensureInit();
    await scheduleFrontierAlarm();
    try { await refreshFrontier({ force: false }); } catch { /* ignore */ }
    await rememberVersionAndReload();
  });
});

locked(async () => {
  await scheduleFrontierAlarm();
  await rememberVersionAndReload();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  locked(() => dispatch(msg))
    .then((res) => sendResponse(res))
    .catch((err) =>
      sendResponse({
        ok: false,
        error: err?.message || String(err),
      })
    );
  return true;
});
