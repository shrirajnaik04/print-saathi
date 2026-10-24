/// <reference lib="webworker" />
import { fileLength } from './fileLength';

// Spike (c): proves a Web Worker can load and fetch local files in a release build with no INTERNET permission.
self.onmessage = async (e: MessageEvent<string>) => {
  self.postMessage(await fileLength(e.data));
};
