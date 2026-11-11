/** Turns raw API errors into messages a person can act on. */
export function friendlyError(message: string): string {
  if (/401|unauthori[sz]ed|invalid_client|authenticat|access token/i.test(message)) {
    return "PayPal rejected the sandbox credentials. Check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in your local env file, then restart the server.";
  }
  if (/429|quota|rate.?limit|exhaust|too many requests/i.test(message)) {
    return "A usage limit was reached (AI model or catalog). Wait a minute and try again.";
  }
  return message;
}
