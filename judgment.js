/** 判断闭环：跟进骨架、拐点、关键节点、层标签、判断快照。纯函数，可供测试与 service worker 复用。 */

export const JUDGMENT_CHOICES = ["升级", "降级", "观察", "改口"];
export const INFLECTION_STATUSES = ["未发生", "观察中", "已跨过"];
export const NOTE_TEMPLATE = `拐点：
对象：
判断变化：（升级 / 降级 / 观察 / 改口）
还缺什么验证：`;

export const CHAT_PRESETS = [
  "对照拐点清单，最近哪些状态变了？该不该改口？",
  "最近存入的材料里，哪些在更新预测量，哪些只是演示？",
  "按灵魂/身体分层，当前判断有没有被本体热度带跑？",
];

export const LAYER_TAGS = ["数据飞轮", "世界模型", "默认路径", "创始人路线", "本体演示", "评测标准"];

export const SKELETON_NODES = [
  { path: "跟进判断", title: "跟进判断", parent: null, sort: 2, description: "终局、预测量、拐点与改口" },
  { path: "跟进判断/终局与浪", title: "终局与浪", parent: "跟进判断", sort: 3, description: "终局判断与当前所处的浪" },
  { path: "跟进判断/拐点清单", title: "拐点清单", parent: "跟进判断", sort: 4, description: "对照会不会发生、发生在谁身上" },
  { path: "跟进判断/反证与泡沫", title: "反证与泡沫", parent: "跟进判断", sort: 5, description: "可能证伪当前判断的信号" },
  { path: "世界模型", title: "世界模型", parent: null, sort: 6, description: "灵魂层：世界模型与可迁移表征" },
  { path: "具身智能", title: "具身智能", parent: null, sort: 5, description: "人形、VLA、世界模型与机器人基座" },
  { path: "具身智能/数据层", title: "数据层", parent: "具身智能", sort: 51, description: "遥操作、第一人称、合成数据与数据引擎" },
  { path: "具身智能/VLA与控制", title: "VLA与控制", parent: "具身智能", sort: 52, description: "视觉-语言-动作与控制栈" },
  { path: "具身智能/本体与硬件", title: "本体与硬件", parent: "具身智能", sort: 53, description: "人形本体、执行器与硬件" },
  { path: "基础设施与标准", title: "基础设施与标准", parent: null, sort: 7, description: "算力、推理平台、评测与安全协议" },
  { path: "关键节点", title: "关键节点", parent: null, sort: 8, description: "Figure、Physical Intelligence、1X、NVIDIA、DeepMind 等" },
];

/** 具身智能 父枝仅在缺失时才创建；已有则跳过（不改名、不改描述）。 */
export function missingSkeletonPaths(treeNodes) {
  const have = new Set((treeNodes || []).map((n) => n.path));
  return SKELETON_NODES.filter((n) => {
    if (have.has(n.path)) return false;
    // 具身智能父枝已存在时不算「缺父枝」，只可能缺子枝（子枝单独列在清单里）
    return true;
  }).map((n) => n.path);
}

export function implantSkeleton(treeNodes, nowIso) {
  const nodes = Array.isArray(treeNodes) ? treeNodes.slice() : [];
  const have = new Set(nodes.map((n) => n.path));
  const added = [];
  const ts = typeof nowIso === "function" ? nowIso() : nowIso || "";
  for (const spec of SKELETON_NODES) {
    if (have.has(spec.path)) continue;
    if (spec.parent && !have.has(spec.parent) && spec.parent !== "具身智能") {
      // parent should have been inserted earlier in this list
    }
    if (spec.path === "具身智能" && [...have].some((p) => p === "具身智能")) continue;
    nodes.push({
      path: spec.path,
      title: spec.title,
      parent: spec.parent,
      sort: spec.sort,
      description: spec.description,
      created_at: ts,
    });
    have.add(spec.path);
    added.push(spec.path);
  }
  return { nodes, added };
}

