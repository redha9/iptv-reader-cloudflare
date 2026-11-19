export function onRequestGet() {
  return new Response(JSON.stringify({ mediaGateway: "" }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
