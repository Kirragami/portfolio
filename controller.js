document.addEventListener('DOMContentLoaded', function () {
  const buttons = document.querySelectorAll('[data-section]');
  const panels = document.querySelectorAll('.panel');

  function showSection(name) {
    buttons.forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.section === name && btn.classList.contains('nav-btn'));
    });

    panels.forEach(function (panel) {
      const isActive = panel.id === name;
      panel.classList.toggle('active', isActive);
      panel.hidden = !isActive;
    });

    history.replaceState(null, '', name === 'home' ? '#' : '#' + name);
  }

  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      showSection(button.dataset.section);
    });
  });

  const hash = location.hash.replace('#', '');
  const validSections = ['home', 'skills', 'projects'];
  if (hash && validSections.includes(hash)) {
    showSection(hash);
  }

  document.querySelectorAll('[data-carousel]').forEach(initCarousel);
  initCopyButtons();
  initCarouselThumbnails();
  initMediaLightbox();
  initLocalClock();
  initActivityScrollObserver();
  initRailLayout();
  initDiscordStatus();
});

var scrollResizeObserver = null;
var railLayoutObserver = null;

var DISCORD_USER_ID = '492633487753478154';
var LANYARD_WS = 'wss://api.lanyard.rest/socket';
var MAX_RECONNECT = 5;

var lanyardSocket = null;
var heartbeatTimer = null;
var reconnectTimer = null;
var reconnectAttempts = 0;

var OFFLINE_QUIPS = [
  "I'm offline. Either sleeping or deep in a config file somewhere.",
  "I'm offline. Touch grass arc in progress.",
  "I'm offline. The servers are holding up without me. Somehow.",
  "I'm offline rn. Dm me anyway — I answer when I feel like it.",
  "I'm offline. Not dead, just unavailable.",
  "I'm offline. Probably pretending I'll fix that bug tomorrow."
];

var IDLE_QUIPS = [
  'Staring at the ceiling.',
  'Doing absolutely nothing.',
  'Contemplating life choices.',
  'Staring into the void.',
  'Probably refreshing something.',
  'Existing. Barely.',
  'Thinking about that one bug.',
  'Lost in thought.',
  'Just vibing.',
  'Wondering what to eat.',
  'Pretending to be productive.',
  'Watching the fan spin.'
];

var ACTIVITY_TYPE_LABELS = {
  0: 'Playing a game',
  1: 'Streaming',
  2: 'Listening to',
  3: 'Watching',
  5: 'Competing in'
};

var progressTimer = null;

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function setupScrollLine(container) {
  if (!container) return;

  var textEl = container.querySelector('.activity-scroll-text');
  if (!textEl) return;

  container.classList.remove('is-marquee');
  container.style.removeProperty('--marquee-offset');
  container.style.removeProperty('--marquee-duration');

  requestAnimationFrame(function () {
    var overflow = textEl.scrollWidth - container.clientWidth;
    if (overflow <= 2) return;

    container.classList.add('is-marquee');
    container.style.setProperty('--marquee-offset', '-' + overflow + 'px');
    container.style.setProperty('--marquee-duration', Math.max(5, Math.min(14, overflow / 18 + 4)) + 's');
  });
}

function refreshActivityScrolls() {
  document.querySelectorAll('#activityList .activity-scroll').forEach(function (el) {
    if (!el.hidden) {
      setupScrollLine(el);
    }
  });
}

function initActivityScrollObserver() {
  var target = document.getElementById('activityList') || document.querySelector('.presence-body');
  if (!target || scrollResizeObserver || typeof ResizeObserver === 'undefined') return;

  scrollResizeObserver = new ResizeObserver(function () {
    refreshActivityScrolls();
  });
  scrollResizeObserver.observe(target);
}

function syncRailTopbarHeight() {
  var root = document.documentElement;

  if (window.matchMedia('(max-width: 767px)').matches) {
    root.style.removeProperty('--topbar-height');
    return;
  }

  if (window.matchMedia('(min-width: 1100px)').matches) {
    root.style.setProperty('--topbar-height', '0px');
    return;
  }

  var sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  var height = sidebar.getBoundingClientRect().height;
  root.style.setProperty('--topbar-height', Math.ceil(height) + 'px');
}

