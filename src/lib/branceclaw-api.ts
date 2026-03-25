/**
 * BranceClaw API Client
 *
 * Connects Claw3D to the live BranceClaw backend via REST polling and
 * WebSocket real-time events.
 *
 * Default URL: http://127.0.0.1:18800
 * Override with NEXT_PUBLIC_BRANCECLAW_URL env var.
 */

// ---------------------------------------------------------------------------
// Types — mirrors the shapes returned by BranceClaw's dashboard API
// ---------------------------------------------------------------------------

export type BranceClawStatus = {
  uptime_ms: number;
  uptime_human: string;
  channels_connected: string[];
  models: {
    router: string;
    general: string;
    cloud: string;
    embeddings: string;
  };
  memory: {
    core_entries: number;
    archival_count: number;
    observation_count: number;
    graph_nodes: number;
    graph_edges: number;
  };
  messages_total: number;
  active_containers: number;
  killswitch: unknown;
  security: {
    dm_policy: string;
    group_policy: string;
  };
  heartbeat: {
    enabled: boolean;
    interval_ms: number;
  };
};

export type BranceClawMessage = {
  id: number;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: number;
  is_from_me: number;
  is_bot_message: number;
};

export type BranceClawAuditEntry = {
  id: number;
  timestamp: string;
  agent_id: string;
  action: string;
  target: string;
  input: string;
  output: string;
  status: string;
  duration_ms: number;
};

export type BranceClawTask = {
  id: number;
  prompt: string;
  schedule_type: string;
  schedule_value: string;
  group_folder: string;
  created_at: string;
  last_run: string | null;
  next_run: string | null;
  enabled: number;
};

export type BranceClawTaskRun = {
  id: number;
  task_id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  output: string | null;
};

export type BranceClawSkill = {
  name: string;
  description: string;
  enabled: boolean;
};

export type BranceClawChannelStatus = {
  name: string;
  connected: boolean;
  details?: Record<string, unknown>;
};

export type BranceClawWsEvent = {
  type: string;
  data: unknown;
  ts: number;
};

export type BranceClawApproval = {
  id: string;
  action: string;
  details: string;
  created_at: string;
};

export type BranceClawAgentSummary = {
  id: string;
  actions: number;
  last_active: number;
  last_action: string;
  status: string;
};

export type BranceClawHoneyDoItem = {
  id: number;
  text: string;
  notes?: string;
  priority?: string;
  due_date?: string;
  completed: boolean;
  created_at: string;
};

export type BranceClawMemory = {
  core: { key: string; value: string; updated_at: number }[];
  archival_count: number;
  observation_count: number;
};

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export type BranceClawApiClientOptions = {
  /** Base URL, e.g. http://127.0.0.1:18800 */
  baseUrl?: string;
  /** Called when a WebSocket event arrives */
  onWsEvent?: (event: BranceClawWsEvent) => void;
  /** Called when the WebSocket connection state changes */
  onWsStatusChange?: (connected: boolean) => void;
};

/**
 * Resolve the BranceClaw API base URL.
 *
 * Priority:
 * 1. Explicit NEXT_PUBLIC_BRANCECLAW_URL env var (backward compatible)
 * 2. Auto-detect: if the page is loaded from localhost/127.0.0.1, hit the
 *    BranceClaw API directly at localhost:18800.  Otherwise use the
 *    same-origin `/branceclaw-api` proxy path (for Cloudflare tunnel / remote).
 */
function resolveDefaultBaseUrl(): string {
  // Check explicit env var first
  if (
    typeof process !== "undefined" &&
    typeof (process as NodeJS.Process).env?.NEXT_PUBLIC_BRANCECLAW_URL === "string" &&
    (process as NodeJS.Process).env.NEXT_PUBLIC_BRANCECLAW_URL!.trim().length > 0
  ) {
    return (process as NodeJS.Process).env.NEXT_PUBLIC_BRANCECLAW_URL!.trim();
  }

  // In browser, auto-detect based on hostname
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return "http://127.0.0.1:18800";
    }
    // Remote access -- use the same-origin proxy
    return "/branceclaw-api";
  }

  // Server-side fallback (SSR)
  return "http://127.0.0.1:18800";
}

const DEFAULT_BASE_URL = resolveDefaultBaseUrl();

export class BranceClawApiClient {
  private baseUrl: string;
  private ws: WebSocket | null = null;
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wsReconnectAttempt = 0;
  private wsStopped = false;
  private onWsEvent: ((event: BranceClawWsEvent) => void) | null;
  private onWsStatusChange: ((connected: boolean) => void) | null;

