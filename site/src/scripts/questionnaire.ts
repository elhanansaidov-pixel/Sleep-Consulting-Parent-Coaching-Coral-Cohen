const STORAGE_KEY = 'cc-questionnaire-v1';

const MSG = {
  required: 'נשמח לתשובה כאן',
  phone: 'נראה שמספר הטלפון לא מלא',
  email: 'כתובת הדוא״ל לא תקינה',
  consent: 'יש לאשר את ההצהרה כדי לשלוח',
  send: 'משהו השתבש בשליחה. התשובות שמורות, נסו שוב או כתבו לי בוואטסאפ.',
  notConnected: 'זו גרסת תצוגה: השליחה עדיין לא מחוברת למערכת. התשובות שמורות במכשיר.',
};

type Ctl = HTMLInputElement | HTMLTextAreaElement;

const safeStorage = {
  get(): Record<string, string> {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { return {}; }
  },
  set(v: Record<string, string>) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch { /* private mode */ }
  },
  clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  },
};

function validate(el: Ctl): string {
  if (el instanceof HTMLInputElement && el.type === 'checkbox') return el.checked ? '' : MSG.consent;
  const v = el.value.trim();
  if (el.required && !v) return MSG.required;
  if (!v) return '';
  if (el.type === 'tel' && v.replace(/\D/g, '').length < 9) return MSG.phone;
  if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return MSG.email;
  return '';
}

function showError(el: Ctl, msg: string) {
  const err = document.getElementById(`${el.id}-err`);
  if (err) err.textContent = msg;
  el.setAttribute('aria-invalid', msg ? 'true' : 'false');
}

export function initQuestionnaire() {
  const form = document.querySelector<HTMLFormElement>('[data-qform]');
  if (!form) return;
  const steps = Array.from(form.querySelectorAll<HTMLFieldSetElement>('[data-q-step]'));
  const prev = form.querySelector<HTMLButtonElement>('[data-q-prev]')!;
  const next = form.querySelector<HTMLButtonElement>('[data-q-next]')!;
  const submit = form.querySelector<HTMLButtonElement>('[data-q-submit]')!;
  const bar = form.querySelector<HTMLElement>('[data-q-bar]')!;
  const count = form.querySelector<HTMLElement>('[data-q-count]')!;
  const status = form.querySelector<HTMLElement>('[data-q-status]')!;
  const done = document.querySelector<HTMLElement>('[data-q-done]')!;
  const endpoint = form.dataset.endpoint ?? '';
  let current = 0;

  const controls = () => Array.from(form.querySelectorAll<Ctl>('input[name]:not([name="website"]), textarea[name]'));

  // restore
  const saved = safeStorage.get();
  controls().forEach((el) => {
    const v = saved[el.name];
    if (v === undefined) return;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = v === '1';
    else el.value = v;
  });

  form.addEventListener('input', (e) => {
    const el = e.target as Ctl;
    if (!el.name || el.name === 'website') return;
    const data = safeStorage.get();
    data[el.name] = el instanceof HTMLInputElement && el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value;
    safeStorage.set(data);
    if (el.getAttribute('aria-invalid') === 'true') showError(el, validate(el));
  });

  const render = () => {
    steps.forEach((s, i) => (s.hidden = i !== current));
    prev.hidden = current === 0;
    const last = current === steps.length - 1;
    next.hidden = last;
    submit.hidden = !last;
    bar.style.width = `${((current + 1) / steps.length) * 100}%`;
    count.textContent = `שלב ${current + 1} מתוך ${steps.length}`;
  };

  const validateStep = (i: number) => {
    const els = Array.from(steps[i].querySelectorAll<Ctl>('input[name], textarea[name]'));
    let firstBad: Ctl | null = null;
    els.forEach((el) => {
      const msg = validate(el);
      showError(el, msg);
      if (msg && !firstBad) firstBad = el;
    });
    if (firstBad) (firstBad as Ctl).focus();
    return !firstBad;
  };

  const go = (i: number) => {
    current = i;
    render();
    steps[current].querySelector<HTMLElement>('legend')?.setAttribute('tabindex', '-1');
    steps[current].querySelector<HTMLElement>('legend')?.focus();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  next.addEventListener('click', () => { if (validateStep(current)) go(current + 1); });
  prev.addEventListener('click', () => go(current - 1));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = '';
    for (let i = 0; i < steps.length; i++) {
      if (!validateStep(i)) { go(i); validateStep(i); return; }
    }
    if (!endpoint) { status.textContent = MSG.notConnected; return; }

    const payload: Record<string, string | boolean> = {};
    controls().forEach((el) => {
      payload[el.name] = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.value.trim();
    });
    payload.website = (form.querySelector<HTMLInputElement>('input[name="website"]')?.value ?? '');
    const token = form.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value;
    if (token) payload.turnstile_token = token;

    submit.disabled = true;
    submit.textContent = 'שולח…';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      safeStorage.clear();
      form.hidden = true;
      done.hidden = false;
      done.focus();
    } catch {
      status.textContent = MSG.send;
    } finally {
      submit.disabled = false;
      submit.textContent = 'שליחת השאלון';
    }
  });

  render();
}