function initRailLayout() {
  syncRailTopbarHeight();
  window.addEventListener('resize', syncRailTopbarHeight);
  window.addEventListener('orientationchange', syncRailTopbarHeight);

  var sidebar = document.querySelector('.sidebar');
  if (!sidebar || railLayoutObserver || typeof ResizeObserver === 'undefined') return;

  railLayoutObserver = new ResizeObserver(syncRailTopbarHeight);
  railLayoutObserver.observe(sidebar);
}

function setPresenceLoading(loading) {
  var presence = document.getElementById('discordPresence');
  var activityList = document.getElementById('activityList');
  var quip = document.getElementById('presenceQuip');
  if (presence) {
    presence.classList.toggle('is-loading', loading);
  }
  if (loading) {
    if (activityList) activityList.hidden = true;
    if (quip) quip.hidden = true;
  }
}

function showPresenceQuip(text, muted) {
  var activityList = document.getElementById('activityList');
  var quip = document.getElementById('presenceQuip');
  if (activityList) {
    activityList.innerHTML = '';
    activityList.hidden = true;
  }
  if (!quip) return;
  quip.textContent = text;
  quip.classList.toggle('is-muted', !!muted);
  quip.hidden = false;
  stopProgressTimer();
}

function stopProgressTimer() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function formatTrackTime(ms) {
  var totalSeconds = Math.max(0, Math.floor(ms / 1000));
  var minutes = Math.floor(totalSeconds / 60);
  var seconds = totalSeconds % 60;
  return minutes + ':' + String(seconds).padStart(2, '0');
}

function updateProgressDisplays() {
  document.querySelectorAll('[data-progress-start][data-progress-end]').forEach(function (el) {
    var start = Number(el.dataset.progressStart);
    var end = Number(el.dataset.progressEnd);
    if (!start || !end || end <= start) return;

    var duration = end - start;
    var elapsed = Math.max(0, Math.min(duration, Date.now() - start));
    var pct = (elapsed / duration) * 100;
    var fill = el.querySelector('.activity-progress-fill');
    var current = el.querySelector('.activity-progress-current');
    var total = el.querySelector('.activity-progress-total');

    if (fill) fill.style.width = pct + '%';
    if (current) current.textContent = formatTrackTime(elapsed);
    if (total) total.textContent = formatTrackTime(duration);
  });
}

function startProgressTimer() {
  stopProgressTimer();
  updateProgressDisplays();
  if (document.querySelector('[data-progress-start]')) {
    progressTimer = setInterval(updateProgressDisplays, 1000);
  }
}

function createSpotifyProgress(start, end) {
  var wrap = document.createElement('div');
  wrap.className = 'activity-progress';
  wrap.dataset.progressStart = String(start);
  wrap.dataset.progressEnd = String(end);

  var track = document.createElement('div');
  track.className = 'activity-progress-track';

  var fill = document.createElement('div');
  fill.className = 'activity-progress-fill';
  track.appendChild(fill);
  wrap.appendChild(track);

  var times = document.createElement('div');
  times.className = 'activity-progress-times';

  var current = document.createElement('span');
  current.className = 'activity-progress-current';

  var total = document.createElement('span');
  total.className = 'activity-progress-total';

  times.appendChild(current);
  times.appendChild(total);
  wrap.appendChild(times);

  return wrap;
}

function decodeExternalAsset(key) {
  if (!key || !key.startsWith('mp:external/')) return null;
  var rest = key.slice('mp:external/'.length);
  var encoded = rest.includes('/') ? rest.slice(0, rest.lastIndexOf('/')) : rest;
  try {
    return atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
  } catch (err) {
    return null;
  }
}

function resolveAssetUrl(applicationId, assetKey) {
  if (!assetKey) return null;

  if (assetKey.startsWith('http://') || assetKey.startsWith('https://')) {
    return assetKey;
  }

  if (assetKey.startsWith('mp:external/')) {
    return decodeExternalAsset(assetKey);
  }

  if (assetKey.startsWith('spotify:')) {
    return 'https://i.scdn.co/image/' + assetKey.slice('spotify:'.length);
  }

  if (applicationId) {
    return 'https://cdn.discordapp.com/app-assets/' + applicationId + '/' + assetKey + '.png?size=128';
  }

  return null;
}

function getActivityViews(data) {
  var views = [];

  if (data.listening_to_spotify && data.spotify) {
    views.push(buildSpotifyView(data.spotify));
  }

  if (data.activities) {
    data.activities.forEach(function (act) {
      if (act.type === 4) return;
      if (data.listening_to_spotify && act.type === 2 && act.name === 'Spotify') return;
      views.push(buildActivityView(act));
    });
  }

  return views;
}

