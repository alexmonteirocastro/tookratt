import { useCallback, useEffect, useState } from "react";
import { CHAT_HISTORY_MAX_TURNS, setUnauthorizedHandler } from "./api/client";
import { hasStoredApiKey } from "./api/authStorage";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { Chat } from "./components/Chat";
import { LockIcon } from "./components/LockIcon";
import { NewConversationIcon } from "./components/NewConversationIcon";
import styles from "./App.module.css";

export default function App() {
  const [hasApiKey, setHasApiKey] = useState(() => hasStoredApiKey());
  const [isModalOpen, setIsModalOpen] = useState(() => !hasStoredApiKey());
  const [chatKey, setChatKey] = useState(0);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const handleAuthRequired = useCallback(() => {
    setHasApiKey(false);
    setIsModalOpen(true);
  }, []);

  const startNewConversation = useCallback(() => {
    setChatKey((key) => key + 1);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(handleAuthRequired);
    return () => setUnauthorizedHandler(null);
  }, [handleAuthRequired]);

  return (
    <div className={styles.app}>
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
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.lockButton}
            onClick={startNewConversation}
            aria-label="New conversation"
          >
            <NewConversationIcon />
          </button>
          <button
            type="button"
            className={styles.lockButton}
            onClick={openModal}
            aria-label={hasApiKey ? "Change API key" : "Enter API key"}
          >
            <LockIcon locked={!hasApiKey} />
          </button>
        </div>
      </header>

      <div className={styles.banner} role="note">
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
        <p className={styles.bannerText}>
          Töökratt remembers this conversation — follow-ups like &ldquo;any others?&rdquo; work.
          Memory covers the last {CHAT_HISTORY_MAX_TURNS} turns, stays in this tab, and resets
          if you refresh or start a new conversation.
        </p>
      </div>

      <main className={styles.main}>
        <Chat key={chatKey} />
      </main>
      <ApiKeyModal
        isOpen={isModalOpen}
        allowDismiss={hasApiKey}
        onClose={() => setIsModalOpen(false)}
        onVerified={() => setHasApiKey(true)}
      />
    </div>
  );
}
