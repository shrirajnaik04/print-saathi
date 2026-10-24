/// <reference lib="webworker" />
import { parseAnalysis } from '../core/crop/detect';
import { textTurn } from '../core/rotate/textTurn';

/**
 * Text direction off the screen's thread (Phase 15): reads one photo's analysis file (by URL, like an image; no bytes
 * over the bridge) and answers with the turn that makes it upright, or null.
 */
self.onmessage = async (e: MessageEvent<{ id: number; url: string }>) => {
  const { id, url } = e.data;
  try {
    const parsed = parseAnalysis(new Uint8Array(await (await fetch(url)).arrayBuffer()));
    self.postMessage({ id, result: parsed ? textTurn(parsed.grey, parsed.w, parsed.h) : null });
  } catch {
    self.postMessage({ id, result: null });
  }
};
