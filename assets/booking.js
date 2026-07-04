(function(){
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
  const form = document.querySelector('[data-booking-form]');
  const message = document.querySelector('[data-booking-message]');
  const serviceSelect = document.querySelector('[data-service-select]');
  const confirmation = document.querySelector('[data-booking-confirmation]');
  const trackingForm = document.querySelector('[data-tracking-form]');
  const trackingMessage = document.querySelector('[data-tracking-message]');
  const trackingResult = document.querySelector('[data-tracking-result]');
  const photoInput = document.querySelector('#photos');
  const photoName = document.querySelector('[data-booking-photo-name]');
  const photoPreview = document.querySelector('[data-booking-photo-preview]');
  let clientSession = null;
  async function publicApi(path, options){
    const opts = options || {};
    const headers = opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' };
    const response = await fetch(API_BASE + path, { headers, ...opts });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error && payload.error.message || 'HTTP ' + response.status);
    return payload.data;
  }
  function escapeHtml(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function formatDate(value){
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
  }
  async function loadClientSession(){
    try {
      clientSession = await publicApi('/client/auth/session', { credentials: 'include' });
    } catch (error) {
      clientSession = null;
    }
  }
  function prefillClient(){
    if (!clientSession || !form) return;
    if (form.customerName && !form.customerName.value) form.customerName.value = clientSession.name || '';
    if (form.customerEmail && !form.customerEmail.value) form.customerEmail.value = clientSession.email || '';
    if (form.customerPhone && !form.customerPhone.value) form.customerPhone.value = clientSession.phone || '';
  }
  function setMessage(text, ok){
    if (!message) return;
    message.textContent = text;
    message.classList.toggle('green', ok === true);
    message.hidden = false;
  }
  function setTrackingMessage(text, ok){
    if (!trackingMessage) return;
    trackingMessage.textContent = text;
    trackingMessage.classList.toggle('green', ok === true);
    trackingMessage.hidden = false;
  }
  function addOption(value, label){
    if (!serviceSelect) return;
    const option = document.createElement('option');
    option.value = value || '';
    option.textContent = label || 'Service';
    serviceSelect.appendChild(option);
  }
  async function loadPublicBooking(){
    await loadClientSession();
    prefillClient();
    try {
      const company = await publicApi('/public/company');
      document.querySelectorAll('[data-public-brand]').forEach((node) => { node.textContent = company.brandName || 'FieldCore'; });
      document.documentElement.style.setProperty('--blue', company.primaryColor || '#2363ff');
      document.documentElement.style.setProperty('--blue2', company.secondaryColor || '#263ff1');
      document.documentElement.style.setProperty('--green', company.accentColor || '#12a96d');
      const logo = document.querySelector('[data-public-logo]');
      if (logo && company.logoUrl) {
        const image = document.createElement('img');
        image.src = company.logoUrl;
        image.alt = 'Company logo';
        logo.replaceChildren(image);
      }
    } catch (error) {}
    if (serviceSelect) serviceSelect.replaceChildren();
    addOption('', 'Select service');
    try {
      const services = await publicApi('/public/services');
      services.forEach((service) => addOption(service.id, service.description ? service.name + ' - ' + service.description : service.name));
    } catch (error) {
      if (serviceSelect) serviceSelect.options[0].textContent = 'Describe service below';
      if (serviceSelect) serviceSelect.required = false;
    }
  }
  function updatePhotoPreview(){
    if (!photoInput) return;
    const files = Array.from(photoInput.files || []);
    if (photoName) photoName.textContent = files.length ? files.map((file) => file.name).join(', ') : 'No files selected';
    if (!photoPreview) return;
    if (!files.length) {
      photoPreview.innerHTML = '<strong>No photos selected</strong>';
      return;
    }
    photoPreview.innerHTML = files.slice(0, 5).map((file) => '<span>' + escapeHtml(file.name) + '</span>').join('');
  }
  function showConfirmation(data){
    if (!confirmation) return;
    const service = data.service && data.service.name || data.serviceName || 'Service request';
    confirmation.innerHTML = '<strong>Request submitted</strong><span>Reference: ' + escapeHtml(data.publicReference || data.id) + '</span><span>' + escapeHtml(service) + '</span><small>Use this reference with your email or phone to track the request below.</small>';
    confirmation.hidden = false;
    if (trackingForm && trackingForm.reference) trackingForm.reference.value = data.publicReference || '';
    if (trackingForm && trackingForm.contact) trackingForm.contact.value = data.customerEmail || data.customerPhone || '';
  }
  function renderTracking(data){
    if (!trackingResult) return;
    const preferred = [formatDate(data.preferredDate), data.preferredTimeWindow && String(data.preferredTimeWindow).replace(/_/g, ' ')].filter(Boolean).join(' / ');
    trackingResult.innerHTML = '<div><span>Status</span><strong>' + escapeHtml(data.status) + '</strong></div><div><span>Service</span><strong>' + escapeHtml(data.service && data.service.name || '-') + '</strong></div><div><span>Submitted</span><strong>' + escapeHtml(formatDate(data.submittedAt)) + '</strong></div><div><span>Preferred</span><strong>' + escapeHtml(preferred || '-') + '</strong></div><p>' + escapeHtml(data.nextStep || '') + '</p>';
    trackingResult.hidden = false;
  }
  if (form) form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (message) { message.hidden = true; message.classList.remove('green'); }
    const body = new FormData(form);
    Array.from(body.entries()).forEach(([key, value]) => {
      if (value === '') body.delete(key);
    });
    try {
      const path = clientSession ? '/client/booking-requests' : '/public/booking-requests';
      const data = await publicApi(path, { method: 'POST', credentials: 'include', body });
      form.reset();
      updatePhotoPreview();
      if (clientSession) {
        window.location.href = 'client-portal.html';
        return;
      }
      showConfirmation(data);
      setMessage('Request received. Save the reference shown above.', true);
    } catch (error) {
      setMessage(error.message, false);
    }
  });
  if (trackingForm) trackingForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (trackingMessage) { trackingMessage.hidden = true; trackingMessage.classList.remove('green'); }
    if (trackingResult) trackingResult.hidden = true;
    const body = Object.fromEntries(new FormData(trackingForm).entries());
    try {
      const data = await publicApi('/public/booking-requests/track', { method: 'POST', body: JSON.stringify(body) });
      renderTracking(data);
      setTrackingMessage('Request found.', true);
    } catch (error) {
      setTrackingMessage(error.message, false);
    }
  });
  if (photoInput) photoInput.addEventListener('change', updatePhotoPreview);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadPublicBooking);
  else loadPublicBooking();
})();



