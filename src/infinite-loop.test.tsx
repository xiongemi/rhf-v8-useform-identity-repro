import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

type Values = { a: string };

/**
 * The runaway effect does NOT trip React's "Maximum update depth exceeded"
 * guard, because each pass goes through react-hook-form's own subscription
 * rather than a synchronous setState cascade. In a real app it just spins
 * forever and pins the CPU, so these tests install a circuit breaker and
 * assert on the count instead of waiting for React to bail out.
 */
const LIMIT = 50;

describe('effects that depend on values returned by useForm()', () => {
  it('runs a `reset` effect keyed on [form] exactly once', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const DEFAULTS: Values = { a: '' };
    let effectRuns = 0;

    function Subject() {
      const form = useForm<Values>({ defaultValues: DEFAULTS });

      // Exactly the dependency array exhaustive-deps asks for. Safe in v7,
      // because `form` kept one identity for the life of the component.
      useEffect(() => {
        if (effectRuns >= LIMIT) return; // circuit breaker
        effectRuns += 1;
        form.reset(DEFAULTS);
      }, [form]);

      return <input {...form.register('a')} />;
    }

    render(<Subject />);

    console.log(`[reset-in-effect] ran ${effectRuns}x (breaker at ${LIMIT})`);
    expect(effectRuns).toBe(1);
  });

  it('runs an effect keyed on [getValues] once, not once per keystroke', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();

    let effectRuns = 0;

    function Subject() {
      const form = useForm<Values>({ defaultValues: { a: '' } });
      const { getValues, register, watch } = form;
      watch('a'); // subscribe, so typing re-renders

      // `getValues` is one of the four methods v8 re-binds on every
      // form-state change, so this effect re-fires on every keystroke even
      // though nothing it reads has changed.
      useEffect(() => {
        if (effectRuns >= LIMIT) return;
        effectRuns += 1;
      }, [getValues]);

      return <input aria-label="a" {...register('a')} />;
    }

    render(<Subject />);
    await user.type(screen.getByLabelText('a'), 'abcde');

    console.log(`[getValues-in-effect] ran ${effectRuns}x after typing 5 chars`);
    expect(effectRuns).toBe(1);
  });
});
