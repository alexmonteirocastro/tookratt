import { useCallback, useEffect, useRef, useState } from "react";
import { loadDemoData } from "../api/loadDemoData";
import type { DemoPayload, JobSearchHit } from "../api/types";
import type { DisplayMessage } from "../components/ChatMessage";
import { ANALYZING_MS, MATCH_PERCENTS, MATCH_STAGGER_MS } from "../data/persona";
import { createMessageId } from "../utils/id";
import { insightsIntro, matchTurn, noMatchesTurn, profileReveal, whyThisFits } from "./copy";

export type FlowPhase = "loading" | "awaiting-cv" | "analyzing" | "matching" | "done";

export interface InsightsTurn {
  message: DisplayMessage;
  stats: DemoPayload["stats"];
}

function assistantMessage(content: string): DisplayMessage {
  return { id: createMessageId(), role: "assistant", content };
}

function userMessage(content: string): DisplayMessage {
  return { id: createMessageId(), role: "user", content };
}

export function useConceptFlow() {
  const [phase, setPhase] = useState<FlowPhase>("loading");
  const [insights, setInsights] = useState<InsightsTurn | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [pendingHits, setPendingHits] = useState<JobSearchHit[]>([]);
  const runId = useRef(0);

  const start = useCallback(() => {
    const id = ++runId.current;
    setPhase("loading");
    setInsights(null);
    setMessages([]);
    setPendingHits([]);

    void loadDemoData().then((payload) => {
      if (runId.current !== id) {
        return;
      }
      setInsights({
        message: assistantMessage(insightsIntro(payload.stats)),
        stats: payload.stats,
      });
      setPendingHits(payload.search.results.slice(0, MATCH_PERCENTS.length));
      setPhase("awaiting-cv");
    });
  }, []);

  // Snapshot load on mount. start() sets state after the async resolve.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    start();
  }, [start]);

  const onFileChosen = useCallback(
    (fileName: string) => {
      if (phase !== "awaiting-cv") {
        return;
      }
      const id = ++runId.current;
      setMessages([userMessage(`Uploaded ${fileName}`)]);
      setPhase("analyzing");

      window.setTimeout(() => {
        if (runId.current !== id) {
          return;
        }
        const next = [assistantMessage(profileReveal())];
        if (pendingHits.length === 0) {
          next.push(assistantMessage(noMatchesTurn()));
          setMessages((prev) => [...prev, ...next]);
          setPhase("done");
          return;
        }
        setMessages((prev) => [...prev, ...next]);
        setPhase("matching");
      }, ANALYZING_MS);
    },
    [phase, pendingHits],
  );

  useEffect(() => {
    if (phase !== "matching") {
      return;
    }
    if (pendingHits.length === 0) {
      // Empty live search: finish instead of sitting on "Finding matching roles…".
      // oxlint-disable-next-line react/set-state-in-effect
      setMessages((prev) => {
        const text = noMatchesTurn();
        if (prev.some((message) => message.content === text)) {
          return prev;
        }
        return [...prev, assistantMessage(text)];
      });
      setPhase("done");
      return;
    }

    const id = runId.current;
    let index = 0;
    const timer = window.setInterval(() => {
      if (runId.current !== id) {
        window.clearInterval(timer);
        return;
      }
      const hit = pendingHits[index];
      if (!hit) {
        window.clearInterval(timer);
        setPhase("done");
        return;
      }
      const percent = MATCH_PERCENTS[index] ?? MATCH_PERCENTS[MATCH_PERCENTS.length - 1];
      const content = matchTurn(hit, percent, whyThisFits(hit, index));
      setMessages((prev) => [...prev, assistantMessage(content)]);
      index += 1;
      if (index >= pendingHits.length) {
        window.clearInterval(timer);
        setPhase("done");
      }
    }, MATCH_STAGGER_MS);

    return () => window.clearInterval(timer);
  }, [phase, pendingHits]);

  return { phase, insights, messages, onFileChosen, replay: start };
}
