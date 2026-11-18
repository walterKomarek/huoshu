import {
  NOTE_TEMPLATE,
  CHAT_PRESETS,
  JUDGMENT_CHOICES,
  INFLECTION_STATUSES,
  LAYER_TAGS,
  insertNoteTemplate,
  eventLogBucket,
  recentFrontierForNode,
} from "../judgment.js";

/* 活树 frontend — vanilla SPA */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const state = {
  tree: { nodes: [], total: 0, today: 0 },
  events: [],
  items: [],
  paths: [],
  selectedPath: null,
  selectedItem: null,
  mode: "frontier",
  q: "",
  chats: [],
  chatOpen: false,
  treeEdit: null,
  llmConfigured: false,
  frontier: null,
  frontierMeta: null,
  selectedFrontier: null,
  frontierSummary: null,
  frontierSummaryLoading: false,
  frontierGrown: new Set(),
  frontierKindFilter: "all",
  frontierLayerFilter: "all",
  inflections: [],
  keyNodes: [],
  skeletonMissing: [],
  showSkeletonBanner: false,
  inflectionKindFilter: "all",
  logFilter: "all",
  justSavedId: null,
  noteTemplate: NOTE_TEMPLATE,
  chatPresets: CHAT_PRESETS,
};

const TZ = "Asia/Shanghai";
const EXT_VERSION =
  (typeof chrome !== "undefined" && chrome.runtime?.getManifest?.()?.version) || "0.4.1";

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  return `${get("month")}月${get("day")}日 ${get("hour")}:${get("minute")}`;
}

function fmtDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ,
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  return `${get("month")}月${get("day")}日 ${get("weekday")}`;
}

function dayKey(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return (iso || "").slice(0, 10);
  }
}

function api(type, data = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...data }, (res) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!res) {
        reject(new Error("活树没有回应"));
        return;
      }
      if (res.ok === false || res.error) {
        reject(new Error(res.error || "请求失败"));
        return;
      }
      resolve(res);
    });
  });
}

function collectPaths(nodes, acc = []) {
  for (const n of nodes || []) {
    acc.push(n.path);
    collectPaths(n.children, acc);
  }
  return acc;
}

async function refreshAll() {
  const [tree, tl, items, chats, llm, skel, inflect, nodes] = await Promise.all([
    api("tree"),
    api("timeline", { limit: 120 }),
    api("items", itemsQuery()),
    api("chats").catch(() => ({ chats: [] })),
    api("llmStatus").catch(() => ({ configured: false })),
    api("skeletonStatus").catch(() => ({ missing: [], showBanner: false, installed: true })),
    api("listInflections").catch(() => ({ inflections: [] })),
    api("listKeyNodes").catch(() => ({ nodes: [] })),
  ]);
  state.tree = tree;
  state.events = tl.events || [];
  state.items = items.items || [];
  state.paths = collectPaths(tree.nodes);
  state.chats = chats.chats || [];
  state.llmConfigured = !!llm.configured;
  state.skeletonMissing = skel.missing || [];
  state.showSkeletonBanner = !!skel.showBanner;
  state.inflections = inflect.inflections || [];
  state.keyNodes = nodes.nodes || [];
  if (state.selectedItem) {
    const fresh = state.items.find((x) => x.id === state.selectedItem.id);
    if (fresh) {
      state.selectedItem = { ...state.selectedItem, ...fresh };
    } else {
      try {
        state.selectedItem = await api("item", { id: state.selectedItem.id });
      } catch {
        state.selectedItem = null;
      }
    }
  }
  if (state.selectedPath && !state.paths.includes(state.selectedPath)) {
    state.selectedPath = null;
  }
  render();
}

function itemsQuery() {
  const q = { limit: 50 };
  if (state.selectedPath) q.path = state.selectedPath;
  if (state.q) q.q = state.q;
  return q;
}

function render() {
  $("#statusLine").textContent = `已生长 ${state.tree.total} 条 · v${EXT_VERSION}`;
  for (const it of state.items || []) {
    if (it.source === "frontier" && it.source_id) state.frontierGrown.add(it.source_id);
  }
  renderBanner();
  renderTree();
  renderLog();
  renderStream();
  renderFrontier();
  renderInflection();
  renderDetail();
  renderChat();
  $("#modeLog").classList.toggle("on", state.mode === "log");
  $("#modeStream").classList.toggle("on", state.mode === "stream");
  $("#modeFrontier").classList.toggle("on", state.mode === "frontier");
  $("#modeInflection")?.classList.toggle("on", state.mode === "inflection");
  $("#logView").classList.toggle("hidden", state.mode !== "log");
  $("#streamView").classList.toggle("hidden", state.mode !== "stream");
  $("#frontierView").classList.toggle("hidden", state.mode !== "frontier");
  $("#inflectionView")?.classList.toggle("hidden", state.mode !== "inflection");
  $("#chatScope").textContent = state.selectedPath || "整棵树";
  $("#btnAll").classList.toggle("on", !state.selectedPath);
  const hint = $("#chatHint");
  if (hint) hint.hidden = !!state.llmConfigured;
  const skelBtn = $("#btnImplantSkeleton");
  const skelRow = $("#skeletonRow");
  const missing = (state.skeletonMissing || []).length > 0;
  if (skelRow) skelRow.hidden = !missing;
  if (skelBtn) skelBtn.hidden = !missing;
}

function renderBanner() {
  const el = $("#skeletonBanner");
  if (!el) return;
  el.hidden = !state.showSkeletonBanner;
}

function renderTree() {
  const slot = $("#rootAddSlot");
  if (slot) {
    slot.innerHTML =
      state.treeEdit?.mode === "root"
        ? `<input class="tree-inline-input" data-role="root" placeholder="新枝名" />`
        : "";
  }
  const nav = $("#treeNav");
  const rootMark = `<div class="tree-root"><svg class="tree-mark breathe" viewBox="0 0 32 32" width="18" height="18" aria-hidden="true">
    <path d="M16 26 V12" stroke="#7cb87c" stroke-width="1.6" stroke-linecap="round" fill="none"/>
    <path d="M16 20 L10 14" stroke="#7cb87c" stroke-width="1.4" stroke-linecap="round" fill="none"/>
    <path d="M16 17 L22 11" stroke="#7cb87c" stroke-width="1.4" stroke-linecap="round" fill="none"/>
    <circle cx="16" cy="11" r="1.6" fill="#c4e0c4"/>
  </svg>活树</div>`;
  nav.innerHTML = rootMark + walk(state.tree.nodes || []);
  nav.querySelectorAll(".node").forEach((btn) => {
    btn.addEventListener("click", () => {
      const path = btn.dataset.path;
      state.selectedPath = state.selectedPath === path ? null : path;
      closeDrawer();
      reloadItems();
    });
  });
  nav.querySelectorAll(".node-op").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const act = btn.dataset.act;
      const path = btn.dataset.path;
      if (act === "add") startTreeEdit({ mode: "child", path });
      else if (act === "rename") startTreeEdit({ mode: "rename", path });
      else if (act === "del") deleteBranch(path, btn.dataset.title || path);
    });
  });
  bindInlineInputs();
}

