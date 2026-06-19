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
  cameraStream: null,
};

// ─── ELEMENTOS DOM ───────────────────────────
const $ = id => document.getElementById(id);

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

// ─── CÁMARA MEDIDEVICES (Opción A — sin crash) ───
const btnCamera       = $('btn-camera');
const btnCameraInput  = $('input-camera');
const cameraContainer = $('camera-container');
const cameraVideo     = $('camera-video');
const btnSnap         = $('btn-snap');
const btnCancelCamera = $('btn-cancel-camera');
const snapCanvas      = $('snap-canvas');

// Opción A: MediaDevices — abre cámara dentro de la app
btnCamera.addEventListener('click', async () => {
  // Intentar MediaDevices primero
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      state.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      cameraVideo.srcObject = state.cameraStream;
      cameraContainer.classList.remove('hidden');
      captureZone.classList.add('hidden');
      return;
    } catch (err) {
      console.warn('[Camera] MediaDevices falló, usando input nativo:', err);
    }
  }
  // Fallback Opción B: input file nativo
  btnCameraInput.click();
});

// Capturar foto del preview de video
btnSnap.addEventListener('click', () => {
  const w = cameraVideo.videoWidth;
  const h = cameraVideo.videoHeight;
  snapCanvas.width = w;
  snapCanvas.height = h;
  snapCanvas.getContext('2d').drawImage(cameraVideo, 0, 0, w, h);

  stopCamera();
  cameraContainer.classList.add('hidden');
  captureZone.classList.remove('hidden');

  snapCanvas.toBlob(blob => {
    const file = new File([blob], 'captura.jpg', { type: 'image/jpeg' });
    handleImageFile(file);
  }, 'image/jpeg', 0.85);
});

btnCancelCamera.addEventListener('click', () => {
  stopCamera();
  cameraContainer.classList.add('hidden');
  captureZone.classList.remove('hidden');
});

function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
  cameraVideo.srcObject = null;
}

// Opción B: input file nativo (fallback o galería)
btnCameraInput.addEventListener('change', e => handleImageFile(e.target.files[0]));
inputGallery.addEventListener('change', e => handleImageFile(e.target.files[0]));

// ─── OCR ─────────────────────────────────────
function handleImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;

  const MAX_MB = 15;
  if (file.size > MAX_MB * 1024 * 1024) {
    alert(`La imagen es muy grande (${(file.size/1024/1024).toFixed(1)}MB). Usá una de menos de ${MAX_MB}MB.`);
    return;
  }

  const url = URL.createObjectURL(file);
  previewImg.src = url;
  previewImg.classList.remove('hidden');
  captureIdle.classList.add('hidden');
  captureZone.classList.add('has-image');
  ocrResult.classList.add('hidden');
  ocrStatus.classList.remove('hidden');
  progressBar.style.width = '0%';
  ocrStatusText.textContent = 'Preparando imagen…';

  runOCR(url);
}

async function runOCR(imageUrl) {
  try {
    const resizedUrl = await resizeImage(imageUrl);

    ocrStatusText.textContent = 'Iniciando motor OCR…';
    progressBar.style.width = '15%';

    const esMobil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const idioma = esMobil ? 'spa' : 'spa+eng';

    const worker = await Tesseract.createWorker(idioma, 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          progressBar.style.width = 15 + Math.round(pct * 0.85) + '%';
          ocrStatusText.textContent = `Reconociendo texto… ${pct}%`;
        } else if (m.status === 'loading language traineddata') {
          ocrStatusText.textContent = 'Cargando modelo de idioma…';
          progressBar.style.width = '10%';
        } else if (m.status === 'initializing api') {
          ocrStatusText.textContent = 'Inicializando motor OCR…';
          progressBar.style.width = '5%';
        }
      }
    });

    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzáéíóúÁÉÍÓÚüÜñÑ0123456789.,;:!?()-/\'"% \n',
    });

    const { data: { text } } = await worker.recognize(resizedUrl);
    await worker.terminate();

    progressBar.style.width = '100%';
    ocrStatusText.textContent = '¡Texto reconocido con éxito!';

    state.ocrText = cleanOCRText(text);
    ocrTextarea.value = state.ocrText;

    setTimeout(() => {
      ocrStatus.classList.add('hidden');
      ocrResult.classList.remove('hidden');
      updateSaveBtn();
    }, 600);

  } catch (err) {
    console.error('[OCR] error:', err);
    ocrStatusText.textContent = 'Error al procesar. Intentá con otra foto.';
    progressBar.style.width = '100%';
    progressBar.style.background = 'var(--red)';
    setTimeout(() => {
      ocrStatus.classList.add('hidden');
      progressBar.style.background = '';
    }, 3000);
  }
}

function resizeImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const esMobil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isPWA = window.matchMedia('(display-mode: standalone)').matches;
      const maxW = (esMobil || isPWA) ? 900 : 1600;
      const maxH = (esMobil || isPWA) ? 900 : 1600;

      let w = img.width;
      let h = img.height;

      if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      const resultado = canvas.toDataURL('image/jpeg', 0.85);
      canvas.width = 1;
      canvas.height = 1;
      resolve(resultado);
    };
    img.src = url;
  });
}

function cleanOCRText(text) {
  return text
    .replace(/^[\s]*[•e\-\*]\s+/gm, '- ')
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[©®°•·✓→←↑↓★☆♦♣♠♥@#$%^&*_=<>~`|\\{}[\]]/g, '')
    .replace(/^\d{1,2}[.:]\d{2}\s*$/gm, '')
    .replace(/\s+\d{1,2}[.:]\d{2}\s*$/gm, '')
    .replace(/^.{1,2}$/gm, '')
    .replace(/^[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ0-9"'¿¡(\-]{1,2}\s/gm, '')
    .replace(/\s*[,\.]\s*$/gm, '')
    .replace(/([.,;]){2,}/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
  if (btnCameraInput) btnCameraInput.value = '';
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
    html: `<div style="width:18px;height:18px;background:var(--accent);border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.5)"></div>`,
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
  if (!records.length) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const marginL = 20, marginR = 20, pageW = 210;
  const contentW = pageW - marginL - marginR;
  let y = 20;
  const checkPage = (needed = 10) => {
    if (y + needed > 280) { doc.addPage(); y = 20; }
  };
  const writeText = (text, fontSize, isBold, color = [30, 30, 30]) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, contentW);
    checkPage(lines.length * (fontSize * 0.4));
    doc.text(lines, marginL, y);
    y += lines.length * (fontSize * 0.4) + 2;
  };
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(56, 189, 248);
  doc.text('FieldScan', marginL, 13);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('Reporte de Relevamientos de Campo', marginL, 21);
  const fechaExport = new Date().toLocaleString('es-AR');
  doc.setFontSize(9);
  doc.text(`Exportado: ${fechaExport}`, pageW - marginR - 60, 21);
  y = 40;
  writeText(`Total de relevamientos: ${records.length}`, 11, true, [15, 23, 42]);
  y += 4;
  doc.setDrawColor(200, 200, 200);
  doc.line(marginL, y, pageW - marginR, y);
  y += 8;
  records.forEach((r, i) => {
    checkPage(40);
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(marginL, y - 4, contentW, 10, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`#${String(records.length - i).padStart(3, '0')}`, marginL + 3, y + 3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(r.date, marginL + 18, y + 3);
    y += 12;
    writeText('Texto reconocido:', 9, true, [71, 85, 105]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    const textLines = doc.splitTextToSize(r.text || '(sin texto)', contentW - 4);
    checkPage(textLines.length * 4 + 6);
    const textBoxH = textLines.length * 4 + 6;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(marginL, y - 2, contentW, textBoxH, 2, 2, 'FD');
    doc.text(textLines, marginL + 3, y + 3);
    y += textBoxH + 4;
    writeText('Ubicación:', 9, true, [71, 85, 105]);
    const lat = r.coords.lat.toFixed(6);
    const lon = r.coords.lon.toFixed(6);
    const acc = Math.round(r.coords.acc);
    writeText(`Latitud: ${lat}   Longitud: ${lon}   Precisión: ±${acc}m`, 9, false, [30, 30, 30]);
    const mapsUrl = `https://maps.google.com/?q=${lat},${lon}`;
    doc.setFontSize(9);
    doc.setTextColor(14, 165, 233);
    doc.textWithLink('Ver en Google Maps →', marginL, y, { url: mapsUrl });
    y += 5;
    y += 4;
    doc.setDrawColor(226, 232, 240);
    doc.line(marginL, y, pageW - marginR, y);
    y += 8;
  });
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`FieldScan — Página ${p} de ${totalPages}`, marginL, 292);
    doc.text('campa002.github.io/TP_PWA', pageW - marginR - 45, 292);
  }
  doc.save(`fieldscan_reporte_${Date.now()}.pdf`);
});

// ─── UTILS ───────────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const style = document.createElement('style');
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(style);

// ─── INIT ─────────────────────────────────────
renderRecords();