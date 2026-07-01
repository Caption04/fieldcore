(function(){
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
  const form = document.querySelector('[data-booking-form]');
  const message = document.querySelector('[data-booking-message]');
  const serviceSelect = document.querySelector('[data-service-select]');
  async function publicApi(path, options){
    const response = await fetch(API_BASE + path, { headers: { 'Content-Type': 'application/json' }, ...(options || {}) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error && payload.error.message || 'HTTP ' + response.status);
    return payload.data;
  }
  function setMessage(text, ok){
    if (!message) return;
    message.textContent = text;
    message.classList.toggle('green', ok === true);
    message.hidden = false;
  }
  function addOption(value, label){
    if (!serviceSelect) return;
    const option = document.createElement('option');
    option.value = value || '';
    option.textContent = label || 'Service';
    serviceSelect.appendChild(option);
  }
  async function loadPublicBooking(){
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
      services.forEach((service) => addOption(service.id, service.name));
    } catch (error) {
      if (serviceSelect) serviceSelect.options[0].textContent = 'Describe service below';
    }
  }
  if (form) form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (message) { message.hidden = true; message.classList.remove('green'); }
    const body = Object.fromEntries(new FormData(form).entries());
    Object.keys(body).forEach((key) => { if (body[key] === '') delete body[key]; });
    try {
      await publicApi('/public/booking-requests', { method: 'POST', body: JSON.stringify(body) });
      form.reset();
      setMessage('Request received. The team will contact you shortly.', true);
    } catch (error) {
      setMessage(error.message, false);
    }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadPublicBooking);
  else loadPublicBooking();
})();
