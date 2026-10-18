# Custom domains

A team's public site (`apps/sites`) is served from:

1. **Default:** the claimed platform subdomain after the slug is claimed.
2. **Optional:** one custom domain. Attaching `example.com` or `www.example.com` attaches **both** as a pair; any other host (`docs.example.com`) is attached alone. The team picks which host is **primary** (defaults to the one typed).

The API is the only host authority. `apps/sites` asks `GET /public/resolve-host?host=` and gets `{ teamId, canonicalHost, redirect }`. It 301-redirects when `redirect` is true (keeping path and query), otherwise rewrites to `/sites/[teamId]/…`.

## Serving

The canonical host is the verified primary, else the other verified custom host, else the subdomain. Every other host 301s to it.

| Custom domain           | Subdomain                                  | Custom hosts                | Canonical         |
| ----------------------- | ------------------------------------------ | --------------------------- | ----------------- |
| none / pending / failed | serves                                     | 404                         | subdomain         |
| one host verified       | 301, or serves when `redirectSubdomain` off | verified serves, other 301s | the verified host |
| both verified           | 301, or serves when `redirectSubdomain` off | primary serves, other 301s  | primary           |

`redirectSubdomain` defaults to true. Turning it off keeps the subdomain serving with `noindex`; its canonical tags still point at the custom host. Removing the custom domain makes the subdomain canonical again.

New sites start hidden from search engines (`hideFromSearch`): every page is `noindex`, robots.txt disallows everything and the sitemap is empty. The first verified custom domain turns it off; the team can also toggle it under Search engines on the Domain page.

A pending half of a pair resolves (and redirects) as soon as its sibling is verified. The shared TXT already proves the zone belongs to the team, so `www` starts working the moment its CNAME exists. The workspace still shows it as pending with a warning until Check DNS passes.

## DNS

1. **Ownership** — one `TXT` at `<team TXT record name>.<apex>` (or `.<hostname>` for an unpaired host) equals the issued token. Shared by both hosts of a pair. Standalone teams default to `_frontlit-verify`; provisioning integrations can assign a team-specific label.
2. **Routing**, per host:
    - Non-apex (`www.example.com`): `CNAME` chain includes the team's configured target, or `CUSTOM_DOMAIN_CNAME_TARGET` when no team override is set.
    - Apex (`example.com`): A record(s) pointing at the IPs in `CUSTOM_DOMAIN_A_RECORDS`. If the variable is unset, no A rows are shown and verification only requires the name to resolve.

A host is verified when the TXT and its own routing record pass. Status flips only when the team clicks Check DNS (`POST /domain/custom/verify`).

## TLS ask

Custom hostnames are unbounded (any domain a team verifies), so the edge
cannot pre-list certificates. Caddy uses on-demand TLS and asks FrontLit
before Let's Encrypt issues a cert:

```
GET /public/tls-ask?domain=<hostname>
```

Caddy's `ask` protocol always sends `domain`. The handler is the same host
authority as `GET /public/resolve-host?host=`:

- **200** — issue or serve a certificate. Claimed subdomain or any host of
  a custom domain with at least one verified host. Redirecting hosts need a
  certificate too, since the 301 is served over HTTPS.
- **404** — refuse. Unknown host or a custom domain with no verified host.

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
2. Attach a test apex hostname, for example `example.test`; `www.example.test` is added automatically. Point `/etc/hosts` at the sites process:

    ```
    127.0.0.1 example.test www.example.test
    ```

3. Mock or publish the TXT + routing records, then Check DNS (or set the `custom_domains` rows to `verified` directly in a dev database).
4. `http://www.example.test:3002/pricing?x=1` → 301 → `http://example.test:3002/pricing?x=1`, and `<slug>.localhost:3002/…` → 301 → `example.test:3002/…`. Redirects keep the request's scheme (`X-Forwarded-Proto` behind the edge) and port.

## Workspace

`/website/domain` has two cards: the FrontLit subdomain and the custom domain. The custom domain card lists both hosts with their status, a **Make primary** action, the DNS table (one routing record per host plus the shared TXT), a warning while only one host is verified, and the **Redirect subdomain** switch once a host is verified.
