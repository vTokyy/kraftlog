/* ===== Kraftlog-Proxy (Cloudflare Worker) =====
 * Zwei Aufgaben:
 * 1. Strava-Vermittler (Token-Tausch + Aktivitäten anlegen) — Strava erlaubt kein CORS.
 * 2. Pausen-Push: sekundengenaue Weckrufe über Durable-Object-Alarme; am Ziel wird eine
 *    Web-Push-Nachricht (payloadlos, VAPID-signiert) an Apples/Googles Push-Dienst
 *    geschickt — das iPhone klingelt auch gesperrt, Musik läuft weiter.
 * VAPID-Schlüssel werden beim ersten Aufruf automatisch erzeugt und im
 * Durable-Object-Speicher abgelegt — nichts manuell zu konfigurieren.
 */

const STANDARD_ORIGIN = 'https://vtokyy.github.io';
const PUSH_SUBJECT = 'https://vtokyy.github.io/kraftlog/';

/* ---------- Hilfen ---------- */
function b64url(bytes) {
  let s = '';
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function textB64url(text) {
  return b64url(new TextEncoder().encode(text));
}
function antwort(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors || {}),
  });
}

/* VAPID-Schlüsselpaar erzeugen (P-256) */
async function vapidErzeugen() {
  const paar = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const pubRaw = await crypto.subtle.exportKey('raw', paar.publicKey);     // 65 Bytes, unkomprimiert
  const privJwk = await crypto.subtle.exportKey('jwk', paar.privateKey);
  return { publicKey: b64url(pubRaw), privateJwk: privJwk };
}

/* VAPID-JWT (ES256) für den Push-Dienst signieren */
async function vapidJwt(audience, vapid) {
  const header = textB64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = textB64url(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: PUSH_SUBJECT,
  }));
  const key = await crypto.subtle.importKey('jwk', vapid.privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key,
    new TextEncoder().encode(header + '.' + claims));
  return header + '.' + claims + '.' + b64url(sig);
}

/* Payloadlosen Push senden (kein Verschlüsseln nötig; der Service Worker der App
 * zeigt eine feste "Pause vorbei"-Meldung). */
async function sendePush(sub, vapid) {
  const ziel = new URL(sub.endpoint);
  const jwt = await vapidJwt(ziel.origin, vapid);
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'TTL': '120',
      'Urgency': 'high',
      'Authorization': 'vapid t=' + jwt + ', k=' + vapid.publicKey,
    },
  });
}

/* ---------- Durable Object: ein Pausen-Timer pro Gerät ---------- */
export class PausenTimer {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/vapid') {
      /* Singleton 'vapid-config': Schlüssel holen oder einmalig erzeugen */
      let vapid = await this.state.storage.get('vapid');
      if (!vapid) {
        vapid = await vapidErzeugen();
        await this.state.storage.put('vapid', vapid);
      }
      return antwort({ publicKey: vapid.publicKey, privateJwk: vapid.privateJwk }, 200);
    }
    if (url.pathname === '/planen') {
      const d = await request.json();
      await this.state.storage.put('sub', d.subscription);
      await this.state.storage.put('vapidKopie', d.vapid);
      const delay = Math.max(5, Math.min(3600, Number(d.delaySec) || 0));
      await this.state.storage.setAlarm(Date.now() + delay * 1000);
      return antwort({ ok: true, feuertIn: delay }, 200);
    }
    if (url.pathname === '/stornieren') {
      await this.state.storage.deleteAlarm();
      return antwort({ ok: true }, 200);
    }
    return antwort({ message: 'unbekannter Pfad' }, 404);
  }
  async alarm() {
    const sub = await this.state.storage.get('sub');
    const vapid = await this.state.storage.get('vapidKopie');
    if (sub && vapid) {
      try { await sendePush(sub, vapid); } catch (e) { }
    }
  }
}

/* ---------- Haupt-Router ---------- */
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
      /* --- Pausen-Push --- */
      if (url.pathname === '/push/vapid') {
        const cfg = env.PAUSEN.get(env.PAUSEN.idFromName('vapid-config'));
        const d = await (await cfg.fetch('https://do/vapid')).json();
        return antwort({ publicKey: d.publicKey }, 200, cors);
      }
      if (url.pathname === '/push/planen' && request.method === 'POST') {
        const d = await request.json();
        if (!d.subscription || !d.subscription.endpoint) return antwort({ message: 'subscription fehlt' }, 400, cors);
        const cfg = env.PAUSEN.get(env.PAUSEN.idFromName('vapid-config'));
        const vapid = await (await cfg.fetch('https://do/vapid')).json();
        const timer = env.PAUSEN.get(env.PAUSEN.idFromName(d.subscription.endpoint));
        const r = await timer.fetch('https://do/planen', {
          method: 'POST',
          body: JSON.stringify({ subscription: d.subscription, delaySec: d.delaySec, vapid }),
        });
        return antwort(await r.json(), r.status, cors);
      }
      if (url.pathname === '/push/stornieren' && request.method === 'POST') {
        const d = await request.json();
        if (!d.subscription || !d.subscription.endpoint) return antwort({ message: 'subscription fehlt' }, 400, cors);
        const timer = env.PAUSEN.get(env.PAUSEN.idFromName(d.subscription.endpoint));
        const r = await timer.fetch('https://do/stornieren', { method: 'POST' });
        return antwort(await r.json(), r.status, cors);
      }

      /* --- Strava --- */
      if (url.pathname === '/token' && request.method === 'POST') {
        const body = await request.json();
        const form = new URLSearchParams();
        form.set('client_id', env.STRAVA_CLIENT_ID || '');
        form.set('client_secret', env.STRAVA_CLIENT_SECRET || '');
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

      if (url.pathname === '/') return antwort({ ok: true, dienst: 'kraftlog-proxy', funktionen: ['strava', 'push'] }, 200, cors);
      return antwort({ message: 'unbekannter Pfad' }, 404, cors);
    } catch (e) {
      return antwort({ message: String(e) }, 500, cors);
    }
  },
};