function walk(nodes) {
  if (!nodes?.length) return "";
  return `<ul>${nodes
    .map((n) => {
      const on = state.selectedPath === n.path ? " on" : "";
      const renaming = state.treeEdit?.mode === "rename" && state.treeEdit.path === n.path;
      const adding = state.treeEdit?.mode === "child" && state.treeEdit.path === n.path;
      const main = renaming
        ? `<input class="tree-inline-input" data-role="rename" data-path="${esc(n.path)}" value="${esc(n.title)}" />
           <span class="count">${n.count || 0}</span>`
        : `<button type="button" class="node${on}" data-path="${esc(n.path)}">
        <span class="title">${esc(n.title)}</span>
        <span class="count">${n.count || 0}</span>
      </button>`;
      return `<li>
      <div class="node-row${on}">
        ${main}
        <span class="node-ops">
          <button type="button" class="node-op" data-act="add" data-path="${esc(n.path)}" title="加一枝">+</button>
          <button type="button" class="node-op" data-act="rename" data-path="${esc(n.path)}" title="改名">改</button>
          <button type="button" class="node-op" data-act="del" data-path="${esc(n.path)}" data-title="${esc(n.title)}" title="剪掉">删</button>
        </span>
      </div>
      ${adding ? `<div class="tree-inline-wrap"><input class="tree-inline-input" data-role="child" data-path="${esc(n.path)}" placeholder="子枝名" /></div>` : ""}
      ${walk(n.children)}
    </li>`;
    })
    .join("")}</ul>`;
}

function startTreeEdit(edit) {
  state.treeEdit = edit;
  renderTree();
}

function cancelTreeEdit() {
  if (!state.treeEdit) return;
  state.treeEdit = null;
  renderTree();
}

function bindInlineInputs() {
  const inputs = [
    ...document.querySelectorAll(".tree-inline-input"),
  ];
  for (const input of inputs) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        commitTreeEdit(input);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        input.dataset.cancelled = "1";
        cancelTreeEdit();
      }
    });
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("blur", () => {
      if (input.dataset.cancelled === "1") return;
      if (input.dataset.role === "rename") {
        if (input.value.trim()) commitTreeEdit(input);
        else cancelTreeEdit();
      }
    });
    setTimeout(() => {
      input.focus();
      if (input.dataset.role === "rename") input.select();
    }, 0);
  }
}

async function commitTreeEdit(input) {
  if (!input || input.dataset.busy === "1") return;
  const title = input.value.trim();
  const role = input.dataset.role;
  const path = input.dataset.path || null;
  if (!title) {
    cancelTreeEdit();
    return;
  }
  input.dataset.busy = "1";
  const edit = state.treeEdit;
  state.treeEdit = null;
  try {
    if (role === "root") {
      await api("addNode", { parent: null, title });
    } else if (role === "child") {
      await api("addNode", { parent: path, title });
    } else if (role === "rename") {
      const res = await api("renameNode", { path, title });
      if (state.selectedPath && res.newPath) {
        if (state.selectedPath === path) state.selectedPath = res.newPath;
        else if (state.selectedPath.startsWith(path + "/")) {
          state.selectedPath = res.newPath + state.selectedPath.slice(path.length);
        }
      }
    }
    await refreshAll();
  } catch (err) {
    state.treeEdit = edit;
    alert(err.message || "树枝没改成");
    renderTree();
  }
}

async function deleteBranch(path, title) {
  if (!path) return;
  if (!confirm(`剪掉「${title}」？这枝上的叶子会移到上一级。`)) return;
  try {
    const res = await api("deleteNode", { path });
    if (state.selectedPath === path || (state.selectedPath && state.selectedPath.startsWith(path + "/"))) {
      state.selectedPath = res.dest || null;
    }
    await refreshAll();
  } catch (err) {
    alert(err.message || "没剪掉");
  }
}

function renderLog() {
  const el = $("#logView");
  const fil = state.logFilter || "all";
  const chip = (id, label) =>
    `<button type="button" class="frontier-chip${fil === id ? " on" : ""}" data-log-filter="${id}">${label}</button>`;
  const filters = `<div class="log-filters" role="tablist" aria-label="日志筛选">${chip("all", "全部")}${chip("ingest", "存入")}${chip("inflection", "拐点")}${chip("judgment", "改口")}</div>`;
  const evAll = state.events || [];
  const ev = evAll.filter((e) => fil === "all" || eventLogBucket(e) === fil);
  if (!evAll.length) {
    el.innerHTML = filters + `<p class="empty">还没有生长痕迹。存入一条，树会记下来。</p>`;
    bindLogFilters(el);
    return;
  }
  if (!ev.length) {
    el.innerHTML = filters + `<p class="empty">这一类暂时没有记录。</p>`;
    bindLogFilters(el);
    return;
  }
  const groups = [];
  let last = "";
  for (const e of ev) {
    const k = dayKey(e.ts);
    if (k !== last) {
      groups.push({ key: k, title: fmtDay(e.ts), items: [] });
      last = k;
    }
    groups[groups.length - 1].items.push(e);
  }
  el.innerHTML = groups
    .map(
      (g) => `<section class="day-block">
      <h3 class="day-title">${esc(g.title)}</h3>
      ${g.items
        .map(
          (e) => `<article class="entry ${esc(e.type || "")}" data-id="${esc(e.item_id || "")}">
          <span class="when">${esc(fmtTime(e.ts))}</span>
          <span class="msg">${esc(e.message || "")}</span>
        </article>`
        )
        .join("")}
    </section>`
    )
    .join("");
  el.innerHTML = filters + el.innerHTML;
  bindLogFilters(el);
  el.querySelectorAll(".entry").forEach((n) => {
    n.addEventListener("click", () => {
      const id = n.dataset.id;
      if (id) openItem(id);
    });
  });
}

function bindLogFilters(el) {
  el.querySelectorAll("[data-log-filter]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      state.logFilter = btn.dataset.logFilter || "all";
      renderLog();
    });
  });
}

function renderStream() {
  const el = $("#streamView");
  const items = state.items || [];
  if (!items.length) {
    el.innerHTML = `<p class="empty">这根枝上还空着。从时间线里摘一片叶子吧。</p>`;
    return;
  }
  el.innerHTML = `<div class="stream">${items.map(cardHtml).join("")}</div>`;
  el.querySelectorAll(".card").forEach((c) => {
    c.addEventListener("click", () => openItem(c.dataset.id));
  });
  el.querySelectorAll(".btn-cancel").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      cancelItem(b.dataset.id);
    });
  });
  el.querySelectorAll("select.move-to").forEach((sel) => {
    sel.addEventListener("click", (e) => e.stopPropagation());
    sel.addEventListener("mousedown", (e) => e.stopPropagation());
    sel.addEventListener("change", async (e) => {
      e.stopPropagation();
      const id = sel.dataset.id;
      const path = sel.value;
      try {
        const updated = await api("patchItem", { id, tree_path: path });
        if (state.selectedItem?.id === id) state.selectedItem = updated;
        await refreshAll();
      } catch (err) {
        alert(err.message || "没移过去");
      }
    });
  });
}

function fmtFrontierDate(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return ymd || "";
  return `${Number(m[2])}月${Number(m[3])}日`;
}

async function loadFrontier({ force = false } = {}) {
  if (state.frontier && !force) return state.frontier;
  try {
    const res = force
      ? await api("refreshFrontier")
      : await api("getFrontier");
    if (res?.feed) {
      state.frontier = res.feed;
      state.frontierMeta = res.meta || null;
      return state.frontier;
    }
  } catch (err) {
    console.warn("frontier via background failed", err);
  }
  // fallback: bundled file
  try {
    const url = "./frontier.json?t=" + Date.now();
    const r = await fetch(url);
    if (!r.ok) throw new Error("前沿清单读不到");
    state.frontier = await r.json();
    state.frontierMeta = { source_kind: "bundled", as_of: state.frontier.as_of };
    return state.frontier;
  } catch (e) {
    if (!state.frontier) state.frontier = { window: "", note: "", items: [] };
    return state.frontier;
  }
}

