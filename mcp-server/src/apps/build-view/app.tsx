import React, { useEffect, useMemo, useState } from "react";
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

type ImageRequest = { server: "ja" | "global"; kind: "support_card" | "trainee" | "training_type"; catalog_id: string; variant: "thumbnail" | "card" | "icon" | "portrait" };
type Artwork = { status: string; src?: string; width?: number; height?: number; reason?: string };
type ArtworkPayload = { assets?: Array<{ key?: string; status?: string; mime_type?: string; data_base64?: string; width?: number; height?: number; reason?: string }>; next_offset?: number; has_more?: boolean };
type AppBridge = NonNullable<ReturnType<typeof useApp>["app"]>;
type OpenAiBridge = { callTool?: (name: string, args: Record<string, unknown>) => Promise<unknown> };

const STAT_TYPES = [
  { key: "speed", label: "Speed", trainingTypeId: "101", aliases: ["speed"] },
  { key: "stamina", label: "Stamina", trainingTypeId: "102", aliases: ["stamina"] },
  { key: "power", label: "Power", trainingTypeId: "103", aliases: ["power"] },
  { key: "guts", label: "Guts", trainingTypeId: "105", aliases: ["guts"] },
  { key: "wit", label: "Wit", trainingTypeId: "106", aliases: ["wit", "wisdom", "intelligence"] },
  { key: "pal", label: "Pal", trainingTypeId: null, aliases: ["pal", "friend", "group"] },
] as const;

function statType(role: string) {
  const normalized = role.trim().toLowerCase();
  return STAT_TYPES.find((item) => item.aliases.some((alias) => normalized === alias || normalized.includes(alias))) || null;
}

function imageKey(request: ImageRequest): string {
  return `${request.server}:${request.kind}:${request.catalog_id}:${request.variant}`;
}

function parseArtwork(result: unknown): ArtworkPayload | null {
  if (!result || typeof result !== "object") return null;
  const envelope = result as { structuredContent?: unknown; content?: { type?: string; text?: string }[] };
  if (envelope.structuredContent && typeof envelope.structuredContent === "object") return envelope.structuredContent as ArtworkPayload;
  const text = envelope.content?.find((item) => item.type === "text")?.text;
  if (!text) return null;
  try { return JSON.parse(text) as ArtworkPayload; } catch { return null; }
}

async function callArtworkTool(app: AppBridge, requests: ImageRequest[], signal: AbortSignal): Promise<ArtworkPayload> {
  if (requests.length > 12) throw new Error("The artwork tool accepts at most twelve images per request.");
  const args = { requests, offset: 0 };
  const valid = (payload: ArtworkPayload | null) => payload?.assets?.length && typeof payload.next_offset === "number" && payload.next_offset > 0 && payload.next_offset <= requests.length && payload.assets.every((asset) => requests.some((request) => imageKey(request) === asset.key) && (asset.status !== "available" || (asset.mime_type === "image/webp" && typeof asset.data_base64 === "string")));
  let standardError: unknown;
  try {
    const result = await app.callServerTool({ name: "build.get_game_images", arguments: args }, { signal, timeout: 15000 });
    const payload = result.isError ? null : parseArtwork(result);
    if (valid(payload)) {
      return payload!;
    }
    standardError = new Error(result.isError ? "The MCP Apps image call failed." : "The MCP Apps image response was incomplete.");
  } catch (error) {
    if (signal.aborted) throw error;
    standardError = error;
  }

  if (signal.aborted) throw standardError instanceof Error ? standardError : new Error("The artwork request was cancelled.");
  const compatibilityBridge = (window as Window & { openai?: OpenAiBridge }).openai;
  if (!compatibilityBridge?.callTool) {
    throw standardError instanceof Error ? standardError : new Error("The host could not call the artwork tool.");
  }

  const result = await new Promise<unknown>((resolve, reject) => {
    const onAbort = () => finish(new Error("The artwork request was cancelled."));
    const timer = window.setTimeout(() => finish(new Error("The artwork request timed out.")), 15000);
    function finish(error?: unknown, value?: unknown) {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error); else resolve(value);
    }
    signal.addEventListener("abort", onAbort, { once: true });
    compatibilityBridge.callTool!("build.get_game_images", args).then((value) => finish(undefined, value), (error) => finish(error));
  });
  if (result && typeof result === "object" && "isError" in result && result.isError === true) {
    throw new Error("The host compatibility image call failed.");
  }
  const payload = parseArtwork(result);
  if (!valid(payload)) {
    throw new Error("The host compatibility image response was incomplete.");
  }
  return payload!;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function ArtworkImage({ artwork, className, label }: { artwork?: Artwork; className: string; label: string }) {
  if (artwork?.status === "available" && artwork.src) {
    return <img className={className} src={artwork.src} width={artwork.width} height={artwork.height} alt={label} loading="lazy" />;
  }
  return <div className={`${className} artwork-placeholder`} role="img" aria-label={`${label}: artwork unavailable`} title="Artwork unavailable on this MCP host"><span aria-hidden="true">✦</span></div>;
}

