# FieldScan — PWA de Relevamiento de Campo

Aplicación Web Progresiva para captura OCR y geolocalización.  
Desarrollada para el TP final de **Proyecto de Desarrollo de Software para Plataformas Móviles** — EEST N°1 "Eduardo Ader".

---

## Funcionalidades

- **OCR** con Tesseract.js (español + inglés): captura texto desde foto o galería
- **Geolocalización** precisa con la Geolocation API
- **Mapa interactivo** con Leaflet.js + OpenStreetMap
- **Registros persistentes** en localStorage
- **Exportar a JSON** todos los relevamientos guardados
- **PWA instalable** en Android/iOS/desktop (manifest + service worker)
- **Modo offline** funcional para registros ya guardados

---

## Estructura del proyecto

```
/
├── index.html          # App shell principal
├── manifest.json       # Configuración PWA
├── sw.js               # Service Worker (caché offline)
├── css/
│   └── style.css       # Estilos completos
├── js/
│   └── app.js          # Lógica OCR, geo, registros
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

---

## Deploy en GitHub Pages (gratis, HTTPS incluido)

### Primera vez

```bash
# 1. Crear repositorio en github.com (público, sin README)
# 2. Desde la carpeta del proyecto:

git init
git add .
git commit -m "feat: FieldScan PWA inicial"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

### Activar GitHub Pages

1. Ir a **Settings** → **Pages** en tu repositorio
2. En *Source* seleccionar **Deploy from a branch**
3. Branch: **main**, carpeta: **/ (root)**
4. Guardar → en ~1 minuto el sitio está en:
   `https://TU_USUARIO.github.io/TU_REPO/`

### Actualizaciones futuras

```bash
git add .
git commit -m "fix: descripción del cambio"
git push
```

---

## Tecnologías

| Tecnología | Uso |
|---|---|
| HTML5 / CSS3 / JS | Base de la aplicación |
| Tesseract.js v5 | Motor OCR en el navegador |
| Geolocation API | Coordenadas GPS |
| Leaflet.js 1.9 | Mapa interactivo |
| OpenStreetMap | Tiles del mapa (gratuito) |
| Service Worker | Caché offline |
| Web App Manifest | Instalación PWA |

---

## Notas importantes

- La **cámara y geolocalización requieren HTTPS** — GitHub Pages lo provee automáticamente.
- Tesseract.js descarga los modelos de idioma la primera vez (~5MB), luego los cachea.
- Los registros se guardan en `localStorage` del navegador (persisten entre sesiones).