function frontierSourceLabel(meta, feed) {
  const kind = meta?.source_kind || feed?.source_kind || "";
  if (kind === "multi") return "来源 · 综合（arXiv / HF / 行业事件）";
  if (kind === "arxiv") return "来源 · arXiv 自动";
  if (kind === "remote") return "来源 · 远程清单";
  if (kind === "bundled") return "来源 · 扩展内置";
  return "";
}

function frontierCounts(items) {
  let papers = 0;
  let events = 0;
  for (const it of items || []) {
    if ((it.kind || "paper") === "event") events += 1;
    else papers += 1;
  }
  return { papers, events };
}

function frontierFetchedLabel(meta, feed) {
  const ts = meta?.fetched_at || feed?.fetched_at || "";
  if (!ts) return "";
  const m = String(ts).match(/T(\d{2}:\d{2})/);
  const day = String(ts).slice(0, 10);
  return m ? `更新于 ${day} ${m[1]}` : `更新于 ${day}`;
}

async function refreshFrontierUi() {
  const btn = document.getElementById("btnFrontierRefresh");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "更新中…";
  }
  try {
    const res = await api("refreshFrontier");
    if (res?.feed) {
      state.frontier = res.feed;
      state.frontierMeta = res.meta || null;
    } else {
      await loadFrontier({ force: true });
    }
    await markGrownFromStore();
    renderFrontier();
    const meta = state.frontierMeta || res?.meta || {};
    const tip = document.getElementById("frontierRefreshTip");
    if (tip) {
      if (res?.skipped) {
        tip.textContent = "今日已更新过，未重复请求。";
      } else if (meta.same_content || res?.sameContent) {
        tip.textContent =
          "已重新拉取，但条目与上次相同（arXiv 近几日暂无更新匹配主题的新文，周末更常见）。";
      } else if (typeof meta.added === "number") {
        tip.textContent = `已更新：新增 ${meta.added} 条` + (meta.removed ? `，换下 ${meta.removed} 条` : "") + "。";
      } else {
        tip.textContent = "已更新。";
      }
    }
  } catch (err) {
    alert(err.message || "前沿更新失败");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "更新前沿";
    }
  }
}

function renderFrontier() {
  const el = $("#frontierView");
  if (!el) return;
  const feed = state.frontier;
  if (!feed) {
    el.innerHTML = `<p class="empty">前沿还在发芽…</p>`;
    return;
  }
  const allItems = Array.isArray(feed.items) ? feed.items : [];
  const { papers, events } = frontierCounts(allItems);
  const fil = state.frontierKindFilter || "all";
  const layer = state.frontierLayerFilter || "all";
  const items = allItems.filter((it) => {
    if (fil !== "all" && (it.kind || "paper") !== fil) return false;
    if (layer !== "all") {
      const layers = Array.isArray(it.layers) ? it.layers : [];
      if (!layers.includes(layer)) return false;
    }
    return true;
  });
  const src = frontierSourceLabel(state.frontierMeta, feed);
  const when = frontierFetchedLabel(state.frontierMeta, feed);
  const newest = feed.newest_date || state.frontierMeta?.newest_date || "";
  const newestLabel = newest ? `最新条目日期 ${esc(newest)}` : "";
  const mix =
    allItems.length > 0
      ? `<span class="frontier-count">论文 ${papers} · 事件 ${events}</span>`
      : `<span class="frontier-count">0 条</span>`;
  const chip = (id, label) =>
    `<button type="button" class="frontier-chip${fil === id ? " on" : ""}" data-frontier-filter="${id}">${label}</button>`;
  const head = `<header class="frontier-head">
    <div class="frontier-head-row">
      <div>
        <p class="frontier-window">${esc(feed.window || "")}</p>
        <p class="frontier-note">${esc(feed.note || "")} ${mix}
          ${src ? `<span class="frontier-src">${esc(src)}</span>` : ""}
          ${when ? `<span class="frontier-src">${esc(when)}</span>` : ""}
          ${newestLabel ? `<span class="frontier-src">${newestLabel}</span>` : ""}
        </p>
        <div class="frontier-filters" role="tablist" aria-label="前沿筛选">
          ${chip("all", "全部")}
          ${chip("paper", "论文")}
          ${chip("event", "事件")}
          ${LAYER_TAGS.map((tag) => `<button type="button" class="frontier-chip${layer === tag ? " on" : ""}" data-frontier-layer="${esc(tag)}">${esc(tag)}</button>`).join("")}
        </div>
        <p class="frontier-tip" id="frontierRefreshTip"></p>
      </div>
      <button type="button" class="btn ghost frontier-refresh" id="btnFrontierRefresh">更新前沿</button>
    </div>
  </header>`;
  if (!allItems.length) {
    el.innerHTML = head + `<p class="empty">近三日没有足够硬的进展可收。可点右上角「更新前沿」重试。</p>`;
  } else if (!items.length) {
    el.innerHTML = head + `<p class="empty">这一类暂时没有条目。</p>`;
  } else {
    el.innerHTML = head + `<div class="frontier-list">${items.map(frontierCardHtml).join("")}</div>`;
  }
  const refreshBtn = el.querySelector("#btnFrontierRefresh");
  if (refreshBtn) refreshBtn.addEventListener("click", (e) => {
    e.preventDefault();
    refreshFrontierUi();
  });
  el.querySelectorAll("[data-frontier-filter]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.frontierKindFilter = btn.dataset.frontierFilter || "all";
      renderFrontier();
    });
  });
  el.querySelectorAll("[data-frontier-layer]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const tag = btn.dataset.frontierLayer || "all";
      state.frontierLayerFilter = state.frontierLayerFilter === tag ? "all" : tag;
      renderFrontier();
    });
  });
  el.querySelectorAll("[data-grow]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      growFrontierItem(btn.dataset.grow);
    });
  });
  el.querySelectorAll(".frontier-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("a, button, .frontier-grow")) return;
      const id = card.dataset.id;
      if (id) openFrontierItem(id);
    });
    card.style.cursor = "pointer";
  });
}

function countCjkChars(s) {
  return (String(s || "").match(/[\u4e00-\u9fff]/g) || []).length;
}

/** 卡片一句话：有中文要点则显示，否则中文提示；绝不展示英文 why */
function frontierBlurbLine(it) {
  const b = String(it?.blurb || "").trim();
  if (countCjkChars(b) >= 4) return { text: b, muted: false };
  return { text: "更新前沿可生成中文要点", muted: true };
}

