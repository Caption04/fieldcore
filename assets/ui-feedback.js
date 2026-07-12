(function () {
  if (window.FieldCoreUI) return;

  const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[char]);

  function ensureToastStack() {
    let stack = document.querySelector('[data-toast-stack]');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      stack.dataset.toastStack = 'true';
      stack.setAttribute('aria-live', 'polite');
      stack.setAttribute('aria-atomic', 'false');
      document.body.appendChild(stack);
    }
    return stack;
  }

  function notify(message, options = {}) {
    const config = typeof options === 'boolean' ? { type: options ? 'success' : 'error' } : options;
    const type = config.type || 'success';
    const title = config.title || (type === 'error' ? 'Action failed' : type === 'info' ? 'Notice' : 'Done');
    const duration = Number.isFinite(config.duration) ? config.duration : 4000;
    const stack = ensureToastStack();
    const toast = document.createElement('div');
    toast.className = `corner-toast${type === 'error' ? ' error' : type === 'info' ? ' info' : ''}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span><button type="button" class="toast-close" aria-label="Dismiss">×</button><i></i>`;
    stack.appendChild(toast);

    let removeTimer;
    const remove = () => {
      window.clearTimeout(removeTimer);
      toast.classList.add('toast-hiding');
      window.setTimeout(() => {
        toast.remove();
        if (!stack.children.length) stack.remove();
      }, 460);
    };

    toast.querySelector('.toast-close').addEventListener('click', remove);
    removeTimer = window.setTimeout(remove, Math.max(duration - 450, 800));
    return toast;
  }

  function syncModalLock() {
    const hasOpenModal = document.querySelector('.fc-modal') || Array.from(document.querySelectorAll('.client-modal-backdrop')).some((item) => !item.hidden);
    document.body.classList.toggle('modal-open', Boolean(hasOpenModal));
  }

  function closeDialog(modal, value, resolve, previousFocus) {
    modal.remove();
    syncModalLock();
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    resolve(value);
  }

  function openDialog(options = {}) {
    return new Promise((resolve) => {
      const previousFocus = document.activeElement;
      const modal = document.createElement('div');
      modal.className = 'fc-modal fc-feedback-modal';
      modal.setAttribute('role', 'presentation');
      const title = options.title || 'Please confirm';
      const message = options.message || '';
      const confirmLabel = options.confirmLabel || 'Confirm';
      const cancelLabel = options.cancelLabel || 'Cancel';
      const danger = Boolean(options.danger);
      const promptMode = options.mode === 'prompt';
      const fieldLabel = options.fieldLabel || 'Details';
      const initialValue = options.initialValue || '';
      const placeholder = options.placeholder || '';
      const required = Boolean(options.required);
      const maxLength = Number.isFinite(options.maxLength) ? options.maxLength : 500;

      modal.innerHTML = `<div class="fc-dialog fc-feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="fcFeedbackTitle">
        <div class="panel-head">
          <div><h2 id="fcFeedbackTitle">${escapeHtml(title)}</h2>${message ? `<p class="muted">${escapeHtml(message)}</p>` : ''}</div>
          <button class="icon-button" type="button" data-feedback-cancel aria-label="Close">×</button>
        </div>
        ${promptMode ? `<div class="field"><label for="fcFeedbackInput">${escapeHtml(fieldLabel)}</label><textarea id="fcFeedbackInput" rows="4" maxlength="${maxLength}" placeholder="${escapeHtml(placeholder)}"${required ? ' required' : ''}>${escapeHtml(initialValue)}</textarea><p class="fc-form-error" data-feedback-error hidden></p></div>` : ''}
        <div class="fc-form-actions">
          <button class="secondary-button" type="button" data-feedback-cancel>${escapeHtml(cancelLabel)}</button>
          <button class="${danger ? 'danger-button' : 'primary-button'}" type="button" data-feedback-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;

      document.body.appendChild(modal);
      syncModalLock();
      const confirmButton = modal.querySelector('[data-feedback-confirm]');
      const input = modal.querySelector('#fcFeedbackInput');
      const error = modal.querySelector('[data-feedback-error]');

      const cancel = () => closeDialog(modal, promptMode ? null : false, resolve, previousFocus);
      const submitDialog = () => {
        if (promptMode) {
          const value = input.value.trim();
          if (required && !value) {
            error.textContent = options.requiredMessage || `${fieldLabel} is required.`;
            error.hidden = false;
            input.focus();
            return;
          }
          closeDialog(modal, value, resolve, previousFocus);
          return;
        }
        closeDialog(modal, true, resolve, previousFocus);
      };

      modal.querySelectorAll('[data-feedback-cancel]').forEach((button) => button.addEventListener('click', cancel));
      confirmButton.addEventListener('click', submitDialog);
      modal.addEventListener('click', (event) => { if (event.target === modal) cancel(); });
      modal.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') cancel();
        if (event.key === 'Enter' && !promptMode) submitDialog();
        if (event.key === 'Enter' && promptMode && (event.ctrlKey || event.metaKey)) submitDialog();
      });

      window.setTimeout(() => (input || confirmButton).focus(), 0);
    });
  }

  function confirmAction(options) {
    return openDialog({ ...options, mode: 'confirm' });
  }

  function requestText(options) {
    return openDialog({ ...options, mode: 'prompt' });
  }

  async function run(action, options = {}) {
    try {
      const result = await action();
      if (options.successMessage) notify(options.successMessage, { type: 'success', title: options.successTitle });
      return result;
    } catch (error) {
      notify(error && error.message ? error.message : options.errorMessage || 'Something went wrong.', { type: 'error' });
      throw error;
    }
  }

  window.FieldCoreUI = {
    notify,
    confirm: confirmAction,
    requestText,
    run
  };
})();
