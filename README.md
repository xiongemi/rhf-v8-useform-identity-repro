# `useForm()` identity churn in v8 → runaway effects

Minimal reproduction for
[react-hook-form#12333](https://github.com/react-hook-form/react-hook-form/pull/12333)
(["the `useForm` identity change and the potential infinite effect loops"](https://github.com/react-hook-form/react-hook-form/pull/12333#issuecomment-5704356408)).

**Status as of `8.0.0-beta.4`** (published 2026-09-26): partially fixed.
`useForm()`'s return value keeps one identity again — the re-spread was removed
— and the `required`-on-controlled-fields finding is fixed. But four methods
(`getValues`, `watch`, `register`, `getFieldState`) are still **re-bound on
every form-state change**, so any `useEffect` that lists one of them in its
dependency array still re-runs on every keystroke.

In `8.0.0-beta.3` it was worse: the whole return object *and* the four methods
got a new identity per form-state change, so an effect keyed on `[form]` that
also wrote to the form **looped forever**. In `7.87.0` everything keeps one
identity for the life of the component.

## Run it

```bash
npm install

npm run test:v8        # 8.0.0-beta.4: 2 failed | 4 passed  -- methods still churn
npm run test:v8beta3   # 8.0.0-beta.3: 4 failed | 2 passed  -- object churned too
npm run test:v7        # 7.87.0:       6 passed             -- same specs, only the version differs
```

```bash
npm run dev       # live demo in the browser
```

The `test:*` scripts swap only `react-hook-form` (`npm i --no-save`); nothing
else in the project changes. Each leaves that version installed — `npm run
which` prints the current one, and `npm install` restores the pinned
`8.0.0-beta.4`.

## Result

Same six specs, same React 19, only the `react-hook-form` version differs:

| | `7.87.0` | `8.0.0-beta.3` | `8.0.0-beta.4` |
|---|---|---|---|
| `useForm()` return value keeps one identity | ✅ | ❌ | ✅ **fixed** |
| the four re-bound methods keep one identity | ✅ | ❌ | ❌ **still fails** |
| `reset` effect keyed on `[form]` runs once | ✅ (1 run) | ❌ (runs forever) | ✅ **fixed** (1 run) |
| effect keyed on `[getValues]` runs once | ✅ (1 run) | ❌ (7 runs / 5 keystrokes) | ❌ **still fails** (7 runs) |
| workaround: effect keyed on destructured `[reset]` | ✅ | ✅ | ✅ |
| `required` on a controlled field with `field.ref` attached | ✅ | ❌ | ✅ **fixed** |
| `required` on empty native text/number inputs | ✅ | ✅ | ✅ |

### Distinct identities observed across 7 renders

Typing 5 characters into one subscribed field (`src/identity.test.tsx`):

| | `7.87.0` | `8.0.0-beta.3` | `8.0.0-beta.4` |
|---|---|---|---|
| renders | 7 | 7 | 7 |
| `useForm()` return value | **1** | 7 | **1** |
| `getValues` | **1** | 7 | 7 |
| `watch` | **1** | 7 | 7 |
| `register` | **1** | 7 | 7 |
| `getFieldState` | **1** | 7 | 7 |
| `control` | 1 | 1 | 1 |
| `reset` | 1 | 1 | 1 |
| `handleSubmit` | 1 | 1 | 1 |

beta.4 stabilised the object itself, which is what stops the `[form]`-keyed
infinite loop. The four re-bound methods still get exactly one new identity
per render — and because they are **re-bound in place on the (now stable)
object**, destructuring them does not help: `const { getValues } = form` still
yields a fresh function each render. `control` and the methods that are never
re-bound stay stable on all versions, which is what makes the workaround below
work.

## Cause

`useForm` re-binds four methods inside a `useMemo` keyed on `formState`:

```js
// v8.0.0-beta.4 — src/utils/updateMethodsReference.ts
export function updateMethodsReference(_formControl) {
  if (_formControl.current) {
    _formControl.current.getFieldState = _formControl.current.getFieldState.bind({});
    _formControl.current.watch         = _formControl.current.watch.bind({});
    _formControl.current.getValues     = _formControl.current.getValues.bind({});
    _formControl.current.register      = _formControl.current.register.bind({});
  }
}

// v8.0.0-beta.4 — src/useForm.ts
return React.useMemo(() => {
  updateMethodsReference(_formControl);                   // ← on every formState change
  if (_formControl.current) {
    _formControl.current.formState = getProxyFormState(formState, control);
  }
  return _formControl.current;
}, [formState, control]);
```

`formState` is React state, so it changes on every subscribed notification —
i.e. every keystroke under `mode: 'onChange'`.

beta.3 additionally ended `updateMethodsReference` with
`_formControl.current = { ..._formControl.current }`, giving the whole return
object a new identity too; beta.4 removed that line, which is the partial fix.

In `7.87.0` there is no `updateMethodsReference`; the same ref'd object with
the same methods is returned each render, which is why the dependency-array
pattern was safe.

## Why beta.3 looped rather than throwing

The runaway `[form]`-keyed effect did **not** trip React's *"Maximum update
depth exceeded"* guard, because each pass goes through react-hook-form's own
subscription rather than a synchronous `setState` cascade. In a real app it
just spins and pins the CPU. Both the tests and the browser demo therefore
install an explicit circuit breaker; on beta.3, without it, neither
terminates. (On beta.4 the `[form]`-keyed effect no longer loops; the breaker
is kept so the suite stays safe to run against beta.3.)

(In a large test suite it surfaces as a hang plus thousands of depth warnings
rather than a clean failure, which makes it easy to misattribute to the test
runner.)

## Is this intentional? — Yes, confirmed

The maintainer [confirmed](https://github.com/react-hook-form/react-hook-form/pull/12333#issuecomment-5879069223)
(2026-09-28) that the four method re-binds are **intentional and expected in
v8**, done for React Compiler compatibility:

> `useForm()` itself is now referentially stable again, but `watch`,
> `getValues`, `getFieldState`, and `register` are intentionally rebound on
> form updates for React Compiler compatibility.
>
> For this use case, where you want to react to form value changes inside an
> effect without causing a render, `subscribe` should be used instead of
> relying on `getValues` as an effect dependency.

So the two remaining red specs in this repo document permanent v8 behaviour,
not a bug awaiting a fix. The recommended migration is
[`subscribe`](https://react-hook-form.com/docs/useform/subscribe) (or
`control`-based equivalents) instead of listing these methods in dependency
arrays.

The remaining request is that it be called out as a ⚠️ breaking change in the
migration guide: v7's docs describe these as memoized, `exhaustive-deps`
actively tells you to write the dependency array that now breaks, and the
failure mode is a silent re-run (or on beta.3, an infinite loop) rather than a
type or lint error.

### Workaround, for the guide

Depend on the individual methods that are **not** re-bound (`reset`,
`setValue`, `trigger`, `clearErrors`, `setError`, `handleSubmit`, `control`)
rather than on the methods object:

```diff
-const form = useForm({ defaultValues: DEFAULTS });
-useEffect(() => {
-  form.reset(DEFAULTS);
-}, [form, DEFAULTS]);
+const form = useForm({ defaultValues: DEFAULTS });
+const { reset } = form;
+useEffect(() => {
+  reset(DEFAULTS);
+}, [reset, DEFAULTS]);
```

(On beta.4 keying on `[form]` itself also works again, since the object is
stable — but the destructured form is the one that is safe on both betas.)

Note this does *not* work for `getValues` / `watch` / `register` /
`getFieldState` — those are re-bound, so destructuring them still yields a
fresh identity each render. They have to be left out of the dependency array
(with a lint suppression) or replaced with `control`-based equivalents.

## Files

| Path | What it covers |
|---|---|
| `src/identity.test.tsx` | counts distinct identities across renders |
| `src/infinite-loop.test.tsx` | the two runaway-effect patterns |
| `src/workaround.test.tsx` | the suggested workaround, green on all versions |
| `src/App.tsx` | live browser demo of both |
| `src/required-controlled.test.tsx` | second finding, **fixed in beta.4**: built-in `required` fired on a controlled field whose `field.ref` is attached to an always-empty input |
| `src/required-native.test.tsx` | regression guard for the `required` fix — `required` must keep firing for empty *uncontrolled* text and number inputs |

## The `required` finding — fixed in beta.4

This repo's README previously proposed two candidate fixes, verified by
patching the installed beta.3 bundle:

| | `required-controlled` (the bug) | `required-native` (must keep passing) |
|---|---|---|
| unpatched `8.0.0-beta.3` | ❌ fail | ✅ pass |
| **A.** `&& isUndefined(inputValue)` on the DOM branch | ✅ pass | ❌ **fail** |
| **B.** flag controller fields, skip the DOM branch | ✅ pass | ✅ pass |
| `8.0.0-beta.4` (ships **B**) | ✅ **pass** | ✅ **pass** |

beta.4 implements exactly candidate B — `useController` sets an `_f._c` flag
on Controller-managed fields, and `validateField`'s DOM-emptiness branch skips
them:

```js
// v8.0.0-beta.4 — src/useController.ts (ref callback / mount effect)
field._f._c = true;

// v8.0.0-beta.4 — src/logic/validateField.ts
(isHTMLElement(ref) && ref.value === '' && !_c) ||
```

This keeps v8's new "`field.ref` is the real DOM node" behaviour while
restoring v7's validation semantics: for Controller-managed fields, form
state — not the DOM — is authoritative.

**A is a trap**, for the record: an empty `type="number"` field with
`valueAsNumber` has a form value of `NaN`, not `''` — so the DOM branch is the
*only* clause that catches it, and gating that branch on
`isUndefined(inputValue)` silently stops `required` firing there.

Neither fix affects the identity/loop specs, which is the clearest evidence
that the two findings are independent — and indeed beta.4 fixed this one while
the method re-binds remain.

Environment: React 19.3.0, jsdom, Vitest. Reproduced on macOS / Node 22.
