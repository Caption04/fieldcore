(function () {
  const root = document.querySelector('[data-invite-accept]');
  if (!root) return;

  const token = new URLSearchParams(window.location.search).get('token') || '';
  const form = root.querySelector('[data-invite-form]');
  const heading = root.querySelector('[data-invite-heading]');
  const copy = root.querySelector('[data-invite-copy]');
  const message = root.querySelector('[data-invite-message]');

  async function api(path, options) {
    const response = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json' }, ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error && payload.error.message || 'This invitation could not be opened.');
    return payload.data;
  }

  function setMessage(text) {
    message.textContent = text || '';
    message.hidden = !text;
  }

  async function load() {
    try {
      if (!token || token === '[redacted]' || token.length < 32) throw new Error('This invitation link is incomplete. Ask the sender to resend it.');
      const invitation = await api('/public/member-invitations/preview?token=' + encodeURIComponent(token));
      heading.textContent = 'Join ' + invitation.company.name;
      copy.textContent = `You were invited as ${invitation.jobTitle || invitation.roleTemplate && invitation.roleTemplate.name || 'a team member'}. Set your password to join.`;
      form.hidden = false;
      if (window.FieldCoreFormUX) window.FieldCoreFormUX.refresh();
    } catch (error) {
      heading.textContent = 'Invitation unavailable';
      copy.textContent = error.message || 'Ask the sender to resend the invitation.';
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage('');
    if (window.FieldCoreFormUX && !window.FieldCoreFormUX.validateForm(form)) return;
    const values = Object.fromEntries(new FormData(form).entries());
    if (values.password !== values.confirmPassword) {
      setMessage('Passwords do not match.');
      if (window.FieldCoreUI) window.FieldCoreUI.notify('Passwords do not match.', { type: 'error' });
      return;
    }
    try {
      await api('/public/member-invitations/accept', { method: 'POST', body: JSON.stringify({ token, name: values.name.trim(), password: values.password }) });
      window.location.href = 'index.html';
    } catch (error) {
      const text = error.message || 'The invitation could not be accepted. Ask the sender to resend it.';
      setMessage(text);
      if (window.FieldCoreUI) window.FieldCoreUI.notify(text, { type: 'error' });
    }
  });

  load();
})();
