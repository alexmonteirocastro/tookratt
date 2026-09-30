# Supabase production (ALE-247)

Auth projects, the daily dump, how to restore one, and the schedule heartbeat. No key values and no email addresses.

## Projects

| | Dev | Production |
| --- | --- | --- |
| Ref | `uuaoiyzztkxzrzvfddil` | `jogkvchexsfiwezdpirb` |
| URL | `https://uuaoiyzztkxzrzvfddil.supabase.co` | `https://jogkvchexsfiwezdpirb.supabase.co` |
| Region | Ireland (`eu-west-1`), from the [ALE-213](https://linear.app/alex-projects/issue/ALE-213) spike | Central EU (`aws-1-eu-central-1`) |

Production is Central EU because that region was chosen for production. Dev stayed in Ireland. This is not a Render constraint.

Both projects, set in the dashboard:

- Sign-ups are off.
- Minimum password length is 8.
- Email OTP expiry is 86400 seconds.
- No custom SMTP.
- Legacy `anon` and `service_role` keys are disabled.
- Site URL and redirect allow-list: dev `http://localhost:5173`, production `https://app.tookratt.com`. Invite and recovery links land on that origin with the session in the URL fragment.

## Dump

[`.github/workflows/supabase-dump.yml`](../../.github/workflows/supabase-dump.yml) runs at `15 1 * * *` and can also be started with `workflow_dispatch`. It uses `pg_dump` 17. Before the dump it runs `select 1` and checks the server major version.

Each run writes one prefix, `dumps/<UTC timestamp>/`, with two custom-format files:

- `auth-data.dump` — data only, `auth` schema, excluding `auth.schema_migrations`, `--no-owner --no-acl`.
- `public.dump` — schema and data, `public` schema, `--no-owner --no-acl`.

The bucket is the private R2 bucket `tookratt-supabase-dumps`, jurisdiction `eu`. The S3 endpoint is `https://${CLOUDFLARE_ACCOUNT_ID}.eu.r2.cloudflarestorage.com`. Objects expire after 30 days. The bucket and the lifecycle rule were created once, outside the workflow.

GitHub Actions secrets, names only:

- `SUPABASE_DB_URL` — production database URL the dump connects with.
- `CLOUDFLARE_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` — the workflow's write key. Do not use this key to download a dump.

## Restore

Do this in a scratch directory, not in the repo. Do not commit the dumps, the scratch project, or any credentials. Stop the local stack when the check is done.

### Download

Create a read-only R2 token scoped to `tookratt-supabase-dumps` (object read). Do not reuse `R2_ACCESS_KEY_ID`. Download one prefix, then delete the token in the Cloudflare dashboard. Nothing long-lived should be left from the download.

```bash
export AWS_ACCESS_KEY_ID="…"       # the read-only token
export AWS_SECRET_ACCESS_KEY="…"
export AWS_DEFAULT_REGION=auto
endpoint="https://${CLOUDFLARE_ACCOUNT_ID}.eu.r2.cloudflarestorage.com"
prefix="dumps/<UTC timestamp>"

aws s3 cp "s3://tookratt-supabase-dumps/${prefix}/auth-data.dump" ./auth-data.dump \
  --endpoint-url "$endpoint"
aws s3 cp "s3://tookratt-supabase-dumps/${prefix}/public.dump" ./public.dump \
  --endpoint-url "$endpoint"
```

The 2026-09-29 proof did not create that token. It downloaded `dumps/20260929T065405Z/` (scheduled run 36533523475) with the logged-in Cloudflare account:

```bash
npx wrangler r2 object get tookratt-supabase-dumps/dumps/20260929T065405Z/auth-data.dump \
  --file ./auth-data.dump --remote --jurisdiction eu
npx wrangler r2 object get tookratt-supabase-dumps/dumps/20260929T065405Z/public.dump \
  --file ./public.dump --remote --jurisdiction eu
```

That is not the workflow write key. No token was created, so none was left to delete. A machine that should not use that login uses the read-only token above and deletes it.

### Local stack

There is no `supabase/` config in the repo. `supabase init` with the current CLI writes `major_version = 17`. Older CLIs default to 15. Prod and the dump client are 17, so confirm the line before starting.

```bash
mkdir scratch && cd scratch
npx supabase init --yes
# supabase/config.toml must contain: major_version = 17
npx supabase start
```

The database container is `supabase_db_<directory name>`. The local URL is `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

### Load

GoTrue on that stack already owns `auth`. Copy the files into the database container and restore there.

```bash
container="supabase_db_<directory name>"
docker cp ./auth-data.dump "$container":/tmp/auth-data.dump
docker cp ./public.dump "$container":/tmp/public.dump

docker exec "$container" pg_restore \
  --data-only --no-owner \
  --dbname=postgres --username=postgres \
  /tmp/auth-data.dump

docker exec "$container" pg_restore \
  --no-owner \
  --dbname=postgres --username=postgres \
  /tmp/public.dump
```

Do not pass `--disable-triggers`. The local `postgres` role is not a superuser, and `auth` tables are owned by `supabase_auth_admin`, so that flag fails every `ALTER TABLE … DISABLE TRIGGER ALL` with `must be owner of table`. The `COPY` does not need it. A hosted Supabase project has the same limit: you are not a superuser there either.

On 2026-09-29, against local GoTrue `v2.197.0` and Postgres 17.6:

- `auth-data.dump` exited 0 and printed nothing.
- `public.dump` exited 1 with one ignored error, `schema "public" already exists` on `CREATE SCHEMA public`, and the line `errors ignored on restore: 1`. That dump had no tables in `public`.

Stop if either restore prints something else. Then confirm the admin account without selecting an email:

```bash
docker exec "$container" psql -U postgres -d postgres -c \
  "select count(*) filter (where raw_app_meta_data->>'role' = 'admin') as admin_accounts, count(*) as accounts from auth.users;"
```

On 2026-09-29 that query returned `admin_accounts = 1` and `accounts = 1`. Stop if a restore of this same dump does not. Then:

```bash
npx supabase stop --no-backup
```

Delete the dump files. Do not commit the scratch directory.

## Schedule heartbeat

A dump that nobody notices has stopped is not a backup. Both [`.github/workflows/supabase-dump.yml`](../../.github/workflows/supabase-dump.yml) and [`.github/workflows/ingest.yml`](../../.github/workflows/ingest.yml) push one Loki line after a successful **scheduled** run:

```text
{app="tookratt", event="schedule_heartbeat", source="supabase_dump"}
{app="tookratt", event="schedule_heartbeat", source="ingest"}
```

The step condition is `if: success() && github.event_name == 'schedule'`. A `workflow_dispatch` run does not refresh the line, so a hand trigger cannot hide a disabled timer. Ingest logs with `print`, so this line is the only ingest signal an absence rule can watch. The ingest heartbeat is after the marketing Pages hook. A failed hook is `continue-on-error` and does not fail the sync.

### Alert rules

Reuse the contact point `tookratt-email` from [grafana-cloud-injection-alerting.md](grafana-cloud-injection-alerting.md). One rule per source, so the alert title says which schedule stopped.

| Rule | Identifier | Query |
|---|---|---|
| Schedule heartbeat missing: supabase_dump | `ffzpbtlt5ryf4e` | `absent_over_time({app="tookratt", event="schedule_heartbeat", source="supabase_dump"}[36h])` |
| Schedule heartbeat missing: ingest | `cfzpbztihwveof` | `absent_over_time({app="tookratt", event="schedule_heartbeat", source="ingest"}[36h])` |

For each rule:

1. **Alerting** → **Alert rules** → **New alert rule**, folder `Hubster`.
2. Query type: **LogQL**, type **Instant**, datasource `grafanacloud-cosmicmerlin1468-logs`. The stack's default is the Prometheus datasource and it cannot be changed (provisioned), so switch it first. Not `…-alert-state-history`: that Loki source holds Grafana's alert state, not app logs.
3. Condition: fire when the query **is above** `0`.
4. Evaluation group: `schedule-heartbeat`, interval `1h`. Create it once, with the first rule, and pick it for the second. Do not put these rules in the group the auth and injection rules use: changing a group's interval changes every rule in it. Pending period: `0`. Keep firing for: None.
5. **Alert state if no data:** **Normal**. `absent_over_time` returns nothing while heartbeats arrive, so No Data is the healthy state. Left at the default, it sends a No Data notification on a healthy schedule.
6. **Alert state if execution error:** **Error**.
7. Contact point: `tookratt-email`.
8. Summary: `Ingest schedule heartbeat missing` / `Supabase dump schedule heartbeat missing`. Description: `No scheduled <ingest|supabase-dump> heartbeat for 36h. Check .github/workflows/<ingest|supabase-dump>.yml and whether GitHub disabled the schedule.`

Leave the 36-hour window. The ingest heartbeat landed about 4 hours after its 00:00 UTC schedule on 2026-09-30 (GitHub start delay plus job run time), and the window absorbs that. With a 1h interval and the default of 2 missing-series evaluations, an alert can take up to about 2 hours to resolve after a heartbeat arrives.

The Loki push secret is `logs:write` and cannot create the rule; this is a Grafana Cloud click.

### Proved once

On 2026-09-29/30 the ingest rule fired at 09:21 UTC, when no `source="ingest"` heartbeat existed yet, and resolved at 03:54 UTC after the first scheduled ingest. The dump rule never fired, because a dump heartbeat was already in Loki; both rules use the same query shape. Times and details are on [ALE-247](https://linear.app/alex-projects/issue/ALE-247).

## Privacy

The notice is [https://tookratt.com/privacy](https://tookratt.com/privacy) ([ALE-250](https://linear.app/alex-projects/issue/ALE-250)).

The Supabase DPA is published at <https://supabase.com/legal/dpa>. It supplements and forms part of the [Supabase Terms of Service](https://supabase.com/terms), and it is effective as of the effective date of that agreement. It does not need a separate countersignature. The organization legal settings page was not opened for this note.

Deletion on request is the Supabase dashboard: production project → **Authentication** → **Users** → delete the user. The admin API does not delete users. It invites, lists, revokes, restores, and sends a reset link. [ALE-251](https://linear.app/alex-projects/issue/ALE-251) would later move deletion into `/admin`. Until that ships, the dashboard step is the deletion path on purpose. A dump can still hold the account for up to 30 days.

## Related

- [ADR-0019](../adr/0019-accounts-and-access-control-on-supabase-auth.md) — Decision 5 is unchanged. The follow-up note points the pause, backup, and silent-schedule risks here.
- [ARCHITECTURE.md](../ARCHITECTURE.md) — `SUPABASE_URL` names both project refs.
