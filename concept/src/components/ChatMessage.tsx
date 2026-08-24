import ReactMarkdown, { type Components } from "react-markdown";
import styles from "./ChatMessage.module.css";

const assistantMarkdownComponents: Components = {
  a: ({ href, children, ...props }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
};

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
}

interface ChatMessageProps {
  message: DisplayMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <article
      className={`${styles.message} ${isUser ? styles.user : styles.assistant} ${message.isError ? styles.error : ""}`}
      aria-label={isUser ? "Your message" : "Assistant reply"}
    >
      {isUser ? (
        <p className={styles.content}>{message.content}</p>
      ) : (
        <div className={styles.contentMarkdown}>
          <ReactMarkdown
            disallowedElements={["img"]}
            components={assistantMarkdownComponents}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      )}
    </article>
  );
}
