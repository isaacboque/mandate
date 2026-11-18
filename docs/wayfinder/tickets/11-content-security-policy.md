---
type: task (AFK)
status: open
---
## Question
The review added `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` and `Permissions-Policy`. A Content-Security-Policy would also stop an injected script from running, but it has to match what the page really loads (own scripts and styles, inline `style` attributes from React, `https:` product images, same-origin API) and a wrong policy blanks the demo.

## Recommended answer
Try `default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'` in report-only mode first, load every step of the flow in a real browser (`npm run screenshots`), and only then enforce it.
