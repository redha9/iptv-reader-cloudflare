import { readSession, safeHttpUrl, json } from "../../lib/session.js";

function proxyUrl(requestUrl, absolute, type, id, ext) {
  const p = new URLSearchParams({ url: absolute, type: type || "live", id: id || "", ext: ext || "" });
  return `${new URL(requestUrl).origin}/api/stream?${p.toString()}`;
}

export async function onRequest({ request, env }) {
  if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
  const session = await readSession(request, env);
  if (!session) return json({ error: "Session absente ou expirée." }, 401);
  const incoming = new URL(request.url);
  const type = incoming.searchParams.get("type") || "live";
  const id = incoming.searchParams.get("id") || "";
  const ext = (incoming.searchParams.get("ext") || "ts").replace(/[^a-z0-9]/gi, "").toLowerCase() || "ts";
  let target;
  try {
    if (incoming.searchParams.has("url")) {
      target = safeHttpUrl(incoming.searchParams.get("url"));
      const base = new URL(session.host);
      if (target.origin !== base.origin) return json({ error: "URL de segment externe refusée." }, 403);
    } else {
      if (!["live", "movie", "series"].includes(type) || !id) return json({ error: "Paramètres de flux invalides." }, 400);
      target = new URL(`${type}/${encodeURIComponent(session.user)}/${encodeURIComponent(session.pass)}/${encodeURIComponent(id)}.${ext}`, session.host.replace(/\/?$/, "/"));
    }
  } catch (e) {
    return json({ error: e.message || "URL de flux invalide." }, 400);
  }
  const headers = new Headers({ Accept: "*/*" });
  const range = request.headers.get("Range");
  if (range) headers.set("Range", range);
  try {
    const upstream = await fetch(target.toString(), { method: request.method, headers, cache: "no-store", redirect: "follow" });
    const contentType = (upstream.headers.get("Content-Type") || "").toLowerCase();
    const isPlaylist = ext === "m3u8" || contentType.includes("mpegurl") || contentType.includes("x-mpegurl");
    if (isPlaylist && upstream.ok && request.method === "GET") {
      const playlist = await upstream.text();
      if (playlist.length > 2_000_000) return json({ error: "Playlist HLS trop volumineuse." }, 502);
      const rewrite = raw => {
        try {
          const absolute = new URL(raw, target).toString();
          const u = new URL(absolute);
          if (u.origin !== new URL(session.host).origin) return raw;
          const childExt = (u.pathname.split(".").pop() || "").toLowerCase();
          return proxyUrl(request.url, absolute, type, id, childExt);
        } catch { return raw; }
      };
      const proxied = playlist.split(/\r?\n/).map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (trimmed.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${rewrite(uri)}"`);
        return rewrite(trimmed);
      }).join("\n");
      return new Response(proxied, { status: 200, headers: { "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8", "Cache-Control": "no-store, no-cache, must-revalidate" } });
    }
    const outHeaders = new Headers({ "Cache-Control": "no-store, no-cache, must-revalidate" });
    for (const name of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "Last-Modified", "ETag"]) {
      const value = upstream.headers.get(name);
      if (value) outHeaders.set(name, value);
    }
    return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers: outHeaders });
  } catch {
    return json({ error: "Impossible d'ouvrir le flux Xtream." }, 502);
  }
}
