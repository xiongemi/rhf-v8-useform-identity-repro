import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

type Values = { text: string; num: number };

/**
 * Regression guard for any fix to the `isEmpty` computation: `required` must
 * still fire for genuinely empty *uncontrolled* inputs. The empty number input
 * matters most -- with `valueAsNumber` its form value is `NaN`, not `''`, so
 * the DOM-value branch of `isEmpty` is the only thing that catches it.
 */
describe('built-in `required` on native registered inputs', () => {
  it('still fires for an empty text input and an empty number input', async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    const onInvalid = vi.fn();

    function Form() {
      const { register, handleSubmit } = useForm<Values>();
      return (
        <form onSubmit={handleSubmit(onValid, onInvalid)}>
          <input
            aria-label="text"
            {...register('text', { required: 'text is required' })}
          />
          <input
            aria-label="num"
            type="number"
            {...register('num', {
              required: 'num is required',
              valueAsNumber: true,
            })}
          />
          <button type="submit" data-testid="submit">
            submit
          </button>
        </form>
      );
    }

    render(<Form />);
    await user.click(screen.getByTestId('submit'));

    expect(onValid).not.toHaveBeenCalled();
    expect(onInvalid).toHaveBeenCalledTimes(1);
    const errors = onInvalid.mock.calls[0][0] as Record<
      string,
      { message?: string }
    >;
    expect(errors.text?.message).toBe('text is required');
    expect(errors.num?.message).toBe('num is required');
  });
});
