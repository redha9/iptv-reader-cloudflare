const COOKIE = "iptv_session";
const SESSION_MS = 20 * 60 * 1000;

function bytesToB64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function cryptoKey(secret) {
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET doit contenir au moins 32 caractères.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function safeHttpUrl(input) {
  let u;
  try { u = new URL(String(input)); } catch { throw new Error("URL invalide."); }
  if (!(["http:", "https:"].includes(u.protocol)) || u.username || u.password) throw new Error("Seules les URL HTTP/HTTPS publiques sont acceptées.");
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || h === "metadata.google.internal") throw new Error("Hôte local ou privé refusé.");
  // Refuse les adresses IPv4 privées, locales, link-local et réservées.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const a = h.split(".").map(Number);
    if (a.some(n => n < 0 || n > 255) || a[0] === 0 || a[0] === 10 || a[0] === 127 || a[0] >= 224 || (a[0] === 169 && a[1] === 254) || (a[0] === 172 && a[1] >= 16 && a[1] <= 31) || (a[0] === 192 && a[1] === 168)) throw new Error("Adresse IP privée ou réservée refusée.");
  }
  if (h.includes(":") && (h === "::" || h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:" ) || h.startsWith("::ffff:127.") || h.startsWith("::ffff:10.") || h.startsWith("::ffff:192.168."))) throw new Error("Adresse IPv6 locale ou privée refusée.");
  u.hash = "";
  return u;
}

export async function readSession(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.split(";").map(v => v.trim()).find(v => v.startsWith(COOKIE + "="));
  if (!match) return null;
  try {
    const token = match.slice(COOKIE.length + 1);
    const raw = b64UrlToBytes(token);
    const iv = raw.slice(0, 12), ciphertext = raw.slice(12);
    const key = await cryptoKey(env.SESSION_SECRET);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    const session = JSON.parse(new TextDecoder().decode(plaintext));
    if (!session.host || !session.user || !session.pass || !session.exp || session.exp <= Date.now()) return null;
    return session;
  } catch { return null; }
}

export async function createSessionCookie(session, env) {
  const key = await cryptoKey(env.SESSION_SECRET);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify({ ...session, exp: Date.now() + SESSION_MS }));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0); combined.set(new Uint8Array(ciphertext), iv.length);
  return `${COOKIE}=${bytesToB64Url(combined)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1200`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}
