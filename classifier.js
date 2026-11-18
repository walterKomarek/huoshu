/** Keyword classifier — port of classifier.py. No LLM. */
export const BRANCHES = [
  [
    "世界模型",
    "世界模型",
    [
      "世界模型",
      "world model",
      "world-model",
      "jepa",
      "dreamer",
      "latent dynamics",
      "video world model"
    ]
  ],
  [
    "具身智能/数据层",
    "数据层",
    [
      "数据层",
      "teleop",
      "teleoperation",
      "遥操作",
      "egocentric",
      "open x-embodiment",
      "open-x-embodiment",
      "cross-embodiment",
      "cross embodiment",
      "synthetic robot",
      "data engine",
      "数据引擎",
      "umi",
      "retargeting",
      "retarget",
      "human demonstration",
      "robot dataset",
      "演示数据"
    ]
  ],
  [
    "具身智能/VLA与控制",
    "VLA",
    [
      "vla",
      "vision-language-action",
      "vision language action",
      "action model",
      "策略控制",
      "robot policy"
    ]
  ],
  [
    "具身智能/本体与硬件",
    "本体",
    [
      "humanoid",
      "人形机器人",
      "人形",
      "本体",
      "actuator",
      "执行器",
      "关节",
      "hardware platform",
      "本体与硬件"
    ]
  ],
  [
    "基础设施与标准",
    "基础设施",
    [
      "nvidia",
      "isaac",
      "jetson",
      "cuda",
      "cosmos",
      "gr00t",
      "groot",
      "基础设施",
      "推理平台",
      "算力平台",
      "safety protocol",
      "评测协议",
      "安全协议"
    ]
  ],
  [
    "具身智能",
    "具身智能",
    [
      "具身智能",
      "具身",
      "embodied",
      "机器人基座",
      "physical ai",
      "physical intelligence"
    ]
  ],
  [
    "人工智能/大模型",
    "大模型",
    [
      "llm",
      "gpt",
      "claude",
      "gemini",
      "grok",
      "llama",
      "mistral",
      "qwen",
      "大模型",
      "语言模型",
      "transformer",
      "token",
      "tokenizer",
      "context window",
      "上下文窗口",
      "rlhf",
      "sft",
      "预训练",
      "pretrain",
      "pre-train",
      "instruction tune",
      "对齐",
      "alignment",
      "moat",
      "mixture of experts",
      "moe",
      "推理模型",
      "reasoning model",
      "o1",
      "chain of thought",
      "思维链",
      "cot",
      "temperature",
      "system prompt",
      "system prompt",
      "prompt engineering",
      "提示词",
      "hallucination",
      "幻觉",
      "context length",
      "长上下文",
      "foundation model",
      "基座模型",
      "openai",
      "anthropic"
    ]
  ],
  [
    "人工智能/Agent",
    "Agent",
    [
      "agent",
      "agents",
      "智能体",
      "tool use",
      "tool-use",
      "function call",
      "function calling",
      "mcp",
      "multi-agent",
      "multi agent",
      "computer use",
      "computer-use",
      "autonomous",
      "自主代理",
      "planner",
      "orchestrat",
      "reAct",
      "react loop",
      "工具调用",
      "browser agent",
      "coding agent",
      "agentic",
      "工作流智能体",
      "subagent",
      "delegation",
      "委派"
    ]
  ],
  [
    "人工智能/训练与评测",
    "评测",
    [
      "benchmark",
      "eval",
      "evaluation",
      "mmlu",
      "gsm8k",
      "humaneval",
      "loss",
      "training",
      "fine-tune",
      "finetune",
      "fine tune",
      "评测",
      "训练",
      "微调",
      "数据集",
      "dataset",
      "ablation",
      "leaderboard",
      "榜单",
      "overfit",
      "过拟合",
      "gradient",
      "learning rate",
      "epoch",
      "checkpoint",
      "sft",
      "dpo",
      "reward model",
      "奖励模型",
      "kl divergence",
      "wandb",
      "arena",
      "lmsys",
      "livecodebench",
      "swe-bench"
    ]
  ],
  [
    "产品与增长/产品策略",
    "产品策略",
    [
      "pm ",
      "product manager",
      "roadmap",
      "产品",
      "策略",
      "retention",
      "留存",
      "north star",
      "北极星",
      "需求",
      "prd",
      "mvp",
      "product-market",
      "产品市场",
      "priorit",
      "优先级",
      "roadmap",
      "activation",
      "激活",
      "aha moment",
      "job to be done",
      "jtbd",
      "onboarding",
      "核心循环",
      "core loop",
      "product sense",
      "产品经理",
      "功能规划",
      "user interview",
      "用户访谈"
    ]
  ],
  [
    "产品与增长/增长与分发",
    "增长",
    [
      "growth",
      "viral",
      "virality",
      "seo",
      "distribution",
      "增长",
      "获客",
      "分发",
      "acquisition",
      "cac",
      "ltv",
      "referral",
      "推荐裂变",
      "渠道",
      "channel",
      "funnel",
      "漏斗",
      "k-factor",
      "content marketing",
      "内容获客",
      "plg",
      "product-led",
      "network effect",
      "网络效应",
      "loop",
      "增长黑客",
      "go-to-market",
      "gtm",
      "投放",
      "ads"
    ]
  ],
  [
    "设计与体验",
    "设计",
    [
      "ux",
      "ui",
      "design",
      "设计",
      "体验",
      "interaction",
      "交互",
      "visual",
      "视觉",
      "typography",
      "字体",
      "whitespace",
      "留白",
      "affordance",
      "usability",
      "可用性",
      "information architecture",
      "ia ",
      "wireframe",
      "原型",
      "fidelity",
      "motion",
      "动效",
      "accessibility",
      "无障碍",
      "dark mode",
      "暗色",
      "haptic",
      "interface",
      "界面",
      "layout",
      "布局",
      "color",
      "色彩"
    ]
  ],
  [
    "媒体与信息流",
    "信息流",
    [
      "twitter",
      "tweet",
      "timeline",
      "feed",
      "信息流",
      "推荐",
      "algorithm",
      "算法推荐",
      "for you",
      "following",
      "timeline",
      "attention",
      "注意力",
      "doomscroll",
      "刷",
      "timeline",
      "content feed",
      "社交网络",
      "social graph",
      "engagement",
      "互动率",
      "impressions",
      "曝光",
      "x.com",
      "微博",
      "小红书",
      "xhs",
      "xiaohongshu",
      "rss",
      "newsletter",
      "订阅",
      "media diet",
      "媒体饮食",
      "information overload",
      "信息过载",
      "curation",
      "策展"
    ]
  ],
  [
    "个人知识与方法",
    "方法",
    [
      "pkm",
      "zettelkasten",
      "second brain",
      "笔记",
      "知识",
      "方法",
      "卡片",
      "card",
      "evergreen",
      "常青笔记",
      "atomic note",
      "原子笔记",
      "roam",
      "obsidian",
      "logseq",
      "notion",
      "inbox",
      "inbox zero",
      "capture",
      "收集",
      "回顾",
      "review",
      "spaced repetition",
      "间隔重复",
      "anki",
      "flashcard",
      "personal canon",
      "正典",
      "知识树",
      "living notes",
      "write to think",
      "写作即思考",
      "daily note",
      "日记"
    ]
  ]
];

