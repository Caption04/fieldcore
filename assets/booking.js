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
  const MAX_PHOTOS = 5;
  const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
  const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  let photoPreviewUrls = [];
  let photoPreviewRenderToken = 0;
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
  function readPhotoAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not preview ' + file.name + '.'));
      reader.readAsDataURL(file);
    });
  }
  async function updatePhotoPreview(){
    if (!photoInput) return;
    const renderToken = ++photoPreviewRenderToken;
    const files = Array.from(photoInput.files || []);
    const error = validatePhotoFiles(files);
    if (error) {
      photoInput.value = '';
      clearPhotoPreviewUrls();
      if (photoName) photoName.textContent = 'No files selected';
      if (photoPreview) {
        photoPreview.classList.remove('has-proof-previews', 'has-booking-photo-previews');
        photoPreview.innerHTML = '<strong>No photos selected</strong>';
      }
      setMessage(error, false);
      return;
    }
    if (message) message.hidden = true;
    if (photoName) photoName.textContent = files.length ? files.length + ' photo' + (files.length === 1 ? '' : 's') + ' selected' : 'No files selected';
    if (!photoPreview) return;
    clearPhotoPreviewUrls();
    if (!files.length) {
      photoPreview.classList.remove('has-proof-previews', 'has-booking-photo-previews');
      photoPreview.innerHTML = '<strong>No photos selected</strong>';
      return;
    }
    photoPreview.classList.add('has-proof-previews', 'has-booking-photo-previews');
    photoPreview.innerHTML = '<strong>Loading previews...</strong>';
    try {
      const previews = await Promise.all(files.map((file) => readPhotoAsDataUrl(file)));
      if (renderToken !== photoPreviewRenderToken) return;
      photoPreview.innerHTML = previews.map((url, index) => {
        const file = files[index];
        return '<div class="proof-preview-item booking-photo-preview-item"><img src="' + escapeHtml(url) + '" alt="' + escapeHtml(file.name) + '"><span>' + escapeHtml(file.name) + '</span><button class="booking-photo-remove" type="button" data-remove-photo-index="' + index + '">Remove</button></div>';
      }).join('');
    } catch (error) {
      if (renderToken !== photoPreviewRenderToken) return;
      photoPreview.classList.remove('has-proof-previews', 'has-booking-photo-previews');
      photoPreview.innerHTML = '<strong>No photos selected</strong>';
      setMessage(error.message, false);
    }
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
    trackingResult.innerHTML = '<div class="tracking-result-grid"><div class="tracking-detail"><span>Status</span><strong>' + escapeHtml(data.status) + '</strong></div><div class="tracking-detail"><span>Service</span><strong>' + escapeHtml(data.service && data.service.name || '-') + '</strong></div><div class="tracking-detail"><span>Submitted</span><strong>' + escapeHtml(formatDate(data.submittedAt)) + '</strong></div><div class="tracking-detail"><span>Preferred</span><strong>' + escapeHtml(preferred || '-') + '</strong></div></div><p class="tracking-next-step">' + escapeHtml(data.nextStep || '') + '</p>';
    trackingResult.hidden = false;
  }
  function clearPhotoPreviewUrls(){
    photoPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    photoPreviewUrls = [];
  }
  function setPhotoFiles(files){
    if (!photoInput) return;
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    photoInput.files = transfer.files;
  }
  function validatePhotoFiles(files){
    if (files.length > MAX_PHOTOS) return 'Upload up to ' + MAX_PHOTOS + ' photos.';
    const invalidType = files.find((file) => !PHOTO_TYPES.includes(file.type));
    if (invalidType) return 'Only PNG, JPG, and WEBP photos are allowed.';
    const oversized = files.find((file) => file.size > MAX_PHOTO_SIZE);
    if (oversized) return oversized.name + ' is larger than 5MB.';
    return '';
  }
  if (form) form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (message) { message.hidden = true; message.classList.remove('green'); }
    const photoError = validatePhotoFiles(Array.from(photoInput && photoInput.files || []));
    if (photoError) {
      setMessage(photoError, false);
      return;
    }
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
  if (photoPreview) photoPreview.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-photo-index]');
    if (!button) return;
    const index = Number(button.dataset.removePhotoIndex);
    const files = Array.from(photoInput && photoInput.files || []);
    files.splice(index, 1);
    setPhotoFiles(files);
    updatePhotoPreview();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadPublicBooking);
  else loadPublicBooking();
})();