export const DEFAULT_KEY_NODES = [
  {
    id: "node-figure",
    title: "Figure",
    aliases: ["Figure AI", "figure.ai", "Brett Adcock"],
    note: "",
  },
  {
    id: "node-pi",
    title: "Physical Intelligence",
    aliases: ["π0", "pi0", "π₀", "Physical Intelligence", "Chelsea Finn", "Sergey Levine"],
    note: "",
  },
  {
    id: "node-1x",
    title: "1X",
    aliases: ["1X Technologies", "NEO", "Bernt Børnich", "Bernt Bornich"],
    note: "",
  },
  {
    id: "node-nvidia",
    title: "NVIDIA",
    aliases: ["Nvidia", "Isaac", "Cosmos", "Jetson", "Jensen Huang", "黄仁勋", "GR00T", "Groot"],
    note: "",
  },
  {
    id: "node-deepmind",
    title: "DeepMind",
    aliases: ["Google DeepMind", "Gemini Robotics", "Demis Hassabis", "Raia Hadsell", "RT-2", "RT-X"],
    note: "",
  },
];

const SECTOR_DEFAULTS = [
  {
    id: "sec-default-stack",
    kind: "sector",
    title: "世界模型或 VLA 成为他人流水线里的默认训练/控制路径，而不只是一篇论文",
    description: "看它是不是别人默认在用的路径，而不是又多了一篇方法论文。",
    status: "观察中",
    after_action: "把卡位从「追论文」转向「默认路径上的数据、平台或许可」。",
    verification: "多家实验室或公司的公开流水线把某一模型/栈列为默认，而不只是引用或演示。",
  },
  {
    id: "sec-workflow-default",
    kind: "sector",
    title: "在非结构化场景里，某条路径成为真实工作流的默认",
    description: "状态变化是「成为某条工作流的默认」，不是营收数字。",
    status: "观察中",
    after_action: "用「谁的工作流改走这条路径」来调判断，不要把订单或估值当成拐点本身。",
    verification: "具名的非结构化场景里持续使用，而不是一次性演示或封闭试点。",
  },
  {
    id: "sec-data-layer",
    kind: "sector",
    title: "数据层出现主导来源或协议，或别人必须用的数据引擎",
    description: "遥操作 / 第一人称 / cross-embodiment / 合成数据，或成为默认的数据引擎。",
    status: "未发生",
    after_action: "提高数据层与数据引擎在组合里的权重，压低纯本体演示的权重。",
    verification: "出现被多方采用的采集协议、共享数据集或必须接入的数据引擎。",
  },
  {
    id: "sec-stack-not-body",
    kind: "sector",
    title: "行业讨论从「哪款人形本体」转向「哪套模型/栈」",
    description: "热度中心是否从身体转到灵魂与栈。",
    status: "观察中",
    after_action: "若讨论仍停在本体，保持冷静，避免被硬件发布带着跑。",
    verification: "重要发布、融资与从业者讨论的主语变成模型、数据或栈，而不再是某一款人形。",
  },
  {
    id: "sec-compute-platform",
    kind: "sector",
    title: "机器人推理/算力成为可计价的默认平台",
    description: "推理与算力是否变成别人默认付费使用的一层。",
    status: "未发生",
    after_action: "把基础设施与标准视为可能的默认层，而不只是上游供应商。",
    verification: "出现按调用/按小时计价、且被多家机器人公司当作默认的推理或仿真平台。",
  },
  {
    id: "sec-eval-standard",
    kind: "sector",
    title: "安全/评测协议收敛到一个标准",
    description: "评测与安全是否从各说各话变成可对照的公约。",
    status: "未发生",
    after_action: "把评测标准当作可能的卡位，而不是事后的附件。",
    verification: "监管、保险或主流买家开始引用同一套安全/评测协议。",
  },
];

