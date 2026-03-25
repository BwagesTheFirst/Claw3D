"use client";

import { useMemo, useState } from "react";
import { RetroOffice3D } from "@/features/retro-office/RetroOffice3D";
import type { OfficeAgent } from "@/features/retro-office/core/types";
import { useBranceClawLive } from "@/hooks/useBranceClawLive";
import { useBranceClawAnimations } from "@/hooks/useBranceClawAnimations";
import { ChatPanel } from "@/features/hq/ChatPanel";
import { StatusBar } from "@/features/hq/StatusBar";
import { ActivityFeed } from "@/features/hq/ActivityFeed";

// Demo fallback agents
const DEMO_AGENTS: OfficeAgent[] = [
  { id: "branceclaw", name: "BranceClaw", status: "working", color: "#f59e0b", item: "globe" },
  { id: "roofbot", name: "RoofBot", status: "working", color: "#ef4444", item: "shield" },
  { id: "hoa-hunter", name: "HOA Hunter", status: "working", color: "#22c55e", item: "camera" },
  { id: "caso-collect", name: "CASO Collect", status: "idle", color: "#3b82f6", item: "books" },
  { id: "hoa-cloud", name: "HOA Cloud", status: "idle", color: "#06b6d4", item: "shield" },
  { id: "slotmaster", name: "SlotMaster", status: "idle", color: "#ec4899", item: "laptop" },
];

type SidePanel = "chat" | "feed" | null;

export default function HQPage() {
  const { animationState, handleWsEvent } = useBranceClawAnimations();

  // Single WS connection: useBranceClawLive forwards events to the animation hook
  const live = useBranceClawLive({
    pollIntervalMs: 5_000,
    onWsEvent: handleWsEvent,
  });

  const [sidePanel, setSidePanel] = useState<SidePanel>("feed");

  // Merge live desk holds with animation-triggered holds
  const mergedDeskHolds = useMemo(() => {
    return { ...live.deskHoldByAgentId, ...animationState.deskHoldByAgentId };
  }, [live.deskHoldByAgentId, animationState.deskHoldByAgentId]);

  const agents = live.connected ? live.agents : DEMO_AGENTS;
  const gatewayStatus = live.connected ? "connected" : "disconnected";

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#0a0a0a",
      }}
    >
      {/* Main content area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* 3D Office */}
        <div style={{ flex: 1, position: "relative" }}>
          <RetroOffice3D
            agents={agents}
            officeTitle="BranceClaw HQ"
            officeTitleLoaded
            gatewayStatus={gatewayStatus}
            runCountByAgentId={live.runCountByAgentId}
            lastSeenByAgentId={live.lastSeenByAgentId}
            deskHoldByAgentId={mergedDeskHolds}
            gymHoldByAgentId={animationState.gymHoldByAgentId}
            phoneBoothAgentId={animationState.phoneBoothAgentId}
            smsBoothAgentId={animationState.smsBoothAgentId}
            qaHoldByAgentId={animationState.qaHoldByAgentId}
            feedEvents={live.feedEvents}
          />

          {/* Panel toggle buttons */}
          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              display: "flex",
              gap: 8,
              zIndex: 100,
            }}
          >
            <button
              onClick={() => setSidePanel(sidePanel === "chat" ? null : "chat")}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #2a2a3a",
                background: sidePanel === "chat" ? "#f59e0b33" : "#111118",
                color: sidePanel === "chat" ? "#f59e0b" : "#a1a1aa",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              Chat
            </button>
            <button
              onClick={() => setSidePanel(sidePanel === "feed" ? null : "feed")}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #2a2a3a",
                background: sidePanel === "feed" ? "#f59e0b33" : "#111118",
                color: sidePanel === "feed" ? "#f59e0b" : "#a1a1aa",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              Feed
            </button>
          </div>
        </div>

        {/* Side panel */}
        {sidePanel && (
          <div style={{ width: 360, flexShrink: 0 }}>
            {sidePanel === "chat" && <ChatPanel />}
            {sidePanel === "feed" && <ActivityFeed events={live.feedEvents} />}
          </div>
        )}
      </div>

      {/* Status bar */}
      <StatusBar status={live.status} connected={live.connected} wsConnected={live.wsConnected} />
    </div>
  );
}