function TrainingTypeIcon({ server, role, artwork }: { server: "ja" | "global"; role: string; artwork: Record<string, Artwork> }) {
  const type = statType(role);
  if (!type?.trainingTypeId) return null;
  const image = artwork[imageKey({ server, kind: "training_type", catalog_id: type.trainingTypeId, variant: "icon" })];
  if (image?.status !== "available" || !image.src) return null;
  return <span className={`stat-icon ${type.key}`} title={`${type.label} training`}><img src={image.src} alt="" /></span>;
}

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
  const [initialArtwork, setInitialArtwork] = useState<ArtworkPayload | null>(null);
  const [artwork, setArtwork] = useState<Record<string, Artwork>>({});
  const [artworkMessage, setArtworkMessage] = useState("");
  const [refinement, setRefinement] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const { app, isConnected, error } = useApp({
    appInfo: { name: "Umamusume Build Advisor", version: "0.4.4" },
    capabilities: {},
    onAppCreated: (createdApp) => {
      createdApp.ontoolresult = (result) => {
        const next = parseRecommendation(result);
        if (next?.deck?.length === 6) {
          const meta = (result as { _meta?: { artwork?: ArtworkPayload } })._meta;
          setInitialArtwork(meta?.artwork || null);
          setRecommendation(next);
          setMessage("");
        }
      };
    },
  });

  useEffect(() => {
    if (!app || !recommendation) {
      setArtwork({});
      return;
    }
    const controller = new AbortController();
    const objectUrls: string[] = [];
    const trainingTypeIds = [...new Set(recommendation.deck
      .map((slot) => statType(slot.role)?.trainingTypeId)
      .filter((id): id is Exclude<typeof id, null | undefined> => id !== null && id !== undefined))];
    const requests: ImageRequest[] = [
      ...recommendation.deck.map((slot): ImageRequest => ({ server: recommendation.server, kind: "support_card", catalog_id: slot.support_id, variant: "portrait" })),
      { server: recommendation.server, kind: "trainee", catalog_id: recommendation.trainee.id, variant: "icon" },
      { server: recommendation.server, kind: "trainee", catalog_id: recommendation.trainee.id, variant: "portrait" },
      ...trainingTypeIds.map((catalog_id): ImageRequest => ({ server: recommendation.server, kind: "training_type", catalog_id, variant: "icon" })),
    ];
    setArtwork({});
    setArtworkMessage("");

    void (async () => {
      const resolved: Record<string, Artwork> = {};
      const accept = (payload: ArtworkPayload) => {
        for (const asset of payload.assets || []) {
          if (!asset.key || !requests.some((request) => imageKey(request) === asset.key)) continue;
          if (asset.status === "available" && asset.mime_type === "image/webp" && typeof asset.data_base64 === "string") {
            const src = URL.createObjectURL(new Blob([base64ToBytes(asset.data_base64).buffer as ArrayBuffer], { type: asset.mime_type }));
            objectUrls.push(src);
            resolved[asset.key] = { status: "available", src, width: asset.width, height: asset.height };
          } else {
            resolved[asset.key] = { status: asset.status || "unavailable", reason: asset.reason };
          }
        }
        setArtwork({ ...resolved });
      };
      // Hydrate from the presentation result without additional host calls.
      // Older hosts and budget-limited results use bounded batch continuation.
      if (initialArtwork) accept(initialArtwork);
      let pending = requests.filter((request) => !resolved[imageKey(request)]);
      try {
        while (pending.length && !controller.signal.aborted) {
          const batch = pending.slice(0, 12);
          const payload = await callArtworkTool(app, batch, controller.signal);
          if (controller.signal.aborted) return;
          accept(payload);
          pending = pending.slice(payload.next_offset!);
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      const unavailableCount = requests.filter((request) => resolved[imageKey(request)]?.status !== "available").length;
      if (!controller.signal.aborted && unavailableCount > 0) {
        setArtworkMessage(`${unavailableCount} of ${requests.length} images could not be loaded. The build and card details are still available.`);
      }
    })();

    return () => {
      controller.abort();
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [app, recommendation, initialArtwork]);

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
      "Present the completed or revised six-slot build by calling build.present_recommendation before your final answer, so the interactive Build View opens again.",
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
        <div className="hero-main">
          <div className="trainee-art-pair">
            <ArtworkImage className="trainee-portrait" artwork={artwork[imageKey({ server: recommendation.server, kind: "trainee", catalog_id: recommendation.trainee.id, variant: "portrait" })]} label={`${recommendation.trainee.name} portrait`} />
            <ArtworkImage className="trainee-icon" artwork={artwork[imageKey({ server: recommendation.server, kind: "trainee", catalog_id: recommendation.trainee.id, variant: "icon" })]} label={`${recommendation.trainee.name} outfit icon`} />
          </div>
          <div className="hero-copy">
            <div className="eyebrow">BUILD ADVISOR</div>
            <h1>{recommendation.trainee.name}</h1>
            <p className="hero-reason">{recommendation.scenario} · {recommendation.server === "ja" ? "Japan" : "Global"} · <ExternalLink href={recommendation.trainee.gametora_url}>{recommendation.target}</ExternalLink></p>
          </div>
        </div>
      </header>

      <section className="section deck-section">
        <div className="section-heading"><h2>Support Deck</h2><span className="count">{recommendation.deck.length} / 6 Cards</span></div>
        <div className="deck-grid">
          {recommendation.deck.map((slot, index) => (
            <article className="support-card" key={`${slot.support_id}-${index}`}>
              <div className="support-art-wrap">
                <ArtworkImage className="support-art" artwork={artwork[imageKey({ server: recommendation.server, kind: "support_card", catalog_id: slot.support_id, variant: "portrait" })]} label={`${slot.name} support card`} />
                <TrainingTypeIcon server={recommendation.server} role={slot.role} artwork={artwork} />
              </div>
              <h3><ExternalLink href={slot.gametora_url}>{slot.name}</ExternalLink></h3>
              <div className={`role ${statType(slot.role)?.key || "other"}`}>{statType(slot.role)?.label || slot.role}</div>
              <div className="ownership-line"><Ownership item={slot} /></div>
              <details className="card-details">
                <summary>Card details</summary>
                <p>{slot.reason}</p>
                {(slot.effective_level !== null || slot.limit_break !== null) && <div className="level">{slot.effective_level !== null ? `Level ${slot.effective_level}` : ""}{slot.effective_level !== null && slot.limit_break !== null ? " · " : ""}{slot.limit_break !== null ? `LB${slot.limit_break}` : ""}</div>}
                {slot.effects.length > 0 && <div className="chip-row">{slot.effects.map((effect) => <span className="chip" key={effect}>{effect}</span>)}</div>}
                {slot.skills.length > 0 && <div className="micro-list"><b>Useful skills</b><span>{slot.skills.join(" · ")}</span></div>}
              </details>
            </article>
          ))}
        </div>
        {artworkMessage && <p className="artwork-message" role="status">{artworkMessage}</p>}
      </section>

      <div className="deck-footer">
        <div>Build preview · {recommendation.target}</div>
        <button type="button" className="refine-cta" onClick={() => {
          const panel = document.getElementById("recommendation-details");
          if (panel instanceof HTMLDetailsElement) panel.open = true;
          document.getElementById("refinement")?.scrollIntoView({ behavior: "smooth", block: "center" });
          window.setTimeout(() => document.getElementById("refinement")?.focus(), 250);
        }}>Refine build <span aria-hidden="true">→</span></button>
      </div>
      <div className="icon-credit">Japanese artwork and stat icons are served from the installed game cache. Global game artwork is unavailable unless a verified Global cache is installed.</div>

      <details className="recommendation-details" id="recommendation-details">
        <summary>Recommendation details, rationale and sources</summary>
        <div className={`confidence ${recommendation.confidence.level}`}><strong>{recommendation.confidence.level} confidence</strong><p>{recommendation.confidence.explanation}</p><p className="trainee-rationale"><b>{recommendation.trainee.name}:</b> {recommendation.trainee.reason}</p></div>
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
      </details>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<AppView />);
