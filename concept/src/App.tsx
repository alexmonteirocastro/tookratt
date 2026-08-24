import { useEffect, useRef } from "react";
import { ChatMessage } from "./components/ChatMessage";
import { CvUploader } from "./components/CvUploader";
import { InsightsBlock } from "./components/InsightsBlock";
import { LoadingIndicator } from "./components/LoadingIndicator";
import { NewConversationIcon } from "./components/NewConversationIcon";
import { useConceptFlow } from "./flow/useConceptFlow";
import styles from "./App.module.css";

export default function App() {
  const { phase, insights, messages, onFileChosen, replay } = useConceptFlow();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el && typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [phase, insights, messages]);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <img
            className={styles.mascot}
            src="/mascot.png"
            alt="Töökratt"
            width={56}
            height={56}
          />
          <div className={styles.brandText}>
            <h1 className={styles.title}>töökratt</h1>
            <p className={styles.subtitle}>
              Tireless job search assistant for Nordic &amp; European startups
            </p>
          </div>
        </div>
        <button
          type="button"
          className={styles.replayButton}
          onClick={replay}
          aria-label="Replay demo"
        >
          <NewConversationIcon />
        </button>
      </header>

      <div className={styles.banner} role="status">
        <svg
          className={styles.bannerIcon}
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <p className={styles.bannerText}>Concept Preview — not live functionality</p>
      </div>

      <main className={styles.main}>
        <div className={styles.chat}>
          <div className={styles.messages} ref={listRef} aria-live="polite">
            {phase === "loading" ? (
              <LoadingIndicator label="Looking at the Danish job market…" />
            ) : null}
            {insights ? (
              <>
                <ChatMessage message={insights.message} />
                <InsightsBlock stats={insights.stats} />
              </>
            ) : null}
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {phase === "analyzing" ? (
              <LoadingIndicator label="Analyzing your CV…" />
            ) : null}
            {phase === "matching" ? (
              <LoadingIndicator label="Finding matching roles…" />
            ) : null}
          </div>
          {phase === "awaiting-cv" ? (
            <CvUploader disabled={false} onFileChosen={onFileChosen} />
          ) : null}
        </div>
      </main>
    </div>
  );
}
