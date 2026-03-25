"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RetroOffice3D } from "@/features/retro-office/RetroOffice3D";
import type { OfficeAgent } from "@/features/retro-office/core/types";
import { useBranceClawLive } from "@/hooks/useBranceClawLive";

// ---------------------------------------------------------------------------
// Brance Wages / Dino Killers venture studio -- full agent lineup (fallback)
// ---------------------------------------------------------------------------

const DEMO_AGENTS: OfficeAgent[] = [
  {
    id: "winsworth",
    name: "Winsworth",
    status: "working",
    color: "#f59e0b",
    item: "globe",
  },
  {
    id: "caso-sales-mgr",
    name: "Marcus",
    status: "idle",
    color: "#3b82f6",
    item: "books",
  },
  {
    id: "caso-researcher",
    name: "Scout",
    status: "idle",
    color: "#22c55e",
    item: "camera",
  },
  {
    id: "caso-outreach",
    name: "Hayes",
    status: "idle",
    color: "#06b6d4",
    item: "shield",
  },
];

// ---------------------------------------------------------------------------
// Rotating feed messages -- simulate live agent activity (demo fallback)
// ---------------------------------------------------------------------------

const FEED_TEMPLATES: {
  name: string;
  text: string;
  kind: "status" | "reply";
}[] = [
  { name: "BranceClaw", text: "Morning briefing compiled -- 3 urgent items flagged for Brance.", kind: "status" },
  { name: "RoofBot", text: "New lead from Google Ads: 4,200 sqft re-roof in Cedar Park. Quote drafted at $18,400.", kind: "reply" },
  { name: "HOA Hunter", text: "Scraped 14 new HOA violation notices in Travis County. 6 matched roofing keywords.", kind: "status" },
  { name: "CASO Collect", text: "Document review complete -- 2 of 8 filings need updated signatures.", kind: "reply" },
  { name: "SlotMaster", text: "Slot machine reel physics tuned. Awaiting QA test run.", kind: "status" },
  { name: "HOA Cloud", text: "Portal sync: 12 new board packets uploaded for 3 communities.", kind: "status" },
  { name: "BranceClaw", text: "Calendar sync done. 2 meetings rescheduled, 1 conflict resolved.", kind: "status" },
  { name: "RoofBot", text: "Insurance supplement approved for 1847 Elm St. +$3,200 to final invoice.", kind: "reply" },
  { name: "HOA Hunter", text: "Cross-referenced MLS data: 23 properties with expired roofs in Pflugerville.", kind: "status" },
  { name: "CASO Collect", text: "New filing deadline detected: TX-2026-0412. Added to compliance tracker.", kind: "status" },
  { name: "BranceClaw", text: "WhatsApp: 4 unread messages. 2 from known contacts, 2 new leads.", kind: "reply" },
  { name: "RoofBot", text: "Material order confirmed: 48 sq GAF Timberline HDZ, delivery Thursday.", kind: "status" },
  { name: "HOA Hunter", text: "Drone inspection results processed. 3 of 5 roofs show hail damage.", kind: "reply" },
  { name: "SlotMaster", text: "New theme pack generated: Aztec Gold. 5 reel configs ready for review.", kind: "status" },
  { name: "HOA Cloud", text: "Violation notice #2847 auto-drafted. Awaiting board approval.", kind: "reply" },
];

// ---------------------------------------------------------------------------
// Demo page -- connects to live BranceClaw API if available, falls back to
// simulated data when the API is unreachable.
// ---------------------------------------------------------------------------

export default function DemoPage() {
  // --- Live data from BranceClaw API ---
  const live = useBranceClawLive();

  // --- Demo fallback state (used when BranceClaw is unreachable) ---
  const now = useMemo(() => Date.now(), []);

  const [demoRunCounts, setDemoRunCounts] = useState<Record<string, number>>({
    branceclaw: 1_247,
    roofbot: 438,
    "hoa-hunter": 312,
    "caso-collect": 89,
    "hoa-cloud": 156,
    slotmaster: 54,
  });

  const DEMO_LAST_SEEN: Record<string, number> = useMemo(
    () => ({
      branceclaw: now - 12_000,
      roofbot: now - 45_000,
      "hoa-hunter": now - 3 * 60_000,
      "caso-collect": now - 22 * 60_000,
      "hoa-cloud": now - 5 * 60_000,
      slotmaster: now - 90 * 60_000,
    }),
    [now],
  );

  const DEMO_DESK_HOLDS: Record<string, boolean> = useMemo(
    () => ({
      branceclaw: true,
      roofbot: true,
    }),
    [],
  );

  // Live feed -- start with initial events, then rotate in new ones
  const [demoFeedEvents, setDemoFeedEvents] = useState(() => {
    const base = Date.now();
    return FEED_TEMPLATES.slice(0, 7).map((t, i) => ({
      id: `f-${i}`,
      name: t.name,
      text: t.text,
      ts: base - (i + 1) * 30_000,
      kind: t.kind as "status" | "reply",
    }));
  });

  const feedCounterRef = useMemo(() => ({ current: 7 }), []);

  // Rotate in new feed events every 15-25 seconds (only when in demo mode)
  useEffect(() => {
    if (live.connected) return; // live data takes over

    const tick = () => {
      const idx = feedCounterRef.current % FEED_TEMPLATES.length;
      const template = FEED_TEMPLATES[idx];
      feedCounterRef.current += 1;
      const newEvent = {
        id: `f-${feedCounterRef.current}`,
        name: template.name,
        text: template.text,
        ts: Date.now(),
        kind: template.kind as "status" | "reply",
      };
      setDemoFeedEvents((prev) => [newEvent, ...prev].slice(0, 20));

      // Also bump a run count for the active agent
      const agentId = DEMO_AGENTS.find((a) => a.name === template.name)?.id;
      if (agentId) {
        setDemoRunCounts((prev) => ({ ...prev, [agentId]: (prev[agentId] ?? 0) + 1 }));
      }
    };

    const interval = setInterval(tick, 15_000 + Math.random() * 10_000);
    return () => clearInterval(interval);
  }, [feedCounterRef, live.connected]);

  // --- Choose live data or demo fallback ---
  const agents = live.connected ? live.agents : DEMO_AGENTS;
  const feedEvents = live.connected ? live.feedEvents : demoFeedEvents;
  const runCountByAgentId = live.connected ? live.runCountByAgentId : demoRunCounts;
  const lastSeenByAgentId = live.connected ? live.lastSeenByAgentId : DEMO_LAST_SEEN;
  const deskHoldByAgentId = live.connected ? live.deskHoldByAgentId : DEMO_DESK_HOLDS;
  const gatewayStatus = live.connected ? "connected" : "disconnected";

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0a0a" }}>
      <RetroOffice3D
        agents={agents}
        officeTitle="Brance's Empire"
        officeTitleLoaded
        gatewayStatus={gatewayStatus}
        runCountByAgentId={runCountByAgentId}
        lastSeenByAgentId={lastSeenByAgentId}
        deskHoldByAgentId={deskHoldByAgentId}
        feedEvents={feedEvents}
      />
    </div>
  );
}
