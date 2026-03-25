"use client";

/**
 * useBranceClawLive
 *
 * React hook that polls BranceClaw's REST API on an interval and listens
 * for real-time WebSocket events, mapping the data into the OfficeAgent
 * format expected by RetroOffice3D.
 *
 * If the API is unreachable, all agents default to "idle" and the hook
 * sets `connected` to false so the UI can degrade gracefully.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BranceClawApiClient,
  type BranceClawAuditEntry,
  type BranceClawMessage,
  type BranceClawStatus,
  type BranceClawTask,
  type BranceClawWsEvent,
} from "@/lib/branceclaw-api";
import type { OfficeAgent } from "@/features/retro-office/core/types";

// ---------------------------------------------------------------------------
// Portfolio definition — the six agents that Brance actually runs
// ---------------------------------------------------------------------------

export type PortfolioAgent = {
  id: string;
  name: string;
  color: string;
  item: string;
  /** BranceClaw agent_id values that map to this portfolio agent in audit logs */
  auditAliases: string[];
};

const PORTFOLIO: PortfolioAgent[] = [
  {
    id: "branceclaw",
    name: "BranceClaw",
    color: "#f59e0b", // amber
    item: "globe",
    auditAliases: ["branceclaw", "main", "default"],
  },
  {
    id: "hoa-hunter",
    name: "HOA Hunter",
    color: "#22c55e", // green
    item: "camera",
    auditAliases: ["hoa-hunter", "hoa_hunter", "hoahunter"],
  },
  {
    id: "caso-collect",
    name: "CASO Collect",
    color: "#3b82f6", // blue
    item: "books",
    auditAliases: ["caso-collect", "caso_collect", "casocollect", "casocomply"],
  },
  {
    id: "hoa-cloud",
    name: "HOA Cloud",
    color: "#06b6d4", // cyan
    item: "shield",
    auditAliases: ["hoa-cloud", "hoa_cloud", "hoacloud"],
  },
  {
    id: "slotmaster",
    name: "SlotMaster",
    color: "#ec4899", // pink
    item: "laptop",
    auditAliases: ["slotmaster", "slot-master", "slot_master"],
  },
  {
    id: "roofbot",
    name: "RoofBot",
    color: "#ef4444", // red
    item: "shield",
    auditAliases: ["roofbot", "roof-bot", "roof_bot"],
  },
];

// ---------------------------------------------------------------------------
// Activity window: agent is "working" if it had audit activity within this
// many milliseconds.
// ---------------------------------------------------------------------------

const ACTIVITY_WINDOW_MS = 60_000;

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export type BranceClawLiveData = {
  /** True if the last REST poll succeeded */
  connected: boolean;
  /** True if the WebSocket is currently open */
  wsConnected: boolean;
  /** OfficeAgent[] ready to pass to RetroOffice3D */
  agents: OfficeAgent[];
  /** Activity feed events (newest first) for the feedEvents prop */
  feedEvents: {
    id: string;
    name: string;
    text: string;
    ts: number;
    kind: "status" | "reply";
  }[];
  /** Run count per agent id */
  runCountByAgentId: Record<string, number>;
  /** Last-seen timestamp per agent id */
  lastSeenByAgentId: Record<string, number>;
  /** Desk hold map — agents that are "working" should be held at their desk */
  deskHoldByAgentId: Record<string, boolean>;
  /** Raw status response (null until first successful fetch) */
  status: BranceClawStatus | null;
  /** Raw audit log entries */
  auditEntries: BranceClawAuditEntry[];
  /** Raw messages */
  messages: BranceClawMessage[];
  /** Raw tasks */
  tasks: BranceClawTask[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a reverse lookup: audit agent_id -> portfolio agent id */
function buildAuditAliasMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const agent of PORTFOLIO) {
    for (const alias of agent.auditAliases) {
      map.set(alias.toLowerCase(), agent.id);
    }
  }
  return map;
}

const ALIAS_MAP = buildAuditAliasMap();

function resolveAgentId(auditAgentId: string): string | null {
  const normalized = (auditAgentId ?? "").trim().toLowerCase();
  if (!normalized) return null;
  // Direct match
  const direct = ALIAS_MAP.get(normalized);
  if (direct) return direct;
  // Partial match — try stripping common prefixes
  let partialMatch: string | null = null;
  ALIAS_MAP.forEach((id, alias) => {
    if (partialMatch) return;
    if (normalized.includes(alias) || alias.includes(normalized)) {
      partialMatch = id;
    }
  });
  if (partialMatch) return partialMatch;
  return null;
}

