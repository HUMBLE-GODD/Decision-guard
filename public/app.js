const $ = (selector) => document.querySelector(selector);

const api = async (path, options = {}) => {
  const response = await fetch(path, { headers: { "content-type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
};

const setText = (selector, value) => { $(selector).textContent = value; };
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
let graphNodeData = new Map();
let graphLinks = [];

const savedAgentId = localStorage.getItem("decisionguard-agent");
if (savedAgentId) $("#agent-input").value = savedAgentId;

async function loadStatus() {
  try {
    const data = await api("/api/v1/status");
    const stats = data.stats || {};
    setText("#metric-memories", stats.totalMemories ?? "0");
    setText("#metric-synapses", stats.totalSynapses ?? "0");
    setText("#metric-agents", stats.agents ?? "0");
    setText("#metric-resonance", stats.avgResonance ?? "0.00");
    setText("#metric-memory-note", `${stats.memoryByStatus?.[0]?.status || "active"} graph`);
    setText("#hero-status", "Engine online");
    setText("#hero-status-detail", "Memory and decision APIs responding");
    setText("#status-badge", "Healthy");
    $("#status-lines").innerHTML = `<div><span>Database</span><strong>Connected</strong></div><div><span>Embedding engine</span><strong>Ollama / mxbai</strong></div><div><span>LLM provider</span><strong>Groq</strong></div>`;
  } catch (error) {
    setText("#hero-status", "Engine unavailable");
    setText("#hero-status-detail", error.message);
    setText("#status-badge", "Offline");
    $("#status-lines").innerHTML = `<div><span>Database</span><strong class="error">Unavailable</strong></div><div><span>Embedding engine</span><strong>Ollama / mxbai</strong></div><div><span>LLM provider</span><strong>Groq</strong></div>`;
  }
}

function renderPreflight(data) {
  const classification = data.classification || {};
  const related = data.related || [];
  const weightClass = classification.weight === "heavy" ? "heavy" : "";
  const relatedMarkup = related.length ? `<div class="related-title">Related decisions</div>${related.map((item) => `<div class="related-item"><strong>${escapeHtml(item.id)}</strong><span>${escapeHtml(item.title)}${item.why ? ` — ${escapeHtml(item.why)}` : ""}</span></div>`).join("")}` : `<div class="related-title">Related decisions</div><div class="empty-state">No matching decisions found.</div>`;
  $("#preflight-result").innerHTML = `<div class="classification"><span class="weight-pill ${weightClass}">${escapeHtml(classification.weight || "standard")}</span><span>${escapeHtml(classification.category || "general")} · ${escapeHtml(classification.reason || "")}</span></div>${relatedMarkup}`;
}

function renderSearch(data) {
  const results = data.results || [];
  if (!results.length) { $("#search-result").innerHTML = `<div class="empty-state"><span class="empty-icon">◌</span><span>No memory matched that question.</span></div>`; return; }
  $("#search-result").innerHTML = `<div class="result-summary"><strong>${results.length}</strong> memories recalled <span>·</span> labile window opened</div>${results.map((item) => `<article class="result-card"><div class="result-card-top"><span>${escapeHtml(item.sourceType || "memory")} · #${escapeHtml(item.id)}</span><span class="score">${Number(item.score || 0).toFixed(2)} resonance</span></div><p>${escapeHtml(item.content)}</p></article>`).join("")}`;
}

const graphColors = { strategic: "#9ee6bd", technical: "#83b8e8", operational: "#f3c77b", research: "#d2a3e8", communication: "#e59b9b", identity: "#e6c08c", environmental: "#9dc4b0", creative: "#e6a3c1" };
const graphColor = (category) => graphColors[category] || "#91a49a";

function graphPosition(index, total) {
  if (total === 1) return { x: 450, y: 190 };
  const columns = Math.ceil(Math.sqrt(total * 1.6));
  const rows = Math.ceil(total / columns);
  const gapX = 760 / Math.max(1, columns - 1);
  const gapY = 290 / Math.max(1, rows - 1);
  return { x: 70 + (index % columns) * gapX, y: rows === 1 ? 195 : 50 + Math.floor(index / columns) * gapY };
}

function inspectGraphNode(node) {
  if (!node) return;
  const linked = [...graphNodeData.values()].filter((candidate) => graphLinks.some((link) => (link.memoryA === node.id && link.memoryB === candidate.id) || (link.memoryB === node.id && link.memoryA === candidate.id)));
  $("#graph-inspector").innerHTML = `<p class="eyebrow">Node inspector</p><strong>Memory #${escapeHtml(node.id)}</strong><span class="inspector-category" style="color:${graphColor(node.category)}">${escapeHtml(node.category || "memory")}</span><p>${escapeHtml(node.content || "No content preview available.")}</p><div class="inspector-meta"><span>Source <b>${escapeHtml(node.sourceType || "unknown")}</b></span><span>Resonance <b>${Number(node.resonanceScore || 0).toFixed(2)}</b></span><span>Links <b>${linked.length}</b></span></div>`;
}

function renderGraph(data) {
  const nodes = data.nodes || [];
  graphLinks = data.synapses || [];
  const positions = new Map(nodes.map((node, index) => [node.id, graphPosition(index, nodes.length)]));
  graphNodeData = new Map(nodes.map((node) => [node.id, node]));
  setText("#graph-count", `${nodes.length} ${nodes.length === 1 ? "memory" : "memories"}`);
  setText("#graph-stats", `${nodes.length} nodes · ${graphLinks.length} visible links · ${data.stats?.totalSynapses ?? graphLinks.length} total links`);
  $("#graph-empty").hidden = nodes.length > 0;
  $("#graph-canvas").style.opacity = nodes.length > 0 ? "1" : "0.22";
  $("#graph-links").innerHTML = graphLinks.map((link) => { const from = positions.get(link.memoryA); const to = positions.get(link.memoryB); if (!from || !to) return ""; return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#6e9982" stroke-opacity="${Math.max(.25, Math.min(.8, Number(link.connectionStrength || .4)))}" stroke-width="${Math.max(1, Number(link.connectionStrength || .4) * 3)}" marker-end="url(#graph-arrow)"></line>`; }).join("");
  $("#graph-nodes").innerHTML = nodes.map((node) => { const point = positions.get(node.id); const color = graphColor(node.category); const label = String(node.content || `Memory ${node.id}`).replace(/\s+/g, " ").slice(0, 25); return `<g class="graph-node" data-node-id="${escapeHtml(node.id)}" tabindex="0" role="button" aria-label="Memory ${escapeHtml(node.id)}: ${escapeHtml(label)}"><circle cx="${point.x}" cy="${point.y}" r="${node.priority === 0 ? 14 : 10}" fill="#10201a" stroke="${color}" stroke-width="2"></circle><circle cx="${point.x}" cy="${point.y}" r="4" fill="${color}"></circle><text x="${point.x}" y="${point.y + 29}" text-anchor="middle">${escapeHtml(label)}</text></g>`; }).join("");
  if (!nodes.length) $("#graph-inspector").innerHTML = `<p class="eyebrow">Node inspector</p><strong>Graph awaiting memories</strong><p>Use the memory search or ingestion API to add related memories for this agent.</p>`;
}

async function loadGraph() {
  const agentId = $("#agent-input").value.trim();
  if (!agentId) return;
  try { renderGraph(await api(`/api/v1/graph?agentId=${encodeURIComponent(agentId)}&limit=120`)); } catch (error) { setText("#graph-count", "Unavailable"); $("#graph-stats").innerHTML = `<span class="error">${escapeHtml(error.message)}</span>`; $("#graph-empty").hidden = false; }
}

$("#preflight-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const button = event.currentTarget.querySelector("button"); const description = $("#decision-input").value.trim(); if (!description) return;
  button.disabled = true; button.querySelector("span").textContent = "Checking…";
  try { renderPreflight(await api("/api/v1/decisions/preview", { method: "POST", body: JSON.stringify({ description }) })); } catch (error) { $("#preflight-result").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } finally { button.disabled = false; button.querySelector("span").textContent = "Run preflight"; }
});

$("#search-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const button = event.currentTarget.querySelector("button"); const query = $("#search-input").value.trim(); const agentId = $("#agent-input").value.trim(); if (!query || !agentId) return;
  button.disabled = true; button.textContent = "…";
  try { renderSearch(await api("/api/v1/search", { method: "POST", body: JSON.stringify({ query, agentId, limit: 3 }) })); } catch (error) { $("#search-result").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; } finally { button.disabled = false; button.textContent = "→"; }
});

$("#graph-nodes").addEventListener("click", (event) => { const target = event.target.closest(".graph-node"); if (target) inspectGraphNode(graphNodeData.get(Number(target.dataset.nodeId))); });
$("#graph-nodes").addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); const target = event.target.closest(".graph-node"); if (target) inspectGraphNode(graphNodeData.get(Number(target.dataset.nodeId))); } });
$("#agent-input").addEventListener("input", (event) => { localStorage.setItem("decisionguard-agent", event.currentTarget.value.trim()); });
$("#refresh-button").addEventListener("click", () => { loadStatus(); loadGraph(); });
$("#graph-refresh-button").addEventListener("click", loadGraph);
loadStatus();
loadGraph();
