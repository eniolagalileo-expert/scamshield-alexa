// Tavily web search + page extraction.

const BASE = (process.env.TAVILY_BASE_URL || "https://api.tavily.com").replace(/\/+$/, "");
const KEY = process.env.TAVILY_API_KEY || "";

export const searchEnabled = () => Boolean(KEY);

async function post(path, body, timeoutMs = 30_000) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    console.error(`Tavily ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  return res.json();
}

export async function webSearch(query, { includeDomains, topic, timeRange, maxResults = 5 } = {}) {
  if (!KEY) return { error: "Web search is offline (TAVILY_API_KEY not set).", results: [] };
  const body = { query, search_depth: "basic", max_results: maxResults, include_answer: "basic" };
  if (includeDomains?.length) body.include_domains = includeDomains;
  if (topic) body.topic = topic;
  if (timeRange) body.time_range = timeRange;
  const data = await post("/search", body);
  if (!data) return { error: "Search failed.", results: [] };
  return {
    answer: String(data.answer || "").slice(0, 600),
    results: (data.results || []).slice(0, maxResults).map((r) => ({
      title: String(r.title || "").slice(0, 120),
      url: String(r.url || ""),
      content: String(r.content || "").slice(0, 400),
      published: r.published_date || null,
    })),
  };
}

// Reads a page and returns the chunks most relevant to `query`.
export async function extractPage(url, query) {
  if (!KEY) return { error: "Page reading is offline (TAVILY_API_KEY not set)." };
  const data = await post("/extract", { urls: [url], query, chunks_per_source: 3, extract_depth: "basic", format: "text" });
  const hit = data?.results?.[0];
  if (!hit) return { error: data?.failed_results?.[0]?.error || "Could not read the page." };
  return { url: hit.url, content: String(hit.raw_content || "").slice(0, 2500) };
}

// Reads several pages in one request; returns { url, content } for each page that could be read.
export async function extractPages(urls, query) {
  if (!KEY || !urls.length) return [];
  const data = await post("/extract", { urls: urls.slice(0, 5), query, chunks_per_source: 3, extract_depth: "basic", format: "text" });
  return (data?.results || []).map((r) => ({ url: r.url, content: String(r.raw_content || "").slice(0, 2500) }));
}
