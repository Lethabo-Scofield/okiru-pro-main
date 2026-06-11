// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { Input } from '../ui/input';

afterEach(cleanup);

/**
 * Reproduces the real numeric-entry flow used across the pillar forms (Annual
 * Salary, Voting Rights %, Supplier Spend, Training Cost): a controlled
 * `<input type="number">` rendered by the shared Toolkit Input. userEvent.type
 * exercises the browser selection path that previously crashed; if any
 * setSelectionRange-style error were thrown it would surface here.
 */
function NumberField({ initial = '' }: { initial?: string }) {
  const [value, setValue] = React.useState(initial);
  return (
    <Input
      aria-label="amount"
      type="number"
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

describe('numeric inputs — typing does not crash (feedback #2)', () => {
  it('accepts a multi-digit value without throwing', async () => {
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<NumberField />);
    const input = screen.getByLabelText('amount') as HTMLInputElement;

    await user.click(input);
    await user.type(input, '450000');

    expect(input.value).toBe('450000');
    expect(
      errorSpy.mock.calls.some((c) => /selection|setSelectionRange/i.test(String(c[0]))),
    ).toBe(false);
    errorSpy.mockRestore();
  });

  it('accepts a decimal value (e.g. voting rights %) without throwing', async () => {
    const user = userEvent.setup();
    render(<NumberField />);
    const input = screen.getByLabelText('amount') as HTMLInputElement;

    await user.type(input, '12.5');

    expect(input.value).toBe('12.5');
  });

  it('supports editing and clearing an existing value', async () => {
    const user = userEvent.setup();
    render(<NumberField initial="100" />);
    const input = screen.getByLabelText('amount') as HTMLInputElement;

    await user.clear(input);
    await user.type(input, '275');

    expect(input.value).toBe('275');
  });
});
