/** First-run seed — port of seed.py. Fictional handles only. */
export const TAXONOMY = [
  [
    "具身智能",
    "具身智能",
    null,
    5,
    "人形、VLA、世界模型与机器人基座"
  ],
  [
    "人工智能",
    "人工智能",
    null,
    10,
    "模型、智能体与评测"
  ],
  [
    "人工智能/大模型",
    "大模型",
    "人工智能",
    11,
    "基座模型、对齐与推理"
  ],
  [
    "人工智能/Agent",
    "Agent",
    "人工智能",
    12,
    "工具、多智能体与计算机使用"
  ],
  [
    "人工智能/训练与评测",
    "训练与评测",
    "人工智能",
    13,
    "训练动态与基准"
  ],
  [
    "产品与增长",
    "产品与增长",
    null,
    20,
    "产品策略与分发"
  ],
  [
    "产品与增长/产品策略",
    "产品策略",
    "产品与增长",
    21,
    "需求、路线图与北极星"
  ],
  [
    "产品与增长/增长与分发",
    "增长与分发",
    "产品与增长",
    22,
    "获客、渠道与裂变"
  ],
  [
    "设计与体验",
    "设计与体验",
    null,
    30,
    "界面、交互与观感"
  ],
  [
    "媒体与信息流",
    "媒体与信息流",
    null,
    40,
    "时间线、推荐与注意力"
  ],
  [
    "个人知识与方法",
    "个人知识与方法",
    null,
    50,
    "笔记、卡片与个人正典"
  ]
];

export const SEED_HANDLES = [
  "branching_ai",
  "lin_makes",
  "token_weaver",
  "north_of_weights",
  "toolsmith_lab",
  "agent_walks",
  "computer_hands",
  "eval_bench",
  "loss_curve",
  "ablate_quietly",
  "northstar_pm",
  "pm_quietly",
  "retention_tea",
  "growth_plot",
  "distro_notes",
  "ink_and_pixels",
  "soft_edges",
  "type_on_wood",
  "feed_gardener",
  "timeline_slow",
  "quiet_refresh",
  "zettel_rain",
  "card_cabinet",
  "second_soil",
];

export const SEED_SOURCE_IDS = [
  "s1001", "s1002", "s1003", "s1004",
  "s1101", "s1102", "s1103",
  "s1201", "s1202", "s1203",
  "s2001", "s2002", "s2003",
  "s2101", "s2102",
  "s3001", "s3002", "s3003",
  "s4001", "s4002", "s4003",
  "s5001", "s5003",
];

export function buildSeed() {
  const tree_nodes = TAXONOMY.map(([path, title, parent, sort, description]) => ({
    path,
    title,
    parent,
    sort,
    description,
    created_at: "2026-08-08T09:00:00+08:00",
  }));
  return { items: [], events: [], chats: [], tree_nodes };
}