function frontierCardHtml(it) {
  const grown = state.frontierGrown.has(it.id);
  const kind = (it.kind || "paper") === "event" ? "event" : "paper";
  const badge =
    kind === "event"
      ? `<span class="frontier-badge event">事件</span>`
      : `<span class="frontier-badge paper">论文</span>`;
  const layers = (it.layers || []).map((t) => `<span class="layer-tag">${esc(t)}</span>`).join("");
  const tags = (it.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  const href = esc(it.url || "");
  const hangHint = state.selectedPath || "自动匹配你的树";
  const on = state.selectedFrontier?.id === it.id ? " on" : "";
  const growBtn = grown
    ? `<button type="button" class="btn-grow grown" disabled>已生长 ✓</button>`
    : `<button type="button" class="btn-grow" data-grow="${esc(it.id)}">存入活树</button>`;
  const growBlock = grown
    ? growBtn
    : `<span class="frontier-grow">${growBtn}<span class="grow-hint">将挂到：${esc(hangHint)}</span></span>`;
  const blurbLine = frontierBlurbLine(it);
  return `<article class="frontier-card${on}" data-id="${esc(it.id)}" data-kind="${kind}">
    <div class="frontier-meta">
      ${badge}
      <span class="frontier-date">${esc(fmtFrontierDate(it.date))}</span>
      <span class="frontier-who">${esc(it.who || "")}${it.role ? " · " + esc(it.role) : ""}</span>
    </div>
    <h3 class="frontier-title">${esc(it.title || "")}</h3>
    <p class="frontier-blurb${blurbLine.muted ? " muted" : ""}">${esc(blurbLine.text)}</p>
    <div class="frontier-foot">
      ${layers}${tags}
      ${it.url ? `<a class="frontier-orig" href="${href}" target="_blank" rel="noopener">原文</a>` : ""}
      ${growBlock}
    </div>
  </article>`;
}

async function markGrownFromStore() {
  try {
    const res = await api("items", { limit: 200 });
    for (const it of res.items || []) {
      if (it.source === "frontier" && it.source_id) state.frontierGrown.add(it.source_id);
    }
  } catch {
    /* ignore — buttons still work; ingest is idempotent */
  }
}

async function growFrontierItem(id) {
  const item = (state.frontier?.items || []).find((x) => x.id === id);
  if (!item || state.frontierGrown.has(id)) return;
  const btn = [...document.querySelectorAll("[data-grow]")].find((b) => b.dataset.grow === id);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "生长中…";
  }
  try {
    const result = await api("ingest", {
      payload: {
        source: "frontier",
        source_id: item.id,
        url: item.url || "",
        author_name: item.who || "",
        author_handle: "",
        text: `${item.title || ""}\n\n${item.why || ""}`.trim(),
        created_at: (item.date || "") + "T12:00:00+08:00",
        tags: item.tags || [],
        preferred_path: state.selectedPath || "",
      },
    });
    state.frontierGrown.add(item.id);
    if (result?.id) state.justSavedId = result.id;
    await refreshAll();
    if (result?.id) {
      await openItem(result.id);
    } else {
      state.mode = "frontier";
      render();
    }
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "存入活树";
    }
    alert(err.message || "存入失败");
  }
}

function pathOptions(selected) {
  const paths = [...new Set([selected, ...state.paths].filter(Boolean))];
  return paths
    .map(
      (p) =>
        `<option value="${esc(p)}" ${p === selected ? "selected" : ""}>${esc(p)}</option>`
    )
    .join("");
}

