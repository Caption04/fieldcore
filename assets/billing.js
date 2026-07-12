(function () {
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
  const root = document.querySelector('[data-billing-app]');
  if (!root) return;
  const onboarding = root.dataset.billingApp === 'onboarding';
  let interval = 'MONTHLY';
  let catalog;
  let summary;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  async function api(path, options) {
    const response = await fetch(API_BASE + path, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options && options.headers) }, ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error && payload.error.message || `HTTP ${response.status}`);
    return payload.data;
  }

  function money(value, currency) {
    return new Intl.NumberFormat(catalog.market === 'SA' ? 'en-ZA' : 'en-ZW', { style: 'currency', currency: currency || (catalog.market === 'SA' ? 'ZAR' : 'USD'), maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  function planPrice(plan) {
    const pricing = plan.pricing || {};
    if (pricing.custom) return '<strong>Contact us</strong><span>Custom commercial terms</span>';
    if (interval === 'ANNUAL') return `<strong>${escapeHtml(money(pricing.annualTotal, pricing.currency))} billed annually</strong><span>Equivalent to ${escapeHtml(money(pricing.annualEquivalentMonthly, pricing.currency))}/month</span><em>Save ${escapeHtml(money(pricing.annualSavings, pricing.currency))}/year</em>`;
    return `<strong>${escapeHtml(money(pricing.monthlyPrice, pricing.currency))}/month</strong><span>Billed monthly</span>`;
  }

  function featureLabels(plan) {
    const limits = plan.limits || {};
    const features = plan.features || {};
    const values = [];
    if (limits.maxWorkers != null) values.push(`Up to ${limits.maxWorkers} field workers`); else values.push('Unlimited field workers');
    if (limits.maxUsers != null) values.push(`Up to ${limits.maxUsers} office users`); else values.push('Unlimited office users');
    if (features.advancedReports) values.push('Advanced reporting');
    if (features.customBranding) values.push('Custom branding');
    if (features.multiLocation) values.push('Multi-branch controls');
    if (features.apiAccess) values.push('API and integration access');
    return values.slice(0, 5);
  }

  function render() {
    const currentPlanId = summary && summary.plan && summary.plan.id;
    root.querySelectorAll('[data-billing-interval]').forEach((button) => button.classList.toggle('active', button.dataset.billingInterval === interval));
    const cards = root.querySelector('[data-plan-cards]');
    cards.innerHTML = catalog.plans.map((plan, index) => {
      const current = plan.id === currentPlanId;
      const recommended = plan.id === 'growth';
      const cta = current ? 'Current plan' : plan.pricing.custom ? 'Contact us' : onboarding ? 'Choose plan' : 'Change plan';
      return `<article class="pricing-card${recommended ? ' recommended' : ''}${current ? ' current' : ''}">${recommended ? '<span class="pricing-ribbon">Most popular</span>' : ''}<div class="pricing-card-head"><div><h2>${escapeHtml(plan.name)}</h2><p>${escapeHtml(plan.description || '')}</p></div>${current ? '<span class="badge green">Current plan</span>' : ''}</div><div class="pricing-price">${planPrice(plan)}</div><ul>${featureLabels(plan).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul><button class="${recommended ? 'primary-button' : 'secondary-button'}" type="button" data-select-plan="${escapeHtml(plan.id)}"${current ? ' disabled' : ''}>${escapeHtml(cta)}</button></article>`;
    }).join('');
    cards.querySelectorAll('[data-select-plan]').forEach((button) => button.addEventListener('click', () => openConfirm(catalog.plans.find((plan) => plan.id === button.dataset.selectPlan))));
  }

  function openConfirm(plan) {
    const custom = Boolean(plan.pricing.custom);
    const amount = custom ? 'Custom pricing' : interval === 'ANNUAL' ? `${money(plan.pricing.annualTotal, plan.pricing.currency)}/year` : `${money(plan.pricing.monthlyPrice, plan.pricing.currency)}/month`;
    const modal = document.createElement('div');
    modal.className = 'fc-modal';
    modal.innerHTML = `<div class="fc-dialog billing-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="billingConfirmTitle"><div class="panel-head"><div><span class="eyebrow">${custom ? 'Enterprise request' : 'Mock plan confirmation'}</span><h2 id="billingConfirmTitle">${custom ? 'Talk to us about Enterprise' : `Confirm ${escapeHtml(plan.name)}`}</h2></div><button class="icon-button" type="button" data-close-modal aria-label="Close">×</button></div><p>${custom ? 'Enterprise requires custom setup and commercial terms. For this QA flow, continuing records your request without contacting an external service.' : `You are selecting the ${escapeHtml(plan.name)} plan. No card or external payment provider will be used.`}</p><dl class="billing-confirm-summary"><div><dt>Billing</dt><dd>${custom ? 'Custom' : interval === 'ANNUAL' ? 'Annual' : 'Monthly'}</dd></div><div><dt>Amount</dt><dd>${escapeHtml(amount)}</dd></div></dl><p class="fc-form-error" data-confirm-error hidden></p><div class="fc-form-actions"><button class="secondary-button" type="button" data-close-modal>Cancel</button><button class="primary-button" type="button" data-confirm-plan>${custom ? 'Continue' : 'Confirm plan'}</button></div></div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', close));
    modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
    modal.querySelector('[data-confirm-plan]').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await api('/billing/mock-select', { method: 'POST', body: JSON.stringify({ planId: plan.id, billingInterval: interval }) });
        window.location.href = onboarding ? 'index.html' : 'subscription.html';
      } catch (error) {
        const message = modal.querySelector('[data-confirm-error]');
        message.textContent = error.message;
        message.hidden = false;
        if (window.FieldCoreUI) window.FieldCoreUI.notify(error.message, { type: 'error' });
        button.disabled = false;
      }
    });
    modal.querySelector('[data-confirm-plan]').focus();
  }

  async function load() {
    try {
      const user = await api('/auth/session');
      if (!user) return window.location.replace('login.html');
      if (user.systemRole !== 'OWNER') return window.location.replace('index.html');
      [catalog, summary] = await Promise.all([api('/billing/catalog'), onboarding ? Promise.resolve(null) : api('/billing/subscription')]);
      root.querySelector('[data-annual-saving]').textContent = `Save ${catalog.annualDiscountPercent}%`;
      root.querySelectorAll('[data-billing-interval]').forEach((button) => button.addEventListener('click', () => { interval = button.dataset.billingInterval; render(); }));
      if (summary) {
        interval = summary.subscription && summary.subscription.billingInterval || 'MONTHLY';
        const current = root.querySelector('[data-current-subscription]');
        if (current) current.innerHTML = `<div><span>Current plan</span><strong>${escapeHtml(summary.plan && summary.plan.name || 'Not selected')}</strong></div><div><span>Billing</span><strong>${escapeHtml(interval === 'ANNUAL' ? 'Annual' : 'Monthly')}</strong></div><div><span>Status</span><strong>${escapeHtml(summary.subscription && summary.subscription.status || 'Unknown')}</strong></div>`;
      }
      render();
    } catch (error) {
      root.innerHTML = `<div class="empty-state"><div><strong>Plans unavailable</strong><span>${escapeHtml(error.message)}</span></div></div>`;
    }
  }
  load();
})();
