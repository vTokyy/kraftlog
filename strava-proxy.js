/* ===== Kraftlog → Strava Proxy (Cloudflare Worker) =====
 *
 * Warum: Stravas API erlaubt keine direkten Browser-Aufrufe (kein CORS).
 * Dieser winzige Worker unter DEINEM kostenlosen Cloudflare-Account vermittelt —
 * das Client-Secret bleibt sicher im Worker und landet nie im Browser oder Repo.
 *
 * Einrichtung (einmalig, ~5 Minuten):
 * 1. https://www.strava.com/settings/api → API-Anwendung erstellen:
 *    Name: Kraftlog · Website: https://vtokyy.github.io
 *    Autorisierungs-Callback-Domain: vtokyy.github.io
 *    → Client-ID und Client-Secret notieren.
 * 2. https://dash.cloudflare.com (kostenloser Account) → Workers & Pages →
 *    "Create Worker" → Name z. B. kraftlog-strava → Deploy → "Edit code" →
 *    diesen kompletten Dateiinhalt einfügen → Deploy.
 * 3. Worker → Settings → Variables and Secrets:
 *    STRAVA_CLIENT_ID     (Typ Text)   = deine Client-ID
 *    STRAVA_CLIENT_SECRET (Typ Secret) = dein Client-Secret
 * 4. Worker-URL kopieren (https://kraftlog-strava.<dein-name>.workers.dev)
 *    und in Kraftlog unter Daten → Strava eintragen.
 */
const STANDARD_ORIGIN = 'https://vtokyy.github.io';

export default {
  async fetch(request, env) {
    const origin = env.ERLAUBTE_ORIGIN || STANDARD_ORIGIN;
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    try {
      /* Token holen bzw. erneuern (Secret bleibt hier im Worker) */
      if (url.pathname === '/token' && request.method === 'POST') {
        const body = await request.json();
        const form = new URLSearchParams();
        form.set('client_id', env.STRAVA_CLIENT_ID);
        form.set('client_secret', env.STRAVA_CLIENT_SECRET);
        if (body.code) {
          form.set('grant_type', 'authorization_code');
          form.set('code', body.code);
        } else if (body.refresh_token) {
          form.set('grant_type', 'refresh_token');
          form.set('refresh_token', body.refresh_token);
        } else {
          return antwort({ message: 'code oder refresh_token fehlt' }, 400, cors);
        }
        const r = await fetch('https://www.strava.com/oauth/token', { method: 'POST', body: form });
        return antwort(await r.json(), r.status, cors);
      }
      /* Aktivität anlegen (Token kommt als Bearer vom Client) */
      if (url.pathname === '/activities' && request.method === 'POST') {
        const r = await fetch('https://www.strava.com/api/v3/activities', {
          method: 'POST',
          headers: {
            'Authorization': request.headers.get('Authorization') || '',
            'Content-Type': 'application/json',
          },
          body: await request.text(),
        });
        return antwort(await r.json(), r.status, cors);
      }
      if (url.pathname === '/') return antwort({ ok: true, dienst: 'kraftlog-strava-proxy' }, 200, cors);
      return antwort({ message: 'unbekannter Pfad' }, 404, cors);
    } catch (e) {
      return antwort({ message: String(e) }, 500, cors);
    }
  },
};

function antwort(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors),
  });
}
