# Grafana Cloud: auth denial alerting (ALE-214)

Companion to [grafana-cloud-injection-alerting.md](grafana-cloud-injection-alerting.md). One rule. Same email contact point.

Structured auth logs use Loki labels `app=tookratt`, `event`, and `source` only. `reason` and `credential_type` are fields inside the JSON line, not labels.

## Alert rule

1. **Alerting** → **Alert rules** → **New alert rule**.
2. Query type: **LogQL** against the Loki datasource.
3. Query (more than 20 denials in 5 minutes, so ordinary scanner noise does not page):

```logql
count_over_time({app="tookratt", event="auth_denied"}[5m]) > 20
```

Equivalent explore filter:

```logql
{app="tookratt", event="auth_denied"}
```

4. **Evaluation interval:** `1m`.
5. Pending period: `1m`.
6. Notification: contact point `tookratt-email`.

A JWKS outage is HTTP 503 and is not an `auth_denied` event, so this rule does not fire for it.

## After login ships

[ALE-216](https://linear.app/alex-projects/issue/ALE-216) sends the signed-in session token. The app no longer sends a static API key, so a burst of 403s from chat is no longer the expected pre-login cutover. A few scanner denials can still stay under 20 in 5 minutes. Above that, treat the alert as an attack or a bad client.

## Related

- [ADR-0019](../adr/0019-accounts-and-access-control-on-supabase-auth.md) — access control. Revoke lags by up to one access-token hour.
- [ARCHITECTURE.md](../ARCHITECTURE.md) — route matrix and the Supabase settings.