function cardHtml(it) {
  const tags = (it.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  const handle = it.author_handle ? `@${it.author_handle.replace(/^@/, "")}` : "";
  const on = state.selectedItem?.id === it.id ? " on" : "";
  return `<article class="card${on}" data-id="${esc(it.id)}">
    <div class="card-meta">
      <span class="name">${esc(it.author_name || "匿名")}</span>
      <span class="handle">${esc(handle)}</span>
      <button type="button" class="btn-cancel" data-id="${esc(it.id)}" aria-label="取消收藏">取消</button>
    </div>
    <p class="card-text">${esc(it.text || "")}</p>
    <div class="card-foot">
      <select class="move-to" data-id="${esc(it.id)}" title="挂到" aria-label="挂到">
        ${pathOptions(it.tree_path)}
      </select>
      ${tags}
      <span class="when-gold">${esc(fmtTime(it.saved_at))}</span>
    </div>
  </article>`;
}

function renderDetail() {
  const empty = $("#detailEmpty");
  const body = $("#detailBody");
  const pane = $("#detailPane");
  const frontier = state.selectedFrontier;
  const it = state.selectedItem;

  if (frontier) {
    empty.classList.add("hidden");
    body.classList.remove("hidden");
    setDetailOpen(true);
    const layers = (frontier.layers || []).map((t) => `<span class="layer-tag">${esc(t)}</span>`).join("");
    const tags = layers + (frontier.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
    const link = frontier.url
      ? `<a class="detail-orig" href="${esc(frontier.url)}" target="_blank" rel="noopener">原文</a>`
      : "";
    const grown = state.frontierGrown.has(frontier.id);
    let summaryBlock;
    if (state.frontierSummaryLoading) {
      summaryBlock = `<div class="ai-summary loading"><p class="ai-summary-label">AI 提炼</p><p class="ai-summary-body">正在用你的模型提炼这条前沿…</p></div>`;
    } else if (state.frontierSummary) {
      const missingTouch = !String(state.frontierSummary || "").includes("是否触及拐点");
      summaryBlock = `<div class="ai-summary"><p class="ai-summary-label">AI 提炼</p><div class="ai-summary-body">${esc(state.frontierSummary)}</div>
        ${missingTouch ? `<p class="ai-summary-body muted">可点「重新总结」，补一句是否触及拐点、还是只是演示。</p>` : ""}
        <button type="button" class="btn ghost small" id="btnResummarize">重新总结</button></div>`;
    } else {
      summaryBlock = `<div class="ai-summary"><p class="ai-summary-label">AI 提炼</p><p class="ai-summary-body muted">点下方可生成点评。</p>
        <button type="button" class="btn solid small" id="btnResummarize">生成总结</button></div>`;
    }
    const blurbLine = frontierBlurbLine(frontier);
    const whyAbs = String(frontier.why || "").trim();
    const whyBlock = whyAbs
      ? `<p class="detail-kicker">原文摘要</p><p class="detail-text muted">${esc(whyAbs)}</p>`
      : "";
    body.innerHTML = `
      <p class="detail-kicker">前沿条目</p>
      <h3 class="detail-who">${esc(frontier.title || "无标题")}</h3>
      <div class="detail-handle">${esc(frontier.who || "")}${frontier.role ? " · " + esc(frontier.role) : ""} · ${esc(fmtFrontierDate(frontier.date))}</div>
      ${link}
      <p class="detail-text${blurbLine.muted ? " muted" : ""}">${esc(blurbLine.text)}</p>
      ${whyBlock}
      <div class="tags">${tags}</div>
      ${summaryBlock}
      <button type="button" class="btn solid block" id="detailGrow" ${grown ? "disabled" : ""}>${grown ? "已生长 ✓" : "存入活树"}</button>
    `;
    const grow = $("#detailGrow");
    if (grow && !grown) grow.addEventListener("click", () => growFrontierItem(frontier.id));
    const re = $("#btnResummarize");
    if (re) re.addEventListener("click", () => requestFrontierSummary(frontier, { force: true }));
    return;
  }

  if (!it) {
    empty.classList.remove("hidden");
    body.classList.add("hidden");
    setDetailOpen(false);
    return;
  }
  empty.classList.add("hidden");
  body.classList.remove("hidden");
  setDetailOpen(true);
  const handle = it.author_handle ? `@${it.author_handle.replace(/^@/, "")}` : "";
  const paths = [...new Set([it.tree_path, ...state.paths].filter(Boolean))];
  const opts = paths
    .map(
      (p) =>
        `<option value="${esc(p)}" ${p === it.tree_path ? "selected" : ""}>${esc(p)}</option>`
    )
    .join("");
  const link = it.url
    ? `<a class="detail-orig" href="${esc(it.url)}" target="_blank" rel="noopener">原文</a>`
    : "";
  const tags = (it.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  const hook = judgmentHookHtml(it);
  body.innerHTML = `
    <h3 class="detail-who">${esc(it.author_name || "匿名")}</h3>
    <div class="detail-handle">${esc(handle)} · ${esc(fmtTime(it.saved_at))}</div>
    ${link}
    <p class="detail-text">${esc(it.text || "")}</p>
    <div class="tags">${tags}</div>
    <label>挂在这根枝
      <select id="pathSelect">${opts}</select>
    </label>
    ${hook}
    <label>
      <span class="note-head">旁注 <button type="button" class="btn ghost small" id="btnInsertNote">插入模板</button></span>
      <textarea id="noteArea" placeholder="${esc(NOTE_TEMPLATE)}">${esc(it.note || "")}</textarea>
    </label>
    <div class="saved-hint" id="noteHint"></div>
    <button type="button" class="btn-cancel block" id="detailCancel">取消收藏</button>
  `;
  $("#pathSelect").addEventListener("change", async (e) => {
    const path = e.target.value;
    const updated = await api("patchItem", { id: it.id, tree_path: path });
    state.selectedItem = updated;
    await refreshAll();
    state.selectedItem = updated;
    renderDetail();
  });
  let t = null;
  $("#noteArea").addEventListener("input", (e) => {
    $("#noteHint").textContent = "记下…";
    clearTimeout(t);
    t = setTimeout(async () => {
      const updated = await api("patchItem", { id: it.id, note: e.target.value });
      state.selectedItem = updated;
      const card = state.items.find((x) => x.id === it.id);
      if (card) card.note = updated.note;
      $("#noteHint").textContent = "已写入 " + fmtTime(new Date().toISOString());
    }, 600);
  });
  $("#detailCancel").addEventListener("click", () => cancelItem(it.id));
  bindJudgmentHook(it);
  $("#btnInsertNote")?.addEventListener("click", async () => {
    const area = $("#noteArea");
    if (!area) return;
    area.value = insertNoteTemplate(area.value);
    $("#noteHint").textContent = "记下…";
    const updated = await api("patchItem", { id: it.id, note: area.value });
    state.selectedItem = updated;
    const card = state.items.find((x) => x.id === it.id);
    if (card) card.note = updated.note;
    $("#noteHint").textContent = "已写入 " + fmtTime(new Date().toISOString());
  });
}


function judgmentHookHtml(it) {
  const fresh = state.justSavedId && state.justSavedId === it.id;
  const selected = new Set(it.inflection_ids || []);
  const sectors = (state.inflections || []).filter((x) => x.kind !== "project");
  const projects = (state.inflections || []).filter((x) => x.kind === "project");
  const chip = (inf, on) =>
    `<button type="button" class="frontier-chip${on ? " on" : ""}" data-hook-inf="${esc(inf.id)}">${esc(inf.title.length > 22 ? inf.title.slice(0, 22) + "…" : inf.title)}</button>`;
  const jchip = (label) =>
    `<button type="button" class="frontier-chip${it.judgment === label ? " on" : ""}" data-hook-judge="${label}">${label}</button>`;
  const skipOn = !selected.size && !it.judgment;
  const nodeOpts = [`<option value="">选择关键节点…</option>`]
    .concat((state.keyNodes || []).map((n) => `<option value="${esc(n.title)}" ${it.occurred_on === n.title ? "selected" : ""}>${esc(n.title)}</option>`))
    .join("");
  const confirm = (it.judgment === "改口" || it.judgment === "升级") && selected.size
    ? `<div class="hook-confirm">状态不会自动改。同时把已挂钩拐点标为：
        <button type="button" class="btn ghost small" data-hook-mark="观察中">观察中</button>
        <button type="button" class="btn ghost small" data-hook-mark="已跨过">已跨过</button>
      </div>`
    : "";
  return `<div class="judgment-hook${fresh ? " fresh" : ""}" id="judgmentHook">
    <p class="judgment-hook-kicker">${fresh ? "可跳过：这条服务哪条预测量？" : "判断钩子（可跳过）"}</p>
    <div class="hook-row">
      <button type="button" class="frontier-chip${skipOn ? " on" : ""}" data-hook-skip="1">暂不挂钩</button>
      ${sectors.map((s) => chip(s, selected.has(s.id))).join("")}
    </div>
    ${projects.length ? `<label class="hook-label">项目拐点
      <select id="hookProjectSelect" multiple size="4">
        ${projects.map((s) => `<option value="${esc(s.id)}" ${selected.has(s.id) ? "selected" : ""}>${esc(s.title)}</option>`).join("")}
      </select>
    </label>` : ""}
    <label class="hook-label">发生在谁身上
      <input type="text" id="hookOccurred" list="hookNodeList" placeholder="人名、公司或场景" value="${esc(it.occurred_on || "")}" />
      <datalist id="hookNodeList">${(state.keyNodes || []).map((n) => `<option value="${esc(n.title)}"></option>`).join("")}</datalist>
    </label>
    <div class="hook-row">
      ${JUDGMENT_CHOICES.map(jchip).join("")}
    </div>
    ${confirm}
  </div>`;
}

async function patchJudgment(it, fields) {
  const payload = { id: it.id, ...fields };
  const updated = await api("patchItem", payload);
  state.selectedItem = updated;
  const card = (state.items || []).find((x) => x.id === it.id);
  if (card) Object.assign(card, updated);
  return updated;
}

function bindJudgmentHook(it) {
  const root = $("#judgmentHook");
  if (!root) return;
  const currentIds = () => [...(state.selectedItem?.inflection_ids || it.inflection_ids || [])];
  root.querySelectorAll("[data-hook-inf]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.hookInf;
      let ids = currentIds();
      if (ids.includes(id)) ids = ids.filter((x) => x !== id);
      else ids = [...ids, id];
      const updated = await patchJudgment(it, { inflection_ids: ids });
      it = updated;
      renderDetail();
    });
  });
  $("#hookProjectSelect")?.addEventListener("change", async (e) => {
    const picked = [...e.target.selectedOptions].map((o) => o.value);
    const sectors = currentIds().filter((id) =>
      (state.inflections || []).some((x) => x.id === id && x.kind !== "project")
    );
    const updated = await patchJudgment(it, { inflection_ids: [...new Set([...sectors, ...picked])] });
    it = updated;
    renderDetail();
  });
  root.querySelector("[data-hook-skip]")?.addEventListener("click", async () => {
    const updated = await patchJudgment(it, { inflection_ids: [], judgment: "" });
    it = updated;
    renderDetail();
  });
  root.querySelectorAll("[data-hook-judge]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const j = btn.dataset.hookJudge;
      const next = it.judgment === j ? "" : j;
      const updated = await patchJudgment(it, { judgment: next });
      it = updated;
      if (state.mode === "log") {
        const tl = await api("timeline", { limit: 120 });
        state.events = tl.events || [];
      }
      renderDetail();
    });
  });
  let ot = null;
  $("#hookOccurred")?.addEventListener("input", (e) => {
    clearTimeout(ot);
    ot = setTimeout(async () => {
      const updated = await patchJudgment(it, { occurred_on: e.target.value });
      it = updated;
    }, 500);
  });
  root.querySelectorAll("[data-hook-mark]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const status = btn.dataset.hookMark;
      const ids = currentIds();
      if (!ids.length) return;
      if (status === "已跨过") {
        const who = ($("#hookOccurred")?.value || it.occurred_on || "").trim();
        if (!who) {
          const ok = confirm("还没填写「发生在谁身上」。仍要标为已跨过？");
          if (!ok) return;
        }
      }
      for (const id of ids) {
        await api("setInflectionStatus", {
          id,
          status,
          occurred_on: ($("#hookOccurred")?.value || it.occurred_on || "").trim(),
        });
      }
      const res = await api("listInflections");
      state.inflections = res.inflections || [];
      const tl = await api("timeline", { limit: 120 });
      state.events = tl.events || [];
      renderDetail();
    });
  });
}

