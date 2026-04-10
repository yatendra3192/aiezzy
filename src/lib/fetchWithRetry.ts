export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = 2,
  backoff = 1000
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || res.status < 500) return res;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, backoff * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise(r => setTimeout(r, backoff * (attempt + 1)));
    }
  }
  throw new Error('Fetch failed after retries');
}
