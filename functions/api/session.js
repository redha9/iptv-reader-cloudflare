import {
  safeHttpUrl,
  readSession,
  createSessionCookie,
  clearSessionCookie,
  sameOrigin,
  json
} from "../../lib/session.js";

// Vérifier l'état de la session
export async function onRequestGet({ request, env }) {
  const session = await readSession(request, env);

  if (!session) {
    return json({ authenticated: false });
  }

  return json({
    authenticated: true,
    host: session.host,
    user: session.user
  });
}

// Connexion initiale au serveur Xtream
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) {
    return json({ error: "Origine refusée." }, 403);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Corps JSON invalide." }, 400);
  }

  const user = String(body.user || "").trim();
  const pass = String(body.pass || "");
  const hostInput = String(body.host || "").trim().replace(/\/+$/, "");

  if (!user || !pass || !hostInput) {
    return json({ error: "Identifiants ou adresse serveur manquants." }, 400);
  }

  let base;

  try {
    base = safeHttpUrl(hostInput);
  } catch (e) {
    return json({ error: e.message }, 400);
  }

  try {
    const check = new URL(
      "player_api.php",
      base.toString().replace(/\/?$/, "/")
    );

    check.searchParams.set("username", user);
    check.searchParams.set("password", pass);

    const upstream = await fetch(check.toString(), {
      headers: {
        Accept: "application/json"
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000)
    });

    if (!upstream.ok) {
      return json({
        error: `Le serveur Xtream répond HTTP ${upstream.status}.`
      }, 502);
    }

    const result = await upstream.json();

    if (
      !result ||
      !result.user_info ||
      Number(result.user_info.auth) !== 1 ||
      result.user_info.status === "Disabled"
    ) {
      return json({
        error: "Identifiants Xtream refusés ou compte inactif."
      }, 401);
    }

    const host = base.toString().replace(/\/$/, "");

    const cookie = await createSessionCookie(
      { host, user, pass },
      env
    );

    return json(
      {
        authenticated: true,
        host,
        user
      },
      200,
      {
        "Set-Cookie": cookie
      }
    );

  } catch (e) {
    return json({
      error: e?.name === "TimeoutError"
        ? "Délai dépassé lors du contact avec Xtream."
        : "Impossible de vérifier le serveur Xtream."
    }, 502);
  }
}

// Renouvellement d'une session existante
export async function onRequestPut({ request, env }) {
  if (!sameOrigin(request)) {
    return json({ error: "Origine refusée." }, 403);
  }

  const session = await readSession(request, env);

  if (!session) {
    return json({ error: "Session expirée." }, 401);
  }

  const cookie = await createSessionCookie(session, env);

  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Set-Cookie": cookie
    }
  });
}

// Déconnexion
export async function onRequestDelete({ request }) {
  if (!sameOrigin(request)) {
    return json({ error: "Origine refusée." }, 403);
  }

  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Set-Cookie": clearSessionCookie()
    }
  });
}

