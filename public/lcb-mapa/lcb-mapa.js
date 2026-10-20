/* LCB — Vista de mapa para /propiedades(-copy).
 * Se apoya en el motor de listado Algolia del sitio (custom code global):
 * intercepta su query para conocer filtros activos y, en modo Mapa, agrega
 * siempre insideBoundingBox con el área visible del mapa — así listado y
 * mapa muestran lo mismo en todo momento, sin botón manual. */
(function () {
  'use strict';

  var CFG = window.LCBM_CONFIG || {};
  var APP_ID = 'AT36ZPQLUN';
  var SEARCH_KEY = '52fd152e763367fee66a55bc3c557051';
  var INDEX = 'lcb_propiedades';
  var QUERY_PATH = '/indexes/' + INDEX + '/query';
  var BOUNDARY_URL = CFG.boundaryEndpoint || '';
  var MAPLIBRE_JS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js';
  var MAPLIBRE_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css';
  var MX_BOUNDS = [[-117.2, 14.4], [-86.6, 32.8]];
  var ORANGE = '#F39300';
  var INK = '#1A1A1A';
  // Estilo tipo Apple/Google Maps "claro": calles, áreas verdes, ríos — sin
  // el peso de imágenes satelitales. Vectorial (OpenFreeMap, gratis/sin
  // cuenta), se renderiza mucho más rápido que un raster satelital.
  var MAP_STYLE = CFG.mapStyle || 'https://tiles.openfreemap.org/styles/liberty';

  var state = {
    view: 'list',
    body: null,              // última query del listado: { query, filters }
    filterKey: null,         // firma query+filters, para distinguir "cambió un filtro" de "solo se movió el mapa"
    triggeredByFilterChange: false,
    viewport: null,          // [w, s, e, n] del mapa, se actualiza solo al mover/zoom (siempre activo en modo Mapa)
    hits: [],
    total: 0,
    boundaryKey: null,
    boundary: null,
    mapReady: false,
    selectedSlug: null
  };

  var origFetch = window.fetch.bind(window);
  var map = null;
  var popup = null;
  var els = {};
  var mapQueryTimer = null;
  var mapQueryVersion = 0;
  var moveDebounceTimer = null;
  var boundaryCache = {};
  var skipNextFit = false;
  var searchHome = null; // { parent, next } — posición original del buscador, fuera del modo Mapa
  var toggleHome = null; // { parent, next } — posición original del toggle Listado|Mapa, fuera del modo Mapa

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
    if (z.length === 4 && z.every(isFinite)) state.viewport = z;
  }

  function writeUrlState() {
    var p = new URLSearchParams(location.search);
    p.delete('vista'); p.delete('zona');
    if (state.view === 'map') p.set('vista', 'mapa');
    if (state.view === 'map' && state.viewport) {
      p.set('zona', state.viewport.map(function (n) { return n.toFixed(4); }).join(','));
    }
    var qs = p.toString();
    history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : ''));
  }

  // ---------- hook al motor de listado ----------
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf(QUERY_PATH) === -1 || !init || typeof init.body !== 'string') {
      return origFetch(input, init);
    }
    // El cliente pidió orden descendente por precio por defecto en la lista.
    // Algolia pagina del lado del servidor por relevancia — ordenar solo la
    // página de 28 que llega no da un orden global correcto entre páginas.
    // En vez de eso se pide SIEMPRE el set completo (hasta 1000, igual que
    // ya hace el mapa), se ordena aquí y se recorta a la página/tamaño que
    // el motor del sitio pidió originalmente antes de devolverle la
    // respuesta — para el motor es indistinguible de una respuesta normal.
    var requestedPage = 0, requestedHitsPerPage = 28, sortApplies = false;
    try {
      var body = JSON.parse(init.body);
      var key = (body.query || '') + '|' + (body.filters || '');
      state.triggeredByFilterChange = state.filterKey !== null && state.filterKey !== key || state.filterKey === null;
      state.filterKey = key;
      state.body = { query: body.query || '', filters: body.filters || '' };
      if (state.view === 'map' && state.viewport) {
        // Así es como EasyBroker implementa su propio mapa de búsqueda: una
        // vez que mueves el mapa, el viewport manda y el listado muestra lo
        // que hay en esa zona — se ignoran el texto buscado y el filtro de
        // ciudad (igual que runMapQuery()) para que lista y mapa siempre
        // coincidan, en vez de que la lista diga "sin resultados" cuando el
        // mapa sí tiene propiedades visibles ahí.
        body.query = '';
        body.filters = stripCityFilter(body.filters);
        body.insideBoundingBox = [bboxToAlgolia(state.viewport)];
      }
      requestedPage = body.page || 0;
      requestedHitsPerPage = body.hitsPerPage || 28;
      body.page = 0;
      body.hitsPerPage = 1000;
      sortApplies = true;
      init = Object.assign({}, init, { body: JSON.stringify(body) });
    } catch (e) { /* query ajena: se deja pasar intacta */ }
    // El motor reescribe la URL justo antes de consultar; se re-agregan vista/zona.
    writeUrlState();
    if (pendingOps.length) setTimeout(restoreOperacion, 0);
    scheduleMapQuery();
    return origFetch(input, init).then(function (res) {
      if (!sortApplies) return res;
      return res.json().then(function (d) {
        state.total = d.nbHits || 0;
        var hits = Array.isArray(d.hits) ? d.hits.slice() : [];
        hits.sort(function (a, b) { return (b.precioNumerico || 0) - (a.precioNumerico || 0); });
        var start = requestedPage * requestedHitsPerPage;
        var out = Object.assign({}, d, {
          hits: hits.slice(start, start + requestedHitsPerPage),
          page: requestedPage,
          hitsPerPage: requestedHitsPerPage,
          nbPages: Math.max(1, Math.ceil((d.nbHits || 0) / requestedHitsPerPage))
        });
        return new Response(JSON.stringify(out), { status: res.status, statusText: res.statusText, headers: res.headers });
      }).catch(function () { return res; });
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

  // Quita la(s) cláusula(s) city:"..." de un string de filtros Algolia
  // (segmentos unidos con " AND ", cada cláusula entre paréntesis — mismo
  // formato que arma el motor del sitio). El mapa no debe perder de vista
  // propiedades de otras zonas solo porque el listado esté filtrado por
  // ubicación; el listado sigue usando el filtro completo sin tocar.
  function stripCityFilter(filters) {
    return (filters || '').split(' AND ').filter(function (f) {
      return f.indexOf('city:') === -1;
    }).join(' AND ');
  }

  function runMapQuery() {
    if (!state.body) return;
    var v = ++mapQueryVersion;
    showUpdating(true);
    var params = {
      // El mapa muestra todo lo que matchea operación/tipo/m² — ubicación
      // (checkbox de ciudad y texto buscado) no se usa aquí, solo narra el
      // listado y decide el polígono/centrado. Así las burbujas de zonas
      // cercanas siguen visibles como referencia al buscar una zona.
      query: '',
      filters: stripCityFilter(state.body.filters),
      hitsPerPage: 1000,
      attributesToRetrieve: ['_geoloc', 'name', 'slug', 'pageUrl', 'featuredImageUrl', 'metrosDisplay',
        'precioDisplay', 'locationFull', 'propertyType', 'operationType', 'andenes', 'destacada'],
      attributesToHighlight: []
    };
    if (state.view === 'map' && state.viewport) params.insideBoundingBox = [bboxToAlgolia(state.viewport)];
    origFetch('https://' + APP_ID + '-dsn.algolia.net/1/indexes/' + INDEX + '/query', {
      method: 'POST',
      headers: { 'X-Algolia-Application-Id': APP_ID, 'X-Algolia-API-Key': SEARCH_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (v !== mapQueryVersion) return;
      state.hits = (d.hits || []).filter(function (h) { return h._geoloc; });
      renderPoints();
      updateBoundary();
      showUpdating(false);
    }).catch(function (e) { console.error('[LCB mapa]', e); showUpdating(false); });
  }

  function showUpdating(on) {
    if (els.updating) els.updating.classList.toggle('is-visible', on);
  }

  // ---------- límite geográfico real ----------
  function boundaryPlace() {
    if (!state.body) return null;
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
    // Un límite nuevo (o quitado) siempre recentra, aunque solo haya cambiado
    // por una query disparada desde el paneo del mapa.
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
        bounds: state.viewport ? [[state.viewport[0], state.viewport[1]], [state.viewport[2], state.viewport[3]]] : MX_BOUNDS,
        attributionControl: { compact: true },
        // En desktop, un scroll normal sobre el mapa hacía zoom y se comía el
        // scroll de la página entera (solo se podía bajar con el cursor fuera
        // del mapa). Con gestos cooperativos, un scroll simple sigue bajando
        // la página; hace falta Ctrl/Cmd + scroll (o un dedo en touch) para
        // hacer zoom — el mapa muestra un aviso breve si se intenta sin eso.
        cooperativeGestures: true
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new maplibregl.GeolocateControl({ fitBoundsOptions: { maxZoom: 11 } }), 'top-right');
      map.on('load', onMapLoad);
      map.on('moveend', function (e) {
        // Ignora moves programáticos (nuestro propio fitBounds/resize); solo
        // reacciona a interacción real del usuario (drag, scroll, controles,
        // o un easeTo marcado explícitamente con lcbmUser, p. ej. al abrir
        // un cluster).
        if (!e.originalEvent && !e.lcbmUser) return;
        clearTimeout(moveDebounceTimer);
        moveDebounceTimer = setTimeout(function () {
          var b = map.getBounds();
          state.viewport = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
          rerunListing();
        }, 180);
      });
    }).catch(function () {
      els.map.innerHTML = '<p class="lcbm-map-error">No se pudo cargar el mapa. Intenta recargar la página.</p>';
    });
  }

  function onMapLoad() {
    map.addSource('lcbm-boundary', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'lcbm-boundary-fill', type: 'fill', source: 'lcbm-boundary',
      paint: { 'fill-color': ORANGE, 'fill-opacity': 0.18 } });
    map.addLayer({ id: 'lcbm-boundary-line', type: 'line', source: 'lcbm-boundary',
      paint: { 'line-color': ORANGE, 'line-width': 2.5 } });

    map.addSource('lcbm-props', {
      type: 'geojson', data: toGeoJSON(), cluster: true, clusterRadius: 48, clusterMaxZoom: 13
    });
    map.addLayer({ id: 'lcbm-clusters', type: 'circle', source: 'lcbm-props', filter: ['has', 'point_count'],
      paint: {
        'circle-color': INK,
        'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 50, 24],
        'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff',
        'circle-radius-transition': { duration: 300 }
      } });
    map.addLayer({ id: 'lcbm-cluster-count', type: 'symbol', source: 'lcbm-props', filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 12 },
      paint: { 'text-color': '#ffffff' } });
    map.addLayer({ id: 'lcbm-points', type: 'circle', source: 'lcbm-props', filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': ORANGE,
        'circle-radius': 7,
        'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff',
        'circle-opacity-transition': { duration: 300 }
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

  // EasyBroker geocodifica muchas naves a nivel de parque industrial, no
  // por nave individual — es común que varias propiedades compartan
  // coordenadas exactas. Sin esto, se superponen en un solo punto y
  // "desaparecen" aunque la lista sí las muestre por separado. Se separan
  // en un pequeño abanico determinista (mismo slug → siempre el mismo
  // lugar, sin importar el orden en que llegan de Algolia) de ~12m de
  // radio por vuelta — a zoom bajo el clustering de MapLibre las sigue
  // agrupando normalmente; solo se ven como puntos distintos una vez que
  // el zoom es suficiente para despegarlas del clúster.
  function toGeoJSON() {
    var groups = {};
    state.hits.forEach(function (h) {
      var key = h._geoloc.lat.toFixed(6) + ',' + h._geoloc.lng.toFixed(6);
      (groups[key] = groups[key] || []).push(h);
    });
    var features = [];
    Object.keys(groups).forEach(function (key) {
      var group = groups[key];
      group.sort(function (a, b) { return (a.slug || '').localeCompare(b.slug || ''); });
      group.forEach(function (h, idx) {
        var lng = h._geoloc.lng, lat = h._geoloc.lat;
        if (idx > 0) {
          var angle = (idx % 8) * (Math.PI / 4);
          var ring = Math.floor((idx - 1) / 8) + 1;
          var meters = 12 * ring;
          lat += (meters * Math.cos(angle)) / 111320;
          lng += (meters * Math.sin(angle)) / (111320 * Math.cos(lat * Math.PI / 180));
        }
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: { slug: h.slug }
        });
      });
    });
    return { type: 'FeatureCollection', features: features };
  }

  function renderPoints() {
    if (!state.mapReady) return;
    map.getSource('lcbm-props').setData(toGeoJSON());
    if (popup && state.selectedSlug && !hitBySlug(state.selectedSlug)) closePreview();
    // La lista se reconstruye en cada query del motor (cards nuevas en el
    // DOM); si seguía habiendo una propiedad seleccionada, su card se
    // re-ancla primero en la lista reconstruida. La query del mapa y la del
    // listado son independientes y pueden resolver en distinto orden, así
    // que se reintenta una vez poco después por si la lista llegó tarde.
    else if (state.selectedSlug && state.view === 'map') {
      var slugToPin = state.selectedSlug;
      pinCardFirst(slugToPin);
      setTimeout(function () {
        if (state.selectedSlug === slugToPin) pinCardFirst(slugToPin);
      }, 350);
    }
    fitToData();
  }

  function computeBounds() {
    if (state.boundary && state.boundary.bbox) {
      var x = state.boundary.bbox;
      return [[x[0], x[1]], [x[2], x[3]]];
    }
    if (state.hits.length) {
      var w = 180, s = 90, e = -180, n = -90;
      state.hits.forEach(function (h) {
        w = Math.min(w, h._geoloc.lng); e = Math.max(e, h._geoloc.lng);
        s = Math.min(s, h._geoloc.lat); n = Math.max(n, h._geoloc.lat);
      });
      return [[w, s], [e, n]];
    }
    return null;
  }

  // Solo recentra el mapa ante un cambio real de filtros/búsqueda — nunca
  // como reacción a que el propio usuario movió el mapa (eso alimenta el
  // listado, no al revés).
  function fitToData(force) {
    if (!state.mapReady) return;
    if (!force) {
      if (skipNextFit) { skipNextFit = false; return; }
      if (!state.triggeredByFilterChange) return;
    }
    var b = computeBounds();
    if (!b) return;
    map.fitBounds(b, { padding: 56, maxZoom: 14, duration: 500 });
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
    popup = new maplibregl.Popup({ closeButton: true, offset: 14, maxWidth: '340px', className: 'lcbm-popup' })
      .setLngLat([h._geoloc.lng, h._geoloc.lat]).setHTML(html).addTo(map);
    popup.on('close', function () { state.selectedSlug = null; highlight(null); unpinCard(); });
    if (state.view === 'map') {
      document.querySelectorAll('.lcbm-card-active').forEach(function (c) { c.classList.remove('lcbm-card-active'); });
      pinCardFirst(slug);
      if (pinnedCard) {
        pinnedCard.classList.add('lcbm-card-active');
        pinnedCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  function closePreview() { if (popup) popup.remove(); popup = null; unpinCard(); }

  function cardBySlug(slug) {
    var a = document.querySelector('.w-dyn-item a[href$="/propiedades/' + CSS.escape(slug) + '"]');
    return a && a.closest('.w-dyn-item');
  }

  // La card de la propiedad seleccionada en el mapa (el punto al que se le
  // dio clic) pasa a ser la primera de la lista — vía CSS `order` (la lista
  // ya es un flex container en modo Mapa), sin tocar el orden real del DOM
  // para no romper listeners/Swiper/IntersectionObserver de las cards.
  var pinnedCard = null;
  function pinCardFirst(slug) {
    unpinCard();
    var card = cardBySlug(slug);
    if (!card) return;
    card.style.order = '-1';
    pinnedCard = card;
  }
  function unpinCard() {
    if (pinnedCard) { pinnedCard.style.order = ''; pinnedCard = null; }
  }

  function slugFromCard(item) {
    var a = item.querySelector('a[href*="/propiedades/"]');
    return a ? (a.getAttribute('href').split('/propiedades/')[1] || '').replace(/\/$/, '') : null;
  }

  // ---------- vista ----------
  function setView(view) {
    // Listado↔Mapa reacomoda bastante DOM de golpe (grid, buscador, header,
    // panel del mapa) — se oculta un instante y se revela con un fundo
    // suave ya reacomodado, en vez de que el reacomodo se vea como un salto.
    var grid = document.querySelector('.grid-propiedades');
    if (grid) grid.classList.add('lcbm-view-fade');

    state.view = view;
    document.body.classList.toggle('lcbm-map-mode', view === 'map');
    document.documentElement.classList.toggle('lcbm-map-mode', view === 'map');
    els.toggle.querySelectorAll('[data-lcbm-view]').forEach(function (b) {
      var on = b.getAttribute('data-lcbm-view') === view;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    placeSearch(view);
    placeToggle(view);
    if (view === 'map') {
      // Si se restauró una posición de mapa desde la URL (p. ej. al volver
      // de una ficha), no la pise un fit automático en la primera query.
      if (!map) skipNextFit = !!state.viewport;
      initMap();
      setTimeout(function () { if (map) map.resize(); }, 50);
    } else {
      closePreview();
    }
    writeUrlState();
    measureTop();

    if (grid) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { grid.classList.remove('lcbm-view-fade'); });
      });
    }
  }

  // El buscador vive arriba del grid en Listado (como en /propiedades); solo
  // se mueve dentro de la barra horizontal mientras se está en modo Mapa.
  function placeSearch(view) {
    var search = document.querySelector('.select-filter-drow.search');
    if (!search) return;
    if (view === 'map') {
      var bar = document.querySelector('.filtro-horizontal-fix');
      if (bar && !bar.contains(search)) bar.insertBefore(search, bar.firstChild);
    } else if (searchHome && !searchHome.parent.contains(search)) {
      searchHome.parent.insertBefore(search, searchHome.next);
    }
  }

  // El selector Listado|Mapa vive, en Listado, dentro del header original
  // (junto al contador oculto). En modo Mapa el cliente pidió UNA sola fila
  // horizontal con buscador + filtros + selector — se muda el toggle a la
  // barra de filtros (el header que deja atrás queda vacío y se oculta por
  // CSS). Se devuelve a su lugar original al salir de Mapa.
  function placeToggle(view) {
    if (!els.toggle) return;
    if (view === 'map') {
      var bar = document.querySelector('.filtro-horizontal-fix');
      if (bar && !bar.contains(els.toggle)) bar.appendChild(els.toggle);
    } else if (toggleHome && !toggleHome.parent.contains(els.toggle)) {
      toggleHome.parent.insertBefore(els.toggle, toggleHome.next);
    }
  }

  // ---------- autocompletado de ubicación en el buscador ----------
  // El buscador ya hace full-text contra Algolia (incluye locationFull), así
  // que escribir "Cuautitlán" a mano ya funcionaba — esto solo agrega
  // sugerencias mientras se escribe, para no depender de que el usuario
  // sepa el nombre exacto del municipio/colonia. Corpus 100% del lado del
  // cliente: una sola consulta liviana (solo locationFull) a Algolia,
  // cacheada en sessionStorage — no hay geocoding ni servicio de pago.
  var placesCorpus = null; // [{ label, norm }]
  var placesCorpusPromise = null;

  function normalizePlace(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, ''); // quita acentos
  }

  function loadPlacesCorpus() {
    if (placesCorpusPromise) return placesCorpusPromise;
    placesCorpusPromise = (function () {
      try {
        var cached = sessionStorage.getItem('lcbm-places-corpus');
        if (cached) return Promise.resolve(JSON.parse(cached));
      } catch (e) {}
      return origFetch('https://' + APP_ID + '-dsn.algolia.net/1/indexes/' + INDEX + '/query', {
        method: 'POST',
        headers: { 'X-Algolia-Application-Id': APP_ID, 'X-Algolia-API-Key': SEARCH_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '', hitsPerPage: 1000, attributesToRetrieve: ['locationFull'], attributesToHighlight: [] })
      }).then(function (r) { return r.json(); }).then(function (d) {
        var seen = {};
        var list = [];
        (d.hits || []).forEach(function (h) {
          if (!h.locationFull) return;
          h.locationFull.split(',').forEach(function (part) {
            var label = part.trim();
            if (label.length < 3) return;
            var key = normalizePlace(label);
            if (seen[key]) return;
            seen[key] = true;
            list.push({ label: label, norm: key });
          });
        });
        try { sessionStorage.setItem('lcbm-places-corpus', JSON.stringify(list)); } catch (e) {}
        return list;
      }).catch(function () { return []; });
    })();
    return placesCorpusPromise;
  }

  function matchPlaces(query) {
    var q = normalizePlace(query);
    if (q.length < 2 || !placesCorpus) return [];
    var starts = [], contains = [];
    for (var i = 0; i < placesCorpus.length; i++) {
      var idx = placesCorpus[i].norm.indexOf(q);
      if (idx === 0) starts.push(placesCorpus[i]);
      else if (idx > 0) contains.push(placesCorpus[i]);
    }
    starts.sort(function (a, b) { return a.label.length - b.label.length; });
    contains.sort(function (a, b) { return a.label.length - b.label.length; });
    return starts.concat(contains).slice(0, 8);
  }

  function initAutocomplete() {
    var wrap = document.querySelector('.select-filter-drow.search');
    var input = searchInput();
    if (!wrap || !input || wrap.querySelector('.lcbm-autocomplete')) return;
    var cs = getComputedStyle(wrap);
    if (cs.position === 'static') wrap.style.position = 'relative';

    var box = document.createElement('div');
    box.className = 'lcbm-autocomplete';
    box.setAttribute('role', 'listbox');
    wrap.appendChild(box);

    var activeIndex = -1;
    var items = [];

    function render(matches) {
      items = matches;
      activeIndex = -1;
      if (!matches.length) { box.classList.remove('is-open'); box.innerHTML = ''; return; }
      box.innerHTML = matches.map(function (m, i) {
        return '<div class="lcbm-autocomplete-item" role="option" data-i="' + i + '">' + esc(m.label) + '</div>';
      }).join('');
      box.classList.add('is-open');
    }

    function close() { box.classList.remove('is-open'); box.innerHTML = ''; items = []; activeIndex = -1; }

    function choose(label) {
      input.value = label;
      close();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // El dispatch de arriba también corre el listener 'input' de este mismo
      // módulo (más abajo), que vuelve a programar un render() con el valor
      // recién elegido y reabre el dropdown solo. Se cancela ese timer justo
      // después del dispatch (ya corrió síncronamente y lo dejó programado).
      clearTimeout(debounceTimer);
    }

    function highlight(i) {
      var nodes = box.querySelectorAll('.lcbm-autocomplete-item');
      nodes.forEach(function (n, idx) { n.classList.toggle('is-active', idx === i); });
      activeIndex = i;
    }

    var debounceTimer;
    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      var val = input.value;
      debounceTimer = setTimeout(function () {
        if (!placesCorpus) { loadPlacesCorpus().then(function (list) { placesCorpus = list; render(matchPlaces(val)); }); return; }
        render(matchPlaces(val));
      }, 120);
    });
    input.addEventListener('focus', function () {
      loadPlacesCorpus().then(function (list) { placesCorpus = list; if (document.activeElement === input) render(matchPlaces(input.value)); });
    });
    input.addEventListener('keydown', function (e) {
      if (!items.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); highlight((activeIndex + 1) % items.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlight((activeIndex - 1 + items.length) % items.length); }
      else if (e.key === 'Enter' && activeIndex > -1) { e.preventDefault(); choose(items[activeIndex].label); }
      else if (e.key === 'Escape') { close(); }
    });
    box.addEventListener('mousedown', function (e) {
      var item = e.target.closest('.lcbm-autocomplete-item');
      if (!item) return;
      e.preventDefault();
      choose(items[+item.getAttribute('data-i')].label);
    });
    document.addEventListener('click', function (e) {
      if (e.target !== input && !box.contains(e.target)) close();
    });
  }

  function measureTop() {
    // El grid (lista + mapa) debe llenar exactamente el resto del viewport
    // debajo de todo lo que esté arriba (nav + fila de filtros). No basta
    // con restar solo el alto del nav: el contenedor del grid casi siempre
    // trae su propio padding/margen de sección encima, así que se mide
    // directamente su posición real en pantalla (más robusto que sumar
    // alturas supuestas de sus hermanos).
    if (state.view !== 'map') return;
    var grid = document.querySelector('.grid-propiedades');
    if (!grid) return;
    var top = grid.getBoundingClientRect().top;
    document.documentElement.style.setProperty('--lcbm-grid-top', Math.round(top) + 'px');
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

    // Guarda dónde vive el buscador originalmente (arriba del grid, como en
    // /propiedades) para poder devolverlo ahí al salir del modo Mapa.
    var search = document.querySelector('.select-filter-drow.search');
    if (search) searchHome = { parent: search.parentNode, next: search.nextSibling };

    // Igual para el toggle Listado|Mapa: se guarda su posición original
    // (dentro del header) para devolverlo ahí al salir del modo Mapa.
    toggleHome = { parent: els.toggle.parentNode, next: els.toggle.nextSibling };

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
      '<div class="lcbm-updating"><span class="lcbm-updating-dot"></span>Actualizando resultados…</div>';
    els.map = els.panel.querySelector('#lcbm-map');
    els.updating = els.panel.querySelector('.lcbm-updating');

    var clear = document.querySelector('[fs-cmsfilter-element="clear"]');
    if (clear) clear.addEventListener('click', function () { state.viewport = null; }, true);

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
    initAutocomplete();
    setView(state.view);
  }

  readUrlState();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI);
  else buildUI();
})();
