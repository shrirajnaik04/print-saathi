import { describe, expect, it } from 'vitest';
import { fileLength } from './fileLength';

describe('fileLength (spike c worker)', () => {
  it('returns the byte length of a fetched local file', async () => {
    const fake = async () => new Response(new Uint8Array(1234));
    await expect(fileLength('https://localhost/_capacitor_file_/x.jpg', fake)).resolves.toEqual({
      ok: true,
      bytes: 1234,
    });
  });

  it('reports a failed fetch as an error name, never a path or body', async () => {
    const failing = async () => {
      throw new TypeError('Failed to fetch https://localhost/_capacitor_file_/data/user/0/secret/path.jpg');
    };
    await expect(fileLength('https://localhost/x', failing)).resolves.toEqual({ ok: false, error: 'TypeError' });
  });

  it('treats an HTTP error status as a failure', async () => {
    const notFound = async () => new Response('', { status: 404 });
    await expect(fileLength('https://localhost/x', notFound)).resolves.toEqual({ ok: false, error: 'HTTP 404' });
  });
});
