function isDevelopmentHost(hostname) {
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || hostname === "[::1]";
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const commitHash = context.env.CF_PAGES_COMMIT_SHA || null;
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
