"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BranceClawWsEvent } from "@/lib/branceclaw-api";

type AnimationState = {
  deskHoldByAgentId: Record<string, boolean>;
  gymHoldByAgentId: Record<string, boolean>;
  phoneBoothAgentId: string | null;
  smsBoothAgentId: string | null;
  qaHoldByAgentId: Record<string, boolean>;
};

const PHONE_ACTIONS = ["make_call", "make_conversation_call", "briefing_call", "check_voicemails"];
const SMS_ACTIONS = ["send_sms", "send_email"];
const QA_ACTIONS = ["code_review", "code_task"];

// Map BranceClaw action names to portfolio agent IDs
function actionToAgentId(action: string): string {
  const lower = action.toLowerCase();
  if (lower.includes("hoa_hunter") || lower.includes("hoa-hunter")) return "hoa-hunter";
  if (lower.includes("caso") || lower.includes("comply")) return "caso-collect";
  if (lower.includes("hoa_cloud") || lower.includes("hoa-cloud")) return "hoa-cloud";
  if (lower.includes("slot") || lower.includes("game")) return "slotmaster";
  if (lower.includes("roof")) return "roofbot";
  return "branceclaw";
}

export function useBranceClawAnimations() {
  const [state, setState] = useState<AnimationState>({
    deskHoldByAgentId: {},
    gymHoldByAgentId: {},
    phoneBoothAgentId: null,
    smsBoothAgentId: null,
    qaHoldByAgentId: {},
  });

  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = useCallback((key: string) => {
    const existing = timersRef.current.get(key);
    if (existing) {
      clearTimeout(existing);
      timersRef.current.delete(key);
    }
  }, []);

  const setTemporary = useCallback(
    (key: string, setter: () => void, clearer: () => void, durationMs: number) => {
      clearTimer(key);
      setter();
      const timer = setTimeout(() => {
        clearer();
        timersRef.current.delete(key);
      }, durationMs);
      timersRef.current.set(key, timer);
    },
    [clearTimer],
  );

  const handleWsEvent = useCallback(
    (event: BranceClawWsEvent) => {
      const data = event.data as Record<string, unknown> | null;
      if (!data) return;

      const action = (data.action as string) || (data.skill as string) || "";
      const agentId = actionToAgentId(
        (data.agent_id as string) || (data.agentId as string) || action,
      );

      // Phone booth animation for call actions
      if (PHONE_ACTIONS.some((a) => action.includes(a))) {
        setTemporary(
          "phone",
          () => setState((s) => ({ ...s, phoneBoothAgentId: agentId })),
          () => setState((s) => ({ ...s, phoneBoothAgentId: null })),
          15_000,
        );
        return;
      }

      // SMS booth for text/email actions
      if (SMS_ACTIONS.some((a) => action.includes(a))) {
        setTemporary(
          "sms",
          () => setState((s) => ({ ...s, smsBoothAgentId: agentId })),
          () => setState((s) => ({ ...s, smsBoothAgentId: null })),
          10_000,
        );
        return;
      }

      // QA lab for code tasks
      if (QA_ACTIONS.some((a) => action.includes(a))) {
        setTemporary(
          `qa-${agentId}`,
          () =>
            setState((s) => ({
              ...s,
              qaHoldByAgentId: { ...s.qaHoldByAgentId, [agentId]: true },
            })),
          () =>
            setState((s) => {
              const next = { ...s.qaHoldByAgentId };
              delete next[agentId];
              return { ...s, qaHoldByAgentId: next };
            }),
          30_000,
        );
        return;
      }

      // Default: desk hold for working agents
      if (event.type === "audit_entry" || event.type === "skill_executed") {
        setTemporary(
          `desk-${agentId}`,
          () =>
            setState((s) => ({
              ...s,
              deskHoldByAgentId: { ...s.deskHoldByAgentId, [agentId]: true },
            })),
          () =>
            setState((s) => {
              const next = { ...s.deskHoldByAgentId };
              delete next[agentId];
              return { ...s, deskHoldByAgentId: next };
            }),
          60_000,
        );
      }
    },
    [setTemporary],
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  return { animationState: state, handleWsEvent };
}
