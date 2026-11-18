/** Turns raw API errors into messages a person can act on. */
export function friendlyError(message: string): string {
  // The hosted demo runs on free hosting that sleeps when idle: a proxy answers 502/503/504 (or an HTML page) until it is awake.
  if (/\b50[234]\b|bad gateway|service unavailable|gateway time-?out|unexpected token '?<|is not valid json/i.test(message)) {
    return "The demo server is waking up (free hosting sleeps when idle). Wait about 30 seconds and try again.";
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return "Could not reach the server. Check your connection and try again; if the demo was asleep, give it about 30 seconds.";
  }
  if (/401|unauthori[sz]ed|invalid_client|authenticat|access token/i.test(message)) {
    return "PayPal rejected the sandbox credentials. Check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in your local env file, then restart the server.";
  }
  if (/429|quota|rate.?limit|exhaust|too many requests/i.test(message)) {
    return "A usage limit was reached (AI model or catalog). Wait a minute and try again.";
  }
  return message;
}
