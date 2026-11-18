/** Pure tree mutations — used by the service worker and unit tests. */

export function sanitizeTitle(title) {
  return String(title || "")
    .trim()
    .replaceAll("/", "・");
}

export function uniquePath(existing, base) {
  const set = existing instanceof Set ? existing : new Set(existing);
  if (!set.has(base)) return base;
  let i = 2;
  while (set.has(`${base}·${i}`)) i += 1;
  return `${base}·${i}`;
}

export function siblingSort(nodes, parent) {
  const key = parent ?? null;
  let max = 0;
  for (const n of nodes || []) {
    if ((n.parent ?? null) === key) max = Math.max(max, n.sort ?? 0);
  }
  return max + 10;
}

export function remapPath(oldPath, newPath, value) {
  if (value == null || value === "") return value;
  const v = String(value);
  if (v === oldPath) return newPath;
  if (v.startsWith(oldPath + "/")) return newPath + v.slice(oldPath.length);
  return value;
}

function fail(message, code) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

export function addNodeInStore(store, parent, title, nowIso) {
  title = sanitizeTitle(title);
  if (!title) fail("请写枝名", 400);
  parent = parent || null;
  if (parent && !store.tree_nodes.some((n) => n.path === parent)) {
    fail("找不到上一级", 404);
  }
  const base = parent ? `${parent}/${title}` : title;
  const path = uniquePath(
    store.tree_nodes.map((n) => n.path),
    base
  );
  const finalTitle = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
  const node = {
    path,
    title: finalTitle,
    parent,
    sort: siblingSort(store.tree_nodes, parent),
    description: "",
    created_at: typeof nowIso === "function" ? nowIso() : nowIso || "",
  };
  store.tree_nodes.push(node);
  return node;
}

export function renameNodeInStore(store, path, title) {
  const node = store.tree_nodes.find((n) => n.path === path);
  if (!node) fail("未找到这根枝", 404);
  const oldTitle = node.title;
  title = sanitizeTitle(title);
  if (!title) fail("请写枝名", 400);
  const parent = node.parent || null;
  const base = parent ? `${parent}/${title}` : title;
  const existing = store.tree_nodes
    .filter((n) => n.path !== path && !n.path.startsWith(path + "/"))
    .map((n) => n.path);
  const newPath = uniquePath(existing, base);
  const newTitle = newPath.includes("/") ? newPath.slice(newPath.lastIndexOf("/") + 1) : newPath;

  if (newPath !== path) {
    for (const n of store.tree_nodes) {
      n.path = remapPath(path, newPath, n.path);
      if (n.parent != null) n.parent = remapPath(path, newPath, n.parent);
    }
    for (const it of store.items || []) {
      it.tree_path = remapPath(path, newPath, it.tree_path);
    }
    for (const c of store.chats || []) {
      for (const cite of c.citations || []) {
        if (cite.tree_path) cite.tree_path = remapPath(path, newPath, cite.tree_path);
      }
    }
  }
  node.title = newTitle;
  return { oldPath: path, newPath, oldTitle, node };
}

export function ensureUncategorized(store, nowIso) {
  if (store.tree_nodes.some((n) => n.path === "未分类")) return;
  store.tree_nodes.push({
    path: "未分类",
    title: "未分类",
    parent: null,
    sort: siblingSort(store.tree_nodes, null),
    description: "",
    created_at: typeof nowIso === "function" ? nowIso() : nowIso || "",
  });
}

export function deleteNodeInStore(store, path, nowIso) {
  const node = store.tree_nodes.find((n) => n.path === path);
  if (!node) fail("未找到这根枝", 404);
  const title = node.title;
  const parent = node.parent || null;
  const toDelete = store.tree_nodes.filter(
    (n) => n.path === path || n.path.startsWith(path + "/")
  );
  const delPaths = new Set(toDelete.map((n) => n.path));
  let dest = parent && !delPaths.has(parent) ? parent : "未分类";
  if (dest === "未分类") ensureUncategorized(store, nowIso);

  let moved = 0;
  for (const it of store.items || []) {
    const p = it.tree_path || "";
    if (p === path || p.startsWith(path + "/")) {
      it.tree_path = dest;
      moved += 1;
    }
  }
  for (const c of store.chats || []) {
    for (const cite of c.citations || []) {
      const p = cite.tree_path || "";
      if (p === path || p.startsWith(path + "/")) cite.tree_path = dest;
    }
  }

  store.tree_nodes = store.tree_nodes.filter((n) => !delPaths.has(n.path));
  if (dest === "未分类") ensureUncategorized(store, nowIso);
  return { title, dest, moved, path };
}
