/** Industry event nodes for 前沿 — company blogs, lab posts, news RSS. Soft-fail. */

const FETCH_TIMEOUT_MS = 15000;
const EVENT_CAP = 6;
const EVENT_DAYS = 7;
const EVENT_MIN_SCORE = 3;

const SOURCES = [
  {
    id: "pi-blog",
    urls: ["https://www.pi.website/blog", "https://www.physicalintelligence.company/blog"],
    who: "Physical Intelligence",
    source: "lab",
  },
  {
    id: "figure",
    urls: ["https://www.figure.ai/news", "https://www.figure.ai/blog"],
    who: "Figure AI",
    source: "company",
  },
  {
    id: "1x",
    urls: ["https://www.1x.tech/discover"],
    who: "1X",
    source: "company",
  },
  {
    id: "nvidia-robotics",
    urls: ["https://developer.nvidia.com/blog/tag/robotics/"],
    who: "NVIDIA",
    source: "lab",
  },
  {
    id: "deepmind",
    urls: ["https://deepmind.google/discover/blog/"],
    who: "Google DeepMind",
    source: "lab",
    titleFilter: /robot|robotics|embodied|gemini robotics/i,
  },
  {
    id: "hf-blog",
    urls: ["https://huggingface.co/blog"],
    who: "Hugging Face",
    source: "lab",
    titleFilter: /gr00t|nvidia|robot|embodied|isaac/i,
  },
  {
    id: "gnews",
    urls: [
      "https://news.google.com/rss/search?q=Figure+AI+OR+%22Physical+Intelligence%22+OR+1X+NEO+OR+GR00T+OR+%22embodied+AI%22+when:7d&hl=en-US&gl=US&ceid=US:en",
    ],
    who: "Industry",
    source: "news",
    rss: true,
  },
];

const WATCHLIST = [
  { re: /\bBrett\s+Adcock\b|Figure\s*AI|\bFigure\b/i, who: "Figure", w: 3 },
  { re: /\bScott\s+Walter\b/i, who: "Scott Walter", w: 2 },
  { re: /Physical\s*Intelligence|\bπ0\b|\bpi0\b|Chelsea\s+Finn|Sergey\s+Levine|Karol\s+Hausman/i, who: "Physical Intelligence", w: 3 },
  { re: /\bBernt\s+Bornich\b|\b1X\b|\bNEO\b/i, who: "1X", w: 3 },
  { re: /\bElon\s+Musk\b|\bOptimus\b/i, who: "Optimus", w: 3 },
  { re: /\bJim\s+Fan\b/i, who: "Jim Fan", w: 2 },
  { re: /\bHelix\b/i, who: "Figure Helix", w: 2 },
  { re: /\bJensen\s+Huang\b|NVIDIA.*(robot|Isaac|GR00T)|Isaac\s*GR00T|\bGR00T\b/i, who: "NVIDIA", w: 3 },
  { re: /DeepMind|Gemini\s*Robotics/i, who: "DeepMind", w: 3 },
  { re: /\bAgility\b|\bDigit\b/i, who: "Agility", w: 2 },
  { re: /\bApptronik\b/i, who: "Apptronik", w: 2 },
  { re: /\bUnitree\b|宇树/i, who: "Unitree", w: 2 },
  { re: /\bFourier\b|傅里叶/i, who: "Fourier", w: 2 },
  { re: /\bAgibot\b|智元/i, who: "Agibot", w: 2 },
  { re: /\bGalaxea\b/i, who: "Galaxea", w: 2 },
  { re: /\bSkild\b/i, who: "Skild", w: 2 },
  { re: /World\s*Labs|Fei-?Fei\s+Li|李飞飞/i, who: "World Labs", w: 2 },
];

const EVENT_PLUS = [
  { re: /\blaunch(es|ed|ing)?\b|\brelease[sd]?\b|\bannounce[sd]?\b|\bunveils?\b|\bshipping\b/i, w: 3 },
  { re: /\bproduct\b|\bHelix\b|\bNEO\b|\bOptimus\b|\bGR00T\b|\bπ0\b|\bpi0\b/i, w: 3 },
  { re: /world\s*model|具身|embodied|robotics?/i, w: 2 },
  { re: /\bSeries\s*[A-D]\b|\bfunding\b|\braises?\b/i, w: 1, funding: true },
];

