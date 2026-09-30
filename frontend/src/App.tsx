import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { CHAT_HISTORY_MAX_TURNS, setUnauthorizedHandler } from "./api/client";
import { handleAuthChange } from "./api/authEvents";
import {
  clearPendingPasswordType,
  clearPendingToken,
  readPendingPasswordType,
  readPendingToken,
} from "./api/authHash";
import { initialAuthRedirect, supabase } from "./api/supabase";
import {
  armSessionEndedNote,
  didUserAskToLeave,
  disarmSessionEndedNote,
  markUserAskedToLeave,
  resetUserAskedToLeave,
  sessionEndedNoteArmed,
  signOutLocal,
} from "./api/authSession";
import { AdminsOnly, AdminPage } from "./components/AdminPage";
import { AppNav } from "./components/AppNav";
import { AuthLayout } from "./components/AuthLayout";
import { Chat } from "./components/Chat";
import { LoginPage } from "./components/LoginPage";
import { Mark } from "./components/Mark";
import { NewConversationIcon } from "./components/NewConversationIcon";
import { LinkErrorCard, SetPasswordPage } from "./components/SetPasswordPage";
import { Stats } from "./components/Stats";
import { isAdminSession } from "./utils/account";
import styles from "./App.module.css";

function sessionEndedFrom(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    "sessionEnded" in state &&
    (state as { sessionEnded?: unknown }).sessionEnded === true
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(initialAuthRedirect.errorCode);

  useEffect(() => {
    if (location.pathname === "/login") {
      disarmSessionEndedNote();
    }
  }, [location.pathname]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      const nextSession = event === "SIGNED_OUT" ? null : next;
      sessionRef.current = nextSession;
      if (event === "SIGNED_OUT") {
        clearPendingPasswordType();
        clearPendingToken();
      }
      handleAuthChange(event, {
        userAskedToLeave: didUserAskToLeave(),
        navigateToSessionEnded: () => {
          armSessionEndedNote();
          navigate("/login", { replace: true, state: { sessionEnded: true } });
        },
        resetLeaveFlag: resetUserAskedToLeave,
      });
      setSession(nextSession);
      setReady(true);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      navigate("/login", { replace: true, state: { sessionEnded: true } });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate]);

  const logOut = useCallback(async () => {
    markUserAskedToLeave();
    await signOutLocal();
    navigate("/login", { replace: true });
  }, [navigate]);

  if (!ready) {
    return <div className={styles.booting} />;
  }

  if (linkError) {
    return (
      <AuthLayout>
        <LinkErrorCard
          errorCode={linkError}
          onGoToLogin={() => setLinkError(null)}
        />
      </AuthLayout>
    );
  }

  const pendingToken = readPendingToken();
  const pendingType = readPendingPasswordType();
  if (pendingToken || (pendingType && session)) {
    const linkType = pendingToken?.type ?? pendingType;
    if (linkType) {
      return (
        <AuthLayout>
          <SetPasswordPage
            type={linkType}
            email={pendingToken ? "" : (session?.user.email ?? "")}
            onDone={() => navigate("/market", { replace: true })}
          />
        </AuthLayout>
      );
    }
  }

  return (
    <Routes>
      <Route
        path="/set-password"
        element={
          sessionRef.current ? (
            <Navigate to="/market" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/login"
        element={
          sessionRef.current ? (
            <Navigate to="/market" replace />
          ) : (
            <AuthLayout>
              <LoginPage sessionEnded={sessionEndedFrom(location.state)} />
            </AuthLayout>
          )
        }
      />
      <Route
        path="*"
        element={
          sessionRef.current ? (
            <AppShell session={session ?? sessionRef.current} onLogout={() => void logOut()} />
          ) : (
            <GuestRedirect />
          )
        }
      />
    </Routes>
  );
}

function GuestRedirect() {
  const note = sessionEndedNoteArmed();
  return <Navigate to="/login" replace state={note ? { sessionEnded: true } : undefined} />;
}

function AppShell({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const { pathname } = useLocation();
  const isChat = pathname === "/chat";
  const [chatKey, setChatKey] = useState(0);
  const admin = isAdminSession(session);
  const email = session.user.email ?? "";

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brandColumn}>
          <div className={styles.brand}>
            <Mark className={styles.mark} />
            <div className={styles.brandText}>
              <h1 className={styles.title}>töökratt</h1>
              <p className={styles.subtitle}>
                Job market research for Nordic and European startups
              </p>
            </div>
          </div>
          <AppNav showAdmin={admin} />
        </div>
        <div className={styles.headerActions}>
          {isChat ? (
            <button
              type="button"
              className={styles.lockButton}
              onClick={() => setChatKey((key) => key + 1)}
              aria-label="New conversation"
            >
              <NewConversationIcon />
            </button>
          ) : null}
          {email ? <span className={styles.accountEmail}>{email}</span> : null}
          <button type="button" className={styles.logoutButton} onClick={onLogout} aria-label="Log out">
            <LogoutIcon />
            <span className={styles.logoutLabel}>Log out</span>
          </button>
        </div>
      </header>

      {isChat ? (
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
            <span className={styles.bannerFull}>
              Töökratt remembers this conversation, so follow-ups like &ldquo;any others?&rdquo; work.
              Memory covers the last {CHAT_HISTORY_MAX_TURNS} turns, stays in this tab, and resets
              when you refresh or start a new conversation.
            </span>
            <span className={styles.bannerShort}>
              Remembers the last {CHAT_HISTORY_MAX_TURNS} turns in this tab. Refreshing starts over.
            </span>
          </p>
        </div>
      ) : null}

      <main className={styles.main}>
        <Routes>
          <Route path="/" element={<Navigate to="/market" replace />} />
          <Route path="/market" element={<Stats />} />
          <Route path="/stats" element={<Navigate to="/market" replace />} />
          <Route path="/chat" element={<Chat key={chatKey} />} />
          <Route
            path="/admin"
            element={admin ? <AdminPage currentUserId={session.user.id} /> : <AdminsOnly />}
          />
          <Route path="*" element={<Navigate to="/market" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 17l5-5-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
