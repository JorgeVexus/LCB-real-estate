/* LCB — Vista de mapa para /propiedades(-copy).
 * Se apoya en el motor de listado Algolia del sitio (custom code global):
 * intercepta su query para conocer filtros activos, replica esos filtros en
 * una query de mapa y, en modo "zona", agrega insideBoundingBox a la query del
 * listado para que cards y mapa muestren lo mismo. */
(function () {
  'use strict';

  var CFG = window.LCBM_CONFIG || {};
  var APP_ID = 'AT36ZPQLUN';
  var SEARCH_KEY = '52fd152e763367fee66a55bc3c557051';
  var INDEX = 'lcb_propiedades';
  var QUERY_PATH = '/indexes/' + INDEX + '/query';
  var BOUNDARY_URL = CFG.boundaryEndpoint || '';
  var MAP_STYLE = CFG.mapStyle || 'https://tiles.openfreemap.org/styles/positron';
  var MAPLIBRE_JS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js';
  var MAPLIBRE_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css';
  var MX_BOUNDS = [[-117.2, 14.4], [-86.6, 32.8]];
  var ORANGE = '#F39300';
  var INK = '#1A1A1A';

  var state = {
    view: 'list',
    body: null,          // última query del listado: { query, filters }
    zone: null,          // [w, s, e, n] cuando "Buscar en esta zona" está activo
    hits: [],
    total: 0,
    boundaryKey: null,
    boundary: null,
    userMoved: false,
    mapReady: false,
    selectedSlug: null
  };

  var origFetch = window.fetch.bind(window);
  var map = null;
  var popup = null;
  var els = {};
  var mapQueryTimer = null;
  var mapQueryVersion = 0;
  var boundaryCache = {};

  // ---------- estado en URL ----------
  // El motor escribe ?operacion= pero no lo lee al cargar; se restaura aquí
  // (p. ej. al regresar de una ficha).
  var pendingOps = [];
  function restoreOperacion() {
    var ops = pendingOps;
    pendingOps = [];
    ops.forEach(function (v) {
      var cb = document.getElementById(v.charAt(0).toUpperCase() + v.slice(1).toLowerCase());
      if (cb && cb.type === 'checkbox' && !cb.checked) (cb.closest('label') || cb).click();
    });
  }

  function readUrlState() {
    var p = new URLSearchParams(location.search);
    pendingOps = p.getAll('operacion');
    if (p.get('vista') === 'mapa') state.view = 'map';
    var z = (p.get('zona') || '').split(',').map(Number);
    if (z.length === 4 && z.every(isFinite)) state.zone = z;
  }

  function writeUrlState() {
    var p = new URLSearchParams(location.search);
    p.delete('vista'); p.delete('zona');
    if (state.view === 'map') p.set('vista', 'mapa');
    if (state.zone) p.set('zona', state.zone.map(function (n) { return n.toFixed(4); }).join(','));
    var qs = p.toString();
    history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : ''));
  }

  // ---------- hook al motor de listado ----------
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf(QUERY_PATH) === -1 || !init || typeof init.body !== 'string') {
      return origFetch(input, init);
    }
    try {
      var body = JSON.parse(init.body);
      state.body = { query: body.query || '', filters: body.filters || '' };
      if (!state.zone) state.userMoved = false;
      if (state.zone) {
        body.insideBoundingBox = [bboxToAlgolia(state.zone)];
        init = Object.assign({}, init, { body: JSON.stringify(body) });
      }
    } catch (e) { /* query ajena: se deja pasar intacta */ }
    // El motor reescribe la URL justo antes de consultar; se re-agregan vista/zona.
    writeUrlState();
    if (pendingOps.length) setTimeout(restoreOperacion, 0);
    scheduleMapQuery();
    return origFetch(input, init).then(function (res) {
      res.clone().json().then(function (d) {
        state.total = d.nbHits || 0;
        updateZoneBadge();
      }).catch(function () {});
      return res;
    });
  };

  function bboxToAlgolia(b) { return [b[3], b[0], b[1], b[2]]; } // [n, w, s, e] → (lat,lng) x2

  // Re-dispara el motor sin tocar su código: su buscador escucha 'input'.
  function searchInput() {
    return document.querySelector('input[name="field"],#field,input[fs-cmsfilter-field="*"]');
  }

  function rerunListing() {
    var si = searchInput();
    if (si) si.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ---------- query del mapa ----------
  function scheduleMapQuery() {
    clearTimeout(mapQueryTimer);
    mapQueryTimer = setTimeout(runMapQuery, 60);
  }

  function runMapQuery() {
    if (!state.body) return;
    var v = ++mapQueryVersion;
    var params = {
      query: state.body.query,
      filters: state.body.filters,
      hitsPerPage: 1000,
      attributesToRetrieve: ['_geoloc', 'name', 'slug', 'pageUrl', 'featuredImageUrl', 'metrosDisplay',
        'precioDisplay', 'locationFull', 'propertyType', 'operationType', 'andenes', 'destacada'],
      attributesToHighlight: []
    };
    if (state.zone) params.insideBoundingBox = [bboxToAlgolia(state.zone)];
    origFetch('https://' + APP_ID + '-dsn.algolia.net/1/indexes/' + INDEX + '/query', {
      method: 'POST',
      headers: { 'X-Algolia-Application-Id': APP_ID, 'X-Algolia-API-Key': SEARCH_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (v !== mapQueryVersion) return;
      state.hits = (d.hits || []).filter(function (h) { return h._geoloc; });
      renderPoints();
      updateBoundary();
    }).catch(function (e) { console.error('[LCB mapa]', e); });
  }

  // ---------- límite geográfico real ----------
  function boundaryPlace() {
    if (!state.body || state.zone) return null;
    var q = (state.body.query || '').trim();
    if (q.length >= 3 && !/\d/.test(q)) return q;
    var cities = (state.body.filters.match(/city:"([^"]+)"/g) || []).map(function (s) { return s.slice(6, -1); });
    var unique = cities.filter(function (c, i) { return cities.indexOf(c) === i; });
    // "Ciudad de México" arrastra "Estado de México" por el script de pares.
    if (unique.length === 2 && unique.indexOf('Ciudad de México') > -1 && unique.indexOf('Estado de México') > -1) return null;
    return unique.length === 1 ? unique[0] : null;
  }

  function updateBoundary() {
    var place = boundaryPlace();
    if (place === state.boundaryKey) { fitToData(); return; }
    state.boundaryKey = place;
    if (!place || !BOUNDARY_URL) { setBoundary(null); return; }
    fetchBoundary(place).then(function (b) {
      if (state.boundaryKey !== place) return;
      setBoundary(b && b.found ? b : null);
    });
  }

  function fetchBoundary(place) {
    var key = place.toLowerCase();
    if (boundaryCache[key]) return boundaryCache[key];
    try {
      var saved = sessionStorage.getItem('lcbm-b:' + key);
      if (saved) return (boundaryCache[key] = Promise.resolve(JSON.parse(saved)));
    } catch (e) {}
    boundaryCache[key] = origFetch(BOUNDARY_URL + '?q=' + encodeURIComponent(place + ', México'))
      .then(function (r) { return r.json(); })
      .then(function (b) {
        try { sessionStorage.setItem('lcbm-b:' + key, JSON.stringify(b)); } catch (e) {}
        return b;
      })
      .catch(function () { return null; });
    return boundaryCache[key];
  }

  function setBoundary(b) {
    state.boundary = b;
    if (!state.mapReady) return;
    map.getSource('lcbm-boundary').setData(b
      ? { type: 'Feature', properties: {}, geometry: b.geometry }
      : { type: 'FeatureCollection', features: [] });
    fitToData(true);
  }

  // ---------- mapa ----------
  function loadMapLibre() {
    if (window.maplibregl) return Promise.resolve();
    if (loadMapLibre.p) return loadMapLibre.p;
    var css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = MAPLIBRE_CSS;
    document.head.appendChild(css);
    loadMapLibre.p = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = MAPLIBRE_JS; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    return loadMapLibre.p;
  }

  function initMap() {
    if (map) { map.resize(); return; }
    loadMapLibre().then(function () {
      map = new maplibregl.Map({
        container: els.map,
        style: MAP_STYLE,
        bounds: state.zone ? [[state.zone[0], state.zone[1]], [state.zone[2], state.zone[3]]] : MX_BOUNDS,
        attributionControl: { compact: true },
        cooperativeGestures: window.matchMedia('(max-width: 767px)').matches
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new maplibregl.GeolocateControl({ fitBoundsOptions: { maxZoom: 11 } }), 'top-right');
      map.on('load', onMapLoad);
      map.on('moveend', function (e) {
        if (!e.originalEvent && !e.lcbmUser) return;
        state.userMoved = true;
        els.zoneBtn.hidden = false;
      });
    }).catch(function () {
      els.map.innerHTML = '<p class="lcbm-map-error">No se pudo cargar el mapa. Intenta recargar la página.</p>';
    });
  }

  function onMapLoad() {
    map.addSource('lcbm-boundary', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'lcbm-boundary-fill', type: 'fill', source: 'lcbm-boundary',
      paint: { 'fill-color': ORANGE, 'fill-opacity': 0.14 } });
    map.addLayer({ id: 'lcbm-boundary-line', type: 'line', source: 'lcbm-boundary',
      paint: { 'line-color': ORANGE, 'line-width': 2 } });

    map.addSource('lcbm-props', {
      type: 'geojson', data: toGeoJSON(), cluster: true, clusterRadius: 48, clusterMaxZoom: 13
    });
    map.addLayer({ id: 'lcbm-clusters', type: 'circle', source: 'lcbm-props', filter: ['has', 'point_count'],
      paint: {
        'circle-color': INK,
        'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 50, 24],
        'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff'
      } });
    map.addLayer({ id: 'lcbm-cluster-count', type: 'symbol', source: 'lcbm-props', filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 12 },
      paint: { 'text-color': '#ffffff' } });
    map.addLayer({ id: 'lcbm-points', type: 'circle', source: 'lcbm-props', filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': ORANGE,
        'circle-radius': 7,
        'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff'
      } });
    map.addLayer({ id: 'lcbm-points-active', type: 'circle', source: 'lcbm-props',
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'slug'], '']],
      paint: { 'circle-color': ORANGE, 'circle-radius': 11, 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } });

    map.on('click', 'lcbm-clusters', function (e) {
      var f = e.features[0];
      map.getSource('lcbm-props').getClusterExpansionZoom(f.properties.cluster_id).then(function (z) {
        map.easeTo({ center: f.geometry.coordinates, zoom: z }, { lcbmUser: true });
      });
    });
    map.on('click', 'lcbm-points', function (e) { openPreview(e.features[0].properties.slug); });
    ['lcbm-clusters', 'lcbm-points'].forEach(function (id) {
      map.on('mouseenter', id, function () { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, function () { map.getCanvas().style.cursor = ''; });
    });

    state.mapReady = true;
    if (state.boundary) setBoundary(state.boundary);
    renderPoints();
    // El panel puede terminar de medirse después del primer fit.
    var refitTimer;
    map.on('resize', function () {
      clearTimeout(refitTimer);
      refitTimer = setTimeout(function () { fitToData(); }, 150);
    });
  }

  function toGeoJSON() {
    return {
      type: 'FeatureCollection',
      features: state.hits.map(function (h) {
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [h._geoloc.lng, h._geoloc.lat] },
          properties: { slug: h.slug }
        };
      })
    };
  }

  function renderPoints() {
    if (!state.mapReady) return;
    map.getSource('lcbm-props').setData(toGeoJSON());
    if (popup && state.selectedSlug && !hitBySlug(state.selectedSlug)) closePreview();
    fitToData();
  }

  function fitToData(force) {
    if (!state.mapReady || state.zone || (state.userMoved && !force)) return;
    var b = null;
    if (state.boundary && state.boundary.bbox) {
      var x = state.boundary.bbox;
      b = [[x[0], x[1]], [x[2], x[3]]];
    } else if (state.hits.length) {
      var w = 180, s = 90, e = -180, n = -90;
      state.hits.forEach(function (h) {
        w = Math.min(w, h._geoloc.lng); e = Math.max(e, h._geoloc.lng);
        s = Math.min(s, h._geoloc.lat); n = Math.max(n, h._geoloc.lat);
      });
      b = [[w, s], [e, n]];
    }
    if (!b) return;
    map.fitBounds(b, { padding: 56, maxZoom: 14, duration: 500 });
    state.userMoved = false;
    els.zoneBtn.hidden = true;
  }

  function hitBySlug(slug) {
    for (var i = 0; i < state.hits.length; i++) if (state.hits[i].slug === slug) return state.hits[i];
    return null;
  }

  function highlight(slug) {
    if (!state.mapReady) return;
    map.setFilter('lcbm-points-active', ['all', ['!', ['has', 'point_count']], ['==', ['get', 'slug'], slug || '']]);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function openPreview(slug) {
    var h = hitBySlug(slug);
    if (!h) return;
    state.selectedSlug = slug;
    highlight(slug);
    var html =
      '<a class="lcbm-preview" href="' + esc(h.pageUrl) + '">' +
        (h.featuredImageUrl ? '<img class="lcbm-preview-img" src="' + esc(h.featuredImageUrl) + '" alt="" loading="lazy">' : '') +
        '<span class="lcbm-preview-body">' +
          '<span class="lcbm-preview-title">' + esc(h.name) + '</span>' +
          '<span class="lcbm-preview-meta">' +
            [h.metrosDisplay && h.metrosDisplay !== '0' ? esc(h.metrosDisplay) + ' m²' : '', esc(h.precioDisplay)]
              .filter(Boolean).join(' · ') + '</span>' +
          '<span class="lcbm-preview-loc">' + esc(h.locationFull) + '</span>' +
          '<span class="lcbm-preview-cta">Ver propiedad →</span>' +
        '</span>' +
      '</a>';
    if (popup) popup.remove();
    popup = new maplibregl.Popup({ closeButton: true, offset: 14, maxWidth: '300px', className: 'lcbm-popup' })
      .setLngLat([h._geoloc.lng, h._geoloc.lat]).setHTML(html).addTo(map);
    popup.on('close', function () { state.selectedSlug = null; highlight(null); });
    var card = cardBySlug(slug);
    if (card && state.view === 'map') {
      document.querySelectorAll('.lcbm-card-active').forEach(function (c) { c.classList.remove('lcbm-card-active'); });
      card.classList.add('lcbm-card-active');
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function closePreview() { if (popup) popup.remove(); popup = null; }

  function cardBySlug(slug) {
    var a = document.querySelector('.w-dyn-item a[href$="/propiedades/' + CSS.escape(slug) + '"]');
    return a && a.closest('.w-dyn-item');
  }

  function slugFromCard(item) {
    var a = item.querySelector('a[href*="/propiedades/"]');
    return a ? (a.getAttribute('href').split('/propiedades/')[1] || '').replace(/\/$/, '') : null;
  }

  // ---------- zona ----------
  function applyZone() {
    var b = map.getBounds();
    state.zone = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    els.zoneBtn.hidden = true;
    // La zona sustituye a los criterios de ubicación (lugar buscado y estados);
    // operación, tipo y m² se conservan.
    var si = searchInput();
    if (si && state.boundaryKey && si.value.trim().toLowerCase() === state.boundaryKey.toLowerCase()) si.value = '';
    document.querySelectorAll('span[fs-cmsfilter-field="ciudad"],span[fs-cmsfilter-field="cuidad"]').forEach(function (sp) {
      var label = sp.closest('label');
      var cb = label && label.querySelector('input[type="checkbox"]');
      if (cb && cb.checked) label.click();
    });
    state.boundaryKey = null;
    setBoundary(null);
    rerunListing();
  }

  function clearZone(rerun) {
    if (!state.zone) return;
    state.zone = null;
    state.userMoved = false;
    updateZoneBadge();
    if (rerun) rerunListing();
  }

  function updateZoneBadge() {
    if (!els.badge) return;
    els.badge.hidden = !state.zone;
    els.badgeCount.textContent = state.total + (state.total === 1 ? ' propiedad' : ' propiedades');
  }

  // ---------- vista ----------
  function setView(view) {
    state.view = view;
    document.body.classList.toggle('lcbm-map-mode', view === 'map');
    els.toggle.querySelectorAll('[data-lcbm-view]').forEach(function (b) {
      var on = b.getAttribute('data-lcbm-view') === view;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (view === 'map') { initMap(); setTimeout(function () { if (map) map.resize(); }, 50); }
    else { closePreview(); }
    writeUrlState();
    measureTop();
  }

  function measureTop() {
    var nav = document.querySelector('.navbar, .w-nav, nav');
    var h = nav ? nav.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty('--lcbm-top', Math.round(h + 12) + 'px');
  }

  // ---------- UI (usa elementos nativos de Webflow si existen) ----------
  function iconSvg(kind) {
    return kind === 'map'
      ? '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 0v14m6-12v14"/></svg>'
      : '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>';
  }

  function buildUI() {
    document.body.classList.add('lcbm-page');

    els.toggle = document.getElementById('lcbm-toggle');
    if (!els.toggle) {
      els.toggle = document.createElement('div');
      els.toggle.id = 'lcbm-toggle';
      els.toggle.className = 'lcbm-toggle';
      els.toggle.innerHTML =
        '<button type="button" class="lcbm-toggle-btn" data-lcbm-view="list">' + iconSvg('list') + '<span>Listado</span></button>' +
        '<button type="button" class="lcbm-toggle-btn" data-lcbm-view="map">' + iconSvg('map') + '<span>Mapa</span></button>';
      var host = document.querySelector('.div-filtro.propiedades') || document.querySelector('.view-property-contador');
      if (host) host.appendChild(els.toggle);
    }
    els.toggle.addEventListener('click', function (e) {
      var b = e.target.closest('[data-lcbm-view]');
      if (b) { e.preventDefault(); setView(b.getAttribute('data-lcbm-view')); }
    });

    // El buscador vive en el hero; en la barra horizontal va primero.
    var bar = document.querySelector('.filtro-horizontal-fix');
    var search = document.querySelector('.select-filter-drow.search');
    if (bar && search && !bar.contains(search)) bar.insertBefore(search, bar.firstChild);

    var grid = document.querySelector('.grid-propiedades');
    var list = grid && grid.querySelector('[fs-cmsfilter-element="list"]');
    els.panel = document.getElementById('lcbm-map-panel');
    if (!els.panel && grid) {
      els.panel = document.createElement('div');
      els.panel.id = 'lcbm-map-panel';
      els.panel.className = 'lcbm-map-panel';
      grid.appendChild(els.panel);
    }
    if (list) list.classList.add('lcbm-list');
    els.panel.innerHTML =
      '<div id="lcbm-map" class="lcbm-map"></div>' +
      '<button type="button" class="lcbm-zone-btn" hidden>' +
        '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="m21 21-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z"/></svg>' +
        'Buscar en esta zona</button>' +
      '<div class="lcbm-zone-badge" hidden><span class="lcbm-zone-dot"></span>' +
        '<span><strong>Resultados en esta zona</strong><span class="lcbm-zone-count"></span></span>' +
        '<button type="button" class="lcbm-zone-clear" aria-label="Quitar zona">×</button></div>';
    els.map = els.panel.querySelector('#lcbm-map');
    els.zoneBtn = els.panel.querySelector('.lcbm-zone-btn');
    els.badge = els.panel.querySelector('.lcbm-zone-badge');
    els.badgeCount = els.panel.querySelector('.lcbm-zone-count');
    els.zoneBtn.addEventListener('click', applyZone);
    els.panel.querySelector('.lcbm-zone-clear').addEventListener('click', function () { clearZone(true); });

    var clear = document.querySelector('[fs-cmsfilter-element="clear"]');
    if (clear) clear.addEventListener('click', function () { clearZone(false); }, true);

    // Card ↔ marker.
    document.addEventListener('mouseover', function (e) {
      if (state.view !== 'map') return;
      var item = e.target.closest && e.target.closest('.lcbm-list .w-dyn-item');
      if (item) highlight(slugFromCard(item));
    });
    document.addEventListener('mouseout', function (e) {
      if (state.view !== 'map') return;
      var item = e.target.closest && e.target.closest('.lcbm-list .w-dyn-item');
      if (item && !item.contains(e.relatedTarget)) highlight(state.selectedSlug);
    });

    window.addEventListener('resize', measureTop);
    setView(state.view);
  }

  readUrlState();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI);
  else buildUI();
})();
