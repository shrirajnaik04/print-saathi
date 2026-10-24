/// <reference lib="webworker" />
import { detectBorders, type Kind, parseAnalysis } from '../core/crop/detect';

/**
 * Smart auto-crop off the screen's thread (PLAN §F5): reads one photo's analysis file (by URL, like an image; no bytes
 * over the bridge) and answers with the suggested crop or null.
 */
self.onmessage = async (e: MessageEvent<{ id: number; url: string; kind: Kind }>) => {
  const { id, url, kind } = e.data;
  try {
    const parsed = parseAnalysis(new Uint8Array(await (await fetch(url)).arrayBuffer()));
    self.postMessage({ id, result: parsed ? detectBorders(parsed.grey, parsed.w, parsed.h, kind) : null });
  } catch {
    self.postMessage({ id, result: null });
  }
};
