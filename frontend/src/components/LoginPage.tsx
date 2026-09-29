import { useState, type FormEvent } from "react";
import { classifyAuthError, AUTH_FALLBACK_MESSAGE, CREDENTIALS_MESSAGE } from "../api/authErrors";
import { supabase } from "../api/supabase";
import { isFullEmail } from "../utils/account";
import { AuthCard, FieldError, Spinner, StateIcon } from "./AuthLayout";
import styles from "./Auth.module.css";

interface LoginPageProps {
  sessionEnded: boolean;
}

export function LoginPage({ sessionEnded }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!isFullEmail(trimmed)) {
      setEmailError("Enter a full email address.");
      return;
    }
    setEmailError(null);
    setFormError(null);
    setPending(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });
    setPending(false);
    if (!error) {
      return;
    }
    const kind = classifyAuthError(error);
    if (kind === "paused") {
      setPaused(true);
      return;
    }
    if (kind === "credentials") {
      setFormError(CREDENTIALS_MESSAGE);
      return;
    }
    setFormError(AUTH_FALLBACK_MESSAGE);
  }

  if (paused) {
    return (
      <AuthCard>
        <div className={styles.state}>
          <StateIcon name="paused" />
          <h2 className={styles.heading}>Paused right now</h2>
          <p className={styles.stateBody}>
            Töökratt is paused right now. Contact us and we'll get it back up.
          </p>
          <a className={styles.stateLink} href="mailto:hello@tookratt.com">
            hello@tookratt.com
          </a>
        </div>
      </AuthCard>
    );
  }

  return (
    <>
      <AuthCard>
        {sessionEnded ? (
          <p className={styles.sessionNote} role="status">
            You've been logged out. Log in again to keep going.
          </p>
        ) : null}
        <h2 className={styles.heading}>Log in</h2>
        {formError ? (
          <p className={styles.formError} role="alert">
            {formError}
          </p>
        ) : (
          <p className={styles.lede}>Töökratt is invite-only. Use the email your invite was sent to.</p>
        )}
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              className={emailError ? `${styles.input} ${styles.inputInvalid}` : styles.input}
              type="email"
              autoComplete="username"
              value={email}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? "login-email-error" : undefined}
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailError(null);
              }}
              disabled={pending}
            />
            {emailError ? <FieldError id="login-email-error">{emailError}</FieldError> : null}
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              className={styles.input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={pending}
            />
          </div>
          <button className={styles.primary} type="submit" disabled={pending}>
            {pending ? <Spinner /> : null}
            {pending ? "Logging in" : "Log in"}
          </button>
        </form>
      </AuthCard>
      <p className={styles.aside}>
        No account?{" "}
        <a href="https://tookratt.com">Request access at tookratt.com</a>
      </p>
    </>
  );
}
