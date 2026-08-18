import { useCallback, useRef, useState } from "react";
import { ApiHttpError, ApiNetworkError, postChat } from "../api/client";
import type { ChatRequest } from "../api/types";
import { createMessageId } from "../utils/id";
import { ChatInput } from "./ChatInput";
import { ChatMessage, type DisplayMessage } from "./ChatMessage";
import { LoadingIndicator } from "./LoadingIndicator";
import styles from "./Chat.module.css";

export function Chat() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (el && typeof el.scrollTo === "function") {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    });
  }, []);

  const handleSubmit = useCallback(
    async (question: string) => {
      const userMessage: DisplayMessage = {
        id: createMessageId(),
        role: "user",
        content: question,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      scrollToBottom();

      try {
        const request: ChatRequest = sessionId
          ? { question, session_id: sessionId }
          : { question };
        const response = await postChat(request);
        setSessionId(response.session_id);
        const assistantMessage: DisplayMessage = {
          id: createMessageId(),
          role: "assistant",
          content: response.answer,
          sources: response.sources,
          generated: response.generated,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error) {
        if (error instanceof ApiHttpError && error.status === 401) {
          return;
        }
        const content =
          error instanceof ApiNetworkError || error instanceof ApiHttpError
            ? error.message
            : "Something went wrong. Please try again.";
        const errorMessage: DisplayMessage = {
          id: createMessageId(),
          role: "assistant",
          content,
          isError: true,
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
        scrollToBottom();
      }
    },
    [scrollToBottom, sessionId],
  );

  const showEmpty = messages.length === 0 && !isLoading;

  return (
    <div className={styles.chat}>
      <div className={styles.messages} ref={listRef} aria-live="polite">
        {showEmpty && (
          <div className={styles.empty}>
            <img
              className={styles.emptyMascot}
              src="/mascot.png"
              alt=""
              width={120}
              height={120}
            />
            <p className={styles.emptyText}>
              Ask about Nordic and European startup jobs — for example, &ldquo;backend engineer
              in Denmark&rdquo; or &ldquo;remote frontend roles in Sweden&rdquo;.
            </p>
          </div>
        )}
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
        {isLoading && <LoadingIndicator />}
      </div>
      <ChatInput onSubmit={handleSubmit} disabled={isLoading} />
    </div>
  );
}