function createScrollLine(className, text) {
  var wrap = document.createElement('div');
  wrap.className = 'activity-scroll ' + className;
  var span = document.createElement('span');
  span.className = 'activity-scroll-text';
  if (text) {
    span.textContent = text;
  } else {
    wrap.hidden = true;
  }
  wrap.appendChild(span);
  return wrap;
}

function createActivityCardElement(view) {
  var card = document.createElement('article');
  card.className = 'activity-card';

  var type = document.createElement('p');
  type.className = 'activity-type';
  type.textContent = view.typeLabel;
  card.appendChild(type);

  var row = document.createElement('div');
  row.className = 'activity-row';

  var info = document.createElement('div');
  info.className = 'activity-info';
  info.appendChild(createScrollLine('activity-name', view.name));

  if (view.details) {
    info.appendChild(createScrollLine('activity-line', view.details));
  }

  if (view.state) {
    info.appendChild(createScrollLine('activity-line', view.state));
  }

  if (view.isSpotify && view.progressStart && view.progressEnd) {
    info.appendChild(createSpotifyProgress(view.progressStart, view.progressEnd));
  }

  row.appendChild(info);

  if (view.largeImage) {
    var art = document.createElement('div');
    art.className = 'activity-art';
    art.hidden = true;

    var artLarge = document.createElement('img');
    artLarge.className = 'activity-art-large';
    artLarge.alt = view.largeAlt || '';
    artLarge.onload = function () {
      art.hidden = false;
      refreshActivityScrolls();
    };
    artLarge.onerror = function () {
      art.hidden = true;
    };
    artLarge.src = view.largeImage;
    art.appendChild(artLarge);

    if (view.smallImage) {
      var artSmall = document.createElement('img');
      artSmall.className = 'activity-art-small';
      artSmall.alt = view.smallAlt || '';
      artSmall.hidden = true;
      artSmall.onload = function () {
        artSmall.hidden = false;
      };
      artSmall.onerror = function () {
        artSmall.hidden = true;
      };
      artSmall.src = view.smallImage;
      art.appendChild(artSmall);
    }

    row.appendChild(art);
  }

  card.appendChild(row);
  return card;
}

function renderActivityCards(views) {
  var list = document.getElementById('activityList');
  var quip = document.getElementById('presenceQuip');
  if (quip) quip.hidden = true;
  if (!list) return;

  list.innerHTML = '';

  views.forEach(function (view) {
    list.appendChild(createActivityCardElement(view));
  });

  list.hidden = false;

  requestAnimationFrame(function () {
    refreshActivityScrolls();
  });
  startProgressTimer();
}

function buildSpotifyView(spotify) {
  var timestamps = spotify.timestamps || {};

  return {
    isSpotify: true,
    typeLabel: 'Listening to Spotify',
    name: spotify.song || 'Spotify',
    details: null,
    state: spotify.artist || null,
    progressStart: timestamps.start || null,
    progressEnd: timestamps.end || null,
    largeImage: spotify.album_art_url || null,
    smallImage: null,
    largeAlt: spotify.album || spotify.song || 'Album art',
    smallAlt: null
  };
}

function buildActivityView(act) {
  var assets = act.assets || {};
  var typeLabel = ACTIVITY_TYPE_LABELS[act.type] || 'Playing a game';

  if (act.type === 2 && act.name) {
    typeLabel = act.name === 'Spotify' ? 'Listening to Spotify' : 'Listening to ' + act.name;
  }

  if (act.type === 1 && act.name) {
    typeLabel = 'Streaming ' + act.name;
  }

  if (act.type === 5 && act.name) {
    typeLabel = 'Competing in ' + act.name;
  }

  return {
    typeLabel: typeLabel,
    name: act.name || '',
    details: act.details || null,
    state: act.state || null,
    largeImage: resolveAssetUrl(act.application_id, assets.large_image),
    smallImage: resolveAssetUrl(act.application_id, assets.small_image),
    largeAlt: assets.large_text || act.name || 'Activity artwork',
    smallAlt: assets.small_text || act.name || 'Activity icon'
  };
}

function applyPresence(data) {
  var dot = document.getElementById('statusDot');
  if (!dot || !data) return;

  setPresenceLoading(false);

  var status = data.discord_status || 'offline';
  dot.dataset.status = status;

  if (status === 'offline') {
    showPresenceQuip(pickRandom(OFFLINE_QUIPS), true);
    return;
  }

  var views = getActivityViews(data);
  if (!views.length) {
    showPresenceQuip(pickRandom(IDLE_QUIPS), true);
    return;
  }

  renderActivityCards(views);
}

