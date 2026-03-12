/* =============================================
   TIRINHAS — app.js
   Lógica de navegação, feed e animações
   ============================================= */

'use strict';

// ── Estado global ──
const State = {
  tirinhas: [],        // Array ordenado por data (mais recente primeiro)
  personagens: [],     // Array de personagens
  currentIndex: 0,     // Índice atual (modo reader legado)
  isAnimating: false,  // Trava durante transições
  archivePage: 0,      // Página atual do arquivo
  ARCHIVE_PER_PAGE: 10,
  feedPage: 0,         // Página atual do feed
  FEED_PER_PAGE: 6,    // Tirinhas por página no feed
};

// ── Utilitários ──
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).replace('.', '');
}

function formatDateShort(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).replace('.', '');
}

// ── Carregar dados com timeout ──
async function loadData() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch('./data/tirinhas.json', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    State.tirinhas = (json.tirinhas || []).sort((a, b) =>
      new Date(b.data) - new Date(a.data)
    );
    State.personagens = json.personagens || [];
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ── Atualizar dateline do header ──
function updateHeaderDateline() {
  const el = document.getElementById('header-date');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ── Proteção de imagens ──
function initImageProtection() {
  document.addEventListener('contextmenu', (e) => {
    const target = e.target;
    if (
      target.tagName === 'IMG' ||
      target.closest('.feed-comic-frame') ||
      target.closest('.comic-frame') ||
      target.closest('.archive-item-img') ||
      target.closest('.lightbox-img-wrap') ||
      target.closest('.personagem-img-col')
    ) {
      e.preventDefault();
    }
  });

  document.addEventListener('dragstart', (e) => {
    if (e.target.tagName === 'IMG') {
      e.preventDefault();
    }
  });
}

// ── Lightbox ──
let _lightbox = null;

function createLightbox() {
  const el = document.createElement('div');
  el.className = 'lightbox-overlay';
  el.id = 'lightbox';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Imagem ampliada');
  el.innerHTML = `
    <div class="lightbox-img-wrap" id="lightbox-img-wrap">
      <img id="lightbox-img" src="" alt="" draggable="false">
    </div>
    <button class="lightbox-close" id="lightbox-close" aria-label="Fechar imagem">✕</button>
    <p class="lightbox-caption">clique fora para fechar · esc</p>
  `;
  document.body.appendChild(el);

  el.addEventListener('contextmenu', (e) => e.preventDefault());

  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.classList.contains('lightbox-caption')) {
      closeLightbox();
    }
  });

  el.querySelector('#lightbox-close').addEventListener('click', closeLightbox);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _lightbox && _lightbox.classList.contains('active')) {
      closeLightbox();
    }
  });

  return el;
}

function openLightbox(src, alt) {
  if (!_lightbox) _lightbox = createLightbox();

  const wrap = document.getElementById('lightbox-img-wrap');
  if (wrap) {
    // Recria a img para reiniciar a animação sempre que abrir
    const oldImg = wrap.querySelector('img');
    if (oldImg) oldImg.remove();
    const img = document.createElement('img');
    img.id = 'lightbox-img';
    img.src = src;
    img.alt = alt || '';
    img.draggable = false;
    wrap.appendChild(img);
  }

  _lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  if (!_lightbox) return;
  _lightbox.classList.remove('active');
  document.body.style.overflow = '';
}

// ── Scroll Reveal (Intersection Observer) ──
function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.08,
    rootMargin: '0px 0px -40px 0px',
  });

  $$('.reveal').forEach(el => observer.observe(el));
}

// ── Mostrar/ocultar loading (feed) ──
function showFeedLoading() {
  const loading = $('#loading-state');
  const feed    = $('#comic-feed');
  const pag     = $('#feed-pagination');
  if (loading) loading.hidden = false;
  if (feed)    feed.hidden    = true;
  if (pag)     pag.hidden     = true;
}

