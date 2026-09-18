import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Control, useController, useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

type Values = { tags: string[] };

/**
 * A controlled multi-value field -- the shape every chips / autocomplete input
 * has. The visible <input> is only a typeahead box; the committed value lives
 * in form state, so the DOM `value` is always ''.
 */
function TagsField({ control }: { control: Control<Values> }) {
  const { field } = useController({
    name: 'tags',
    control,
    rules: { required: 'tags is required' },
  });

  return (
    <>
      <input data-testid="typeahead" ref={field.ref} value="" readOnly />
      <button
        type="button"
        data-testid="add"
        onClick={() => field.onChange(['a', 'b'])}
      >
        add
      </button>
      <span data-testid="value">{JSON.stringify(field.value ?? null)}</span>
    </>
  );
}

describe('built-in `required` on a controlled field with field.ref attached', () => {
  it('submits when form state holds a non-empty value', async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    const onInvalid = vi.fn();

    function Form() {
      const { control, handleSubmit } = useForm<Values>();
      return (
        <form onSubmit={handleSubmit(onValid, onInvalid)}>
          <TagsField control={control} />
          <button type="submit" data-testid="submit">
            submit
          </button>
        </form>
      );
    }

    render(<Form />);
    await user.click(screen.getByTestId('add'));
    // form state really does hold the value
    expect(screen.getByTestId('value').textContent).toBe('["a","b"]');

    await user.click(screen.getByTestId('submit'));

    expect(onInvalid).not.toHaveBeenCalled();
    expect(onValid).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['a', 'b'] }),
      expect.anything(),
    );
  });
});