const PROJECT_TEMPLATES = [
  {
    slug: "default-stack",
    title: (name) => `${name} 的模型/栈被他人当作默认训练或控制路径`,
    description: "不只是自己发论文或演示，而是别人开始默认用它。",
    status: "未发生",
    after_action: "把它从「观察对象」上调到「可能成为默认层」的候选。",
    verification: "外部团队的公开流水线、产品或论文将其列为默认依赖。",
  },
  {
    slug: "named-production",
    title: (name) => `${name} 离开实验室，进入具名的生产或商业场景`,
    description: "状态变化看具名场景，而不是笼统的「开始商业化」。",
    status: "未发生",
    after_action: "核对场景是否可复核；不要把宣传视频当成已经跨过。",
    verification: "出现可指名的场所、岗位或客户，并且是持续使用而非单次演示。",
  },
  {
    slug: "data-engine",
    title: (name) => `${name} 的数据引擎可见，并且在复合`,
    description: "数据飞轮是否能被外部观察到，而不是只宣称有数据。",
    status: "观察中",
    after_action: "提高对该节点数据层的权重；若只有本体更新，则保持观察。",
    verification: "公开的采集规模、回放、协议或合作表明数据在持续复合。",
  },
  {
    slug: "founder-wave",
    title: (name) => `${name} 创始人/CTO 对下一浪（世界模型 vs 遥操作木偶）作出可核对的承诺`,
    description: "听路线承诺，并记下日后用来对照的原话。",
    status: "观察中",
    after_action: "把承诺记下来，用后续产品与论文核对，而不是听完就改口。",
    verification: "公开访谈、博客或技术报告里出现可引用的路线判断，且后续动作与之对照。",
  },
  {
    slug: "api-platform",
    title: (name) => `${name} 出现可供他人在上面开发的 API 或平台`,
    description: "是否开始成为别人的基础设施，而不只是自己的产品。",
    status: "未发生",
    after_action: "若出现，将其视为可能的默认层，而不只是单一公司的功能发布。",
    verification: "外部开发者或公司基于其 API/平台构建，而不是只有自家 Demo。",
  },
];

export function buildDefaultInflections(nowIso) {
  const ts = typeof nowIso === "function" ? nowIso() : nowIso || "";
  const out = [];
  for (const s of SECTOR_DEFAULTS) {
    out.push({
      ...s,
      occurred_on: "",
      node_id: null,
      created_at: ts,
      updated_at: ts,
    });
  }
  for (const node of DEFAULT_KEY_NODES) {
    for (const t of PROJECT_TEMPLATES) {
      out.push({
        id: `proj-${node.id.replace(/^node-/, "")}-${t.slug}`,
        kind: "project",
        title: t.title(node.title),
        description: t.description,
        status: t.status,
        occurred_on: "",
        after_action: t.after_action,
        verification: t.verification,
        node_id: node.id,
        created_at: ts,
        updated_at: ts,
      });
    }
  }
  return out;
}

export function buildDefaultKeyNodes(nowIso) {
  const ts = typeof nowIso === "function" ? nowIso() : nowIso || "";
  return DEFAULT_KEY_NODES.map((n) => ({
    ...n,
    aliases: [...n.aliases],
    note: n.note || "",
    seeded: true,
    created_at: ts,
    updated_at: ts,
  }));
}

export function seedJudgmentCollections(inflections, nodes, nowIso, alreadySeeded) {
  let nextInf = Array.isArray(inflections) ? inflections.slice() : [];
  let nextNodes = Array.isArray(nodes) ? nodes.slice() : [];
  let seeded = !!alreadySeeded;
  if (!seeded) {
    if (!nextNodes.length) nextNodes = buildDefaultKeyNodes(nowIso);
    if (!nextInf.length) nextInf = buildDefaultInflections(nowIso);
    seeded = true;
  }
  return { inflections: nextInf, nodes: nextNodes, judgmentSeeded: seeded };
}

export function normalizeStatus(s) {
  return INFLECTION_STATUSES.includes(s) ? s : "未发生";
}

export function normalizeKind(s) {
  return s === "project" ? "project" : "sector";
}

