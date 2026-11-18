(function () {
  const BTN_CLASS = "huoshu-save-btn";
  const saved = new Set();

  function findTweets() {
    const a = [...document.querySelectorAll('article[data-testid="tweet"]')];
    const extra = [...document.querySelectorAll("article")].filter((el) =>
      el.querySelector('a[href*="/status/"]')
    );
    const all = [...a];
    for (const el of extra) {
      if (!all.includes(el)) all.push(el);
    }
    return all;
  }

  function extract(article) {
    const textEl = article.querySelector('[data-testid="tweetText"]');
    const text = (textEl?.innerText || article.innerText || "").trim();

    let handle = "";
    let statusId = "";
    let url = "";
    const links = [...article.querySelectorAll("a[href]")];
    for (const a of links) {
      const href = a.getAttribute("href") || "";
      const m = href.match(/\/([^/]+)\/status\/(\d+)/);
      if (m && !/\/(i|search|explore)\//.test(href)) {
        handle = m[1];
        statusId = m[2];
        url = "https://x.com/" + handle + "/status/" + statusId;
        break;
      }
    }
    if (!handle) {
      for (const a of links) {
        const href = a.getAttribute("href") || "";
        const m = href.match(/^\/([A-Za-z0-9_]{1,15})$/);
        if (m && !["home", "explore", "search", "notifications", "messages", "i", "compose"].includes(m[1])) {
          handle = m[1];
          break;
        }
      }
    }

    let authorName = "";
    const userName = article.querySelector('[data-testid="User-Name"]');
    if (userName) {
      const first = userName.querySelector("span");
      authorName = (first?.textContent || "").trim();
    }
    if (!authorName) authorName = handle || "";

    const timeEl = article.querySelector("time");
    const created = timeEl?.getAttribute("datetime") || "";

    return {
      source: "x",
      source_id: statusId || null,
      url,
      author_name: authorName,
      author_handle: handle,
      text,
      created_at: created,
      raw: { href: location.href },
    };
  }

  function actionBar(article) {
    return (
      article.querySelector('[role="group"]') ||
      article.querySelector('[data-testid="tweet"] [role="group"]')
    );
  }

  function setLabel(btn, text) {
    btn.textContent = text;
  }

  function inject(article) {
    if (article.dataset.huoshu === "1") return;
    const data = extract(article);
    const key = data.source_id || data.url || data.text.slice(0, 40);
    const bar = actionBar(article);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = BTN_CLASS;
    btn.textContent = "存入活树";
    if (key && saved.has(key)) {
      setLabel(btn, "已生长 ✓");
      btn.disabled = true;
    }
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled) return;
      const payload = extract(article);
      if (!payload.text) return;
      setLabel(btn, "生长中…");
      chrome.runtime.sendMessage({ type: "ingest", payload }, (res) => {
        if (chrome.runtime.lastError) {
          setLabel(btn, "没存成");
          setTimeout(() => setLabel(btn, "存入活树"), 1600);
          return;
        }
        if (res && (res.ok || res.deduped || res.id) && !res.error) {
          const k = payload.source_id || payload.url || payload.text.slice(0, 40);
          saved.add(k);
          setLabel(btn, "已生长 ✓");
          btn.disabled = true;
          return;
        }
        const err = (res && (res.error || res.message)) || "没存成";
        setLabel(btn, String(err).slice(0, 12));
        setTimeout(() => setLabel(btn, "存入活树"), 1600);
      });
    });
    if (bar) {
      const wrap = document.createElement("div");
      wrap.className = "huoshu-save-wrap";
      wrap.appendChild(btn);
      bar.appendChild(wrap);
    } else {
      btn.classList.add("huoshu-save-btn--float");
      article.style.position = article.style.position || "relative";
      article.appendChild(btn);
    }
    article.dataset.huoshu = "1";
  }

  function scan() {
    findTweets().forEach(inject);
  }

  // —— 前沿：浏览 𝕏 时把关注学者的相关推文送进前沿缓冲 ——
  let watched = null;
  let harvestTimer = null;
  const harvested = new Set();

  function loadWatched() {
    // 暂不采集 𝕏：没有 API
    watched = new Set();
  }

  function harvestScan() {
    if (!watched || !watched.size) return;
    const batch = [];
    for (const article of findTweets()) {
      const data = extract(article);
      const handle = String(data.author_handle || "").toLowerCase();
      if (!handle || !watched.has(handle)) continue;
      const sid = data.source_id;
      if (!sid || harvested.has(sid)) continue;
      harvested.add(sid);
      batch.push({
        source_id: sid,
        author_handle: data.author_handle,
        author_name: data.author_name,
        text: data.text,
        url: data.url,
        created_at: data.created_at,
      });
    }
    if (batch.length) {
      chrome.runtime.sendMessage({ type: "ingestXFrontier", items: batch }, () => {
        void chrome.runtime.lastError;
      });
    }
  }

  function scheduleHarvest() {
    clearTimeout(harvestTimer);
    harvestTimer = setTimeout(harvestScan, 1200);
  }

  loadWatched();
  scan();
  scheduleHarvest();
  const mo = new MutationObserver(() => {
    scan();
    scheduleHarvest();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
