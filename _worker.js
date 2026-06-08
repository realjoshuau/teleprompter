function isDevelopmentHost(hostname) {
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || hostname === "[::1]";
}

function aboutResponse(request, env) {
  const url = new URL(request.url);
  const commitHash = env.CF_PAGES_COMMIT_SHA || null;
  const mode = isDevelopmentHost(url.hostname) ? "development" : "production";

  return Response.json({
    mode,
    commitHash
  }, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function notFoundResponse() {
  return Response.json({
    error: "Not found"
  }, {
    status: 404,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/about" || url.pathname === "/api/about/") {
      return aboutResponse(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return notFoundResponse();
    }

    return env.ASSETS.fetch(request);
  }
};
