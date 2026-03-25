"use client";

type FeedEvent = {
  id: string;
  name: string;
  text: string;
  ts: number;
  kind?: "status" | "reply";
};

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function ActivityFeed({ events }: { events: FeedEvent[] }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#111118",
        borderLeft: "1px solid #2a2a3a",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #2a2a3a",
          color: "#e4e4e7",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Activity Feed
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {events.map((event) => (
          <div
            key={event.id}
            style={{
              padding: "8px 16px",
              borderBottom: "1px solid #1a1a2e",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span
                style={{
                  color: event.kind === "reply" ? "#f59e0b" : "#a1a1aa",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {event.name}
              </span>
              <span style={{ color: "#52525b", fontSize: 10 }}>{timeAgo(event.ts)}</span>
            </div>
            <span style={{ color: "#d4d4d8", fontSize: 11, lineHeight: 1.4 }}>{event.text}</span>
          </div>
        ))}

        {events.length === 0 && (
          <div style={{ padding: 16, color: "#52525b", fontSize: 11, textAlign: "center" }}>
            No activity yet...
          </div>
        )}
      </div>
    </div>
  );
}
