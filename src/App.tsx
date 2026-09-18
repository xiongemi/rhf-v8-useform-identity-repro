import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
// read at runtime purely to label the page
import pkg from 'react-hook-form/package.json';

type Values = { a: string };

const BREAKER = 200;

const box: React.CSSProperties = {
  border: '1px solid #ccc',
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
};
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, monospace' };

/** Panel 1 — how many distinct identities appear across renders. */
function IdentityPanel() {
  const form = useForm<Values>({ defaultValues: { a: '' } });
  const a = form.watch('a'); // subscribe so typing re-renders

  const seen = useRef({
    renders: 0,
    form: new Set<unknown>(),
    getValues: new Set<unknown>(),
    watch: new Set<unknown>(),
    register: new Set<unknown>(),
    getFieldState: new Set<unknown>(),
    control: new Set<unknown>(),
    reset: new Set<unknown>(),
  }).current;

  seen.renders += 1;
  seen.form.add(form);
  seen.getValues.add(form.getValues);
  seen.watch.add(form.watch);
  seen.register.add(form.register);
  seen.getFieldState.add(form.getFieldState);
  seen.control.add(form.control);
  seen.reset.add(form.reset);

  const rows: Array<[string, number]> = [
    ['useForm() return value', seen.form.size],
    ['getValues', seen.getValues.size],
    ['watch', seen.watch.size],
    ['register', seen.register.size],
    ['getFieldState', seen.getFieldState.size],
    ['control (not re-bound)', seen.control.size],
    ['reset (not re-bound)', seen.reset.size],
  ];

  return (
    <div style={box}>
      <h2>1. Identity churn</h2>
      <p>
        Type below. On v7 every row stays <code>1</code>. On v8 the first five
        rows track the render count — a new identity per form-state change.
      </p>
      <input
        aria-label="a"
        placeholder="type here…"
        {...form.register('a')}
        style={{ padding: 8, width: 240 }}
      />
      <p style={mono}>value: {JSON.stringify(a)}</p>
      <table style={mono}>
        <tbody>
          <tr>
            <td style={{ paddingRight: 24 }}>renders</td>
            <td>{seen.renders}</td>
          </tr>
          {rows.map(([label, n]) => (
            <tr key={label}>
              <td style={{ paddingRight: 24 }}>{label}</td>
              <td style={{ color: n > 1 ? '#c00' : '#080' }}>{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Panel 2 — the runaway effect, with a breaker so the tab stays usable. */
function LoopPanel() {
  const DEFAULTS = useRef<Values>({ a: '' }).current;
  const form = useForm<Values>({ defaultValues: DEFAULTS });
  const runs = useRef(0);
  const [, force] = useState(0);

  useEffect(() => {
    if (runs.current >= BREAKER) return; // breaker: a real app spins forever
    runs.current += 1;
    form.reset(DEFAULTS);
    force((n) => n + 1);
  }, [form, DEFAULTS]);

  const tripped = runs.current >= BREAKER;
  return (
    <div style={box}>
      <h2>2. Runaway effect</h2>
      <pre style={mono}>{`useEffect(() => {\n  form.reset(DEFAULTS);\n}, [form]);`}</pre>
      <p style={mono}>
        effect runs:{' '}
        <strong style={{ color: tripped ? '#c00' : '#080' }}>
          {runs.current}
        </strong>{' '}
        {tripped
          ? `— breaker tripped at ${BREAKER}; without it this never stops`
          : '— settled'}
      </p>
    </div>
  );
}

export function App() {
  const [showLoop, setShowLoop] = useState(false);
  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 720,
        margin: '40px auto',
        padding: 16,
      }}
    >
      <h1>react-hook-form — useForm() identity</h1>
      <p style={mono}>installed: react-hook-form {pkg.version}</p>
      <IdentityPanel />
      {showLoop ? (
        <LoopPanel />
      ) : (
        <button
          type="button"
          onClick={() => setShowLoop(true)}
          style={{ padding: '8px 16px' }}
        >
          Mount the runaway-effect demo
        </button>
      )}
    </main>
  );
}
