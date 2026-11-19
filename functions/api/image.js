import { safeHttpUrl, json } from "../../lib/session.js";

export async function onRequestGet({ request }) {
  const incoming = new URL(request.url);
  let target;
  try { target = safeHttpUrl(incoming.searchParams.get("url") || ""); }
  catch { return new Response("URL image invalide", { status: 400 }); }
  try {
    const upstream = await fetch(target.toString(), { headers: { Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" }, cache: "no-store", redirect: "follow" });
    if (!upstream.ok) return new Response(null, { status: upstream.status });
    const headers = new Headers({ "Content-Type": upstream.headers.get("Content-Type") || "image/jpeg", "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000" });
    const length = upstream.headers.get("Content-Length");
    if (length) headers.set("Content-Length", length);
    return new Response(upstream.body, { status: 200, headers });
  } catch { return json({ error: "Image indisponible." }, 502); }
}
