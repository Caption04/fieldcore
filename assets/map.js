(function () {
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
  const DEFAULT_CENTER = [-17.8292, 31.0522];
  const REFRESH_MS = 30000;
  const ONLINE_MS = 5 * 60 * 1000;
  const RECENT_MS = 30 * 60 * 1000;

  let map;
  let markers = new Map();
  let refreshTimer;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[char]));
  }

  function setStatus(message, ok) {
    document.querySelectorAll('[data-api-status]').forEach((node) => {
      node.textContent = message;
      node.classList.toggle('red', ok === false);
    });
  }

  function node(selector) {
    return document.querySelector(selector);
  }

  async function api(path) {
    const response = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error && payload.error.message || `HTTP ${response.status}`);
    return payload.data;
  }

  function workerName(item) {
    return item.worker && item.worker.user && item.worker.user.name
      || item.worker && item.worker.user && item.worker.user.email
      || item.workerName
      || 'Worker';
  }

  function minutesAgo(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  }

  function statusFor(item) {
    if (item.mapStatus) return item.mapStatus;
    const age = minutesAgo(item.recordedAt);
    if (age == null) return 'OFFLINE';
    if (age <= 5) return 'ONLINE';
    if (age <= 30) return 'RECENTLY_ACTIVE';
    return 'OFFLINE';
  }

  function statusLabel(status) {
    if (status === 'ONLINE') return 'Online';
    if (status === 'RECENTLY_ACTIVE') return 'Recently active';
    return 'Offline';
  }

  function statusClass(status) {
    if (status === 'ONLINE') return 'online';
    if (status === 'RECENTLY_ACTIVE') return 'recent';
    return 'offline';
  }

  function formattedTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function relativeTime(value) {
    const age = minutesAgo(value);
    if (age == null) return 'Unknown';
    if (age === 0) return 'Just now';
    if (age === 1) return '1 min ago';
    if (age < 60) return `${age} mins ago`;
    const hours = Math.floor(age / 60);
    if (hours === 1) return '1 hour ago';
    return `${hours} hours ago`;
  }

  function validLocation(item) {
    const lat = Number(item.latitude);
    const lng = Number(item.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  function ensureMap() {
    if (map || !window.L) return map;
    map = L.map('worker-map', {
      zoomControl: true,
      attributionControl: true
    }).setView(DEFAULT_CENTER, 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    return map;
  }

  function markerIcon(status) {
    return L.divIcon({
      className: `worker-marker worker-marker-${statusClass(status)}`,
      html: '<span></span>',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -14]
    });
  }

  function popupHtml(item) {
    const status = statusFor(item);
    const activeJob = item.activeJob;
    return `
      <div class="worker-popup">
        <strong>${escapeHtml(workerName(item))}</strong>
        <span>${escapeHtml(statusLabel(status))} · ${escapeHtml(relativeTime(item.recordedAt))}</span>
        <span>Last update: ${escapeHtml(formattedTime(item.recordedAt))}</span>
        ${activeJob ? `<span>Job: ${escapeHtml(activeJob.title || activeJob.id)} (${escapeHtml(activeJob.status || 'active')})</span>` : ''}
      </div>
    `;
  }

  function renderMarkers(locations) {
    const current = new Set();
    const bounds = [];
    const liveMap = ensureMap();
    if (!liveMap) throw new Error('Leaflet map library did not load. Check internet/CSP access to unpkg.com.');

    locations.forEach((item) => {
      if (!validLocation(item)) return;
      const id = item.workerId || item.id;
      current.add(id);
      const latLng = [Number(item.latitude), Number(item.longitude)];
      const status = statusFor(item);
      bounds.push(latLng);

      if (!markers.has(id)) {
        markers.set(id, L.marker(latLng, { icon: markerIcon(status) }).addTo(liveMap));
      } else {
        markers.get(id).setLatLng(latLng).setIcon(markerIcon(status));
      }
      markers.get(id).bindPopup(popupHtml(item));
    });

    markers.forEach((marker, id) => {
      if (!current.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    });

    if (bounds.length === 1) liveMap.setView(bounds[0], 14);
    if (bounds.length > 1) liveMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }

  function renderWorkerList(locations) {
    const summary = node('[data-worker-map-summary]');
    const onlineCount = node('[data-worker-online-count]');
    const updated = node('[data-map-updated]');
    const valid = locations.filter(validLocation);
    const online = valid.filter((item) => statusFor(item) === 'ONLINE').length;

    if (onlineCount) onlineCount.textContent = `${online} Online`;
    if (updated) updated.textContent = `Updated ${new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;

    if (!summary) return;
    if (!valid.length) {
      summary.innerHTML = `
        <div class="empty-state compact-empty-state">
          <div>
            <strong>No workers found</strong>
            <span>Locations will appear after a technician sends GPS from the mobile app.</span>
          </div>
        </div>`;
      return;
    }

    summary.innerHTML = valid.map((item) => {
      const status = statusFor(item);
      const activeJob = item.activeJob;
      return `
        <button class="worker-location-card" type="button" data-focus-worker="${escapeHtml(item.workerId || item.id)}">
          <span class="worker-location-dot ${statusClass(status)}"></span>
          <span class="worker-location-main">
            <strong>${escapeHtml(workerName(item))}</strong>
            <small>${escapeHtml(statusLabel(status))} · ${escapeHtml(relativeTime(item.recordedAt))}</small>
            ${activeJob ? `<small>${escapeHtml(activeJob.title || activeJob.id)}</small>` : ''}
          </span>
          <span class="worker-location-time">${escapeHtml(formattedTime(item.recordedAt))}</span>
        </button>
      `;
    }).join('');
  }

  function setEmptyState(show) {
    const empty = node('[data-map-empty]');
    if (empty) empty.hidden = !show;
  }

  function setError(message) {
    const error = node('[data-map-error]');
    const text = node('[data-map-error-text]');
    if (text) text.textContent = message;
    if (error) error.hidden = false;
    setStatus(message, false);
  }

  function clearError() {
    const error = node('[data-map-error]');
    if (error) error.hidden = true;
  }

  async function refreshLocations() {
    try {
      clearError();
      setStatus('Loading worker locations...', true);
      const data = await api('/worker-location/latest?limit=500');
      const locations = Array.isArray(data) ? data : [];
      const valid = locations.filter(validLocation);
      setEmptyState(valid.length === 0);
      renderMarkers(valid);
      renderWorkerList(locations);
      setStatus(valid.length ? `Tracking ${valid.length} worker${valid.length === 1 ? '' : 's'}` : 'No live worker locations yet', true);
    } catch (error) {
      setEmptyState(true);
      renderWorkerList([]);
      setError(error.message || 'Unable to load worker locations.');
    }
  }

  function setupFocusHandlers() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-focus-worker]');
      if (!button || !map) return;
      const marker = markers.get(button.dataset.focusWorker);
      if (!marker) return;
      map.setView(marker.getLatLng(), 15);
      marker.openPopup();
    });
  }

  function init() {
    if (!document.getElementById('worker-map')) return;
    if (!window.L) {
      setError('Leaflet did not load. Check your internet connection and CSP settings.');
      return;
    }
    ensureMap();
    setupFocusHandlers();
    const refreshButton = node('[data-map-refresh]');
    if (refreshButton) refreshButton.addEventListener('click', refreshLocations);
    refreshLocations();
    refreshTimer = window.setInterval(refreshLocations, REFRESH_MS);
    window.addEventListener('beforeunload', () => window.clearInterval(refreshTimer));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
