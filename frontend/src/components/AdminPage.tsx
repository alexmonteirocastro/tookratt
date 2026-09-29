import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ApiHttpError,
  ApiNetworkError,
  ADMIN_PAGE_SIZE,
  createInvite,
  createResetLink,
  listAdminUsers,
  revokeUser,
  restoreUser,
} from "../api/client";
import type { AdminUser } from "../api/types";
import { formatAdminDate, isFullEmail, roleLabel } from "../utils/account";
import { ShowOnceLink } from "./ShowOnceLink";
import { StateIcon } from "./AuthLayout";
import styles from "./Admin.module.css";

interface AdminPageProps {
  currentUserId: string;
}

interface ShownLink {
  kind: "invite" | "reset";
  email: string;
  actionLink: string;
}

export function AdminPage({ currentUserId }: AdminPageProps) {
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [invitePending, setInvitePending] = useState(false);
  const [shownLink, setShownLink] = useState<ShownLink | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    setLoadError(null);
    try {
      const body = await listAdminUsers(nextPage);
      setUsers(body.users);
      setPage(body.page);
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) {
        return;
      }
      const message =
        error instanceof ApiNetworkError || error instanceof ApiHttpError
          ? error.message
          : "Something went wrong. Wait a moment and try again.";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!isFullEmail(trimmed)) {
      setEmailError("Enter a full email address.");
      return;
    }
    setEmailError(null);
    setInviteError(null);
    setInvitePending(true);
    try {
      const actionLink = await createInvite(trimmed);
      setShownLink({ kind: "invite", email: trimmed, actionLink });
      setEmail("");
      await load(page);
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) {
        return;
      }
      if (error instanceof ApiHttpError && error.code === "account_exists") {
        setInviteError("That person already has an account.");
        return;
      }
      setInviteError(
        error instanceof ApiHttpError || error instanceof ApiNetworkError
          ? error.message
          : "Something went wrong. Wait a moment and try again.",
      );
    } finally {
      setInvitePending(false);
    }
  }

  async function onRevoke(userId: string) {
    setBusyId(userId);
    setActionError(null);
    try {
      await revokeUser(userId);
      setConfirmId(null);
      await load(page);
    } catch (error) {
      if (!(error instanceof ApiHttpError && error.status === 401)) {
        setActionError(
          error instanceof ApiHttpError ? error.message : "Something went wrong. Wait a moment and try again.",
        );
      }
    } finally {
      setBusyId(null);
    }
  }

  async function onRestore(userId: string) {
    setBusyId(userId);
    setActionError(null);
    try {
      await restoreUser(userId);
      await load(page);
    } catch (error) {
      if (!(error instanceof ApiHttpError && error.status === 401)) {
        setActionError(
          error instanceof ApiHttpError ? error.message : "Something went wrong. Wait a moment and try again.",
        );
      }
    } finally {
      setBusyId(null);
    }
  }

  async function onReset(user: AdminUser) {
    setBusyId(user.id);
    setActionError(null);
    try {
      const actionLink = await createResetLink(user.id);
      setShownLink({
        kind: "reset",
        email: user.email ?? "this account",
        actionLink,
      });
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) {
        return;
      }
      setActionError(
        error instanceof ApiHttpError
          ? error.message
          : "Something went wrong. Wait a moment and try again.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={styles.page}>
      <div>
        <h2 className={styles.heading}>People</h2>
        <p className={styles.intro}>Invite someone, send a reset link, or revoke access.</p>
      </div>
      <section className={styles.card}>
        <form onSubmit={(event) => void onInvite(event)} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="invite-email">
              Invite by email
            </label>
            <div className={styles.inviteControls}>
              <input
                id="invite-email"
                className={emailError ? `${styles.input} ${styles.inputInvalid}` : styles.input}
                type="email"
                placeholder="name@example.com"
                value={email}
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? "invite-email-error" : undefined}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setEmailError(null);
                }}
                disabled={invitePending}
              />
              <button className={styles.inviteButton} type="submit" disabled={invitePending}>
                {invitePending ? <span className={styles.spinner} aria-hidden="true" /> : null}
                Create invite link
              </button>
            </div>
          </div>
          {emailError ? (
            <p id="invite-email-error" className={styles.fieldError} role="alert">
              {emailError}
            </p>
          ) : null}
          {inviteError ? (
            <p className={styles.formError} role="alert">
              {inviteError}
            </p>
          ) : null}
        </form>
        {shownLink ? (
          <ShowOnceLink
            kind={shownLink.kind}
            email={shownLink.email}
            actionLink={shownLink.actionLink}
            onDone={() => setShownLink(null)}
          />
        ) : null}
      </section>
      <section className={styles.card}>
        {loading ? (
          <p role="status">Loading people…</p>
        ) : loadError ? (
          <p className={styles.formError} role="alert">
            {loadError}
          </p>
        ) : users.length === 0 ? (
          <p className={styles.empty}>No one here yet. Invite someone above.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Added</th>
                <th>Last login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isYou={user.id === currentUserId}
                  confirming={confirmId === user.id}
                  busy={busyId === user.id}
                  onAskRevoke={() => {
                    setActionError(null);
                    setConfirmId(user.id);
                  }}
                  onCancelRevoke={() => setConfirmId(null)}
                  onRevoke={() => void onRevoke(user.id)}
                  onRestore={() => void onRestore(user.id)}
                  onReset={() => void onReset(user)}
                />
              ))}
            </tbody>
          </table>
        )}
        {actionError ? (
          <p className={styles.formError} role="alert">
            {actionError}
          </p>
        ) : null}
        {page > 1 || users.length === ADMIN_PAGE_SIZE ? (
          <div className={styles.pager}>
            {page > 1 ? (
              <button type="button" className={styles.textButton} onClick={() => setPage(page - 1)}>
                Previous page
              </button>
            ) : null}
            {users.length === ADMIN_PAGE_SIZE ? (
              <button type="button" className={styles.textButton} onClick={() => setPage(page + 1)}>
                Next page
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function UserRow({
  user,
  isYou,
  confirming,
  busy,
  onAskRevoke,
  onCancelRevoke,
  onRevoke,
  onRestore,
  onReset,
}: {
  user: AdminUser;
  isYou: boolean;
  confirming: boolean;
  busy: boolean;
  onAskRevoke: () => void;
  onCancelRevoke: () => void;
  onRevoke: () => void;
  onRestore: () => void;
  onReset: () => void;
}) {
  const email = user.email ?? "Unknown";
  const role = roleLabel(user.role);
  const lastLogin = formatAdminDate(user.last_sign_in_at);
  const meta =
    user.status === "invited"
      ? `${role} · Never logged in`
      : `${role} · Last login ${lastLogin}`;

  return (
    <tr className={confirming ? styles.rowConfirm : undefined}>
      <td className={styles.emailCell}>
        <span>
          {email}
          {isYou ? " (you)" : ""}
        </span>
        <span className={styles.mobileOnly}>
          <StatusPill status={user.status} />
        </span>
      </td>
      <td className={styles.roleCell}>{role}</td>
      <td className={`${styles.hideMobile} ${styles.statusCell}`}>
        <StatusPill status={user.status} />
      </td>
      <td className={styles.addedCell}>{formatAdminDate(user.created_at)}</td>
      <td className={styles.seenCell}>{lastLogin}</td>
      <td className={styles.actionsCell}>
        {confirming ? (
          <p className={`${styles.confirmCopy} ${styles.meta}`}>
            Revoke access? Takes effect within an hour.
          </p>
        ) : (
          <p className={styles.meta}>{meta}</p>
        )}
        {isYou ? (
          <span className={styles.ownNote}>No actions on your own account</span>
        ) : confirming ? (
          <div className={styles.actions}>
            <p className={`${styles.confirmCopy} ${styles.confirmDesktop}`}>
              Revoke access? Takes effect within an hour.
            </p>
            <button type="button" className={styles.button} onClick={onCancelRevoke} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonDangerSolid}`}
              onClick={onRevoke}
              disabled={busy}
            >
              Revoke
            </button>
          </div>
        ) : (
          <div className={styles.actions}>
            {user.status === "revoked" ? (
              <button type="button" className={styles.button} onClick={onRestore} disabled={busy}>
                Restore access
              </button>
            ) : (
              <>
                <button type="button" className={styles.button} onClick={onReset} disabled={busy}>
                  Reset link
                </button>
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonDanger}`}
                  onClick={onAskRevoke}
                  disabled={busy}
                >
                  Revoke
                </button>
              </>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: AdminUser["status"] }) {
  const label = status === "active" ? "Active" : status === "invited" ? "Invited" : "Revoked";
  const tone =
    status === "active" ? styles.pillActive : status === "invited" ? styles.pillInvited : styles.pillRevoked;
  return <span className={`${styles.pill} ${tone}`}>{label}</span>;
}

export function AdminsOnly() {
  return (
    <section className={styles.card}>
      <div className={styles.state}>
        <StateIcon name="denied" />
        <h2 className={styles.heading}>Admins only</h2>
        <p className={styles.stateBody}>
          This page is for inviting and managing people. Your account can use Job market and Chat.
        </p>
        <Link className={styles.stateLink} to="/market">
          Go to Job market
        </Link>
      </div>
    </section>
  );
}
