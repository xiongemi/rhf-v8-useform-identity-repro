import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

type Values = { a: string };

describe('useForm() referential stability', () => {
  it('keeps one identity for the methods object across form-state changes', async () => {
    const user = userEvent.setup();

    const seen = {
      renders: 0,
      form: new Set<unknown>(),
      getValues: new Set<unknown>(),
      watch: new Set<unknown>(),
      register: new Set<unknown>(),
      getFieldState: new Set<unknown>(),
      // not re-bound by v8 -- included for contrast
      control: new Set<unknown>(),
      reset: new Set<unknown>(),
      handleSubmit: new Set<unknown>(),
    };

    function Probe() {
      const form: UseFormReturn<Values> = useForm<Values>({
        defaultValues: { a: '' },
      });
      // Subscribe so that each keystroke produces a form-state change.
      const a = form.watch('a');

      seen.renders += 1;
      seen.form.add(form);
      seen.getValues.add(form.getValues);
      seen.watch.add(form.watch);
      seen.register.add(form.register);
      seen.getFieldState.add(form.getFieldState);
      seen.control.add(form.control);
      seen.reset.add(form.reset);
      seen.handleSubmit.add(form.handleSubmit);

      return (
        <>
          <input aria-label="a" {...form.register('a')} />
          <output>{a}</output>
        </>
      );
    }

    render(<Probe />);
    await user.type(screen.getByLabelText('a'), 'abcde');

    const summary = {
      renders: seen.renders,
      form: seen.form.size,
      getValues: seen.getValues.size,
      watch: seen.watch.size,
      register: seen.register.size,
      getFieldState: seen.getFieldState.size,
      control: seen.control.size,
      reset: seen.reset.size,
      handleSubmit: seen.handleSubmit.size,
    };
    console.log('[identity] distinct identities seen:', summary);

    expect(summary).toMatchObject({
      form: 1,
      getValues: 1,
      watch: 1,
      register: 1,
      getFieldState: 1,
      // stable on BOTH v7 and v8
      control: 1,
      reset: 1,
      handleSubmit: 1,
    });
  });
});
