import { readSession, json } from "../../lib/session.js";

export async function onRequestGet({ request, env }) {
  const session = await readSession(request, env);
  if (!session) return json({ error: "Session absente ou expirée." }, 401);
  const incoming = new URL(request.url);
  const target = new URL("player_api.php", session.host.replace(/\/?$/, "/"));
  target.searchParams.set("username", session.user);
  target.searchParams.set("password", session.pass);
  for (const [key, value] of incoming.searchParams) {
    if (key !== "host" && key !== "user" && key !== "pass" && !(key === "action" && value === "")) target.searchParams.set(key, value);
  }
  try {
    const upstream = await fetch(target.toString(), { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(55000) });
    const body = await upstream.text();
    return new Response(body, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  } catch {
    return json({ error: "Impossible de joindre le serveur Xtream." }, 502);
  }
}