function hideFeedLoading() {
  const loading = $('#loading-state');
  const feed    = $('#comic-feed');
  const pag     = $('#feed-pagination');
  if (loading) loading.hidden = true;
  if (feed)    feed.hidden    = false;
  if (pag)     pag.hidden     = false;
}

function showFeedError(msg) {
  const loading = $('#loading-state');
  const error   = $('#error-state');
  const feed    = $('#comic-feed');
  if (loading) loading.hidden = true;
  if (feed)    feed.hidden    = true;
  if (error) {
    error.hidden = false;
    const p = $('p', error);
    if (p) p.textContent = msg;
  }
}

// ── Construir artigo de tirinha no feed ──
function buildFeedComic(tirinha, displayNum, isFirst) {
  if (!_lightbox) _lightbox = createLightbox();

  const article = document.createElement('article');
  article.className = 'feed-comic reveal';
  article.id = `tirinha-${tirinha.id}`;

  const commentHTML = (tirinha.comentario && tirinha.comentario.trim())
    ? `<blockquote class="feed-comic-comment">${tirinha.comentario}</blockquote>`
    : '';

  article.innerHTML = `
    <header class="feed-comic-header">
      <span class="feed-comic-num">#${String(displayNum).padStart(3, '0')}</span>
      <h2 class="feed-comic-title">${tirinha.titulo}</h2>
      <time class="feed-comic-date" datetime="${tirinha.data}">${formatDate(tirinha.data)}</time>
    </header>
    <div class="feed-comic-frame" role="img" aria-label="${tirinha.alt || tirinha.titulo}" tabindex="0" title="Clique para ampliar">
      <img
        src="${tirinha.imagem}"
        alt="${tirinha.alt || tirinha.titulo}"
        loading="${isFirst ? 'eager' : 'lazy'}"
        draggable="false"
      >
    </div>
    <p class="feed-comic-hint" aria-hidden="true">↑ clique para ampliar</p>
    ${commentHTML}
  `;

  // Lightbox ao clicar no frame
  const frame = article.querySelector('.feed-comic-frame');
  const openAction = () => {
    const img = frame.querySelector('img');
    if (img && img.src) openLightbox(img.src, img.alt);
  };
  frame.addEventListener('click', openAction);
  frame.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAction(); }
  });

  return article;
}

// ── Renderizar página do feed ──
function renderFeedPage(page) {
  State.feedPage = page;

  const feed  = $('#comic-feed');
  const info  = $('#feed-page-info');
  const prev  = $('#feed-prev');
  const next  = $('#feed-next');

  if (!feed) return;

  // Animação de saída rápida
  feed.style.opacity = '0';
  feed.style.transform = 'translateY(10px)';
  feed.style.transition = 'opacity 0.18s ease, transform 0.18s ease';

  setTimeout(() => {
    feed.innerHTML = '';

    const total      = State.tirinhas.length;
    const totalPages = Math.ceil(total / State.FEED_PER_PAGE);
    const start      = page * State.FEED_PER_PAGE;
    const end        = Math.min(start + State.FEED_PER_PAGE, total);
    const slice      = State.tirinhas.slice(start, end);

    slice.forEach((tirinha, i) => {
      const globalIdx  = start + i;
      const displayNum = total - globalIdx;
      const article    = buildFeedComic(tirinha, displayNum, i === 0 && page === 0);
      feed.appendChild(article);

      // Divisor ornamentado (exceto após o último)
      if (i < slice.length - 1) {
        const divider = document.createElement('hr');
        divider.className = 'feed-divider';
        divider.setAttribute('aria-hidden', 'true');
        feed.appendChild(divider);
      }
    });

    // Fade de entrada
    feed.style.opacity = '1';
    feed.style.transform = 'translateY(0)';

    // Scroll reveal
    initScrollReveal();

    // Paginação
    if (info) info.textContent = `${page + 1} / ${totalPages}`;

    if (prev) {
      prev.disabled = page === 0;
      prev.classList.toggle('disabled', page === 0);
    }
    if (next) {
      next.disabled = page >= totalPages - 1;
      next.classList.toggle('disabled', page >= totalPages - 1);
    }

    const pag = $('#feed-pagination');
    if (pag) pag.hidden = totalPages <= 1;

    // Scroll ao topo suavemente ao trocar de página (exceto primeira carga)
    if (page > 0 || feed.dataset.initialized) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    feed.dataset.initialized = '1';

  }, 180);
}

