/* =============================================
   FieldScan PWA — app.js
   Módulos: OCR, Geolocalización, Registros, SW
   ============================================= */

'use strict';

// ─── ESTADO GLOBAL ───────────────────────────
const state = {
  ocrText: '',
  coords: null,
  map: null,
  marker: null,
  deferredPrompt: null,
};

// ─── ELEMENTOS DOM ───────────────────────────
const $ = id => document.getElementById(id);

const inputCamera   = $('input-camera');
const inputGallery  = $('input-gallery');
const captureZone   = $('capture-zone');
const captureIdle   = $('capture-idle');
const previewImg    = $('preview-img');
const ocrStatus     = $('ocr-status');
const progressBar   = $('progress-bar');
const ocrStatusText = $('ocr-status-text');
const ocrResult     = $('ocr-result');
const ocrTextarea   = $('ocr-text');
const btnCopy       = $('btn-copy');
const btnClearOcr   = $('btn-clear-ocr');
const copyToast     = $('copy-toast');

const btnLocation   = $('btn-location');
const geoData       = $('geo-data');
const geoError      = $('geo-error');
const coordLat      = $('coord-lat');
const coordLon      = $('coord-lon');
const coordAcc      = $('coord-acc');
const coordTime     = $('coord-time');

const btnSave       = $('btn-save');
const btnExport     = $('btn-export');
const recordsEmpty  = $('records-empty');
const recordsList   = $('records-list');
const btnInstall    = $('btn-install');
const offlineBanner = $('offline-banner');

// ─── SERVICE WORKER ──────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('[SW] registrado:', reg.scope))
      .catch(err => console.warn('[SW] error:', err));
  });
}

// ─── INSTALL PROMPT ──────────────────────────
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  state.deferredPrompt = e;
  btnInstall.classList.remove('hidden');
});

btnInstall.addEventListener('click', async () => {
  if (!state.deferredPrompt) return;
  state.deferredPrompt.prompt();
  const { outcome } = await state.deferredPrompt.userChoice;
  console.log('[PWA] install outcome:', outcome);
  state.deferredPrompt = null;
  btnInstall.classList.add('hidden');
});

window.addEventListener('appinstalled', () => {
  btnInstall.classList.add('hidden');
  state.deferredPrompt = null;
});

// ─── OFFLINE BANNER ──────────────────────────
function updateOnlineStatus() {
  offlineBanner.classList.toggle('hidden', navigator.onLine);
}
window.addEventListener('online',  updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// ─── OCR ─────────────────────────────────────
function handleImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;

  const url = URL.createObjectURL(file);
  previewImg.src = url;
  previewImg.classList.remove('hidden');
  captureIdle.classList.add('hidden');
  captureZone.classList.add('has-image');
  ocrResult.classList.add('hidden');
  ocrStatus.classList.remove('hidden');
  progressBar.style.width = '0%';
  ocrStatusText.textContent = 'Iniciando OCR…';

  runOCR(url);
}

inputCamera.addEventListener('change', e => handleImageFile(e.target.files[0]));
inputGallery.addEventListener('change', e => handleImageFile(e.target.files[0]));

async function runOCR(imageUrl) {
  try {
    const worker = await Tesseract.createWorker('spa+eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          progressBar.style.width = pct + '%';
          ocrStatusText.textContent = `Reconociendo texto… ${pct}%`;
        } else if (m.status === 'loading language traineddata') {
          ocrStatusText.textContent = 'Cargando modelo de idioma…';
          progressBar.style.width = '20%';
        } else if (m.status === 'initializing api') {
          ocrStatusText.textContent = 'Inicializando motor OCR…';
          progressBar.style.width = '5%';
        }
      }
    });

    const { data: { text } } = await worker.recognize(imageUrl);
    await worker.terminate();

    progressBar.style.width = '100%';
    ocrStatusText.textContent = '¡Texto reconocido con éxito!';

    state.ocrText = text.trim();
    ocrTextarea.value = state.ocrText;

    setTimeout(() => {
      ocrStatus.classList.add('hidden');
      ocrResult.classList.remove('hidden');
      updateSaveBtn();
    }, 600);

  } catch (err) {
    console.error('[OCR] error:', err);
    ocrStatusText.textContent = 'Error al procesar la imagen.';
    progressBar.style.width = '100%';
    progressBar.style.background = 'var(--red)';
    setTimeout(() => {
      ocrStatus.classList.add('hidden');
      progressBar.style.background = '';
    }, 2000);
  }
}

// Sincronizar textarea con state
ocrTextarea.addEventListener('input', () => {
  state.ocrText = ocrTextarea.value;
  updateSaveBtn();
});

// Copiar texto
btnCopy.addEventListener('click', () => {
  if (!state.ocrText) return;
  navigator.clipboard.writeText(state.ocrText).then(() => {
    copyToast.classList.remove('hidden');
    setTimeout(() => copyToast.classList.add('hidden'), 1800);
  }).catch(() => {
    // Fallback para móviles sin clipboard API
    ocrTextarea.select();
    document.execCommand('copy');
    copyToast.classList.remove('hidden');
    setTimeout(() => copyToast.classList.add('hidden'), 1800);
  });
});

// Limpiar OCR
btnClearOcr.addEventListener('click', () => {
  state.ocrText = '';
  ocrTextarea.value = '';
  ocrResult.classList.add('hidden');
  previewImg.classList.add('hidden');
  captureIdle.classList.remove('hidden');
  captureZone.classList.remove('has-image');
  previewImg.src = '';
  inputCamera.value = '';
  inputGallery.value = '';
  updateSaveBtn();
});

