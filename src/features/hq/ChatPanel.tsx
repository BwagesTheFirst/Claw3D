"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
};

export function ChatPanel({ baseUrl = "http://127.0.0.1:18800" }: { baseUrl?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);

  useEffect(() => {
    const wsUrl = baseUrl.replace(/^http/, "ws") + "/ws/chat";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "message" && data.content) {
          setMessages((prev) => [
            ...prev,
            {
              id: `assistant-${++idCounter.current}`,
              role: "assistant",
              content: data.content,
              ts: Date.now(),
            },
          ]);
        }
      } catch {
        // ignore
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [baseUrl]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({ type: "message", content: text }));
    setMessages((prev) => [
      ...prev,
      { id: `user-${++idCounter.current}`, role: "user", content: text, ts: Date.now() },
    ]);
    setInput("");
  }, [input]);

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
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #2a2a3a",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: connected ? "#22c55e" : "#ef4444",
          }}
        />
        <span style={{ color: "#e4e4e7", fontSize: 13, fontWeight: 600 }}>
          BranceClaw Chat
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              padding: "8px 12px",
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.5,
              color: msg.role === "user" ? "#fff" : "#e4e4e7",
              background: msg.role === "user" ? "#f59e0b33" : "#1a1a2e",
              border: `1px solid ${msg.role === "user" ? "#f59e0b55" : "#2a2a3a"}`,
              wordBreak: "break-word",
            }}
          >
            {msg.content}
          </div>
        ))}
      </div>

      {/* Input */}
      <div
        style={{
          padding: "8px 12px",
          borderTop: "1px solid #2a2a3a",
          display: "flex",
          gap: 8,
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message BranceClaw..."
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid #2a2a3a",
            background: "#0a0a14",
            color: "#e4e4e7",
            fontSize: 12,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
        <button
          onClick={send}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "none",
            background: "#f59e0b",
            color: "#000",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
