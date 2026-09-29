import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  AUTH_FALLBACK_MESSAGE,
  classifyAuthError,
} from "../api/authErrors";
import { clearPendingPasswordType, type PasswordLinkType } from "../api/authHash";
import { supabase } from "../api/supabase";
import { AuthCard, FieldError, Spinner, StateIcon } from "./AuthLayout";
import styles from "./Auth.module.css";

interface SetPasswordPageProps {
  type: PasswordLinkType;
  email: string;
  onDone: () => void;
}

export function SetPasswordPage({ type, email, onDone }: SetPasswordPageProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [pending, setPending] = useState(false);
  const invite = type === "invite";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    let invalid = false;
    if (password.length < 8) {
      setPasswordError("Use at least 8 characters.");
      invalid = true;
    } else {
      setPasswordError(null);
    }
    if (password !== confirm) {
      setConfirmError("The two passwords don't match.");
      invalid = true;
    } else {
      setConfirmError(null);
    }
    if (invalid) {
      return;
    }
    setFormError(null);
    setPending(true);
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (error) {
      const kind = classifyAuthError(error);
      if (kind === "paused") {
        setPaused(true);
        return;
      }
      setFormError(AUTH_FALLBACK_MESSAGE);
      return;
    }
    clearPendingPasswordType();
    onDone();
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
    <AuthCard>
      <h2 className={styles.heading}>{invite ? "Welcome to Töökratt" : "Set a new password"}</h2>
      <p className={styles.lede}>
        {invite ? (
          <>
            Set a password for {email}. You'll log in with this email and password from now on.
          </>
        ) : (
          <>
            For {email}. Your old password stops working once you save this one.
          </>
        )}
      </p>
      {formError ? (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      ) : null}
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="new-password">
            {invite ? "Password" : "New password"}
          </label>
          <input
            id="new-password"
            className={passwordError ? `${styles.input} ${styles.inputInvalid}` : styles.input}
            type="password"
            autoComplete="new-password"
            value={password}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? "new-password-error" : "password-rule"}
            onChange={(event) => {
              setPassword(event.target.value);
              setPasswordError(null);
            }}
            disabled={pending}
          />
          {passwordError ? (
            <FieldError id="new-password-error">{passwordError}</FieldError>
          ) : (
            <p id="password-rule" className={styles.hint}>
              At least 8 characters.
            </p>
          )}
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="confirm-password">
            Type it again
          </label>
          <input
            id="confirm-password"
            className={confirmError ? `${styles.input} ${styles.inputInvalid}` : styles.input}
            type="password"
            autoComplete="new-password"
            value={confirm}
            aria-invalid={confirmError ? true : undefined}
            aria-describedby={confirmError ? "confirm-password-error" : undefined}
            onChange={(event) => {
              setConfirm(event.target.value);
              setConfirmError(null);
            }}
            disabled={pending}
          />
          {confirmError ? <FieldError id="confirm-password-error">{confirmError}</FieldError> : null}
        </div>
        <button className={styles.primary} type="submit" disabled={pending}>
          {pending ? <Spinner /> : null}
          {invite ? "Set password and continue" : "Save new password"}
        </button>
      </form>
    </AuthCard>
  );
}

export function LinkErrorCard({
  errorCode,
  onGoToLogin,
}: {
  errorCode: string;
  onGoToLogin: () => void;
}) {
  const expired = errorCode === "otp_expired";
  return (
    <AuthCard>
      <div className={styles.state}>
        <StateIcon name={expired ? "expired" : "revoked"} />
        <h2 className={styles.heading}>
          {expired ? (
            "This link has expired"
          ) : (
            <>
              This link doesn<span className={styles.apostrophe}>'</span>t work
            </>
          )}
        </h2>
        <p className={styles.stateBody}>
          {expired ? (
            <>
              Links work once and last 24 hours. Ask for a new one at{" "}
              <a className={styles.stateLink} href="mailto:hello@tookratt.com">
                hello@tookratt.com
              </a>
              .
            </>
          ) : (
            <>
              Your account can't use it right now. Write to{" "}
              <a className={styles.stateLink} href="mailto:hello@tookratt.com">
                hello@tookratt.com
              </a>{" "}
              if that seems wrong.
            </>
          )}
        </p>
        {expired ? (
          <Link className={styles.stateLink} to="/login" onClick={onGoToLogin}>
            Go to log in
          </Link>
        ) : null}
      </div>
    </AuthCard>
  );
}
