// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { dateValidator, SECTIONS } from '../sections';

afterEach(cleanup);

/**
 * Wires a real text input to the production dateValidator (the single source of
 * truth the workbook grid uses for date cells). Proves the dd/mm/yyyy product
 * format is accepted without a "use a different format" suggestion, ISO is also
 * tolerated, and clearly invalid input is rejected.
 */
function DateField() {
  const [value, setValue] = React.useState('');
  const message = dateValidator(value);
  return (
    <div>
      <input
        aria-label="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {message ? <span role="alert">{message}</span> : null}
    </div>
  );
}

describe('financial date validation (feedback #1)', () => {
  it('accepts dd/mm/yyyy with no error or format suggestion', async () => {
    const user = userEvent.setup();
    render(<DateField />);
    await user.type(screen.getByLabelText('date'), '01/01/2026');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('accepts ISO yyyy-mm-dd (HTML date picker output) without error', async () => {
    const user = userEvent.setup();
    render(<DateField />);
    await user.type(screen.getByLabelText('date'), '2026-01-01');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rejects an out-of-range date', async () => {
    const user = userEvent.setup();
    render(<DateField />);
    await user.type(screen.getByLabelText('date'), '32/13/2026');
    expect(screen.getByRole('alert').textContent).toContain('Invalid date');
  });

  it('does not suggest a different format for an already-valid value', () => {
    expect(dateValidator('01/01/2026')).toBeNull();
    expect(dateValidator('2026-01-01')).toBeNull();
  });
});

describe('date label consistency (feedback #1)', () => {
  it('financialYearEnd label advertises dd/mm/yyyy, never yyyy-mm-dd', () => {
    const companyInfo = SECTIONS.find((section) => section.key === 'company-information');
    const field = companyInfo?.meta?.find((item) => item.key === 'financialYearEnd');
    expect(field?.label).toContain('dd/mm/yyyy');
    expect(field?.label).not.toContain('yyyy-mm-dd');
  });
});
