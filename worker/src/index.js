/* ===== Kraftlog-Proxy (Cloudflare Worker) =====
 * Zwei Aufgaben:
 * 1. Strava-Vermittler (Token-Tausch + Aktivitäten anlegen) — Strava erlaubt kein CORS.
 * 2. Pausen-Push: sekundengenaue Weckrufe über Durable-Object-Alarme; am Ziel wird eine
 *    Declarative-Web-Push-Nachricht (RFC-8291-verschlüsselt, VAPID-signiert) an
 *    Apples/Googles Push-Dienst geschickt — das iPhone klingelt auch gesperrt,
 *    Musik läuft weiter. Ab iOS 18.4 zeigt Safari die Meldung direkt aus dem
 *    Payload an, ohne den Service Worker zu wecken; ältere Geräte fallen auf den
 *    Push-Handler in sw.js zurück.
 * Zugriffsschutz: alle Routen verlangen den Header X-Kraftlog-Key (Secret
 * KRAFTLOG_KEY, per `npx wrangler secret put KRAFTLOG_KEY` setzen — Pflicht,
 * ohne gesetztes Secret antwortet der Worker nur mit 401). Dazu Rate Limiting
 * pro IP als zweite Schicht.
 * VAPID-Schlüssel werden beim ersten Aufruf automatisch erzeugt und im
 * Durable-Object-Speicher abgelegt — nichts manuell zu konfigurieren.
 */

const STANDARD_ORIGIN = 'https://vtokyy.github.io';
const PUSH_SUBJECT = 'https://vtokyy.github.io/kraftlog/';   // auch Klick-Ziel der Benachrichtigung

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

/* ---------- Web-Push-Payload-Verschlüsselung (RFC 8291, aes128gcm) ----------
 * Sobald ein Push Inhalt trägt, verlangt das Web-Push-Protokoll dessen
 * Verschlüsselung für die Subscription-Schlüssel des Geräts. Die drei
 * Info-Strings und die Reihenfolge sind vom Standard vorgegeben — jede
 * Abweichung lässt das Gerät die Nachricht stillschweigend verwerfen. */
const TE = new TextEncoder();

function b64uZuBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function verketten() {
  let laenge = 0;
  for (const a of arguments) laenge += a.length;
  const out = new Uint8Array(laenge);
  let pos = 0;
  for (const a of arguments) { out.set(a, pos); pos += a.length; }
  return out;
}

async function hkdf(salt, ikm, info, laenge) {
  const schluessel = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt, info: info },
    schluessel, laenge * 8
  );
  return new Uint8Array(bits);
}

/* Verschlüsselt Klartext-Bytes für eine PushSubscription.
 * p256dh und auth sind die base64url-Strings aus sub.keys. */
async function verschluesselePayload(klartext, p256dh, auth) {
  const uaPublic = b64uZuBytes(p256dh);   // 65 Bytes: öffentlicher Schlüssel des Geräts
  const authSecret = b64uZuBytes(auth);   // 16 Bytes

  /* 1) Ephemeres Schlüsselpaar erzeugen und ECDH-Geheimnis ableiten */
  const asPaar = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaKey = await crypto.subtle.importKey(
    'raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhGeheimnis = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaKey }, asPaar.privateKey, 256));
  const asPublic = new Uint8Array(
    await crypto.subtle.exportKey('raw', asPaar.publicKey)); // 65 Bytes

  /* 2) Schlüsselableitung nach RFC 8291 */
  const keyInfo = verketten(TE.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhGeheimnis, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, TE.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, TE.encode('Content-Encoding: nonce\0'), 12);

  /* 3) Verschlüsseln (ein Record; 0x02 = Delimiter des letzten Records) */
  const gepolstert = verketten(klartext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, aesKey, gepolstert));

  /* 4) aes128gcm-Body: salt(16) | recordSize(4) | idLen(1) | asPublic(65) | ciphertext */
  const recordSize = new Uint8Array([0, 0, 16, 0]); // 4096, big-endian
  return verketten(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

/* Declarative-Web-Push-Nachricht bauen, verschlüsseln und senden.
 * title und navigate sind im deklarativen Format Pflicht. */
async function sendeDeklarativenPush(sub, titel, text, vapid) {
  const payload = JSON.stringify({
    web_push: 8030,
    notification: {
      /* Defensiv kürzen: der verschlüsselte Body darf das 4096-Byte-Limit der
       * Push-Dienste nie erreichen (ein einzelner aes128gcm-Record, rs=4096) */
      title: String(titel || 'Pause vorbei').slice(0, 100),
      lang: 'de',
      dir: 'ltr',
      body: String(text || 'Weiter geht’s mit dem nächsten Satz.').slice(0, 500),
      navigate: PUSH_SUBJECT,   // öffnet die App beim Antippen
      tag: 'kraftlog-pause',    // neue Meldung ersetzt die vorige statt zu stapeln
      silent: false,
    },
  });
  const body = await verschluesselePayload(TE.encode(payload), sub.keys.p256dh, sub.keys.auth);
  const ziel = new URL(sub.endpoint);
  const jwt = await vapidJwt(ziel.origin, vapid);
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': 'vapid t=' + jwt + ', k=' + vapid.publicKey,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '120',        // Weckruf veraltet schnell — lieber verfallen als verspätet klingeln
      'Urgency': 'high',
    },
    body: body,
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
      /* Alles, was alarm() später braucht, als ein Auftrag ablegen —
       * alarm() läuft ohne Zugriff auf das Singleton-DO. */
      await this.state.storage.put('auftrag', {
        sub: d.subscription,
        vapid: d.vapid,
        titel: d.titel || null,
        text: d.text || null,
      });
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
    const a = await this.state.storage.get('auftrag');
    if (a && a.sub && a.vapid) {
      try { await sendeDeklarativenPush(a.sub, a.titel, a.text, a.vapid); } catch (e) { }
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
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Kraftlog-Key',
    };
    /* Preflight zuerst und ohne Auth-Check beantworten — der Browser schickt ihn
     * ohne Custom-Header; scheitert er, blockt der Browser alle Requests. */
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: Object.assign({ 'Access-Control-Max-Age': '86400' }, cors),
      });
    }
    /* Zugangsschlüssel: CORS schützt nur im Browser — curl/Skripte ignorieren es.
     * Der Schlüssel lebt nur als Cloudflare-Secret und in den App-Einstellungen. */
    if (request.headers.get('X-Kraftlog-Key') !== env.KRAFTLOG_KEY) {
      return antwort({ message: 'Zugangsschlüssel fehlt oder ist falsch' }, 401, cors);
    }
    /* Rate Limiting pro IP als zweite Schicht (Binding LIMITER, s. wrangler.toml).
     * Guard: ohne konfiguriertes Binding läuft der Worker trotzdem. */
    if (env.LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unbekannt';
      const { success } = await env.LIMITER.limit({ key: ip });
      if (!success) return antwort({ message: 'Zu viele Anfragen' }, 429, cors);
    }
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
          body: JSON.stringify({
            subscription: d.subscription, delaySec: d.delaySec, vapid,
            titel: d.titel, text: d.text,
          }),
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
