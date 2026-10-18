import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import "./styles.css";

type LinkItem = { id: string; name: string; gametora_url?: string | null; reason: string };
type DeckSlot = {
  support_id: string;
  name: string;
  gametora_url: string | null;
  owned: boolean | null;
  limit_break: number | null;
  effective_level: number | null;
  role: string;
  reason: string;
  effects: string[];
  skills: string[];
  borrowed_from?: string | null;
};
type Recommendation = {
  server: "ja" | "global";
  scenario: string;
  target: string;
  generated_at: string;
  evidence_checked_at: string;
  trainee: LinkItem;
  deck: DeckSlot[];
  legacy_candidates: { id: string | null; name: string; gametora_url: string | null; reason: string; factors: string[]; skills: string[]; owned: boolean | null }[];
  stat_priorities: { name: string; target?: string | null; reason: string }[];
  skill_priorities: { name: string; target?: string | null; reason: string }[];
  alternatives: { label: string; changes: string; tradeoff: string }[];
  assumptions: string[];
  confidence: { level: "high" | "medium" | "low"; explanation: string };
  sources: { url: string; title: string; source_type: "game_data" | "official" | "community" | "inference"; context: string; retrieved_at: string; confidence_note: string }[];
};

function parseRecommendation(result: unknown): Recommendation | null {
  if (!result || typeof result !== "object") return null;
  const envelope = result as { structuredContent?: unknown; content?: { type?: string; text?: string }[] };
  if (envelope.structuredContent && typeof envelope.structuredContent === "object") return envelope.structuredContent as Recommendation;
  const text = envelope.content?.find((item) => item.type === "text")?.text;
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { structuredContent?: Recommendation };
    return parsed.structuredContent || null;
  } catch {
    return null;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function Ownership({ item }: { item: Pick<DeckSlot, "owned" | "limit_break" | "borrowed_from"> }) {
  if (item.owned === null) return <span className="ownership unknown">Ownership unknown</span>;
  if (!item.owned) return <span className="ownership rental">Rental{item.borrowed_from ? ` · ${item.borrowed_from}` : ""}</span>;
  return <span className="ownership owned">Owned{item.limit_break === null ? " · LB unknown" : ` · LB${item.limit_break}`}</span>;
}

function ExternalLink({ href, children }: { href?: string | null; children: React.ReactNode }) {
  if (!href) return <span>{children}</span>;
  return <a href={href} target="_blank" rel="noreferrer">{children}<span className="external-mark" aria-hidden="true"> ↗</span></a>;
}

function AppView() {
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [refinement, setRefinement] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const { app, isConnected, error } = useApp({
    appInfo: { name: "Umamusume Build Advisor", version: "0.2.0" },
    capabilities: {},
    onAppCreated: (createdApp) => {
      createdApp.ontoolresult = (result) => {
        const next = parseRecommendation(result);
        if (next?.deck?.length === 6) {
          setRecommendation(next);
          setMessage("");
        }
      };
    },
  });

  const bySource = useMemo(() => {
    if (!recommendation) return [];
    const order = ["community", "official", "game_data", "inference"];
    return [...recommendation.sources].sort((a, b) => order.indexOf(a.source_type) - order.indexOf(b.source_type));
  }, [recommendation]);

  async function askToRevise(mode: "revise" | "compare") {
    if (!app || !recommendation) return;
    const direction = refinement.trim();
    const action = mode === "compare"
      ? "Compare the current recommendation against its listed alternatives and explain which is better for my stated goal. Re-check current Japanese-server strategy sources before answering."
      : "Recalculate this build using the requested change. Re-check the selected server catalog and current Japanese-server strategy sources; preserve six support slots and explain substitutions and tradeoffs.";
    const prompt = [
      action,
      direction ? `My requested change or preference: ${direction}` : "No additional preference was entered; use the details below and ask only if a critical training constraint is missing.",
      "Current recommendation context:",
      JSON.stringify(recommendation),
    ].join("\n\n");
    setSending(true);
    setMessage("");
    try {
      const result = await app.sendMessage({ role: "user", content: [{ type: "text", text: prompt }] });
      setMessage(result.isError ? "ChatGPT could not accept that follow-up. You can ask in chat using the recommendation above." : "Follow-up sent to this chat.");
      if (!result.isError) setRefinement("");
    } catch {
      setMessage("This host could not send a chat follow-up. You can ask in chat using the recommendation above.");
    } finally {
      setSending(false);
    }
  }

  if (error) return <main className="shell"><div className="notice error">The build view could not connect to ChatGPT: {error.message}</div></main>;
  if (!recommendation) return (
    <main className="shell empty-state">
      <div className="eyebrow">UMAMUSUME · BUILD ADVISOR</div>
      <h1>Your build, backed by the catalog</h1>
      <p>Ask for a Japanese-server build with a trainee, scenario, target distance and strategy. The advisor will read the local catalog and inventory, check current strategy sources, and present a six-card deck with legacy options here.</p>
      <div className="setup-note">{isConnected ? "Connected · waiting for a recommendation" : "Connecting to the advisor…"}</div>
    </main>
  );

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <div className="eyebrow">{recommendation.server === "ja" ? "JAPANESE SERVER" : "GLOBAL SERVER"} · {recommendation.scenario}</div>
          <h1>{recommendation.trainee.name}</h1>
          <p className="hero-reason"><ExternalLink href={recommendation.trainee.gametora_url}>{recommendation.target}</ExternalLink> · {recommendation.trainee.reason}</p>
        </div>
        <div className={`confidence ${recommendation.confidence.level}`}><span>{recommendation.confidence.level} confidence</span><p>{recommendation.confidence.explanation}</p></div>
      </header>

      <section className="section">
        <div className="section-heading"><div><div className="eyebrow">TRAINING DECK</div><h2>Six support slots</h2></div><span className="count">6 CARDS</span></div>
        <div className="deck-grid">
          {recommendation.deck.map((slot, index) => (
            <article className="support-card" key={`${slot.support_id}-${index}`}>
              <div className="card-top"><span className="slot-number">{String(index + 1).padStart(2, "0")}</span><Ownership item={slot} /></div>
              <h3><ExternalLink href={slot.gametora_url}>{slot.name}</ExternalLink></h3>
              <div className="role">{slot.role}</div>
              <p>{slot.reason}</p>
              {(slot.effective_level !== null || slot.limit_break !== null) && <div className="level">{slot.effective_level !== null ? `Level ${slot.effective_level}` : ""}{slot.effective_level !== null && slot.limit_break !== null ? " · " : ""}{slot.limit_break !== null ? `LB${slot.limit_break}` : ""}</div>}
              {slot.effects.length > 0 && <div className="chip-row">{slot.effects.map((effect) => <span className="chip" key={effect}>{effect}</span>)}</div>}
              {slot.skills.length > 0 && <div className="micro-list"><b>Useful skills</b><span>{slot.skills.join(" · ")}</span></div>}
            </article>
          ))}
        </div>
      </section>

      <div className="detail-grid">
        <section className="section panel">
          <div className="section-heading"><div><div className="eyebrow">INHERITANCE</div><h2>Legacy candidates</h2></div></div>
          {recommendation.legacy_candidates.length ? <div className="stack-list">{recommendation.legacy_candidates.map((legacy, index) => (
            <article className="legacy-item" key={`${legacy.id}-${index}`}>
              <div className="legacy-title"><h3><ExternalLink href={legacy.gametora_url}>{legacy.name}</ExternalLink></h3><span className={`ownership ${legacy.owned === null ? "unknown" : legacy.owned ? "owned" : "rental"}`}>{legacy.owned === null ? "Ownership unknown" : legacy.owned ? "Owned" : "Not owned"}</span></div>
              <p>{legacy.reason}</p>
              {[...legacy.factors, ...legacy.skills].length > 0 && <div className="chip-row">{[...legacy.factors, ...legacy.skills].map((item) => <span className="chip" key={item}>{item}</span>)}</div>}
            </article>
          ))}</div> : <p className="muted">No legacy candidates were supplied.</p>}
        </section>

        <section className="section panel">
          <div className="section-heading"><div><div className="eyebrow">TRAINING PLAN</div><h2>Priorities</h2></div></div>
          <div className="priority-block"><h3>Stats</h3>{recommendation.stat_priorities.map((item, i) => <p key={`${item.name}-${i}`}><b>{item.name}{item.target ? ` · ${item.target}` : ""}</b><span>{item.reason}</span></p>)}</div>
          <div className="priority-block"><h3>Skills</h3>{recommendation.skill_priorities.map((item, i) => <p key={`${item.name}-${i}`}><b>{item.name}{item.target ? ` · ${item.target}` : ""}</b><span>{item.reason}</span></p>)}</div>
        </section>
      </div>

      {recommendation.alternatives.length > 0 && <section className="section panel">
        <div className="section-heading"><div><div className="eyebrow">SWAP OPTIONS</div><h2>Alternatives and tradeoffs</h2></div></div>
        <div className="alternative-grid">{recommendation.alternatives.map((item, index) => <article className="alternative" key={`${item.label}-${index}`}><h3>{item.label}</h3><p><b>Change</b>{item.changes}</p><p><b>Tradeoff</b>{item.tradeoff}</p></article>)}</div>
      </section>}

      <section className="section panel refine-panel">
        <div className="section-heading"><div><div className="eyebrow">COMPARE OR RECALCULATE</div><h2>Adjust the build</h2></div></div>
        <label htmlFor="refinement">Optional preference or constraint</label>
        <textarea id="refinement" rows={3} value={refinement} onChange={(event) => setRefinement(event.target.value)} placeholder="For example: I prefer fewer borrowed cards, or I need a stamina-heavy deck for a long-distance race." />
        <div className="action-row"><button type="button" onClick={() => void askToRevise("revise")} disabled={!isConnected || sending}>{sending ? "Sending…" : "Recalculate in chat"}</button><button className="secondary" type="button" onClick={() => void askToRevise("compare")} disabled={!isConnected || sending}>Compare alternatives</button></div>
        {message && <p className="status-message" role="status">{message}</p>}
      </section>

      {recommendation.assumptions.length > 0 && <section className="section panel"><div className="section-heading"><div><div className="eyebrow">READ THIS FIRST</div><h2>Assumptions and gaps</h2></div></div><ul className="assumptions">{recommendation.assumptions.map((item, i) => <li key={`${i}-${item}`}>{item}</li>)}</ul></section>}

      <section className="section panel evidence-panel">
        <div className="section-heading"><div><div className="eyebrow">SOURCES</div><h2>Evidence used</h2></div><span className="checked-at">Checked {formatDate(recommendation.evidence_checked_at)}</span></div>
        <div className="source-list">{bySource.map((source, index) => <article className="source-item" key={`${source.url}-${index}`}><div className={`source-tag ${source.source_type}`}>{source.source_type.replace("_", " ")}</div><div><h3><ExternalLink href={source.url}>{source.title}</ExternalLink></h3><p>{source.context}</p><span>{source.confidence_note} · {formatDate(source.retrieved_at)}</span></div></article>)}</div>
      </section>
      <footer>Recommendation generated {formatDate(recommendation.generated_at)} · Catalog facts and live strategy advice are cited separately.</footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<AppView />);
