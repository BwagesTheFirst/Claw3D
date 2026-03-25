"use client";

import type { BranceClawStatus } from "@/lib/branceclaw-api";

export function StatusBar({
  status,
  connected,
  wsConnected,
}: {
  status: BranceClawStatus | null;
  connected: boolean;
  wsConnected: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "6px 16px",
        background: "#0a0a14",
        borderTop: "1px solid #2a2a3a",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 11,
        color: "#71717a",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: connected ? "#22c55e" : "#ef4444",
          }}
        />
        {connected ? "Connected" : "Disconnected"}
      </span>

      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: wsConnected ? "#22c55e" : "#71717a",
          }}
        />
        WS {wsConnected ? "Live" : "Off"}
      </span>

      {status && (
        <>
          <span>Uptime: {status.uptime_human}</span>
          <span>Msgs: {status.messages_total}</span>
          <span>
            Memory: {status.memory.core_entries} core / {status.memory.archival_count} archival
          </span>
          <span>Channels: {status.channels_connected.join(", ")}</span>
        </>
      )}
    </div>
  );
}