// ─── GEOLOCALIZACIÓN ─────────────────────────
btnLocation.addEventListener('click', getLocation);

function getLocation() {
  if (!('geolocation' in navigator)) {
    showGeoError('Tu navegador no soporta geolocalización.');
    return;
  }

  btnLocation.disabled = true;
  btnLocation.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite">
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0"/>
    </svg>
    Obteniendo ubicación…`;

  navigator.geolocation.getCurrentPosition(
    onGeoSuccess,
    onGeoError,
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

function onGeoSuccess(pos) {
  const { latitude: lat, longitude: lon, accuracy: acc } = pos.coords;
  const now = new Date(pos.timestamp);

  state.coords = { lat, lon, acc, time: now.toISOString() };

  coordLat.textContent  = lat.toFixed(6) + '°';
  coordLon.textContent  = lon.toFixed(6) + '°';
  coordAcc.textContent  = Math.round(acc) + ' m';
  coordTime.textContent = now.toLocaleTimeString('es-AR');

  geoData.classList.remove('hidden');
  geoError.classList.add('hidden');

  btnLocation.disabled = false;
  btnLocation.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 00-8 8c0 5.25 8 13 8 13s8-7.75 8-13a8 8 0 00-8-8z"/>
    </svg>
    Actualizar ubicación`;

  initMap(lat, lon);
  updateSaveBtn();
}

function onGeoError(err) {
  const msgs = {
    1: 'Permiso de ubicación denegado. Habilitalo en la configuración del navegador.',
    2: 'No se pudo determinar la ubicación. Verificá la señal GPS.',
    3: 'Tiempo de espera agotado. Intentá de nuevo.',
  };
  showGeoError(msgs[err.code] || 'Error desconocido de geolocalización.');
  btnLocation.disabled = false;
  btnLocation.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 00-8 8c0 5.25 8 13 8 13s8-7.75 8-13a8 8 0 00-8-8z"/>
    </svg>
    Reintentar`;
}

function showGeoError(msg) {
  geoError.textContent = msg;
  geoError.classList.remove('hidden');
}

function initMap(lat, lon) {
  if (!state.map) {
    state.map = L.map('map', { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(state.map);
  }

  state.map.setView([lat, lon], 16);

  const icon = L.divIcon({
    html: `<div style="
      width:18px;height:18px;
      background:var(--accent);
      border:3px solid white;
      border-radius:50%;
      box-shadow:0 2px 8px rgba(0,0,0,.5)
    "></div>`,
    className: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

  if (state.marker) {
    state.marker.setLatLng([lat, lon]);
  } else {
    state.marker = L.marker([lat, lon], { icon }).addTo(state.map);
    state.marker.bindPopup(`<b>Tu posición</b><br>${lat.toFixed(5)}, ${lon.toFixed(5)}`).openPopup();
  }
}

// ─── REGISTROS ───────────────────────────────
const STORAGE_KEY = 'fieldscan_records';

function getRecords() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function updateSaveBtn() {
  const ready = state.ocrText.trim() && state.coords;
  btnSave.disabled = !ready;
}

btnSave.addEventListener('click', () => {
  if (!state.ocrText.trim() || !state.coords) return;

  const record = {
    id:     Date.now(),
    date:   new Date().toLocaleString('es-AR'),
    text:   state.ocrText.trim(),
    coords: { ...state.coords },
  };

  const records = getRecords();
  records.unshift(record);
  saveRecords(records);
  renderRecords();

  // Feedback visual
  btnSave.textContent = '✓ Guardado';
  btnSave.disabled = true;
  setTimeout(() => {
    btnSave.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
      Guardar relevamiento`;
    updateSaveBtn();
  }, 1500);
});

function renderRecords() {
  const records = getRecords();

  if (records.length === 0) {
    recordsEmpty.classList.remove('hidden');
    recordsList.classList.add('hidden');
    btnExport.classList.add('hidden');
    return;
  }

  recordsEmpty.classList.add('hidden');
  recordsList.classList.remove('hidden');
  btnExport.classList.remove('hidden');

  recordsList.innerHTML = records.map((r, i) => `
    <div class="record-card" id="record-${r.id}">
      <div class="record-card-header" onclick="toggleRecord(${r.id})">
        <div class="record-meta">
          <span class="record-num">#${String(records.length - i).padStart(3, '0')}</span>
          <span class="record-date">${r.date}</span>
        </div>
        <svg class="record-toggle" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="record-body">
        <div class="record-text">${escapeHtml(r.text)}</div>
        <div class="record-coords">
          📍 ${r.coords.lat.toFixed(6)}, ${r.coords.lon.toFixed(6)}
          · ±${Math.round(r.coords.acc)}m
        </div>
        <div class="record-foot">
          <button class="btn-delete" onclick="deleteRecord(${r.id})">Eliminar</button>
        </div>
      </div>
    </div>
  `).join('');
}

window.toggleRecord = function(id) {
  const card = document.getElementById(`record-${id}`);
  if (card) card.classList.toggle('open');
};

window.deleteRecord = function(id) {
  const records = getRecords().filter(r => r.id !== id);
  saveRecords(records);
  renderRecords();
};

btnExport.addEventListener('click', () => {
  const records = getRecords();
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fieldscan_export_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// ─── UTILS ───────────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// CSS para spin (sin agregar un archivo extra)
const style = document.createElement('style');
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(style);

// ─── INIT ─────────────────────────────────────
renderRecords();