function renderInflection() {
  const el = $("#inflectionView");
  if (!el) return;
  const fil = state.inflectionKindFilter || "all";
  const chip = (id, label) =>
    `<button type="button" class="frontier-chip${fil === id ? " on" : ""}" data-inflect-filter="${id}">${label}</button>`;
  const head = `<div class="inflect-wrap">
    <div class="inflect-head-row">
      <p class="inflect-lead">拐点由你确认状态。论文或事件不会自动标成「已跨过」。验证信号用来事后核对，不是拐点本身。</p>
      <button type="button" class="btn ghost small" id="btnSnapshotInline">导出判断快照</button>
    </div>
    <div class="inflect-filters" role="tablist" aria-label="拐点筛选">
      ${chip("all", "全部")}
      ${chip("sector", "赛道")}
      ${chip("project", "项目")}
      ${chip("nodes", "关键节点")}
    </div>
    <div id="inflectBody"></div>
  </div>`;
  el.innerHTML = head;
  el.querySelectorAll("[data-inflect-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.inflectionKindFilter = btn.dataset.inflectFilter || "all";
      renderInflection();
    });
  });
  $("#btnSnapshotInline")?.addEventListener("click", () => exportJudgmentSnapshot());
  const body = el.querySelector("#inflectBody");
  if (fil === "nodes") {
    body.innerHTML = renderKeyNodesHtml();
    bindKeyNodeView(body);
  } else {
    const list = (state.inflections || []).filter((it) => {
      if (fil === "all") return true;
      if (fil === "sector") return it.kind !== "project";
      if (fil === "project") return it.kind === "project";
      return true;
    });
    body.innerHTML =
      (list.length ? list.map(inflectionCardHtml).join("") : `<p class="empty">还没有这一类拐点。</p>`) +
      inflectionComposerHtml();
    bindInflectionCards(body);
  }
}

function nodeTitleOf(id) {
  return (state.keyNodes || []).find((n) => n.id === id)?.title || "";
}

function inflectionCardHtml(it) {
  const st = it.status || "未发生";
  const kind = it.kind === "project" ? "项目" : "赛道";
  const node = it.node_id ? nodeTitleOf(it.node_id) : "";
  const statusChips = INFLECTION_STATUSES.map(
    (s) =>
      `<button type="button" class="frontier-chip${st === s ? " on" : ""}" data-inf-status="${s}" data-id="${esc(it.id)}">${s}</button>`
  ).join("");
  const nodeOpts = [`<option value="">（不挂节点）</option>`]
    .concat(
      (state.keyNodes || []).map(
        (n) => `<option value="${esc(n.id)}" ${it.node_id === n.id ? "selected" : ""}>${esc(n.title)}</option>`
      )
    )
    .join("");
  return `<article class="inflect-card" data-id="${esc(it.id)}">
    <p class="inflect-card-title">${esc(it.title)}</p>
    <p class="desc">${esc(kind)}${node ? " · " + esc(node) : ""}${it.description ? " · " + esc(it.description) : ""}</p>
    <div class="inflect-status">${statusChips}</div>
    <div class="inflect-fields">
      <label>发生在谁身上
        <input type="text" data-field="occurred_on" data-id="${esc(it.id)}" value="${esc(it.occurred_on || "")}" placeholder="确认已跨过时尽量填写" />
      </label>
      <label>发生后如何调判断
        <textarea data-field="after_action" data-id="${esc(it.id)}" rows="2">${esc(it.after_action || "")}</textarea>
      </label>
      <label>验证信号（验证，不是拐点本身）
        <textarea data-field="verification" data-id="${esc(it.id)}" rows="2">${esc(it.verification || "")}</textarea>
      </label>
      <label>挂到关键节点
        <select data-field="node_id" data-id="${esc(it.id)}">${nodeOpts}</select>
      </label>
    </div>
    <div class="inflect-card-foot">
      <button type="button" class="btn ghost small" data-del-inf="${esc(it.id)}">删除</button>
    </div>
  </article>`;
}

function inflectionComposerHtml() {
  const nodeOpts = [`<option value="">（可不挂）</option>`]
    .concat((state.keyNodes || []).map((n) => `<option value="${esc(n.id)}">${esc(n.title)}</option>`))
    .join("");
  return `<div class="composer" id="inflectComposer">
    <p class="judgment-hook-kicker">加一条拐点</p>
    <div class="inflect-fields">
      <label>标题 <input type="text" id="newInfTitle" placeholder="会移动判断的那件事" /></label>
      <label>说明 <input type="text" id="newInfDesc" placeholder="简短说明（可选）" /></label>
      <label>类型
        <select id="newInfKind">
          <option value="sector">赛道</option>
          <option value="project">项目</option>
        </select>
      </label>
      <label>关键节点 <select id="newInfNode">${nodeOpts}</select></label>
      <label>发生后如何调判断 <input type="text" id="newInfAfter" /></label>
      <label>验证信号 <input type="text" id="newInfVer" /></label>
    </div>
    <div class="inflect-card-foot">
      <button type="button" class="btn solid small" id="btnAddInflection">添加</button>
    </div>
  </div>`;
}

function bindInflectionCards(root) {
  root.querySelectorAll("[data-inf-status]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const status = btn.dataset.infStatus;
      const card = root.querySelector(`.inflect-card[data-id="${CSS.escape(id)}"]`);
      const who = card?.querySelector('[data-field="occurred_on"]')?.value || "";
      if (status === "已跨过" && !String(who).trim()) {
        const ok = confirm("还没填写「发生在谁身上」。仍要标为已跨过？");
        if (!ok) return;
      }
      try {
        await api("setInflectionStatus", { id, status, occurred_on: who });
        const [inf, tl] = await Promise.all([
          api("listInflections"),
          api("timeline", { limit: 120 }),
        ]);
        state.inflections = inf.inflections || [];
        state.events = tl.events || [];
        renderInflection();
      } catch (err) {
        alert(err.message || "没改成");
      }
    });
  });
  const timers = new Map();
  root.querySelectorAll("[data-field]").forEach((input) => {
    const evName = input.tagName === "SELECT" ? "change" : "input";
    input.addEventListener(evName, () => {
      const id = input.dataset.id;
      const field = input.dataset.field;
      clearTimeout(timers.get(id + field));
      const t = setTimeout(async () => {
        try {
          await api("updateInflection", { id, payload: { [field]: input.value } });
          const it = (state.inflections || []).find((x) => x.id === id);
          if (it) it[field] = input.value;
        } catch (err) {
          alert(err.message || "没写下");
        }
      }, evName === "change" ? 0 : 500);
      timers.set(id + field, t);
    });
  });
  root.querySelectorAll("[data-del-inf]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("删除这条拐点？挂钩会解开，已有日志仍保留。")) return;
      await api("deleteInflection", { id: btn.dataset.delInf });
      state.inflections = (state.inflections || []).filter((x) => x.id !== btn.dataset.delInf);
      renderInflection();
    });
  });
  $("#btnAddInflection")?.addEventListener("click", async () => {
    const title = $("#newInfTitle")?.value.trim();
    if (!title) {
      alert("请写拐点标题");
      return;
    }
    try {
      await api("createInflection", {
        payload: {
          title,
          description: $("#newInfDesc")?.value.trim() || "",
          kind: $("#newInfKind")?.value || "sector",
          node_id: $("#newInfNode")?.value || null,
          after_action: $("#newInfAfter")?.value.trim() || "",
          verification: $("#newInfVer")?.value.trim() || "",
          status: "未发生",
        },
      });
      const res = await api("listInflections");
      state.inflections = res.inflections || [];
      renderInflection();
    } catch (err) {
      alert(err.message || "没加上");
    }
  });
}

