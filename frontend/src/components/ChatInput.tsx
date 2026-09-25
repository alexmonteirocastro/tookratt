import { type FormEvent, useEffect, useState } from "react";
import { CHAT_QUESTION_MAX_LENGTH } from "../api/client";
import styles from "./ChatInput.module.css";

interface ChatInputProps {
  onSubmit: (question: string) => void;
  disabled: boolean;
}

/** Flag the counter when the input is within the last 10% of the limit. */
const NEAR_LIMIT_RATIO = 0.9;

/** Same breakpoint as the mobile layout in ALE-205. */
const NARROW_VIEWPORT = "(max-width: 640px)";
const PLACEHOLDER_DESKTOP = "Ask about roles, skills or countries";
const PLACEHOLDER_MOBILE = "Ask about the market";

function useNarrowViewport(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export function ChatInput({ onSubmit, disabled }: ChatInputProps) {
  const [question, setQuestion] = useState("");
  const narrow = useNarrowViewport(NARROW_VIEWPORT);
  const used = question.length;
  const nearLimit = used >= Math.floor(CHAT_QUESTION_MAX_LENGTH * NEAR_LIMIT_RATIO);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || disabled) {
      return;
    }
    onSubmit(trimmed);
    setQuestion("");
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label htmlFor="chat-question" className={styles.srOnly}>
        Ask a question about jobs
      </label>
      <textarea
        id="chat-question"
        className={styles.input}
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder={narrow ? PLACEHOLDER_MOBILE : PLACEHOLDER_DESKTOP}
        rows={2}
        maxLength={CHAT_QUESTION_MAX_LENGTH}
        disabled={disabled}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            handleSubmit(event);
          }
        }}
      />
      <div className={styles.toolbar}>
        <p
          className={`${styles.counter}${nearLimit ? ` ${styles.counterNearLimit}` : ""}`}
          aria-live={nearLimit ? "polite" : undefined}
        >
          {used}/{CHAT_QUESTION_MAX_LENGTH}
        </p>
        <button type="submit" className={styles.button} disabled={disabled || !question.trim()}>
          Ask
        </button>
      </div>
    </form>
  );
}
