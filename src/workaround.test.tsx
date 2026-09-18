import { render } from '@testing-library/react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

type Values = { a: string };
const LIMIT = 50;

describe('documented workaround', () => {
  it('destructuring `reset` makes the effect run once on v8 too', () => {
    const DEFAULTS: Values = { a: '' };
    let effectRuns = 0;

    function Subject() {
      const form = useForm<Values>({ defaultValues: DEFAULTS });
      const { reset } = form; // <- not re-bound by v8

      useEffect(() => {
        if (effectRuns >= LIMIT) return;
        effectRuns += 1;
        reset(DEFAULTS);
      }, [reset]);

      return <input {...form.register('a')} />;
    }

    render(<Subject />);
    console.log(`[workaround] ran ${effectRuns}x`);
    expect(effectRuns).toBe(1);
  });
});
