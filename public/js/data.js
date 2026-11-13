/** GET a JSON API route, bypassing the browser cache (the CDN still caches). */
export async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
}