const EVENT_DROP =
  /\bhiring\b|\bwe'?re\s+hiring\b|\bjob\s+opening|\bhow\s+to\s+buy\b|\bcoupon\b|\btutorial\b|\bfor\s+beginners\b|\bcheat\s+sheet\b|招聘|教程|优惠券|怎么买/i;

function decodeXml(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function inner(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m = re.exec(block);
  return m ? decodeXml(m[1]) : "";
}

export function hashUrl(url) {
  let h = 2166136261;
  const s = String(url || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function shanghaiYmd(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDaysYmd(ymd, delta) {
  const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function ymdFromAny(raw) {
  if (!raw) return "";
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return shanghaiYmd(d);
  const m = String(raw).match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return "";
}

export function isEventJunk(title, summary = "") {
  const blob = `${title || ""} ${summary || ""}`;
  return EVENT_DROP.test(blob);
}

export function scoreEvent(ev) {
  const title = String(ev?.title || "");
  const summary = String(ev?.summary || "");
  const blob = `${title} ${summary}`;
  const tags = ["行业事件"];
  let score = 0;
  let watchHit = false;
  let plusHit = false;
  let fundingOnly = false;

  if (isEventJunk(title, summary)) {
    return { score: 0, tags, drop: true, plusHit: false, whoHint: "" };
  }

  let whoHint = "";
  for (const w of WATCHLIST) {
    if (w.re.test(blob)) {
      score += w.w;
      watchHit = true;
      if (!whoHint) whoHint = w.who;
      if (w.who && !tags.includes(w.who)) tags.push(w.who);
    }
  }

  let hasTechPlus = false;
  for (const p of EVENT_PLUS) {
    if (!p.re.test(blob)) continue;
    if (p.funding) {
      fundingOnly = true;
      score += p.w;
      continue;
    }
    score += p.w * (p.re.test(title) ? 2 : 1);
    plusHit = true;
    hasTechPlus = true;
  }

  // Prefer technical product over pure fundraising
  if (fundingOnly && !hasTechPlus && !watchHit) {
    return { score: 0, tags, drop: true, plusHit: false, whoHint };
  }
  if (fundingOnly && !hasTechPlus && watchHit) {
    score = Math.min(score, 2); // weak unless technical
  }

  const qualify = (watchHit && score >= EVENT_MIN_SCORE) || (plusHit && watchHit) || score >= EVENT_MIN_SCORE + 2;
  if (!qualify) {
    return { score, tags, drop: false, plusHit: false, whoHint };
  }
  return { score, tags: tags.slice(0, 5), drop: false, plusHit: true, whoHint };
}

export function filterEvents(events, { cap = EVENT_CAP, minScore = EVENT_MIN_SCORE } = {}) {
  const seen = new Set();
  const scored = [];
  for (const e of events || []) {
    const url = String(e.url || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const info = scoreEvent(e);
    if (info.drop || !info.plusHit) continue;
    if (info.score < minScore) continue;
    scored.push({ event: e, ...info });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(b.event.date || "").localeCompare(String(a.event.date || ""));
  });
  return scored.slice(0, cap);
}

function firstSentence(text, max = 80) {
  let t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const m = t.match(/^([\s\S]{8,}?[。！!]|[\s\S]{12,}?[.．])(?:\s|$)/);
  let s = m ? m[1].trim() : t;
  if (s.length > max) s = s.slice(0, max).replace(/[,，;；:\s]+$/, "") + "…";
  return s;
}

export function mapEventToCard(ev, info = {}) {
  const url = String(ev.url || "").trim();
  const who = info.whoHint || ev.who || "Industry";
  const tags = (info.tags || ["行业事件"]).slice(0, 4);
  if (!tags.includes("行业事件")) tags.unshift("行业事件");
  return {
    id: "evt-" + hashUrl(url),
    kind: "event",
    date: ev.date || "",
    who,
    role: ev.role || (ev.source === "news" ? "行业新闻" : "公司/实验室"),
    title: ev.title || "",
    why: firstSentence(ev.summary || ev.title || "", 80),
    url,
    source: ev.source || "news",
    tags: tags.slice(0, 5),
  };
}

export function parseRssItems(xml) {
  const text = String(xml || "");
  const items = [];
  // RSS <item>
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(text))) {
    const block = m[1];
    const title = inner(block, "title");
    let link = inner(block, "link");
    if (!link) {
      const lm = /<link[^>]*href="([^"]+)"/i.exec(block);
      link = lm ? lm[1] : "";
    }
    // Google News often uses <link>text</link>
    const pub =
      inner(block, "pubDate") ||
      inner(block, "published") ||
      inner(block, "dc:date") ||
      "";
    const summary = inner(block, "description") || inner(block, "summary") || "";
    if (title && link) {
      items.push({ title, url: link.trim(), date: ymdFromAny(pub), summary: decodeXml(summary) });
    }
  }
  // Atom <entry>
  const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  while ((m = entryRe.exec(text))) {
    const block = m[1];
    const title = inner(block, "title");
    let link = "";
    const href = /<link[^>]*href="([^"]+)"/i.exec(block);
    if (href) link = href[1];
    if (!link) link = inner(block, "id");
    const pub = inner(block, "published") || inner(block, "updated") || "";
    const summary = inner(block, "summary") || inner(block, "content") || "";
    if (title && link) {
      items.push({ title, url: link.trim(), date: ymdFromAny(pub), summary: decodeXml(summary) });
    }
  }
  return items;
}