// ── Init — Feed (index.html) ──
async function initReader() {
  showFeedLoading();
  initImageProtection();
  updateHeaderDateline();

  try {
    await loadData();

    if (State.tirinhas.length === 0) {
      showFeedError('Nenhuma tirinha encontrada.');
      return;
    }

    hideFeedLoading();
    renderFeedPage(0);

    const prev = $('#feed-prev');
    const next = $('#feed-next');

    if (prev) prev.addEventListener('click', () => {
      if (State.feedPage > 0) renderFeedPage(State.feedPage - 1);
    });

    if (next) next.addEventListener('click', () => {
      const totalPages = Math.ceil(State.tirinhas.length / State.FEED_PER_PAGE);
      if (State.feedPage < totalPages - 1) renderFeedPage(State.feedPage + 1);
    });

  } catch (err) {
    console.error('Erro ao carregar tirinhas:', err);
    showFeedError('Não foi possível carregar as tirinhas. Tente novamente mais tarde.');
  }
}

// ── Pesquisa no arquivo ──
function searchTirinhas(query, total) {
  if (!query.trim()) return null;

  const q = query.toLowerCase().trim();

  return State.tirinhas.filter((t, globalIdx) => {
    const num = String(total - globalIdx).padStart(3, '0');
    const numPlain = String(total - globalIdx);

    const numQuery = q.replace(/^#/, '');
    if (/^\d+$/.test(numQuery)) {
      if (num === numQuery.padStart(3, '0') || numPlain === numQuery) return true;
    }

    if (t.titulo.toLowerCase().includes(q)) return true;
    if (t.hashtags && t.hashtags.some(h => h.toLowerCase().includes(q))) return true;

    return false;
  });
}

// ── Init — Arquivo (arquivo.html) ──
async function initArchive() {
  initImageProtection();
  updateHeaderDateline();

  const list        = $('#archive-list');
  const loading     = $('#archive-loading');
  const counter     = $('#archive-total');
  const pgPrev      = $('#page-prev');
  const pgNext      = $('#page-next');
  const pgInfo      = $('#page-info');
  const searchInput = $('#archive-search');
  const searchInfo  = $('#archive-search-results');

  if (!list) return;

  try {
    await loadData();

    if (loading) loading.hidden = true;

    const total = State.tirinhas.length;

    if (counter) {
      counter.textContent = `${total} tirinha${total !== 1 ? 's' : ''}`;
    }

    function buildArchiveItem(tirinha, displayNum) {
      const item = document.createElement('a');
      item.href = `index.html#tirinha-${tirinha.id}`;
      item.className = 'archive-item';
      item.setAttribute('aria-label', `${tirinha.titulo} — ${formatDateShort(tirinha.data)}`);

      const hashtagsText = tirinha.hashtags ? tirinha.hashtags.join(' ') : '';
      const hashtagsHTML = hashtagsText
        ? `<div class="archive-item-hashtags">${hashtagsText}</div>`
        : '';

      item.innerHTML = `
        <div class="archive-item-img">
          <img src="${tirinha.imagem}" alt="${tirinha.alt || tirinha.titulo}" loading="lazy" draggable="false">
        </div>
        <div class="archive-item-body">
          <div class="archive-item-title">${tirinha.titulo}</div>
          <div class="archive-item-date">${formatDateShort(tirinha.data)}</div>
          ${hashtagsHTML}
        </div>
        <div class="archive-item-num">#${String(displayNum).padStart(3, '0')}</div>
      `;

      return item;
    }

    function renderPage(page) {
      State.archivePage = page;
      list.innerHTML = '';

      const start = page * State.ARCHIVE_PER_PAGE;
      const end   = Math.min(start + State.ARCHIVE_PER_PAGE, total);
      const slice = State.tirinhas.slice(start, end);
      const totalPages = Math.ceil(total / State.ARCHIVE_PER_PAGE);

      slice.forEach((tirinha, i) => {
        const globalIdx = start + i;
        const displayNum = total - globalIdx;
        list.appendChild(buildArchiveItem(tirinha, displayNum));
      });

      if (pgInfo) pgInfo.textContent = `Pág. ${page + 1} / ${totalPages}`;

      if (pgPrev) {
        pgPrev.disabled = page === 0;
        pgPrev.classList.toggle('disabled', page === 0);
      }
      if (pgNext) {
        pgNext.disabled = page >= totalPages - 1;
        pgNext.classList.toggle('disabled', page >= totalPages - 1);
      }

      const paginationEl = $('#archive-pagination');
      if (paginationEl) paginationEl.hidden = totalPages <= 1;
    }

    function renderSearchResults(results) {
      list.innerHTML = '';

      if (results.length === 0) {
        list.innerHTML = '<p style="padding:1.5rem 0;color:var(--ink-light);font-size:0.85rem">Nenhuma tirinha encontrada.</p>';
        if (searchInfo) searchInfo.textContent = '0 resultados';
        return;
      }

      results.forEach((tirinha) => {
        const globalIdx = State.tirinhas.indexOf(tirinha);
        const displayNum = total - globalIdx;
        list.appendChild(buildArchiveItem(tirinha, displayNum));
      });

      if (searchInfo) {
        searchInfo.textContent = `${results.length} resultado${results.length !== 1 ? 's' : ''} encontrado${results.length !== 1 ? 's' : ''}`;
      }

      const paginationEl = $('#archive-pagination');
      if (paginationEl) paginationEl.hidden = true;
    }

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim();
        if (!q) {
          if (searchInfo) searchInfo.textContent = '';
          renderPage(0);
        } else {
          const results = searchTirinhas(q, total);
          renderSearchResults(results || []);
        }
      });
    }

    renderPage(0);

    if (pgPrev) pgPrev.addEventListener('click', () => {
      if (State.archivePage > 0) renderPage(State.archivePage - 1);
    });
    if (pgNext) pgNext.addEventListener('click', () => {
      const totalPages = Math.ceil(total / State.ARCHIVE_PER_PAGE);
      if (State.archivePage < totalPages - 1) renderPage(State.archivePage + 1);
    });

  } catch (err) {
    console.error('Erro ao carregar arquivo:', err);
    if (loading) loading.innerHTML = '<p style="color:var(--ink-light)">Erro ao carregar o arquivo.</p>';
    else list.innerHTML = '<p style="color:var(--ink-light);padding:2rem 0">Erro ao carregar o arquivo.</p>';
  }
}

