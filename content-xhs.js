(function () {
  const BTN_ID = "huoshu-xhs-save";

  function noteIdFromUrl(href) {
    const u = String(href || location.href);
    const m =
      u.match(/\/explore\/([a-zA-Z0-9]+)/) ||
      u.match(/\/discovery\/item\/([a-zA-Z0-9]+)/) ||
      u.match(/\/item\/([a-zA-Z0-9]+)/);
    return m ? m[1] : "";
  }

  function meta(name) {
    const el =
      document.querySelector(`meta[property="${name}"]`) ||
      document.querySelector(`meta[name="${name}"]`);
    return (el?.getAttribute("content") || "").trim();
  }

  function extract() {
    const id = noteIdFromUrl(location.href);
    const title = meta("og:title") || document.title.replace(/\s*[-|].*$/, "").trim();
    const desc = meta("og:description") || meta("description");
    const author =
      document.querySelector(".author-wrapper .username, .name, .user-name")?.textContent?.trim() ||
      "";
    const body =
      document.querySelector("#detail-desc, .note-text, .desc, [class*='note-content']")?.innerText?.trim() ||
      "";
    const text = [title, body || desc].filter(Boolean).join("\n\n").trim();
    return {
      source: "xhs",
      source_id: id || null,
      url: location.href.split("?")[0],
      author_name: author || "小红书",
      author_handle: "",
      text: text || title || "（小红书笔记）",
      created_at: "",
      tags: ["小红书"],
    };
  }

  function setBtn(el, label, disabled) {
    el.textContent = label;
    el.disabled = !!disabled;
  }

  function ensureBtn() {
    if (!noteIdFromUrl(location.href) && !/xiaohongshu\.com/.test(location.host)) return;
    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.type = "button";
      btn.className = "huoshu-save-btn huoshu-xhs-fab";
      btn.textContent = "存入活树";
      document.documentElement.appendChild(btn);
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.disabled) return;
        const payload = extract();
        if (!payload.text && !payload.url) return;
        setBtn(btn, "生长中…", true);
        chrome.runtime.sendMessage({ type: "ingest", payload }, (res) => {
          if (chrome.runtime.lastError || (res && res.error)) {
            setBtn(btn, "没存成", false);
            setTimeout(() => setBtn(btn, "存入活树", false), 1600);
            return;
          }
          setBtn(btn, "已生长 ✓", true);
        });
      });
    }
  }

  ensureBtn();
  const mo = new MutationObserver(() => ensureBtn());
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
