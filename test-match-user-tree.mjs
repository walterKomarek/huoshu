/** Tiny unit test for matchUserTree — run: node test-match-user-tree.mjs */
import { matchUserTree, levenshtein } from "./classifier.js";

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const store = {
  tree_nodes: [
    { path: "人工智能", title: "人工智能" },
    { path: "人工智能/Agent", title: "Agent" },
    { path: "具身智能", title: "具身智能" },
  ],
};

const vlaText =
  "τ0-VLA：用世界模型做测试时搜索的分层机器人基座模型。分层 VLA 与具身智能。";

const got = matchUserTree(store, {
  text: vlaText,
  tags: ["具身智能", "VLA"],
});
assert(got === "具身智能", `VLA/世界模型/具身智能 → expected 具身智能, got ${got}`);

const stale = matchUserTree(store, {
  text: vlaText,
  tags: ["具身智能", "VLA"],
  hintPath: "人工智能/Agent",
});
assert(
  stale === "具身智能",
  `stale Agent hint must not override 具身智能, got ${stale}`
);

const preferred = matchUserTree(store, {
  text: vlaText,
  tags: ["具身智能", "VLA"],
  preferredPath: "具身智能",
  hintPath: "人工智能/Agent",
});
assert(preferred === "具身智能", `preferredPath should win, got ${preferred}`);

const fuzzy = matchUserTree(store, {
  text: "一篇关于机器人的短讯",
  tags: ["聚身智能"],
});
assert(fuzzy === "具身智能", `fuzzy 聚身智能 → 具身智能, got ${fuzzy}`);

assert(levenshtein("具身智能", "聚身智能") === 1, "levenshtein 具/聚");

console.log("ok matchUserTree →", got);

const rich = {
  tree_nodes: [
    { path: "人工智能", title: "人工智能" },
    { path: "人工智能/Agent", title: "Agent" },
    { path: "具身智能", title: "具身智能" },
    { path: "具身智能/数据层", title: "数据层" },
    { path: "具身智能/VLA与控制", title: "VLA与控制" },
    { path: "具身智能/本体与硬件", title: "本体与硬件" },
    { path: "世界模型", title: "世界模型" },
    { path: "基础设施与标准", title: "基础设施与标准" },
  ],
};

const data = matchUserTree(rich, {
  text: "A teleoperation and egocentric robot dataset with a data engine for cross-embodiment.",
  tags: ["数据层"],
  hintPath: "人工智能/Agent",
});
assert(data === "具身智能/数据层", `teleop/data engine → 数据层, got ${data}`);

const wm = matchUserTree(rich, {
  text: "A video world model for robotic planning.",
  tags: ["世界模型"],
  hintPath: "人工智能/Agent",
});
assert(wm === "世界模型", `world model → 世界模型, got ${wm}`);

const vla2 = matchUserTree(rich, {
  text: "A new vision-language-action policy for dexterous control.",
  tags: ["VLA"],
});
assert(vla2 === "具身智能/VLA与控制", `VLA → VLA与控制, got ${vla2}`);

const nv = matchUserTree(rich, {
  text: "NVIDIA Isaac and Cosmos as a robotics inference platform.",
  tags: [],
});
assert(nv === "基础设施与标准", `NVIDIA Isaac → 基础设施与标准, got ${nv}`);

console.log("ok matchUserTree specific branches");
