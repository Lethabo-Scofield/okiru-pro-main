// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { NumberInput } from '../ui/number-input';

afterEach(cleanup);

/**
 * Realistic harness: the pillar forms bind their numeric fields to a `number`
 * that defaults to 0 (e.g. EmployeeFormState.annualSalary, shareholder
 * blackOwnership, training travelCost). Lethabo's numericInputs.dom test bound
 * to a *string* state, which is why it passed while users still couldn't type —
 * a number-bound control shows a stuck "0" and coerces partial input. These
 * tests pin the fixed behaviour of the shared NumberInput.
 */
function NumberField({ initial = 0 }: { initial?: number }) {
  const [value, setValue] = React.useState<number>(initial);
  return (
    <>
      <NumberInput aria-label="amount" value={value} onValueChange={setValue} />
      <span data-testid="model">{value}</span>
    </>
  );
}

describe('NumberInput — free numeric entry (Polo #3/#4/#6)', () => {
  it('renders a 0 model value as an empty field (no stuck "0")', () => {
    render(<NumberField initial={0} />);
    expect((screen.getByLabelText('amount') as HTMLInputElement).value).toBe('');
  });

  it('accepts a full multi-digit value typed from empty', async () => {
    const user = userEvent.setup();
    render(<NumberField />);
    const input = screen.getByLabelText('amount') as HTMLInputElement;

    await user.type(input, '450000');

    expect(input.value).toBe('450000');
    expect(screen.getByTestId('model').textContent).toBe('450000');
  });

  it('accepts a decimal value (voting rights / ownership %)', async () => {
    const user = userEvent.setup();
    render(<NumberField />);
    const input = screen.getByLabelText('amount') as HTMLInputElement;

    await user.type(input, '12.5');

    expect(input.value).toBe('12.5');
    expect(screen.getByTestId('model').textContent).toBe('12.5');
  });

  it('emits 0 when the field is cleared, without leaving a stuck value', async () => {
    const user = userEvent.setup();
    render(<NumberField initial={100} />);
    const input = screen.getByLabelText('amount') as HTMLInputElement;

    await user.clear(input);

    expect(screen.getByTestId('model').textContent).toBe('0');
    // buffer holds "" while focused so the field stays empty for re-entry
    expect(input.value).toBe('');
  });

  it('shows the canonical numeric value once focus leaves (buffer drops)', async () => {
    const user = userEvent.setup();
    render(<NumberField initial={42} />);
    const input = screen.getByLabelText('amount') as HTMLInputElement;

    await user.click(input);
    await user.tab();

    expect(input.value).toBe('42');
  });
});