// ── Init — Personagens (personagens.html) ──
async function initPersonagens() {
  updateHeaderDateline();

  const grid    = $('#characters-grid');
  const loading = $('#characters-loading');
  const counter = $('#characters-total');

  if (!grid) return;

  try {
    await loadData();

    if (loading) loading.hidden = true;

    const personagens = State.personagens;

    if (counter) {
      counter.textContent = `${personagens.length} personagem${personagens.length !== 1 ? 'ns' : ''}`;
    }

    if (personagens.length === 0) {
      grid.innerHTML = '<p style="padding:2rem 0;color:var(--ink-light)">Nenhum personagem cadastrado ainda.</p>';
      return;
    }

    personagens.forEach(p => {
      const card = document.createElement('a');
      card.className = 'character-card';
      card.href = `personagem.html?id=${p.id}`;
      card.setAttribute('aria-label', `Ver perfil de ${p.nome}`);

      const traitsHTML = (p.caracteristicas || [])
        .map(t => `<span class="character-trait">${t}</span>`)
        .join('');

      card.innerHTML = `
        <div class="character-card-img">
          <span class="char-placeholder" aria-hidden="true">◉</span>
        </div>
        <div class="character-card-body">
          <div class="character-name">${p.nome}</div>
          <div class="character-alias">${p.apelido || ''}</div>
          <p class="character-desc">${p.descricao || ''}</p>
          ${traitsHTML ? `<div class="character-traits">${traitsHTML}</div>` : ''}
          <div class="character-debut">
            1ª aparição: tirinha #${p.primeira_aparicao}
          </div>
        </div>
      `;

      grid.appendChild(card);
    });

  } catch (err) {
    console.error('Erro ao carregar personagens:', err);
    if (loading) loading.innerHTML = '<p style="color:var(--ink-light)">Erro ao carregar personagens.</p>';
  }
}

