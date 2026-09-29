export function normalizeRouteMap(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 16000) throw new Error("route_url must be an On The Go Map share link or iframe embed.");
  const input = value.trim();
  const source = /^<iframe\b/i.test(input)
    ? input.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]?.replaceAll("&amp;", "&")
    : input;
  if (!source) throw new Error("route_url must be an On The Go Map share link or iframe embed.");
  let url: URL;
  try { url = new URL(source); }
  catch { throw new Error("route_url must be a valid On The Go Map URL."); }
  if (url.protocol !== "https:" || !["onthegomap.com", "www.onthegomap.com"].includes(url.hostname) || url.pathname !== "/" || !url.searchParams.get("r2")) {
    throw new Error("route_url must be a route shared from onthegomap.com.");
  }
  url.hostname = "onthegomap.com";
  url.searchParams.set("context", "share");
  return url.toString();
}
