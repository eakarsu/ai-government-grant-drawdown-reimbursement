// Feature pack: search/filter, CSV/JSON export, and deterministic offline domain insights over the app's own records.
// No provider call is made here; insights are labelled aiGenerated:false.
export function filterRecords(records, { q = "", status = "", risk = "" } = {}) {
  const needle = String(q || "").trim().toLowerCase();
  return (records || []).filter((r) => {
    if (status && String(r.status ?? r.state ?? "") !== status) return false;
    if (risk && String(r.risk ?? "") !== risk) return false;
    if (!needle) return true;
    return JSON.stringify(r ?? {}).toLowerCase().includes(needle);
  });
}
export function toCsv(records) {
  const rows = records || [];
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r || {})))];
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}
export function formatValue(value) {
  if (value === false) return "No";
  if (value === true) return "Yes";
  if (value === 0) return "0";
  if (value === null || value === undefined || value === "") return "Not provided";
  return String(value);
}
const DOMAIN = ["Drawdown exposure summary", "Reimbursement aging review", "High-risk grant blockers"];
export function buildInsights(records) {
  const rows = records || [];
  const totalAmount = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const highRisk = rows.filter((r) => ["High", "Critical"].includes(String(r.risk || ""))).length;
  const now = Date.now();
  const overdue = rows.filter((r) => r.due_date && Date.parse(r.due_date) < now && !["Closed","closed","approved","DONE"].includes(String(r.status ?? r.state ?? ""))).length;
  const open = rows.filter((r) => !["Closed","closed","DONE"].includes(String(r.status ?? r.state ?? ""))).length;
  const zeroAmount = rows.filter((r) => Number(r.amount) === 0).length;
  const mk = (id, title, summary, metrics) => ({ id, title, summary, aiGenerated: false, source: "deterministic-fallback", label: "Offline deterministic insight (not AI-generated)", metrics });
  return {
    aiGenerated: false, source: "deterministic-fallback", label: "Offline deterministic insight (not AI-generated)",
    counts: { total: rows.length, open, highRisk, overdue, totalAmount, zeroAmount },
    insights: [
      mk("exposure", DOMAIN[0], `${rows.length} record(s); ${highRisk} high-risk; total amount ${totalAmount}.`, [{label:"Records",value:rows.length},{label:"High risk",value:highRisk},{label:"Total amount",value:totalAmount}]),
      mk("blockers", DOMAIN[1], `${overdue} overdue open record(s) need review.`, [{label:"Overdue open",value:overdue},{label:"Open",value:open}]),
      mk("concentration", DOMAIN[2], `${zeroAmount} record(s) with amount 0 were preserved, not dropped.`, [{label:"Zero-amount records",value:zeroAmount},{label:"Total amount",value:totalAmount}]),
    ],
  };
}
export function mountFeaturePack(app, { fetchRecords, guard }) {
  const g = typeof guard === "function" ? guard : (_req,_res,next)=>next();
  app.get("/api/feature-pack/search", g, async (req, res, next) => { try { const rows = await fetchRecords(); res.json({ items: filterRecords(rows, { q: req.query.q, status: req.query.status, risk: req.query.risk }), total: rows.length }); } catch(e){ next(e); } });
  app.get("/api/feature-pack/export", g, async (req, res, next) => { try { const rows = filterRecords(await fetchRecords(), { q: req.query.q, status: req.query.status, risk: req.query.risk }); const fmt = String(req.query.format||"json").toLowerCase(); if (fmt==="csv") { res.setHeader("Content-Type","text/csv"); res.setHeader("Content-Disposition","attachment; filename=\"records.csv\""); return res.send(toCsv(rows)); } res.setHeader("Content-Disposition","attachment; filename=\"records.json\""); return res.json({ items: rows }); } catch(e){ next(e); } });
  app.post("/api/feature-pack/insights", g, async (req, res, next) => { try { const out = buildInsights(await fetchRecords()); const kind = req.body?.kind; res.json(kind ? { ...out, insights: out.insights.filter(i=>i.id===kind) } : out); } catch(e){ next(e); } });
}
