import {
  implantSkeleton,
  missingSkeletonPaths,
  seedJudgmentCollections,
  buildDefaultInflections,
  classifyLayerTags,
  decorateFrontierItem,
  insertNoteTemplate,
  NOTE_TEMPLATE,
  isJudgmentBranch,
  compileJudgmentSnapshot,
  inflectionChatSnapshot,
  eventLogBucket,
  normalizeStatus,
  recentFrontierForNode,
  DEFAULT_KEY_NODES,
} from "./judgment.js";

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const existing = [
  { path: "人工智能", title: "人工智能", parent: null, sort: 10 },
  { path: "具身智能", title: "具身智能", parent: null, sort: 5 },
  { path: "产品与增长", title: "产品与增长", parent: null, sort: 20 },
];
const missing = missingSkeletonPaths(existing);
assert(missing.includes("跟进判断"), "missing 跟进判断");
assert(missing.includes("具身智能/数据层"), "missing 数据层");
assert(!missing.includes("具身智能"), "do not list existing 具身智能 as missing");

const { nodes, added } = implantSkeleton(existing, "2026-11-17T00:00:00+08:00");
assert(existing.some((n) => n.path === "产品与增长"), "user branch preserved in input");
assert(nodes.some((n) => n.path === "产品与增长"), "user branch preserved after implant");
assert(nodes.some((n) => n.path === "跟进判断/拐点清单"), "added 拐点清单");
assert(nodes.some((n) => n.path === "世界模型"), "added 世界模型");
assert(added.includes("世界模型"), "added list includes 世界模型");
assert(!added.includes("具身智能"), "do not re-add 具身智能");

const again = implantSkeleton(nodes, "2026-11-17T00:00:00+08:00");
assert(again.added.length === 0, "second implant is idempotent");

const seeded = seedJudgmentCollections([], [], "2026-11-17T00:00:00+08:00", false);
assert(seeded.nodes.length === 5, `5 key nodes, got ${seeded.nodes.length}`);
assert(seeded.inflections.length === 6 + 5 * 5, `6 sector + 25 project, got ${seeded.inflections.length}`);
assert(seeded.inflections.every((i) => i.status !== "已跨过"), "no fake 已跨过");
assert(seeded.judgmentSeeded === true, "flag set");
const seeded2 = seedJudgmentCollections([], [], "2026-11-17T00:00:00+08:00", true);
assert(seeded2.inflections.length === 0, "do not re-seed after flag");

const layers = classifyLayerTags({
  title: "Open X-Embodiment and a teleop data engine",
  why: "We collect egocentric demonstrations.",
});
assert(layers.includes("数据飞轮"), `data layer tag, got ${layers}`);

const wm = classifyLayerTags({ title: "A world model for robots", why: "" });
assert(wm.includes("世界模型"), `world model tag, got ${wm}`);

const decorated = decorateFrontierItem({ id: "1", title: "humanoid walking demo", why: "A new unveiling video" });
assert(Array.isArray(decorated.layers), "layers field present");

assert(insertNoteTemplate("") === NOTE_TEMPLATE, "empty note gets template");
assert(insertNoteTemplate("已有旁注").includes("已有旁注"), "append keeps existing");
assert(insertNoteTemplate("已有旁注").includes("还缺什么验证："), "append adds template");
assert(insertNoteTemplate(NOTE_TEMPLATE) === NOTE_TEMPLATE, "do not duplicate template");

assert(isJudgmentBranch("跟进判断") && isJudgmentBranch("跟进判断/终局与浪"), "judgment branch");
assert(!isJudgmentBranch("具身智能"), "other branches are not judgment");

const snap = compileJudgmentSnapshot({
  items: [
    {
      id: "a",
      author_name: "我",
      tree_path: "跟进判断/终局与浪",
      text: "终局在世界模型。",
      note: "第二浪向第三浪过渡。",
      judgment: "观察",
      saved_at: "2026-11-17T10:00:00+08:00",
    },
  ],
  inflections: [
    {
      id: "sec-1",
      kind: "sector",
      title: "测试拐点",
      status: "观察中",
      after_action: "上调数据层",
      verification: "出现默认协议",
      occurred_on: "",
    },
  ],
  nodes: [],
  dateLabel: "2026年11月17日",
});
assert(snap.includes("# 判断快照"), "snapshot title");
assert(snap.includes("终局在世界模型"), "includes endgame note");
assert(snap.includes("测试拐点"), "includes inflection");
assert(snap.includes("验证信号"), "verification labeled");

const chat = inflectionChatSnapshot(
  [{ kind: "sector", title: "测试拐点", status: "观察中" }],
  [{ author_name: "我", judgment: "改口", note: "先记下", saved_at: "2026-11-17T10:00:00+08:00" }],
  []
);
assert(chat.includes("观察中"), "chat snapshot has status");
assert(chat.includes("改口"), "chat snapshot has judgment");

assert(eventLogBucket({ type: "ingest" }) === "ingest", "ingest bucket");
assert(eventLogBucket({ type: "inflection" }) === "inflection", "inflection bucket");
assert(eventLogBucket({ type: "judgment" }) === "judgment", "judgment bucket");
assert(normalizeStatus("foo") === "未发生", "bad status falls back");

const figure = DEFAULT_KEY_NODES[0];
const hits = recentFrontierForNode(figure, [
  { title: "Figure AI shows a new demo", who: "Brett Adcock" },
  { title: "Unrelated paper", who: "Someone" },
]);
assert(hits.length === 1, `figure events, got ${hits.length}`);

const defaults = buildDefaultInflections("t");
assert(defaults.filter((i) => i.kind === "sector").length === 6, "6 sector defaults");
assert(defaults.every((i) => i.status === "未发生" || i.status === "观察中"), "statuses ok");

console.log("ok judgment helpers");