function absolutize(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/** Heuristic HTML listing parser: links + nearby dates. */
export function parseHtmlListing(html, baseUrl, { titleFilter = null } = {}) {
  const text = String(html || "");
  const items = [];
  const seen = new Set();

  // Prefer article cards: <a href>…</a> with substantial text
  const aRe = /<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = aRe.exec(text))) {
    const href = m[1];
    const rawTitle = decodeXml(m[2]);
    if (!rawTitle || rawTitle.length < 12 || rawTitle.length > 200) continue;
    if (/^(home|blog|news|read more|learn more|subscribe|sign up|login|menu)$/i.test(rawTitle)) continue;
    if (titleFilter && !titleFilter.test(rawTitle)) continue;
    let url;
    try {
      url = absolutize(href, baseUrl);
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(url)) continue;
    if (seen.has(url)) continue;
    // skip pure nav / asset links
    if (/\.(css|js|png|jpg|svg|ico|woff2?)(\?|$)/i.test(url)) continue;
    if (/\/(tag|tags|category|author|page)\//i.test(url) && rawTitle.length < 40) continue;

    // Look for a date near this match
    const around = text.slice(Math.max(0, m.index - 280), m.index + m[0].length + 280);
    const dateMatch =
      around.match(/datetime=["']([^"']+)["']/i) ||
      around.match(/\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})\b/) ||
      around.match(/\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2})\b/i);
    const date = dateMatch ? ymdFromAny(dateMatch[1]) : "";

    seen.add(url);
    items.push({ title: rawTitle, url, date, summary: "" });
    if (items.length >= 40) break;
  }
  return items;
}

async function fetchText(url, fetchImpl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/rss+xml,application/atom+xml,application/xml,text/html,text/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "HuoshuFrontier/0.4.14 (+research feed)",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOneSource(src, fetchImpl) {
  const collected = [];
  for (const url of src.urls || []) {
    try {
      const body = await fetchText(url, fetchImpl);
      let parsed = [];
      if (src.rss || /<(rss|feed)\b/i.test(body.slice(0, 800)) || /<item\b/i.test(body)) {
        parsed = parseRssItems(body);
      } else {
        parsed = parseHtmlListing(body, url, { titleFilter: src.titleFilter || null });
      }
      for (const p of parsed) {
        collected.push({
          ...p,
          who: src.who,
          source: src.source,
          role: src.who,
        });
      }
      if (collected.length) break; // first working URL wins
    } catch {
      /* try next mirror */
    }
  }
  return collected;
}

export async function fetchEvents({ days = EVENT_DAYS, fetchImpl = fetch, asOf } = {}) {
  const as_of = asOf || shanghaiYmd();
  const cutoff = addDaysYmd(as_of, -Number(days) || -EVENT_DAYS);
  const settled = await Promise.allSettled(SOURCES.map((s) => fetchOneSource(s, fetchImpl)));
  const merged = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) merged.push(...r.value);
  }

  const inWindow = merged.filter((e) => {
    if (!e.date) {
      // undated lab posts: keep only if title looks strong; assign as_of
      e.date = as_of;
      return true;
    }
    return e.date >= cutoff && e.date <= as_of;
  });

  const ranked = filterEvents(inWindow, { cap: EVENT_CAP });
  return ranked.map((row) => mapEventToCard(row.event, row));
}

export { EVENT_CAP, EVENT_DAYS, EVENT_MIN_SCORE, SOURCES };