  constructor(options?: BranceClawApiClientOptions) {
    this.baseUrl = (options?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.onWsEvent = options?.onWsEvent ?? null;
    this.onWsStatusChange = options?.onWsStatusChange ?? null;
  }

  // -----------------------------------------------------------------------
  // REST helpers
  // -----------------------------------------------------------------------

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`BranceClaw API ${path} responded ${res.status}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  // -----------------------------------------------------------------------
  // REST endpoints
  // -----------------------------------------------------------------------

  async fetchStatus(): Promise<BranceClawStatus> {
    return this.get<BranceClawStatus>("/api/status");
  }

  async fetchMessages(limit = 100): Promise<BranceClawMessage[]> {
    return this.get<BranceClawMessage[]>(`/api/messages?limit=${limit}`);
  }

  async fetchAudit(limit = 50): Promise<BranceClawAuditEntry[]> {
    return this.get<BranceClawAuditEntry[]>(`/api/audit?limit=${limit}`);
  }

  async fetchTasks(): Promise<BranceClawTask[]> {
    return this.get<BranceClawTask[]>("/api/tasks");
  }

  async fetchTaskRuns(): Promise<BranceClawTaskRun[]> {
    return this.get<BranceClawTaskRun[]>("/api/tasks/runs");
  }

  async fetchSkills(): Promise<BranceClawSkill[]> {
    return this.get<BranceClawSkill[]>("/api/skills");
  }

  async fetchChannelStatus(): Promise<BranceClawChannelStatus[]> {
    return this.get<BranceClawChannelStatus[]>("/api/channels/status");
  }

  async sendChatMessage(content: string): Promise<{ ok: boolean }> {
    const url = `${this.baseUrl}/api/chat`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    return { ok: res.ok };
  }

  async fetchApprovals(): Promise<BranceClawApproval[]> {
    return this.get<BranceClawApproval[]>("/api/approvals");
  }

  async resolveApproval(id: string, approved: boolean): Promise<void> {
    await fetch(`${this.baseUrl}/api/approvals/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved }),
    });
  }

  async fetchAgents(): Promise<BranceClawAgentSummary[]> {
    return this.get<BranceClawAgentSummary[]>("/api/agents");
  }

  async fetchHoneyDoList(): Promise<BranceClawHoneyDoItem[]> {
    return this.get<BranceClawHoneyDoItem[]>("/api/honey-do");
  }

  async fetchMemory(): Promise<BranceClawMemory> {
    return this.get<BranceClawMemory>("/api/memory");
  }

  // -----------------------------------------------------------------------
  // WebSocket
  // -----------------------------------------------------------------------

  startWebSocket(): void {
    this.wsStopped = false;
    this.connectWebSocket();
  }

  stopWebSocket(): void {
    this.wsStopped = true;
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    this.onWsStatusChange?.(false);
  }

  private connectWebSocket(): void {
    if (this.wsStopped) return;
    if (this.ws) return;

    // When using the same-origin proxy path (e.g. /branceclaw-api), build a
    // WebSocket URL relative to the current page host using the dedicated
    // /branceclaw-ws proxy endpoint handled by the custom server.
    let wsUrl: string;
    if (this.baseUrl.startsWith("/")) {
      const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = typeof window !== "undefined" ? window.location.host : "localhost:3000";
      wsUrl = `${proto}//${host}/branceclaw-ws`;
    } else {
      wsUrl = this.baseUrl.replace(/^http/, "ws") + "/ws";
    }

    try {
      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      socket.onopen = () => {
        this.wsReconnectAttempt = 0;
        this.onWsStatusChange?.(true);
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data)) as BranceClawWsEvent;
          this.onWsEvent?.(parsed);
        } catch {
          // ignore malformed frames
        }
      };

      socket.onerror = () => {
        // onclose will fire after onerror
      };

      socket.onclose = () => {
        this.ws = null;
        this.onWsStatusChange?.(false);
        this.scheduleReconnect();
      };
    } catch {
      this.ws = null;
      this.onWsStatusChange?.(false);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.wsStopped) return;
    if (this.wsReconnectTimer) return;

    const delay = Math.min(2_000 * Math.pow(1.5, this.wsReconnectAttempt), 30_000);
    this.wsReconnectAttempt += 1;

    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = null;
      this.connectWebSocket();
    }, delay);
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  destroy(): void {
    this.stopWebSocket();
  }
}
