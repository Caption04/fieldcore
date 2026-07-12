(function () {
  'use strict';

  const NEW_PASSWORD_MIN_LENGTH = 12;
  const processedPasswordInputs = new WeakSet();
  const fieldErrors = new WeakMap();

  function fieldLabel(input) {
    const explicit = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
    const wrapping = input.closest('label');
    const text = (explicit || wrapping) && (explicit || wrapping).textContent;
    const cleaned = String(text || input.getAttribute('aria-label') || input.name || 'this field')
      .replace(/\s+/g, ' ')
      .replace(/\*$/, '')
      .trim()
      .toLowerCase();
    return cleaned || 'this field';
  }

  function errorNode(input) {
    if (fieldErrors.has(input)) return fieldErrors.get(input);
    const existing = input.parentElement && input.parentElement.querySelector(':scope > .field-error');
    if (existing) {
      fieldErrors.set(input, existing);
      return existing;
    }
    const node = document.createElement('small');
    node.className = 'field-error';
    node.hidden = true;
    const anchor = input.closest('.password-input-shell') || input;
    anchor.insertAdjacentElement('afterend', node);
    fieldErrors.set(input, node);
    return node;
  }

  function isVisible(input) {
    return !input.disabled && input.type !== 'hidden' && !input.closest('[hidden]');
  }

  function matchingPassword(input) {
    const form = input.form || input.closest('form') || document;
    if (/confirm/i.test(input.name || input.id || '')) {
      return form.querySelector('input[name="newPassword"], input[name="password"]');
    }
    return null;
  }

  function validationMessage(input) {
    if (!isVisible(input)) return '';
    const value = String(input.value || '');
    const label = fieldLabel(input);

    if (input.required && !value.trim()) {
      return input.tagName === 'SELECT' ? `Choose ${label}.` : `Enter ${label}.`;
    }
    if (!value) return '';
    if (input.type === 'email' && input.validity.typeMismatch) return 'Enter a valid email address.';
    if (input.minLength > 0 && value.length < input.minLength) return `Use at least ${input.minLength} characters.`;
    if (input.maxLength > 0 && value.length > input.maxLength) return `Use no more than ${input.maxLength} characters.`;
    if (input.validity.patternMismatch) return `Check ${label} and try again.`;

    const original = matchingPassword(input);
    if (original && value !== original.value) return 'Passwords do not match.';

    return '';
  }

  function validateInput(input, showSuccess) {
    if (!input || !isVisible(input)) return true;
    if ((input.type === 'checkbox' || input.type === 'radio') && !input.required) {
      input.classList.remove('field-input-invalid', 'field-input-valid');
      input.removeAttribute('aria-invalid');
      return true;
    }
    const message = validationMessage(input);
    const node = errorNode(input);
    node.textContent = message;
    node.hidden = !message;
    input.classList.toggle('field-input-invalid', Boolean(message));
    input.classList.toggle('field-input-valid', Boolean(showSuccess && !message && String(input.value || '').length));
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    return !message;
  }

  function eyeIcon(hidden) {
    return hidden
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18"></path><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.1 2.8"></path><path d="M6.5 7.2C3.9 9 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.9-.4 4.1-1"></path></svg>';
  }

  function addPasswordControl(input) {
    if (processedPasswordInputs.has(input)) return;
    processedPasswordInputs.add(input);

    if (input.autocomplete === 'new-password') input.minLength = Math.max(input.minLength || 0, NEW_PASSWORD_MIN_LENGTH);

    let shell = input.closest('.password-input-shell');
    if (!shell) {
      shell = document.createElement('span');
      shell.className = 'password-input-shell';
      input.parentNode.insertBefore(shell, input);
      shell.appendChild(input);
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'password-visibility-button';
    button.setAttribute('aria-label', 'Show password');
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = eyeIcon(true);
    button.addEventListener('click', function () {
      const hidden = input.type === 'password';
      input.type = hidden ? 'text' : 'password';
      button.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
      button.setAttribute('aria-pressed', hidden ? 'true' : 'false');
      button.innerHTML = eyeIcon(!hidden);
      input.focus();
    });
    shell.appendChild(button);

    if (input.autocomplete === 'new-password') {
      const check = document.createElement('small');
      check.className = 'password-live-check';
      check.textContent = `Use at least ${input.minLength} characters.`;
      shell.insertAdjacentElement('afterend', check);
      const updateCheck = function () {
        const passed = input.value.length >= input.minLength;
        check.classList.toggle('passed', passed);
        check.textContent = passed ? 'Password length is good.' : `Use at least ${input.minLength} characters.`;
      };
      input.addEventListener('input', updateCheck);
      updateCheck();
    }
  }

  function bindInput(input) {
    if (input.dataset.fieldcoreValidationBound === 'true') return;
    input.dataset.fieldcoreValidationBound = 'true';
    input.addEventListener('blur', function () { validateInput(input, true); });
    input.addEventListener('input', function () {
      if (input.classList.contains('field-input-invalid') || /confirm/i.test(input.name || input.id || '')) validateInput(input, true);
      const form = input.form || input.closest('form');
      if (form && /password/i.test(input.name || input.id || '')) {
        form.querySelectorAll('input[type="password"], input[type="text"]').forEach(function (candidate) {
          if (/confirm/i.test(candidate.name || candidate.id || '')) validateInput(candidate, true);
        });
      }
    });
    input.addEventListener('change', function () { validateInput(input, true); });
  }

  function controlsWithin(root) {
    if (!root) return [];
    const controls = [];
    if (root.matches && root.matches('input, select, textarea')) controls.push(root);
    if (root.querySelectorAll) controls.push.apply(controls, root.querySelectorAll('input, select, textarea'));
    return controls;
  }

  function refresh(root) {
    const target = root || document;
    controlsWithin(target).forEach(function (input) {
      if (input.type === 'password') addPasswordControl(input);
      bindInput(input);
    });
    if (target.querySelectorAll) {
      target.querySelectorAll('form').forEach(function (form) { form.noValidate = true; });
    }
  }

  function validateForm(root) {
    const controls = controlsWithin(root).filter(isVisible);
    let firstInvalid = null;
    controls.forEach(function (input) {
      if (!validateInput(input, true) && !firstInvalid) firstInvalid = input;
    });
    if (firstInvalid) {
      firstInvalid.focus();
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  }

  window.FieldCoreFormUX = { refresh, validateForm };

  function start() {
    refresh(document);
    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) refresh(node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