export const DEFAULT_PATH = "个人知识与方法";
export const DEFAULT_TAG = "未分类";

function normalize(text) {
  return (text || "").toLowerCase();
}

export function firstSentence(text, limit = 80) {
  let t = (text || "").trim().replace(/\n/g, " ");
  t = t.replace(/\s+/g, " ");
  if (!t) return "";
  for (const sep of ["。", "！", "？", ". ", "! ", "? "]) {
    const i = t.indexOf(sep);
    if (i > 0 && i < limit + 10) {
      const end = i + (["。", "！", "？"].includes(sep) ? 1 : 2);
      return t.slice(0, end).trim();
    }
  }
  if (t.length <= limit) return t;
  return t.slice(0, limit).replace(/\s+$/, "") + "…";
}

export function classify(text, extra = "") {
  const blob = normalize(text + " " + (extra || ""));
  const scores = [];
  for (const [path, tag, kws] of BRANCHES) {
    let score = 0;
    for (const kw of kws) {
      const k = kw.toLowerCase();
      if (blob.includes(k)) {
        score += Math.max(1, Math.floor(k.length / 4));
      }
    }
    if (score) scores.push([score, path, tag]);
  }
  scores.sort((a, b) => b[0] - a[0] || String(b[1]).length - String(a[1]).length || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));

  let path;
  let tags;
  if (!scores.length) {
    path = DEFAULT_PATH;
    tags = [DEFAULT_TAG];
  } else {
    path = scores[0][1];
    tags = [];
    for (const [, , tag] of scores) {
      if (!tags.includes(tag)) tags.push(tag);
      if (tags.length >= 3) break;
    }
    const leaf = path.split("/").pop();
    if (leaf && !tags.includes(leaf)) {
      tags = [leaf, ...tags].slice(0, 3);
    }
  }
  const summary = firstSentence(text);
  return { tree_path: path, tags: tags.slice(0, 3), summary };
}