// ── Init — Personagem individual (personagem.html) ──
async function initPersonagem() {
  initImageProtection();
  updateHeaderDateline();

  const loadingEl  = $('#personagem-loading');
  const contentEl  = $('#personagem-content');
  const notFoundEl = $('#personagem-not-found');

  const params = new URLSearchParams(window.location.search);
  const id = parseInt(params.get('id'), 10);

  if (!id || isNaN(id)) {
    if (loadingEl) loadingEl.hidden = true;
    if (notFoundEl) notFoundEl.hidden = false;
    return;
  }

  try {
    await loadData();

    if (loadingEl) loadingEl.hidden = true;

    const p = State.personagens.find(x => x.id === id);

    if (!p) {
      if (notFoundEl) notFoundEl.hidden = false;
      return;
    }

    document.title = `${p.nome} — Tirinhas`;

    const nomeEl     = $('#personagem-nome');
    const apelidoEl  = $('#personagem-apelido');
    const descEl     = $('#personagem-descricao');
    const traitsEl   = $('#personagem-traits');
    const hashtagEl  = $('#personagem-hashtag');
    const debutEl    = $('#personagem-debut');
    const imgCol     = $('#personagem-img-col');

    if (nomeEl)    nomeEl.textContent   = p.nome;
    if (apelidoEl) apelidoEl.textContent = p.apelido || '';
    if (descEl)    descEl.textContent = p.descricao || '';

    if (traitsEl) {
      traitsEl.innerHTML = (p.caracteristicas || [])
        .map(t => `<span class="personagem-trait">${t}</span>`)
        .join('');
    }

    if (hashtagEl && p.hashtag) {
      hashtagEl.textContent = p.hashtag;
    }

    if (debutEl) {
      debutEl.innerHTML = `1ª aparição: <a href="index.html#tirinha-${p.primeira_aparicao}">tirinha #${p.primeira_aparicao}</a>`;
    }

    if (imgCol) {
      if (p.imagem && !p.imagem.includes('placeholder')) {
        const img = document.createElement('img');
        img.src = p.imagem;
        img.alt = `Imagem de ${p.nome}`;
        img.draggable = false;
        imgCol.appendChild(img);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'personagem-img-placeholder';
        placeholder.setAttribute('aria-hidden', 'true');
        placeholder.textContent = '◉';
        imgCol.appendChild(placeholder);
      }
    }

    if (contentEl) contentEl.hidden = false;

  } catch (err) {
    console.error('Erro ao carregar personagem:', err);
    if (loadingEl) loadingEl.hidden = true;
    if (notFoundEl) notFoundEl.hidden = false;
  }
}

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'reader')      initReader();
  if (page === 'archive')     initArchive();
  if (page === 'personagens') initPersonagens();
  if (page === 'personagem')  initPersonagem();
});
