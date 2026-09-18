# `useForm()` identity churn in v8 → runaway effects

Minimal reproduction for
[react-hook-form#12333](https://github.com/react-hook-form/react-hook-form/pull/12333)
(["the `useForm` identity change and the potential infinite effect loops"](https://github.com/react-hook-form/react-hook-form/pull/12333#issuecomment-5704356408)).

In `8.0.0-beta.3`, `useForm()`'s return value — and four of its methods — get a
**new identity on every form-state change**. In `7.87.0` they keep one identity
for the life of the component. Any `useEffect` that lists one in its dependency
array therefore re-runs on every keystroke in v8, and **loops forever** if it
also writes to the form.

## Run it

```bash
npm install

npm run test:v8   # 3 failed | 1 passed  -- reproduces
npm run test:v7   # 4 passed              -- same specs, only the version differs

npm run dev       # live demo in the browser
```

`test:v7` / `test:v8` swap only `react-hook-form` (`npm i --no-save`); nothing
else in the project changes. Each leaves that version installed — `npm run
which` prints the current one, and `npm install` restores the pinned
`8.0.0-beta.3`.

## Result

Same three specs, same React 19, only the `react-hook-form` version differs:

| | `7.87.0` | `8.0.0-beta.3` |
|---|---|---|
| `useForm()` keeps one identity | ✅ pass | ❌ **fail** |
| `reset` effect keyed on `[form]` runs once | ✅ pass (1 run) | ❌ **fail** (runs forever) |
| effect keyed on `[getValues]` runs once | ✅ pass (1 run) | ❌ **fail** (7 runs / 5 keystrokes) |
| workaround: effect keyed on destructured `[reset]` | ✅ pass | ✅ pass |

### Distinct identities observed across 7 renders

Typing 5 characters into one subscribed field (`src/identity.test.tsx`):

| | `7.87.0` | `8.0.0-beta.3` |
|---|---|---|
| renders | 7 | 7 |
| `useForm()` return value | **1** | **7** |
| `getValues` | **1** | **7** |
| `watch` | **1** | **7** |
| `register` | **1** | **7** |
| `getFieldState` | **1** | **7** |
| `control` | 1 | 1 |
| `reset` | 1 | 1 |
| `handleSubmit` | 1 | 1 |

Exactly one new identity per render on v8. `control` and the methods that are
not re-bound stay stable on both — which is what makes the workaround below
work.

## Cause

`useForm` re-spreads the ref'd methods object inside a `useMemo` keyed on
`formState`, and re-binds four methods each time:

```js
// v8.0.0-beta.3 — src/useForm.ts
function updateMethodsReference(_formControl) {
  if (_formControl.current) {
    _formControl.current.getFieldState = _formControl.current.getFieldState.bind({});
    _formControl.current.watch         = _formControl.current.watch.bind({});
    _formControl.current.getValues     = _formControl.current.getValues.bind({});
    _formControl.current.register      = _formControl.current.register.bind({});
    _formControl.current = { ..._formControl.current };   // ← new identity
  }
}

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

In `7.87.0` there is no `updateMethodsReference`; the same ref'd object is
returned each render, which is why the dependency-array pattern was safe.

## Why it loops rather than throwing

The runaway effect does **not** trip React's *"Maximum update depth exceeded"*
guard, because each pass goes through react-hook-form's own subscription rather
than a synchronous `setState` cascade. In a real app it just spins and pins the
CPU. Both the tests and the browser demo therefore install an explicit circuit
breaker; without it neither terminates.

(In a large suite it surfaces as a hang plus thousands of depth warnings — the
migration this came from hit 6,634 of them from a single component.)

## Is this intentional?

Plausibly — it looks like the immutability work for
[#12298](https://github.com/react-hook-form/react-hook-form/issues/12298)
(React Compiler correctness), since mutating a hook's return value is exactly
what that issue is about.

If so, the request is just that it be called out as a ⚠️ breaking change in the
migration guide: v7's docs describe these as memoized, `exhaustive-deps`
actively tells you to write the dependency array that now breaks, and the
failure mode is a silent infinite loop rather than a type or lint error.

### Workaround, for the guide

Depend on the individual methods that are **not** re-bound (`reset`, `setValue`,
`trigger`, `clearErrors`, `setError`, `handleSubmit`, `control`) rather than on
the methods object:

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

Note this does *not* work for `getValues` / `watch` / `register` /
`getFieldState` — those are re-bound, so destructuring them still yields a fresh
identity each render. They have to be left out of the dependency array (with a
lint suppression) or replaced with `control`-based equivalents.

## Files

| Path | What it covers |
|---|---|
| `src/identity.test.tsx` | counts distinct identities across renders |
| `src/infinite-loop.test.tsx` | the two runaway-effect patterns |
| `src/workaround.test.tsx` | the suggested workaround, green on both versions |
| `src/App.tsx` | live browser demo of both |
| `src/required-controlled.test.tsx` | second finding: built-in `required` fires on a controlled field whose `field.ref` is attached to an always-empty input |
| `src/required-native.test.tsx` | regression guard for any fix to `isEmpty` — `required` must keep firing for empty *uncontrolled* text and number inputs |

## A candidate fix for the `required` finding

Verified by patching the installed `8.0.0-beta.3` bundle and re-running the
suite. Two candidates:

| | `required-controlled` (the bug) | `required-native` (must keep passing) |
|---|---|---|
| unpatched `8.0.0-beta.3` | ❌ fail | ✅ pass |
| **A.** `&& isUndefined(inputValue)` on the DOM branch | ✅ pass | ❌ **fail** |
| **B.** flag controller fields, skip the DOM branch | ✅ pass | ✅ pass |

**A is a trap.** It looks like the obvious one-line fix, but an empty
`type="number"` field with `valueAsNumber` has a form value of `NaN`, not `''`
— so the DOM branch is the *only* clause that catches it, and gating that
branch on `isUndefined(inputValue)` silently stops `required` firing there.

**B** keeps v8's new "`field.ref` is the real DOM node" behaviour while
restoring v7's validation semantics, by recording that a field is
Controller-managed (so form state, not the DOM, is authoritative):

```diff
  // src/useController.ts -- in the ref callback and the mount effect
  if (field && field._f && elm) {
    field._f.ref = _proxyRef.current;
+   field._f.isController = true;
  }

  // src/logic/validateField.ts
- (isHTMLElement(ref) && ref.value === '') ||
+ (isHTMLElement(ref) && ref.value === '' && !isController) ||

  // src/types/fields.ts -- Field._f
+ isController?: boolean;
```

Neither candidate affects the identity/loop specs, which is the clearest
evidence that the two findings are independent: the identity churn is a
deliberate design change, not a side effect of this one.

Environment: React 19.3.0, jsdom, Vitest. Reproduced on macOS / Node 22.
