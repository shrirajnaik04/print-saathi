/**
 * The PS printer (brand v3, assets/brand/mark.svg), drawn from the same paths; colours come from the brand tokens.
 * Decorative: always beside the visible name "PrintSaathi", so screen readers skip it.
 */
export function BrandMark() {
  return (
    <svg class="brand-mark" viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <path class="bm-c" d="M128 184V158Q128 146 140 146H372Q384 146 384 158V184" />
      <path class="bm-w" d="M148 68H298L360 130V174H148Z" />
      <path class="bm-t" d="M160 78H296V124Q296 140 312 140H348V162H160Z" />
      <path class="bm-t" d="M308 78L348 128H308Z" />
      <rect class="bm-c" x="64" y="176" width="384" height="196" rx="40" />
      <path class="bm-letter" d="M136 216H198C242 216 242 272 198 272H136V328" />
      <path class="bm-letter" d="M376 216H310C268 216 268 272 310 272H342C386 272 386 328 342 328H288" />
      <path class="bm-page" d="M170 356H342L372 426Q375 440 360 440H152Q137 440 141 426Z" />
      <path class="bm-line" d="M196 394H316" />
    </svg>
  );
}
