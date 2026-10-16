# Custom domains

A team's public site (`apps/sites`) is served from:

1. **Default:** the claimed platform subdomain after the slug is claimed.
2. **Optional:** a verified custom hostname the team attaches.
3. **Optional:** the FrontLit subdomain can be turned **off** once the custom domain is verified. Off means the host is unknown (404), not a redirect.

The API is the only host authority. `apps/sites` asks `GET /public/resolve-host?host=` and rewrites known hosts to `/sites/[teamId]/…`. Canonical URLs automatically use the verified custom host when present.

## Serving

| Custom domain           | subdomainPublic | Subdomain host     | Custom host | Canonical       |
| ----------------------- | --------------- | ------------------ | ----------- | --------------- |
| none / pending / failed | true (forced)   | serves             | 404         | subdomain       |
| verified                | true (default)  | serves             | serves      | custom hostname |
| verified                | false           | 404 / unknown host | serves      | custom hostname |

The slug stays reserved when hidden. Removing the custom domain always re-enables the subdomain so the site cannot go dark.

## DNS

Verification is two independent checks. Both must pass:

1. **Ownership** — `TXT` at `<team TXT record name>.<hostname>` equals the issued token. Standalone teams default to `_frontlit-verify`; provisioning integrations can assign a team-specific label.
2. **Routing**
    - Non-apex (`www.example.com`): `CNAME` chain includes the team's configured target, or `CUSTOM_DOMAIN_CNAME_TARGET` when no team override is set.
    - Apex (`example.com`): A record(s) pointing at the IPs in `CUSTOM_DOMAIN_A_RECORDS` (ALIAS/CNAME at the apex is not offered). Verification requires the apex A set to match; if the variable is unset, ownership TXT plus name-resolves is enough.

Do not put a raw CNAME at the zone apex unless the DNS host flattens it. Status flips only when the team clicks Check DNS (`POST /domain/custom/verify`).

## TLS ask

Custom hostnames are unbounded (any domain a team verifies), so the edge
cannot pre-list certificates. Caddy uses on-demand TLS and asks FrontLit
before Let's Encrypt issues a cert:

```
GET /public/tls-ask?domain=<hostname>
```

Caddy's `ask` protocol always sends `domain`. The handler is the same host
authority as `GET /public/resolve-host?host=`:

- **200** — issue or serve a certificate. Public claimed subdomain or
  verified custom host.
- **404** — refuse. Unknown host, unverified custom domain, or a hidden
  platform subdomain.

`apps/sites` does not terminate TLS. The cluster Caddyfile catch-all
`https://` site obtains the cert and reverse-proxies to `frontlit-sites`.

## Environment (`apps/api`)

| Variable                                       | Purpose                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PLATFORM_SITE_DOMAIN`                         | Suffix used to classify `<slug>.<domain>` (default `localhost`).                                                                                  |
| `CUSTOM_DOMAIN_CNAME_TARGET`                   | Default DNS target shown in the workspace and checked for non-apex CNAME when a team has no provisioning override. Defaults to `sites.<PLATFORM_SITE_DOMAIN>`. |
| `CUSTOM_DOMAIN_TXT_RECORD_NAME`                | Default relative TXT owner label. Defaults to `_frontlit-verify`; team provisioning can override it.                                               |
| `CUSTOM_DOMAIN_A_RECORDS`                      | Optional comma-separated IPv4 set required for apex hosts. Omit until anycast IPs are stable.                                                     |
| `SITES_BASE_URL` / `REVALIDATE_WEBHOOK_SECRET` | Domain mutations ping `apps/sites` with `{ teamId, invalidateHosts }` so the process host map drops immediately. ISR tag revalidation still runs. |

`apps/sites` needs no platform-domain setting. It forwards the normalized `Host` header.

## Local testing

1. Claim a slug in the workspace (`/website/domain`). The site is at `<slug>.localhost:3002` when `PLATFORM_SITE_DOMAIN=localhost`.
2. Attach a test hostname. Point `/etc/hosts` at the sites process, for example:

    ```
    127.0.0.1 www.example.test
    127.0.0.1 acme.localhost
    ```

3. Mock or publish the configured TXT + CNAME (or apex flattening) records, then Check DNS.
4. Toggle **Also serve this site on {slug}.{platform}**. With it off, `<slug>.localhost:3002` is an unknown host; the custom host still renders.

## Workspace

`/website/domain` has two cards: the FrontLit subdomain and the custom domain. After verify the DNS table stays visible (with satisfied state) so records can be re-copied. The custom host is canonical; the subdomain switch is an optional fallback.