function setOfflineQuip() {
  setPresenceLoading(false);
  showPresenceQuip(pickRandom(OFFLINE_QUIPS), true);
}

function clearLanyardTimers() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleLanyardReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT) {
    setPresenceLoading(false);
    showPresenceQuip("Couldn't connect to Discord.", true);
    return;
  }

  reconnectAttempts += 1;
  var delay = Math.min(1000 * reconnectAttempts, 10000);
  reconnectTimer = setTimeout(connectLanyard, delay);
}

function connectLanyard() {
  if (!DISCORD_USER_ID) return;

  clearLanyardTimers();
  setPresenceLoading(true);

  if (lanyardSocket) {
    lanyardSocket.onclose = null;
    lanyardSocket.close();
    lanyardSocket = null;
  }

  lanyardSocket = new WebSocket(LANYARD_WS);

  lanyardSocket.onopen = function () {
    reconnectAttempts = 0;
  };

  lanyardSocket.onmessage = function (event) {
    var msg;
    try {
      msg = JSON.parse(event.data);
    } catch (err) {
      return;
    }

    if (msg.op === 1 && msg.d && msg.d.heartbeat_interval) {
      heartbeatTimer = setInterval(function () {
        if (lanyardSocket && lanyardSocket.readyState === WebSocket.OPEN) {
          lanyardSocket.send(JSON.stringify({ op: 3 }));
        }
      }, msg.d.heartbeat_interval);

      lanyardSocket.send(JSON.stringify({
        op: 2,
        d: { subscribe_to_id: DISCORD_USER_ID }
      }));
    }

    if (msg.op === 0 && (msg.t === 'INIT_STATE' || msg.t === 'PRESENCE_UPDATE')) {
      applyPresence(msg.d);
    }
  };

  lanyardSocket.onclose = function () {
    clearLanyardTimers();
    lanyardSocket = null;
    scheduleLanyardReconnect();
  };

  lanyardSocket.onerror = function () {
    if (lanyardSocket) {
      lanyardSocket.close();
    }
  };
}

function initDiscordStatus() {
  if (!DISCORD_USER_ID) {
    setOfflineQuip();
    return;
  }

  connectLanyard();
}

function initLocalClock() {
  var clock = document.getElementById('localClock');
  var date = document.getElementById('localDate');
  var tz = document.getElementById('localTz');
  if (!clock) return;

  if (tz) {
    tz.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  function tick() {
    var now = new Date();
    clock.textContent = now.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    if (date) {
      date.textContent = now.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      });
    }
  }

  tick();
  setInterval(tick, 1000);
}

function initCarousel(root) {
  const track = root.querySelector('.carousel-track');
  const slides = root.querySelectorAll('.carousel-slide');
  const prevBtn = root.querySelector('.carousel-btn.prev');
  const nextBtn = root.querySelector('.carousel-btn.next');
  const dotsHost = root.querySelector('.carousel-dots');
  const controls = root.querySelector('.carousel-controls');

  if (!track || !slides.length) return;

  let index = 0;

  function pauseVideos(activeIndex) {
    slides.forEach(function (slide, i) {
      slide.querySelectorAll('video').forEach(function (video) {
        if (i !== activeIndex) {
          video.pause();
        }
      });
    });
  }

  function goTo(nextIndex) {
    index = (nextIndex + slides.length) % slides.length;
    track.style.transform = 'translate3d(-' + index * 100 + '%, 0, 0)';

    if (dotsHost) {
      dotsHost.querySelectorAll('.carousel-dot').forEach(function (dot, i) {
        dot.classList.toggle('active', i === index);
        dot.setAttribute('aria-selected', i === index ? 'true' : 'false');
      });
    }

    pauseVideos(index);
  }

  if (slides.length <= 1) {
    if (controls) controls.hidden = true;
    return;
  }

  slides.forEach(function (_, i) {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('role', 'tab');
    dot.setAttribute('aria-label', 'Slide ' + (i + 1));
    dot.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    dot.addEventListener('click', function () {
      goTo(i);
    });
    dotsHost.appendChild(dot);
  });

  prevBtn.addEventListener('click', function () {
    goTo(index - 1);
  });

  nextBtn.addEventListener('click', function () {
    goTo(index + 1);
  });
}

