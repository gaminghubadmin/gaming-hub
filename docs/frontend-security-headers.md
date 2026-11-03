# Frontend security headers

The HTML includes baseline `object-src 'none'; base-uri 'self'` CSP and
`no-referrer` protection. These apply after the updated frontend is deployed.
They do not replace HTTP response headers, including frame protection.

For the existing Render static site, add the entries from
`apps/web/render-security-headers.yaml` in Dashboard → Headers, or merge that
fragment into the site's existing Blueprint. The fragment is not itself a
Blueprint and pushing it alone does not change Render headers. Do not create a
second service. Apply the following values to `/*`:

| Header | Value |
| --- | --- |
| Content-Security-Policy | `frame-ancestors 'none'; object-src 'none'; base-uri 'self'` |
| X-Frame-Options | `DENY` |
| Referrer-Policy | `no-referrer` |
| X-Content-Type-Options | `nosniff` |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` |

The fragment also provides Permissions-Policy and a report-only CSP. Generate
the report-only connection allowlist using the actual public API, socket and
Supabase endpoints:

```sh
node scripts/render-security-headers.mjs API_HTTPS_URL SOCKET_HTTPS_URL SUPABASE_HTTPS_URL
```

Review report-only violations before enforcing a stricter resource policy.
For Docker hosting, `apps/web/nginx.conf` supplies response headers, including
on fingerprinted assets; avoid location-level `add_header` directives that
override inheritance.

## Internal credentials and APKs

The API browser CORS allowlist excludes `X-Internal-Key`. Internal API and
socket services still authenticate server-to-server requests using that header;
CORS is not an authentication mechanism.

Keep `INTERNAL_API_KEY` and service-role credentials only in backend environment
variables. Never give them a `VITE_` prefix or include them in frontend source,
assets, or native resources. Public Supabase anon keys are client configuration,
not backend secrets. Treat the downloadable APK and all JavaScript as public;
minification and disabled source maps cannot protect embedded credentials.

After deploying and configuring Render, verify actual responses:

```sh
curl -sSI https://gaming-hub-frontend.onrender.com/
```

Confirm the five response headers above, and repeat for a deployed asset URL.
An older downloadable APK needs a separate inspection or rebuild; rebuilding
the web frontend does not replace an existing APK.
