export type FileLengthResult = { ok: true; bytes: number } | { ok: false; error: string };

/**
 * Spike (c): fetches a local file URL (Capacitor.convertFileSrc) and returns its size. Errors carry only the
 * error's name or HTTP status, because messages can contain private paths (PLAN §Q).
 */
export async function fileLength(url: string, fetchFn: typeof fetch = fetch): Promise<FileLengthResult> {
  try {
    const res = await fetchFn(url);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, bytes: (await res.arrayBuffer()).byteLength };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.name : 'Error' };
  }
}
