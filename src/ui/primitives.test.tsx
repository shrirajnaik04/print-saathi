import { render } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { ActionBar } from './ActionBar';
import { Button } from './Button';
import { ChangeRow } from './ChangeRow';
import { Panel } from './Panel';
import { Stepper } from './Stepper';
import { Tile } from './Tile';
import { TopBar } from './TopBar';

describe('Button', () => {
  it('renders its label as a real button', () => {
    const html = render(<Button onClick={() => {}}>PRINT</Button>);
    expect(html).toMatch(/^<button type="button" class="btn btn-primary"[^>]*>.*PRINT/);
  });

  it('while busy it shows a small spinner beside the words (Phase 13 spec)', () => {
    const html = render(
      <Button onClick={() => {}} busy busyLabel="Preparing…">
        PRINT
      </Button>,
    );
    expect(html).toContain('class="spinner"');
    expect(render(<Button onClick={() => {}}>PRINT</Button>)).not.toContain('spinner');
  });

  it('while busy it is disabled, marked busy, and says what is happening', () => {
    const html = render(
      <Button onClick={() => {}} busy busyLabel="Preparing…">
        PRINT
      </Button>,
    );
    expect(html).toContain('disabled');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Preparing…');
    expect(html).not.toContain('PRINT');
  });
});

describe('Panel', () => {
  it('errors and warnings are alerts; info is a polite status (still heard by screen readers)', () => {
    expect(render(<Panel kind="error" title="Printer didn't take the job" />)).toContain('role="alert"');
    expect(render(<Panel kind="warn" title="Put 4×6 photo paper in" />)).toContain('role="alert"');
    expect(render(<Panel kind="info" title="Tip" />)).toContain('role="status"');
  });

  it('can carry its next step as a button', () => {
    expect(render(<Panel kind="error" title="x" action={{ label: 'Try again', onClick: () => {} }} />)).toMatch(
      /<button[^>]*>.*Try again/,
    );
  });
});

describe('Stepper', () => {
  it('disables minus at the lowest value and plus at the highest, and names its buttons', () => {
    const low = render(
      <Stepper
        label="Copies"
        fewerLabel="Fewer copies"
        moreLabel="More copies"
        value={1}
        min={1}
        max={99}
        onChange={() => {}}
      />,
    );
    expect(low).toMatch(/<button[^>]*aria-label="Fewer copies"[^>]*disabled/);
    expect(low).not.toMatch(/<button[^>]*aria-label="More copies"[^>]*disabled/);
    const high = render(
      <Stepper
        label="Copies"
        fewerLabel="Fewer copies"
        moreLabel="More copies"
        value={99}
        min={1}
        max={99}
        onChange={() => {}}
      />,
    );
    expect(high).toMatch(/<button[^>]*aria-label="More copies"[^>]*disabled/);
  });

  it('shows the value large in an <output>, which screen readers announce as a status', () => {
    expect(
      render(
        <Stepper
          label="Copies"
          fewerLabel="Fewer copies"
          moreLabel="More copies"
          value={5}
          min={1}
          max={99}
          onChange={() => {}}
        />,
      ),
    ).toMatch(/<output class="stepper-value">5<\/output>/);
  });
});

describe('TopBar', () => {
  it('has Back and Home as visible words, plus the screen title as the page heading', () => {
    const html = render(<TopBar title="Ready to print" onBack={() => {}} onHome={() => {}} />);
    expect(html).toContain('Back');
    expect(html).toContain('Home');
    expect(html).toMatch(/<h1[^>]*>Ready to print<\/h1>/);
  });
});

describe('Tile and ChangeRow', () => {
  it('a tile is one big button whose accessible name includes its title and helper line', () => {
    const html = render(<Tile icon="photos" title="Photos" helper="Choose from phone" onClick={() => {}} />);
    expect(html).toMatch(/^<button type="button" class="tile"/);
    expect(html).toContain('Photos');
    expect(html).toContain('Choose from phone');
  });

  it('a tile shows its icon in a coloured badge for its job, or a neutral one (Phase 13 Office look)', () => {
    expect(render(<Tile icon="photos" tone="photos" title="Photos" onClick={() => {}} />)).toContain(
      'class="badge badge-photos"',
    );
    expect(render(<Tile icon="recent" title="Recent jobs" onClick={() => {}} />)).toContain(
      'class="badge badge-neutral"',
    );
  });

  it('a change row shows the setting and its current value in words', () => {
    const html = render(<ChangeRow label="Paper" value="A4" onClick={() => {}} />);
    expect(html).toMatch(/<button[^>]*class="change-row"/);
    expect(html).toContain('Paper');
    expect(html).toContain('A4');
    expect(html).toContain('Change');
  });
});

describe('ActionBar', () => {
  it('wraps the bottom actions in a labelled region', () => {
    expect(render(<ActionBar>x</ActionBar>)).toMatch(/<section class="actionbar" aria-label="Actions">/);
  });
});