export function ensureParentPaths(path) {
  const parts = (path || "").split("/").filter(Boolean);
  const out = [];
  const acc = [];
  for (const p of parts) {
    acc.push(p);
    out.push(acc.join("/"));
  }
  return out;
}

const ALIAS_TRIGGERS = ["具身", "embodied", "vla", "世界模型", "humanoid", "人形", "vision-language-action", "world model", "机器人基座", "unitree", "optimus", "人形机器人", "teleop", "遥操作", "egocentric", "data engine", "nvidia", "isaac"];
const ALIAS_TITLE_NEEDLES = ["具身", "vla", "世界", "人形", "机器人", "数据", "本体", "基础设施", "控制"];

const PATH_HINTS = [
  {
    pathIncludes: ["数据层"],
    needles: ["teleop", "teleoperation", "遥操作", "egocentric", "open x-embodiment", "open-x", "cross-embodiment", "cross embodiment", "synthetic robot", "data engine", "数据层", "数据引擎", "umi", "retarget", "demonstration", "robot dataset", "演示数据"],
    bonus: 42,
  },
  {
    pathIncludes: ["世界模型"],
    needles: ["世界模型", "world model", "world-model", "jepa", "dreamer", "latent dynamics"],
    bonus: 42,
  },
  {
    pathIncludes: ["VLA与控制", "VLA"],
    needles: ["vla", "vision-language-action", "vision language action", "action model"],
    bonus: 38,
  },
  {
    pathIncludes: ["本体与硬件"],
    needles: ["humanoid", "人形", "本体", "actuator", "执行器"],
    bonus: 32,
  },
  {
    pathIncludes: ["基础设施与标准", "基础设施"],
    needles: ["nvidia", "isaac", "jetson", "cuda", "cosmos", "gr00t", "groot", "基础设施", "推理平台", "safety protocol", "评测协议", "安全协议"],
    bonus: 38,
  },
];

function pathHintBonus(node, blob) {
  const path = String(node?.path || "");
  const title = String(node?.title || "");
  let bonus = 0;
  for (const hint of PATH_HINTS) {
    const onPath = hint.pathIncludes.some((p) => path.includes(p) || title.includes(p));
    if (!onPath) continue;
    if (hint.needles.some((n) => blob.includes(n.toLowerCase()))) {
      bonus = Math.max(bonus, hint.bonus);
    }
  }
  return bonus;
}