function renderKeyNodesHtml() {
  const nodes = state.keyNodes || [];
  const cards = nodes
    .map((n) => {
      const linked = (state.inflections || []).filter((i) => i.node_id === n.id);
      const events = recentFrontierForNode(n, state.frontier?.items || [], 5);
      const evHtml = events.length
        ? `<ul class="node-events">${events
            .map((e) => {
              const href = e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title || "")}</a>` : esc(e.title || "");
              return `<li>${href}</li>`;
            })
            .join("")}</ul>`
        : `<p class="desc">前沿里暂时没有对得上的事件。</p>`;
      const infHtml = linked.length
        ? linked
            .map(
              (i) =>
                `<article class="inflect-card" data-id="${esc(i.id)}"><p class="inflect-card-title">${esc(i.title)}</p><p class="desc">状态：${esc(i.status || "未发生")}${i.occurred_on ? " · 发生在 " + esc(i.occurred_on) : ""}</p></article>`
            )
            .join("")
        : `<p class="desc">还没有挂到此节点的项目拐点。</p>`;
      const aliases = (n.aliases || []).join("、");
      return `<section class="node-card" data-node="${esc(n.id)}">
        <h3>${esc(n.title)}</h3>
        ${aliases ? `<p class="aliases">${esc(aliases)}</p>` : ""}
        <label class="hook-label">节点笔记
          <textarea data-node-note="${esc(n.id)}" rows="3" placeholder="对这家的判断，可以写在这里">${esc(n.note || "")}</textarea>
        </label>
        <p class="judgment-hook-kicker">项目拐点</p>
        ${infHtml}
        <p class="judgment-hook-kicker">近期匹配的前沿</p>
        ${evHtml}
        <div class="inflect-card-foot">
          <button type="button" class="btn ghost small" data-del-node="${esc(n.id)}">删除节点</button>
        </div>
      </section>`;
    })
    .join("");
  const composer = `<div class="composer">
    <p class="judgment-hook-kicker">加一个关键节点</p>
    <div class="inflect-fields">
      <label>名称 <input type="text" id="newNodeTitle" placeholder="公司或实验室" /></label>
      <label>别名 <input type="text" id="newNodeAliases" placeholder="用顿号或逗号分开" /></label>
    </div>
    <div class="inflect-card-foot">
      <button type="button" class="btn solid small" id="btnAddNode">添加</button>
    </div>
  </div>`;
  return (cards || `<p class="empty">还没有关键节点。</p>`) + composer;
}

function bindKeyNodeView(root) {
  const timers = new Map();
  root.querySelectorAll("[data-node-note]").forEach((area) => {
    area.addEventListener("input", () => {
      const id = area.dataset.nodeNote;
      clearTimeout(timers.get(id));
      timers.set(
        id,
        setTimeout(async () => {
          await api("updateKeyNode", { id, payload: { note: area.value } });
          const n = (state.keyNodes || []).find((x) => x.id === id);
          if (n) n.note = area.value;
        }, 500)
      );
    });
  });
  root.querySelectorAll("[data-del-node]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("删除这个关键节点？上面的项目拐点会保留，只是不再挂在此节点。")) return;
      await api("deleteKeyNode", { id: btn.dataset.delNode });
      const res = await api("listKeyNodes");
      state.keyNodes = res.nodes || [];
      const inf = await api("listInflections");
      state.inflections = inf.inflections || [];
      renderInflection();
    });
  });
  $("#btnAddNode")?.addEventListener("click", async () => {
    const title = $("#newNodeTitle")?.value.trim();
    if (!title) {
      alert("请写节点名");
      return;
    }
    const aliases = String($("#newNodeAliases")?.value || "")
      .split(/[,，、;；]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await api("createKeyNode", { payload: { title, aliases } });
      const res = await api("listKeyNodes");
      state.keyNodes = res.nodes || [];
      renderInflection();
    } catch (err) {
      alert(err.message || "没加上");
    }
  });
}

async function exportJudgmentSnapshot() {
  const res = await api("compile", { path: "", snapshot: true });
  $("#compileOut").textContent = res.markdown || "";
  $("#compileModal").showModal();
  const tl = await api("timeline", { limit: 120 });
  state.events = tl.events || [];
  if (state.mode === "log") renderLog();
}

async function implantSkeleton() {
  try {
    const res = await api("implantSkeleton");
    state.tree = res;
    state.paths = collectPaths(res.nodes || []);
    const skel = await api("skeletonStatus");
    state.skeletonMissing = skel.missing || [];
    state.showSkeletonBanner = !!skel.showBanner;
    const n = (res.added || []).length;
    alert(n ? `已补上 ${n} 根枝，已有的枝都还在。` : "这些枝都已经有了，没有改你的树。");
    await refreshAll();
  } catch (err) {
    alert(err.message || "没植入成");
  }
}

async function openFrontierItem(id) {
  const item = (state.frontier?.items || []).find((x) => x.id === id);
  if (!item) return;
  state.selectedItem = null;
  state.selectedFrontier = item;
  state.frontierSummary = null;
  state.frontierSummaryLoading = false;
  render();
  renderDetail();
  requestFrontierSummary(item, { force: false });
}

async function requestFrontierSummary(item, { force = false } = {}) {
  if (!item?.id) return;
  // force: bypass client-side only; server still caches unless we add bust later
  state.frontierSummaryLoading = true;
  state.frontierSummary = null;
  renderDetail();
  try {
    const res = await api("summarizeFrontier", { item, force: !!force });
    if (state.selectedFrontier?.id !== item.id) return;
    state.frontierSummary = res.summary || "没有生成内容。";
  } catch (err) {
    if (state.selectedFrontier?.id !== item.id) return;
    state.frontierSummary = err.message || "总结失败。";
  } finally {
    if (state.selectedFrontier?.id === item.id) {
      state.frontierSummaryLoading = false;
      renderDetail();
    }
  }
}

async function cancelItem(id) {
  if (!id) return;
  if (!confirm("从树上拿掉这条？")) return;
  await api("deleteItem", { id });
  if (state.selectedItem?.id === id) state.selectedItem = null;
  await refreshAll();
}

function renderChatPresets() {
  const box = $("#chatPresets");
  if (!box) return;
  const presets = state.chatPresets || CHAT_PRESETS;
  box.innerHTML = presets
    .map((p) => `<button type="button" class="chat-preset" data-preset="${esc(p)}">${esc(p)}</button>`)
    .join("");
  box.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = $("#chatInput");
      if (!input) return;
      input.value = btn.dataset.preset || "";
      input.focus();
    });
  });
}

function renderChat() {
  renderChatPresets();
  const log = $("#chatLog");
  if (!state.chats.length) {
    log.innerHTML = `<p class="empty" style="padding:12px">问问这棵树记得什么。</p>`;
    return;
  }
  log.innerHTML = state.chats
    .map((c) => {
      const cites = (c.citations || [])
        .map((x) => {
          const label = x.author_handle ? "@" + x.author_handle.replace(/^@/, "") : "叶子";
          return `<button type="button" class="cite" data-id="${esc(x.id)}">${esc(label)}</button>`;
        })
        .join("");
      return `<div class="bubble ${esc(c.role)}">${esc(c.content || "")}${
        cites ? `<div class="cite-row">${cites}</div>` : ""
      }</div>`;
    })
    .join("");
  log.querySelectorAll(".cite").forEach((b) => {
    b.addEventListener("click", () => openItem(b.dataset.id));
  });
  log.scrollTop = log.scrollHeight;
}

async function openItem(id) {
  if (!id) return;
  state.selectedFrontier = null;
  state.frontierSummary = null;
  state.frontierSummaryLoading = false;
  const it = await api("item", { id });
  state.selectedItem = it;
  if (window.innerWidth > 900) state.mode = "stream";
  render();
}

async function reloadItems() {
  const items = await api("items", itemsQuery());
  state.items = items.items || [];
  const tree = await api("tree");
  state.tree = tree;
  render();
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setTreeOpen(on) {
  $("#treePane").classList.toggle("open", !!on);
  $("#app").classList.toggle("tree-open", !!on);
}
function setDetailOpen(on) {
  $("#detailPane").classList.toggle("open", !!on);
  $("#app").classList.toggle("detail-open", !!on);
}
function closeDrawer() {
  setTreeOpen(false);
  $("#drawerMask").hidden = true;
}

function closeModals() {
  $("#ingestModal").open && $("#ingestModal").close();
  $("#compileModal").open && $("#compileModal").close();
  state.chatOpen = false;
  $("#chatPanel").hidden = true;
  $("#chatFab").hidden = false;
  if (window.innerWidth <= 900) {
    $("#detailPane").classList.remove("open");
    state.selectedItem = state.selectedItem; // keep
  }
}

/* events */
$("#modeLog").addEventListener("click", () => {
  state.mode = "log";
  render();
});
$("#modeStream").addEventListener("click", () => {
  state.mode = "stream";
  render();
});
$("#modeFrontier").addEventListener("click", () => {
  state.mode = "frontier";
  render();
});
$("#modeInflection")?.addEventListener("click", () => {
  state.mode = "inflection";
  render();
});
$("#btnSnapshot")?.addEventListener("click", () => exportJudgmentSnapshot());
$("#btnImplantSkeleton")?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  implantSkeleton();
});
$("#bannerImplant")?.addEventListener("click", () => implantSkeleton());
$("#bannerDismiss")?.addEventListener("click", async () => {
  await api("dismissSkeletonBanner").catch(() => {});
  state.showSkeletonBanner = false;
  renderBanner();
});
$("#btnAll").addEventListener("click", () => {
  state.selectedPath = null;
  closeDrawer();
  reloadItems();
});
$("#btnAddRoot")?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  startTreeEdit({ mode: "root" });
});
$("#logoHome").addEventListener("click", (e) => {
  e.preventDefault();
  state.selectedPath = null;
  state.selectedItem = null;
  state.mode = "frontier";
  reloadItems();
});
$("#treeToggle").addEventListener("click", () => {
  setTreeOpen(!$("#app").classList.contains("tree-open"));
});
$("#treeClose")?.addEventListener("click", () => setTreeOpen(false));
$("#detailClose")?.addEventListener("click", () => setDetailOpen(false));
$("#drawerMask").addEventListener("click", () => {
  setTreeOpen(false);
  setDetailOpen(false);
  $("#drawerMask").hidden = true;
});

$("#btnIngest").addEventListener("click", () => $("#ingestModal").showModal());
$("#ingestCancel").addEventListener("click", () => $("#ingestModal").close());
$("#ingestForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = $("#ingestUrl").value.trim();
  const author = $("#ingestAuthor").value.trim();
  const text = $("#ingestText").value.trim();
  if (!url && !text) return;
  let author_name = author;
  let author_handle = "";
  if (author.startsWith("@")) {
    author_handle = author.slice(1);
    author_name = author.slice(1);
  } else if (author.includes(" ")) {
    author_name = author;
  } else if (author) {
    author_handle = author.replace(/^@/, "");
    author_name = author_handle;
  }
  try {
    const item = await api("ingest", {
      payload: {
        source: url ? "x" : "paste",
        url,
        author_name,
        author_handle,
        text,
        preferred_path: state.selectedPath || "",
      },
    });
    $("#ingestModal").close();
    $("#ingestForm").reset();
    state.selectedItem = item;
    if (item?.id) state.justSavedId = item.id;
    state.mode = "stream";
    await refreshAll();
    state.selectedItem = item;
    render();
  } catch (err) {
    alert(err.message || "存入失败");
  }
});

$("#btnCompile").addEventListener("click", async () => {
  const path = state.selectedPath || "";
  const res = await api("compile", { path });
  $("#compileOut").textContent = res.markdown || "";
  $("#compileModal").showModal();
  const tl = await api("timeline", { limit: 80 });
  state.events = tl.events || [];
  if (state.mode === "log") renderLog();
});
$("#compileClose").addEventListener("click", () => $("#compileModal").close());
$("#compileCopy").addEventListener("click", async () => {
  const t = $("#compileOut").textContent;
  try {
    await navigator.clipboard.writeText(t);
    $("#compileCopy").textContent = "已复制";
    setTimeout(() => ($("#compileCopy").textContent = "复制"), 1200);
  } catch {
    $("#compileCopy").textContent = "复制失败";
  }
});

$("#chatFab").addEventListener("click", async () => {
  state.chatOpen = true;
  $("#chatPanel").hidden = false;
  $("#chatFab").hidden = true;
  try {
    const llm = await api("llmStatus");
    state.llmConfigured = !!llm.configured;
    const hint = $("#chatHint");
    if (hint) hint.hidden = !!state.llmConfigured;
  } catch {}
  $("#chatInput").focus();
});
$("#chatClose").addEventListener("click", () => {
  state.chatOpen = false;
  $("#chatPanel").hidden = true;
  $("#chatFab").hidden = false;
});
$("#chatInput")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("#chatForm").requestSubmit();
  }
});
document.addEventListener("mousedown", (e) => {
  if (!state.chatOpen) return;
  const panel = $("#chatPanel");
  const fab = $("#chatFab");
  if (panel.contains(e.target) || fab.contains(e.target)) return;
  state.chatOpen = false;
  panel.hidden = true;
  fab.hidden = false;
});
$("#chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = $("#chatInput").value.trim();
  if (!message) return;
  $("#chatInput").value = "";
  state.chats.push({ role: "user", content: message, citations: [] });
  renderChat();
  try {
    const rec = await api("chat", { message, path: state.selectedPath || null });
    state.chats.push(rec);
    const tl = await api("timeline", { limit: 80 });
    state.events = tl.events || [];
    renderChat();
    if (state.mode === "log") renderLog();
  } catch (err) {
    state.chats.push({ role: "assistant", content: err.message || "没问成", citations: [] });
    renderChat();
  }
});

let searchT = null;
$("#searchInput").addEventListener("input", (e) => {
  clearTimeout(searchT);
  searchT = setTimeout(() => {
    state.q = e.target.value.trim();
    state.mode = "stream";
    reloadItems();
  }, 280);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (state.treeEdit && !inField(e.target)) {
      cancelTreeEdit();
      return;
    }
    if ($("#ingestModal").open || $("#compileModal").open) {
      closeModals();
      return;
    }
    if (state.chatOpen) {
      $("#chatClose").click();
      return;
    }
    state.selectedItem = null;
    closeDrawer();
    setDetailOpen(false);
    renderDetail();
  }
  if (e.key === "/" && !inField(e.target)) {
    e.preventDefault();
    $("#searchInput").focus();
  }
});

function inField(el) {
  const t = el?.tagName;
  return t === "INPUT" || t === "TEXTAREA" || el?.isContentEditable;
}

Promise.all([
  refreshAll(),
  loadFrontier().catch((err) => {
    console.warn(err);
    state.frontier = { window: "", note: "", items: [] };
  }),
  markGrownFromStore(),
]).then(() => {
  render();
}).catch((err) => {
  $("#logView").innerHTML = `<p class="empty">活树还没醒来。${esc(err.message)}</p>`;
});
