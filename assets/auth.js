(function () {
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
  const page = document.body.dataset.authPage;

  async function api(path, options) {
    const response = await fetch(API_BASE + path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...(options || {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error && payload.error.message || 'Request failed');
    }
    return payload.data;
  }

  function message(text, ok) {
    const node = document.querySelector('[data-auth-message]');
    if (!node) return;
    node.textContent = text || '';
    node.hidden = !text;
    node.classList.toggle('is-success', Boolean(ok));
  }

  function returnUrl() {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('return') || 'index.html';
    if (/^https?:\/\//i.test(next) || next.startsWith('//')) return 'index.html';
    return next;
  }

  function formData(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    Object.keys(data).forEach((key) => {
      if (data[key] === '') delete data[key];
    });
    return data;
  }

  async function redirectIfSignedIn() {
    try {
      const client = await api('/client/auth/session');
      if (client) {
        window.location.href = 'client-portal.html';
        return;
      }
      const user = await api('/auth/session');
      if (user) window.location.href = returnUrl();
    } catch (error) {}
  }

  function bindLogin() {
    const form = document.querySelector('[data-login-form]');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      message('');
      if (window.FieldCoreFormUX && !window.FieldCoreFormUX.validateForm(form)) return;
      try {
        await api('/auth/login', { method: 'POST', body: JSON.stringify(formData(form)) });
        window.location.href = returnUrl();
      } catch (error) {
        const text = error.message || 'Invalid email or password.';
        message(text);
        if (window.FieldCoreUI) window.FieldCoreUI.notify(text, { type: 'error' });
      }
    });
  }

  function bindRegister() {
    const form = document.querySelector('[data-register-form]');
    if (!form) return;
    const steps = Array.from(form.querySelectorAll('[data-signup-step]'));
    const showStep = (number) => {
      steps.forEach((step) => { step.hidden = step.dataset.signupStep !== String(number); });
      form.querySelectorAll('[data-signup-dot]').forEach((dot) => dot.classList.toggle('active', Number(dot.dataset.signupDot) <= number));
    };
    const firstFields = Array.from(form.querySelector('[data-signup-step="1"]').querySelectorAll('input, select'));
    const next = form.querySelector('[data-signup-next]');
    const back = form.querySelector('[data-signup-back]');
    if (next) next.addEventListener('click', () => {
      message('');
      const firstStep = form.querySelector('[data-signup-step="1"]');
      if (window.FieldCoreFormUX && !window.FieldCoreFormUX.validateForm(firstStep)) return;
      const invalid = firstFields.find((field) => !field.checkValidity());
      if (invalid) return invalid.focus();
      if (form.password.value !== form.confirmPassword.value) return message('Passwords do not match.');
      showStep(2);
    });
    if (back) back.addEventListener('click', () => showStep(1));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      message('');
      if (form.password.value !== form.confirmPassword.value) { showStep(1); return message('Passwords do not match.'); }
      if (window.FieldCoreFormUX && !window.FieldCoreFormUX.validateForm(form.querySelector('[data-signup-step="2"]'))) return;
      try {
        await api('/auth/register', { method: 'POST', body: JSON.stringify(formData(form)) });
        window.location.href = 'plan-selection.html';
      } catch (error) {
        const text = error.message || 'Could not create account.';
        message(text);
        if (window.FieldCoreUI) window.FieldCoreUI.notify(text, { type: 'error' });
      }
    });
  }

  redirectIfSignedIn();
  if (page === 'login') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('passwordChanged') === '1') message('Password changed. Sign in again.', true);
    else if (params.get('loggedOut') === '1') message('You have been signed out.', true);
    bindLogin();
  }
  if (page === 'register') bindRegister();
})();