export function levenshtein(a, b) {
  a = String(a || "");
  b = String(b || "");
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array(n + 1);
  const cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

function nodeSet(store) {
  return store?.tree_nodes || [];
}

function pathExists(store, path) {
  if (!path) return false;
  return nodeSet(store).some((n) => n.path === path);
}

function lastSeg(path) {
  const parts = String(path || "").split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

/** Map a classifier path onto a node that already exists in the user's tree. */
export function remapToUserTree(store, path) {
  if (!path) return null;
  if (pathExists(store, path)) return path;
  const leaf = lastSeg(path);
  const nodes = nodeSet(store);
  // Prefer exact title / leaf match on any depth
  const sameLeaf = nodes.find(
    (n) => n.title === leaf || lastSeg(n.path) === leaf
  );
  if (sameLeaf) return sameLeaf.path;
  // Fuzzy title match (typo tolerance)
  if (leaf) {
    const leafLow = leaf.toLowerCase();
    let best = null;
    let bestDist = 3;
    for (const n of nodes) {
      const t = String(n.title || "").toLowerCase();
      if (t.length < 2) continue;
      const d = levenshtein(leafLow, t);
      if (d < bestDist || (d === bestDist && best && String(n.path).length > String(best.path).length)) {
        bestDist = d;
        best = n;
      }
    }
    if (best && bestDist <= 2) return best.path;
  }
  const parts = String(path).split("/").filter(Boolean);
  if (parts.length > 1) {
    const parent = parts.slice(0, -1).join("/");
    if (pathExists(store, parent)) return parent;
  }
  if (pathExists(store, "具身智能")) return "具身智能";
  if (pathExists(store, "人工智能")) return "人工智能";
  return path;
}

/**
 * Prefer the user's live tree over shipped / classifier paths.
 * Priority:
 * 1. preferredPath (explicit user choice / selected branch)
 * 2. exact tag ↔ branch title match on the user's tree
 * 3. score user nodes against text / tags / aliases
 * 4. hintPath only if no strong live match
 * 5. fall back to classify(), remapped onto an existing node
 */
export function matchUserTree(store, { text, tags, hintPath, preferredPath, extra } = {}) {
  const preferred = String(preferredPath || "").trim();
  if (preferred && pathExists(store, preferred)) return preferred;

  const tagList = (Array.isArray(tags) ? tags : [])
    .map((t) => String(t || "").trim())
    .filter(Boolean);
  const tagLows = tagList.map((t) => t.toLowerCase());
  const blob = [...tagList, text || "", extra || ""].join(" ").toLowerCase();
  const nodes = nodeSet(store);

  // --- Pass 1: exact / near-exact tag ↔ user branch title ---
  for (const node of nodes) {
    const title = String(node.title || "");
    const leaf = lastSeg(node.path) || title;
    const titleLow = title.toLowerCase();
    const leafLow = leaf.toLowerCase();
    for (const tag of tagLows) {
      if (!tag) continue;
      if (tag === titleLow || tag === leafLow) return node.path;
      if (title.length >= 2 && levenshtein(titleLow, tag) <= 1) return node.path;
      if (leaf.length >= 2 && leafLow !== titleLow && levenshtein(leafLow, tag) <= 1) return node.path;
    }
  }

  // --- Pass 2: score every user node ---
  let best = null;
  let bestScore = 0;
  for (const node of nodes) {
    let score = 0;
    const title = String(node.title || "");
    const leaf = lastSeg(node.path) || title;
    const titleLow = title.toLowerCase();
    const leafLow = leaf.toLowerCase();

    if (title && title.length >= 2 && blob.includes(titleLow)) {
      score += 20 + title.length;
    }
    if (leaf && leafLow !== titleLow && leaf.length >= 2 && blob.includes(leafLow)) {
      score += 18 + leaf.length;
    }
    score += pathHintBonus(node, blob);
    for (const tag of tagLows) {
      if (!tag) continue;
      if (titleLow && (titleLow.includes(tag) || tag.includes(titleLow))) score += 16 + title.length;
      if (leafLow && leafLow !== titleLow && (leafLow.includes(tag) || tag.includes(leafLow))) score += 14 + leaf.length;
      if (title.length >= 2 && levenshtein(titleLow, tag) <= 2) score += 12 + title.length;
    }

    const hasTrigger = ALIAS_TRIGGERS.some((t) => blob.includes(t.toLowerCase()));
    if (hasTrigger) {
      const titleHasAlias = ALIAS_TITLE_NEEDLES.some((n) => titleLow.includes(n.toLowerCase()));
      if (titleHasAlias) score += 25 + title.length;
    }

    // Prefer deeper / more specific path when scores tie
    if (
      score > bestScore ||
      (score === bestScore && score > 0 && String(node.path).length > String(best || "").length)
    ) {
      bestScore = score;
      best = node.path;
    }
  }

  // Strong live match always wins over stale classifier hints (e.g. Agent)
  if (best && bestScore >= 12) return best;

  const hint = String(hintPath || "").trim();
  if (hint && pathExists(store, hint)) {
    if (!best || best === hint || bestScore < 12) return hint;
    return best;
  }
  if (best) return best;

  const classified = classify(text, extra || tagList.join(" "));
  const mapped = remapToUserTree(store, classified.tree_path);
  if (mapped && pathExists(store, mapped)) return mapped;
  return mapped || classified.tree_path || DEFAULT_PATH;
}