export function normalizeJudgment(s) {
  const v = String(s || "").trim();
  if (!v) return "";
  return JUDGMENT_CHOICES.includes(v) ? v : "";
}

export function isJudgmentBranch(path) {
  const p = String(path || "").trim();
  return p === "跟进判断" || p.startsWith("跟进判断/");
}

const LAYER_RULES = [
  {
    tag: "世界模型",
    re: /world[\s-]?model|世界模型|jepa|dreamer|latent dynamics|video.?world.?model/i,
  },
  {
    tag: "数据飞轮",
    re: /teleop|teleoperation|遥操作|egocentric|open.?x.?embodiment|cross[\s-]?embodiment|data[\s-]?engine|数据引擎|数据飞轮|data[\s-]?flywheel|synthetic[\s-]?robot|umi\b|retarget|human[\s-]?demonstration|演示数据|robot[\s-]?dataset/i,
  },
  {
    tag: "默认路径",
    re: /成为默认|默认路径|default[\s-]?stack|default[\s-]?(training|control|path)|adopted as|production[\s-]?deploy|流水线.*(默认|采用)|foundation model for robot/i,
  },
  {
    tag: "评测标准",
    re: /benchmark|leaderboard|评测协议|安全协议|safety[\s-]?protocol|evaluation protocol|标准协议|conformity|认证协议/i,
  },
  {
    tag: "创始人路线",
    re: /founder|cto\b|创始人|路线图|roadmap|访谈|interview|podcast|观点|we are betting|our bet|Brett Adcock|Chelsea Finn|Sergey Levine|Jensen Huang|Demis Hassabis|Bernt Bø?r?nich|黄仁勋/i,
  },
  {
    tag: "本体演示",
    re: /humanoid|人形|本体|demo\b|演示|walks?|展示|unveil|发布会|product launch/i,
  },
];

const LAYER_PRIORITY = ["世界模型", "数据飞轮", "默认路径", "评测标准", "创始人路线", "本体演示"];

