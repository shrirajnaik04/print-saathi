// Expected outcome of each share-matrix mode (spike a). A row without a verdict proves nothing.
export const EXPECT = {
  'single-photo': { types: ['jpeg'] },
  // distinct: six different photos (a sender bug once sent six identical files and the matrix still passed).
  'six-photos': { types: ['jpeg', 'jpeg', 'jpeg', 'jpeg', 'jpeg', 'jpeg'], distinct: 6 },
  mixed: { types: ['jpeg', 'pdf'] },
  pdf: { types: ['pdf'] },
  'pdf-octet': { types: ['pdf'] },
  office: { types: ['office'] },
  'own-authority': { rejected: 1 },
  'own-authority-user': { rejected: 1 },
  'file-uri': { rejected: 1 },
  'lying-length': { types: ['jpeg'] },
  'unknown-length': { types: ['jpeg'] },
  stall: { problem: 'stalled' },
  'midstream-error': { problem: 'failed' },
  'zero-bytes': { problem: 'empty' },
  endless: { problem: 'tooBig' },
};

export function shareVerdict(mode, row) {
  const e = EXPECT[mode];
  if (!e || row.receivedMs === null) return 'FAIL';
  // Broken streams: nothing imported, and the journal names the right reason.
  if (e.problem !== undefined) return row.files === 0 && row.problems === e.problem ? 'PASS' : 'FAIL';
  // Hostile shares must be refused by the URI policy itself, not merely fail to copy (Gate 3 minor 7).
  if (e.rejected !== undefined)
    return row.files === 0 && row.rejected === e.rejected && row.refusedByPolicy === e.rejected ? 'PASS' : 'FAIL';
  if (e.distinct !== undefined && row.distinct !== e.distinct) return 'FAIL';
  return row.files === e.types.length && row.types === e.types.join(',') && row.rejected === 0 ? 'PASS' : 'FAIL';
}