function downscaleCarouselImage(img) {
  const fullSrc = img.dataset.fullSrc || img.src;
  img.dataset.fullSrc = fullSrc;

  const width = img.clientWidth;
  const height = img.clientHeight;
  if (width < 1 || height < 1) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const targetW = Math.max(1, Math.round(width * dpr));
  const targetH = Math.max(1, Math.round(height * dpr));
  const cacheKey = targetW + 'x' + targetH;

  if (img.dataset.thumbKey === cacheKey) return;

  const loader = new Image();
  loader.decoding = 'async';
  loader.onload = function () {
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(loader, 0, 0, targetW, targetH);
    img.src = canvas.toDataURL('image/jpeg', 0.84);
    img.dataset.thumbKey = cacheKey;
  };
  loader.src = fullSrc;
}

function initCarouselThumbnails() {
  document.querySelectorAll('.carousel-viewport').forEach(function (viewport) {
    const imgs = viewport.querySelectorAll('.carousel-slide img');

    function update() {
      imgs.forEach(downscaleCarouselImage);
    }

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(update);
      observer.observe(viewport);
    }

    update();
  });
}

function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }

  return new Promise(function (resolve, reject) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:none;outline:none;opacity:0';
    document.body.appendChild(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);

    try {
      if (document.execCommand('copy')) {
        resolve();
      } else {
        reject(new Error('Copy failed'));
      }
    } catch (err) {
      reject(err);
    } finally {
      document.body.removeChild(area);
    }
  });
}

function initCopyButtons() {
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const text = btn.getAttribute('data-copy');
      if (!text) return;

      function showCopied() {
        const original = btn.innerHTML;
        const originalLabel = btn.getAttribute('aria-label');
        btn.innerHTML =
          '<svg class="project-install-copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<polyline points="20 6 9 17 4 12"></polyline>' +
          '</svg>';
        btn.setAttribute('aria-label', 'Copied');
        window.setTimeout(function () {
          btn.innerHTML = original;
          btn.setAttribute('aria-label', originalLabel || 'Copy');
        }, 1500);
      }

      copyToClipboard(text).then(showCopied);
    });
  });
}

function initMediaLightbox() {
  const lightbox = document.createElement('div');
  lightbox.className = 'media-lightbox';
  lightbox.hidden = true;
  lightbox.setAttribute('aria-hidden', 'true');

  const dialog = document.createElement('div');
  dialog.className = 'media-lightbox-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Image preview');

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'media-lightbox-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = '&#215;';

  const img = document.createElement('img');
  img.className = 'media-lightbox-img';
  img.alt = '';

  dialog.appendChild(img);
  dialog.appendChild(closeBtn);
  lightbox.appendChild(dialog);
  document.body.appendChild(lightbox);

  let lastFocus = null;

  function fitDialog() {
    if (!img.naturalWidth) return;

    const ratio = img.naturalWidth / img.naturalHeight;
    const pad = Math.max(12, Math.min(window.innerWidth, window.innerHeight) * 0.03);
    const maxW = Math.min(window.innerWidth - pad * 2, 768);
    const maxH = window.innerHeight - pad * 2;
    let w = maxW;
    let h = w / ratio;

    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }

    dialog.style.width = w + 'px';
    dialog.style.height = h + 'px';
  }

  function clearDialogSize() {
    dialog.style.width = '';
    dialog.style.height = '';
  }

  function open(src, alt) {
    img.src = src;
    img.alt = alt || '';
    lastFocus = document.activeElement;
    lightbox.hidden = false;
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lightbox-open');
    closeBtn.focus();

    function onReady() {
      fitDialog();
    }

    if (img.complete && img.naturalWidth) {
      onReady();
    } else {
      img.onload = function () {
        onReady();
        img.onload = null;
      };
    }
  }

  function close() {
    lightbox.hidden = true;
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lightbox-open');
    img.removeAttribute('src');
    clearDialogSize();
    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus();
    }
  }

  document.querySelectorAll('.carousel-slide img').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      open(el.dataset.fullSrc || el.currentSrc || el.src, el.alt);
    });
  });

  closeBtn.addEventListener('click', close);

  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox) {
      close();
    }
  });

  dialog.addEventListener('click', function (e) {
    e.stopPropagation();
  });

  document.addEventListener('keydown', function (e) {
    if (!lightbox.hidden && e.key === 'Escape') {
      close();
    }
  });

  window.addEventListener('resize', function () {
    if (!lightbox.hidden) {
      fitDialog();
    }
  });
}