export function classifyLayerTags(item, limit = 2) {
  const blob = [
    item?.title,
    item?.why,
    item?.text,
    item?.who,
    item?.role,
    item?.blurb,
    Array.isArray(item?.tags) ? item.tags.join(" ") : item?.tags,
  ]
    .filter(Boolean)
    .join(" ");
  const hit = [];
  for (const rule of LAYER_RULES) {
    if (rule.re.test(blob)) hit.push(rule.tag);
  }
  hit.sort((a, b) => LAYER_PRIORITY.indexOf(a) - LAYER_PRIORITY.indexOf(b));
  const out = [];
  for (const t of hit) {
    if (!out.includes(t)) out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

export function decorateFrontierItem(item) {
  if (!item || typeof item !== "object") return item;
  const layers = classifyLayerTags(item);
  return { ...item, layers };
}

export function decorateFrontierFeed(feed) {
  if (!feed || typeof feed !== "object") return feed;
  const items = Array.isArray(feed.items) ? feed.items.map(decorateFrontierItem) : [];
  return { ...feed, items };
}

export function insertNoteTemplate(existing) {
  const cur = String(existing || "");
  if (!cur.trim()) return NOTE_TEMPLATE;
  if (cur.includes("判断变化：") && cur.includes("还缺什么验证：")) return cur;
  return `${cur.replace(/\s+$/, "")}\n\n${NOTE_TEMPLATE}`;
}

function yamlish(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function inflectionChatSnapshot(inflections, items, nodes, limitItems = 8) {
  const list = Array.isArray(inflections) ? inflections : [];
  const nodeMap = new Map((nodes || []).map((n) => [n.id, n]));
  const lines = ["拐点清单（用户维护；状态仅在用户确认后变化，论文或事件不会自动标成已跨过）："];
  if (!list.length) {
    lines.push("（还没有拐点）");
  } else {
    const byStatus = { 已跨过: [], 观察中: [], 未发生: [] };
    for (const it of list) {
      const st = normalizeStatus(it.status);
      (byStatus[st] || byStatus["未发生"]).push(it);
    }
    for (const st of ["已跨过", "观察中", "未发生"]) {
      const arr = byStatus[st];
      if (!arr.length) continue;
      lines.push(`${st}（${arr.length}）：`);
      for (const it of arr) {
        const kind = it.kind === "project" ? "项目" : "赛道";
        const who = it.occurred_on ? `；发生在：${yamlish(it.occurred_on)}` : "";
        const node = it.node_id && nodeMap.get(it.node_id) ? ` · ${nodeMap.get(it.node_id).title}` : "";
        lines.push(`- [${kind}${node}] ${yamlish(it.title)}${who}`);
      }
    }
  }
  const judged = (items || [])
    .filter((it) => it.judgment || it.note)
    .slice()
    .sort((a, b) => String(b.saved_at || b.updated_at || "").localeCompare(String(a.saved_at || a.updated_at || "")))
    .slice(0, limitItems);
  if (judged.length) {
    lines.push("");
    lines.push("带判断或旁注的叶子：");
    for (const it of judged) {
      const who = it.author_handle
        ? "@" + String(it.author_handle).replace(/^@/, "")
        : it.author_name || "匿名";
      const bits = [`${who}`, it.judgment ? `判断：${it.judgment}` : "", it.occurred_on ? `对象：${it.occurred_on}` : ""]
        .filter(Boolean)
        .join(" · ");
      const note = yamlish(it.note).slice(0, 80);
      lines.push(`- ${bits}${note ? "；旁注：" + note : ""}`);
    }
  }
  return lines.join("\n");
}

function itemWho(it) {
  if (it?.author_handle) return "@" + String(it.author_handle).replace(/^@/, "");
  return it?.author_name || "匿名";
}

function itemsUnder(items, path) {
  if (!path) return items || [];
  return (items || []).filter(
    (it) => it.tree_path === path || String(it.tree_path || "").startsWith(path + "/")
  );
}

function inflectionTitle(id, inflections) {
  const hit = (inflections || []).find((x) => x.id === id);
  return hit?.title || id;
}

function renderItemBlock(it, inflections) {
  const lines = [];
  lines.push(`### ${itemWho(it)}`);
  const meta = [it.tree_path || "", String(it.saved_at || "").slice(0, 16).replace("T", " "), it.url || ""]
    .filter(Boolean)
    .join(" · ");
  if (meta) lines.push(`*${meta}*`, "");
  if (it.judgment) lines.push(`- 判断：${it.judgment}`);
  if (it.occurred_on) lines.push(`- 对象：${it.occurred_on}`);
  if (Array.isArray(it.inflection_ids) && it.inflection_ids.length) {
    const names = it.inflection_ids.map((id) => inflectionTitle(id, inflections));
    lines.push(`- 挂钩拐点：${names.join("、")}`);
  }
  if (it.summary) {
    lines.push("", `**摘要** ${it.summary}`);
  }
  if (it.text) {
    lines.push("", it.text);
  }
  if (it.note) {
    lines.push("", `**旁注**`, "", it.note);
  }
  lines.push("", "---", "");
  return lines.join("\n");
}

function renderInflectionMd(it, nodeTitle) {
  const st = normalizeStatus(it.status);
  const kind = it.kind === "project" ? "项目" : "赛道";
  const bits = [`### [${st}] ${it.title}`, ""];
  bits.push(`- 类型：${kind}${nodeTitle ? " · 节点 " + nodeTitle : ""}`);
  if (it.description) bits.push(`- 说明：${it.description}`);
  bits.push(`- 发生在谁身上：${it.occurred_on || "（未记）"}`);
  bits.push(`- 发生后如何调判断：${it.after_action || "（未记）"}`);
  bits.push(`- 验证信号（验证，不是拐点本身）：${it.verification || "（未记）"}`);
  bits.push("");
  return bits.join("\n");
}

export function compileJudgmentSnapshot({ items, inflections, nodes, treeNodes, dateLabel }) {
  const inf = Array.isArray(inflections) ? inflections : [];
  const keyNodes = Array.isArray(nodes) ? nodes : [];
  const nodeMap = new Map(keyNodes.map((n) => [n.id, n]));
  const allItems = Array.isArray(items) ? items : [];
  const lines = [
    "# 判断快照",
    "",
    `> 从活树导出 · ${dateLabel || ""} · 拐点 ${inf.length} 条`,
    "",
    "状态只在你确认后变化；下面的「验证信号」用来事后核对，不是拐点本身。",
    "",
    "## 终局与当前浪",
    "",
  ];

  const endgame = itemsUnder(allItems, "跟进判断/终局与浪");
  const roots = itemsUnder(allItems, "跟进判断").filter((it) => it.tree_path === "跟进判断");
  const endgameItems = [...endgame, ...roots.filter((r) => !endgame.some((e) => e.id === r.id))];
  if (!endgameItems.length) {
    lines.push("这一枝还没有笔记。把你对终局和当前浪的判断写在「跟进判断/终局与浪」下。", "");
  } else {
    for (const it of endgameItems) lines.push(renderItemBlock(it, inf));
  }

  lines.push("## 拐点清单", "", "### 赛道", "");
  const sectors = inf.filter((i) => i.kind !== "project");
  if (!sectors.length) lines.push("还没有赛道拐点。", "");
  else for (const it of sectors) lines.push(renderInflectionMd(it, null));

  lines.push("### 项目", "");
  const projects = inf.filter((i) => i.kind === "project");
  if (!projects.length) {
    lines.push("还没有项目拐点。", "");
  } else {
    const groups = new Map();
    for (const it of projects) {
      const key = it.node_id || "_none";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
    for (const [nid, arr] of groups) {
      const title = nid === "_none" ? "未挂节点" : nodeMap.get(nid)?.title || nid;
      lines.push(`#### ${title}`, "");
      for (const it of arr) lines.push(renderInflectionMd(it, title));
    }
  }

  lines.push("## 反证与泡沫", "");
  const contra = itemsUnder(allItems, "跟进判断/反证与泡沫");
  if (!contra.length) lines.push("还没有反证笔记。", "");
  else for (const it of contra) lines.push(renderItemBlock(it, inf));

  lines.push("## 支撑材料", "");
  const supporting = allItems.filter((it) => {
    if (isJudgmentBranch(it.tree_path)) return true;
    if (it.judgment || (it.note && String(it.note).trim()) || (it.inflection_ids || []).length) return true;
    return false;
  });
  // 终局/反证已在上面列出，支撑材料里避免完全重复终局枝？仍列出全部带判断的，终局的也算支撑。去重按出现顺序。
  if (!supporting.length) lines.push("还没有带判断或旁注的支撑材料。", "");
  else {
    for (const it of supporting) lines.push(renderItemBlock(it, inf));
  }

  void treeNodes;
  return lines.join("\n").replace(/\s+$/, "") + "\n";
}

export function matchNodeAliases(node, blob) {
  if (!node || !blob) return false;
  const s = String(blob).toLowerCase();
  const names = [node.title, ...(node.aliases || [])].filter(Boolean);
  return names.some((n) => s.includes(String(n).toLowerCase()));
}

export function recentFrontierForNode(node, frontierItems, limit = 5) {
  const items = Array.isArray(frontierItems) ? frontierItems : [];
  const hits = items.filter((it) => {
    const blob = [it.who, it.role, it.title, it.why].filter(Boolean).join(" ");
    return matchNodeAliases(node, blob);
  });
  return hits.slice(0, limit);
}

export function eventLogBucket(ev) {
  const t = ev?.type || "";
  if (t === "ingest") return "ingest";
  if (t === "inflection") return "inflection";
  if (t === "judgment") return "judgment";
  return "other";
}
