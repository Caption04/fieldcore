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
      try {
        await api('/auth/login', { method: 'POST', body: JSON.stringify(formData(form)) });
        window.location.href = returnUrl();
      } catch (error) {
        message(error.message || 'Invalid email or password.');
      }
    });
  }

  function bindRegister() {
    const form = document.querySelector('[data-register-form]');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      message('');
      try {
        await api('/auth/register', { method: 'POST', body: JSON.stringify(formData(form)) });
        window.location.href = 'index.html';
      } catch (error) {
        message(error.message || 'Could not create account.');
      }
    });
  }

  redirectIfSignedIn();
  if (page === 'login') bindLogin();
  if (page === 'register') bindRegister();
})();