function auditTimestamp(entry: BranceClawAuditEntry): number {
  // timestamp can be an ISO string or a unix epoch
  const raw = entry.timestamp;
  if (typeof raw === "number") return raw;
  const asNum = Number(raw);
  if (!Number.isNaN(asNum) && asNum > 1_000_000_000_000) return asNum;
  if (!Number.isNaN(asNum) && asNum > 1_000_000_000) return asNum * 1000;
  const parsed = Date.parse(String(raw));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function messageToFeedEvent(
  msg: BranceClawMessage,
  index: number,
): BranceClawLiveData["feedEvents"][number] | null {
  const content = (msg.content ?? "").trim();
  if (!content) return null;
  const name = msg.sender_name || msg.sender || "Unknown";
  const ts = typeof msg.timestamp === "number"
    ? (msg.timestamp > 1e12 ? msg.timestamp : msg.timestamp * 1000)
    : Date.parse(String(msg.timestamp)) || Date.now();
  return {
    id: `bc-msg-${msg.id ?? index}`,
    name,
    text: content.length > 200 ? content.slice(0, 197) + "..." : content,
    ts,
    kind: msg.is_bot_message ? "reply" : "status",
  };
}

function auditToFeedEvent(
  entry: BranceClawAuditEntry,
  index: number,
): BranceClawLiveData["feedEvents"][number] | null {
  const portfolioId = resolveAgentId(entry.agent_id);
  const agent = portfolioId
    ? PORTFOLIO.find((a) => a.id === portfolioId)
    : null;
  const name = agent?.name ?? entry.agent_id ?? "System";
  const action = (entry.action ?? "").trim();
  if (!action) return null;
  const output = (entry.output ?? "").trim();
  const text = output
    ? `${action}: ${output.length > 150 ? output.slice(0, 147) + "..." : output}`
    : action;
  return {
    id: `bc-audit-${entry.id ?? index}`,
    name,
    text,
    ts: auditTimestamp(entry),
    kind: "status",
  };
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useBranceClawLive(options?: {
  /** Override the BranceClaw URL at runtime */
  baseUrl?: string;
  /** Polling interval in ms (default 8000) */
  pollIntervalMs?: number;
  /** Disable the hook entirely (for storybook, tests, etc.) */
  disabled?: boolean;
  /** Called for every incoming WebSocket event (e.g. to drive animations) */
  onWsEvent?: (event: BranceClawWsEvent) => void;
}): BranceClawLiveData {
  const baseUrl = options?.baseUrl;
  const pollInterval = options?.pollIntervalMs ?? 8_000;
  const disabled = options?.disabled ?? false;

  // --- State ---
  const [connected, setConnected] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [statusData, setStatusData] = useState<BranceClawStatus | null>(null);
  const [auditEntries, setAuditEntries] = useState<BranceClawAuditEntry[]>([]);
  const [messages, setMessages] = useState<BranceClawMessage[]>([]);
  const [tasks, setTasks] = useState<BranceClawTask[]>([]);
  const [wsEvents, setWsEvents] = useState<BranceClawWsEvent[]>([]);

  // --- Client singleton (stable across renders) ---
  const clientRef = useRef<BranceClawApiClient | null>(null);

  // Store onWsEvent in a ref so the callback identity stays stable
  const onWsEventRef = useRef(options?.onWsEvent);
  onWsEventRef.current = options?.onWsEvent;

  const handleWsEvent = useCallback((event: BranceClawWsEvent) => {
    setWsEvents((prev) => [event, ...prev].slice(0, 50));
    onWsEventRef.current?.(event);
  }, []);

  const handleWsStatusChange = useCallback((isConnected: boolean) => {
    setWsConnected(isConnected);
  }, []);

  // Create/recreate client when baseUrl changes
  useEffect(() => {
    if (disabled) return;

    const client = new BranceClawApiClient({
      baseUrl,
      onWsEvent: handleWsEvent,
      onWsStatusChange: handleWsStatusChange,
    });
    clientRef.current = client;
    client.startWebSocket();

    return () => {
      client.destroy();
      if (clientRef.current === client) {
        clientRef.current = null;
      }
    };
  }, [baseUrl, disabled, handleWsEvent, handleWsStatusChange]);

  // --- Polling ---
  const poll = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;

    try {
      const [statusRes, auditRes, messagesRes, tasksRes] = await Promise.allSettled([
        client.fetchStatus(),
        client.fetchAudit(50),
        client.fetchMessages(50),
        client.fetchTasks(),
      ]);

      if (statusRes.status === "fulfilled") {
        setStatusData(statusRes.value);
      }
      if (auditRes.status === "fulfilled") {
        setAuditEntries(auditRes.value);
      }
      if (messagesRes.status === "fulfilled") {
        setMessages(messagesRes.value);
      }
      if (tasksRes.status === "fulfilled") {
        setTasks(tasksRes.value);
      }

      // If at least the status call succeeded, we consider ourselves connected
      setConnected(statusRes.status === "fulfilled");
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    if (disabled) return;

    // Initial fetch
    void poll();

    const timer = setInterval(() => void poll(), pollInterval);
    return () => clearInterval(timer);
  }, [disabled, poll, pollInterval]);

  // --- Derive agent states from audit log ---
  const { agents, runCountByAgentId, lastSeenByAgentId, deskHoldByAgentId } =
    useMemo(() => {
      const now = Date.now();

      // Tally activity per portfolio agent
      const latestTimestamp = new Map<string, number>();
      const runCounts = new Map<string, number>();

      for (const entry of auditEntries) {
        const portfolioId = resolveAgentId(entry.agent_id);
        if (!portfolioId) continue;
        const ts = auditTimestamp(entry);
        const current = latestTimestamp.get(portfolioId) ?? 0;
        if (ts > current) latestTimestamp.set(portfolioId, ts);
        runCounts.set(portfolioId, (runCounts.get(portfolioId) ?? 0) + 1);
      }

      // Also count from WS events that reference an agent
      for (const ev of wsEvents) {
        const payload = ev.data as Record<string, unknown> | null;
        if (!payload) continue;
        const agentIdRaw =
          typeof payload.agent_id === "string"
            ? payload.agent_id
            : typeof payload.agentId === "string"
              ? payload.agentId
              : null;
        if (!agentIdRaw) continue;
        const portfolioId = resolveAgentId(agentIdRaw);
        if (!portfolioId) continue;
        const ts = typeof ev.ts === "number" ? ev.ts : now;
        const current = latestTimestamp.get(portfolioId) ?? 0;
        if (ts > current) latestTimestamp.set(portfolioId, ts);
      }

      const officeAgents: OfficeAgent[] = PORTFOLIO.map((pa) => {
        const lastSeen = latestTimestamp.get(pa.id) ?? 0;
        const recentlyActive = lastSeen > 0 && now - lastSeen < ACTIVITY_WINDOW_MS;
        const status: OfficeAgent["status"] = connected
          ? recentlyActive
            ? "working"
            : "idle"
          : "idle";
        return {
          id: pa.id,
          name: pa.name,
          status,
          color: pa.color,
          item: pa.item,
        };
      });

      const rcById: Record<string, number> = {};
      const lsById: Record<string, number> = {};
      const dhById: Record<string, boolean> = {};

      for (const pa of PORTFOLIO) {
        const count = runCounts.get(pa.id) ?? 0;
        const lastSeen = latestTimestamp.get(pa.id) ?? 0;
        rcById[pa.id] = count;
        if (lastSeen > 0) lsById[pa.id] = lastSeen;
        const recentlyActive = lastSeen > 0 && now - lastSeen < ACTIVITY_WINDOW_MS;
        if (recentlyActive) dhById[pa.id] = true;
      }

      return {
        agents: officeAgents,
        runCountByAgentId: rcById,
        lastSeenByAgentId: lsById,
        deskHoldByAgentId: dhById,
      };
    }, [auditEntries, connected, wsEvents]);

  // --- Build feed events from messages + audit ---
  const feedEvents = useMemo(() => {
    const fromMessages = messages
      .slice(0, 20)
      .map((m, i) => messageToFeedEvent(m, i))
      .filter((e): e is NonNullable<typeof e> => e !== null);

    const fromAudit = auditEntries
      .slice(0, 20)
      .map((e, i) => auditToFeedEvent(e, i))
      .filter((e): e is NonNullable<typeof e> => e !== null);

    // Merge and sort newest first, cap at 20
    const merged = [...fromMessages, ...fromAudit]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 20);

    // Deduplicate by id
    const seen = new Set<string>();
    return merged.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  }, [messages, auditEntries]);

  return {
    connected,
    wsConnected,
    agents,
    feedEvents,
    runCountByAgentId,
    lastSeenByAgentId,
    deskHoldByAgentId,
    status: statusData,
    auditEntries,
    messages,
    tasks,
  };
}
