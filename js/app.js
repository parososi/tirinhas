/* =============================================
   TIRINHAS — app.js
   Lógica de navegação, roteamento e animações
   ============================================= */

'use strict';

// ── Estado global ──
const State = {
  tirinhas: [],        // Array ordenado por data (mais recente primeiro)
  personagens: [],     // Array de personagens
  currentIndex: 0,     // Índice atual no array
  isAnimating: false,  // Trava durante transições
  archivePage: 0,      // Página atual do arquivo
  ARCHIVE_PER_PAGE: 10, // Tirinhas por página no arquivo
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

// ── Cursor customizado ──
function initCursor() {
  const cursor = document.getElementById('cursor');
  if (!cursor) return;

  document.addEventListener('mousemove', (e) => {
    cursor.style.left = e.clientX + 'px';
    cursor.style.top  = e.clientY + 'px';
  });

  document.addEventListener('mouseenter', () => { cursor.style.opacity = '1'; });
  document.addEventListener('mouseleave', () => { cursor.style.opacity = '0'; });

  const interactives = 'a, button, [role="button"], input, label, select';
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest(interactives)) cursor.classList.add('expanded');
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest(interactives)) cursor.classList.remove('expanded');
  });
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

// ── Roteamento por hash ──
function getTargetIndex() {
  const hash = window.location.hash;
  if (!hash) return 0;

  const match = hash.match(/^#tirinha-(\d+)$/);
  if (!match) return 0;

  const id = parseInt(match[1], 10);
  const idx = State.tirinhas.findIndex(t => t.id === id);
  return idx >= 0 ? idx : 0;
}

function updateHash(index) {
  const tirinha = State.tirinhas[index];
  if (!tirinha) return;
  const newHash = `#tirinha-${tirinha.id}`;
  if (window.location.hash !== newHash) {
    history.replaceState(null, '', newHash);
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
  // Bloqueia menu de contexto (botão direito) em imagens e frames de tirinha
  document.addEventListener('contextmenu', (e) => {
    const target = e.target;
    if (
      target.tagName === 'IMG' ||
      target.closest('.comic-frame') ||
      target.closest('.archive-item-img') ||
      target.closest('.lightbox-img-wrap') ||
      target.closest('.personagem-img-col')
    ) {
      e.preventDefault();
    }
  });

  // Bloqueia arrasto de imagens
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

  // Bloqueia menu de contexto dentro do lightbox
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  // Fecha ao clicar no overlay (fora da imagem)
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.classList.contains('lightbox-caption')) {
      closeLightbox();
    }
  });

  // Botão fechar
  el.querySelector('#lightbox-close').addEventListener('click', closeLightbox);

  // Tecla Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _lightbox && _lightbox.classList.contains('active')) {
      closeLightbox();
    }
  });

  return el;
}

function openLightbox(src, alt) {
  if (!_lightbox) _lightbox = createLightbox();

  const img = document.getElementById('lightbox-img');
  if (img) {
    img.src = src;
    img.alt = alt || '';
  }

  _lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  if (!_lightbox) return;
  _lightbox.classList.remove('active');
  document.body.style.overflow = '';
}

function initLightbox() {
  // Cria o lightbox no DOM
  _lightbox = createLightbox();

  // Listener de clique no frame da tirinha (abre lightbox)
  const frame = document.getElementById('comic-frame');
  if (!frame) return;

  frame.addEventListener('click', () => {
    const img = frame.querySelector('img');
    if (img && img.src) openLightbox(img.src, img.alt);
  });

  // Dica "toque para ampliar" (somente touch devices — via CSS display:none para desktop)
  const hint = document.createElement('p');
  hint.className = 'comic-tap-hint';
  hint.setAttribute('aria-hidden', 'true');
  hint.textContent = '↑ toque na imagem para ampliar';
  frame.insertAdjacentElement('afterend', hint);
}

// ── Renderizar tirinha ──
function renderComic(index, animate = false, direction = 'none') {
  const tirinha = State.tirinhas[index];
  if (!tirinha) return;

  State.currentIndex = index;
  updateHash(index);
  preloadAdjacent(index);

  const frame   = $('#comic-frame');
  const title   = $('#comic-title');
  const date    = $('#comic-date');
  const comment = $('#comic-comment');
  const counter = $('#comic-counter');
  const btnPrev = $('#btn-prev');
  const btnNext = $('#btn-next');

  if (!frame) return;

  if (animate) {
    [title?.parentElement, comment].forEach(el => {
      if (!el) return;
      el.classList.remove('fade-update');
      void el.offsetWidth;
      el.classList.add('fade-update');
    });
  }

  if (title)   title.textContent  = tirinha.titulo;
  if (date)    date.textContent   = formatDate(tirinha.data);
  if (counter) counter.textContent = `${State.tirinhas.length - index} / ${State.tirinhas.length}`;

  if (comment) {
    if (tirinha.comentario && tirinha.comentario.trim()) {
      comment.textContent = tirinha.comentario;
      comment.hidden = false;
    } else {
      comment.hidden = true;
    }
  }

  if (animate && direction !== 'none') {
    const outClass = direction === 'next' ? 'slide-out-left'  : 'slide-out-right';
    const inClass  = direction === 'next' ? 'slide-in-left'   : 'slide-in-right';

    frame.classList.add(outClass);

    setTimeout(() => {
      updateFrameImage(frame, tirinha);
      frame.classList.remove(outClass);
      frame.classList.add(inClass);

      frame.addEventListener('animationend', () => {
        frame.classList.remove(inClass);
        State.isAnimating = false;
      }, { once: true });
    }, 200);
  } else {
    updateFrameImage(frame, tirinha);
    State.isAnimating = false;
  }

  if (btnPrev) {
    const hasPrev = index < State.tirinhas.length - 1;
    btnPrev.classList.toggle('disabled', !hasPrev);
    btnPrev.setAttribute('aria-disabled', String(!hasPrev));
    if (hasPrev) btnPrev.title = State.tirinhas[index + 1].titulo;
  }

  if (btnNext) {
    const hasNext = index > 0;
    btnNext.classList.toggle('disabled', !hasNext);
    btnNext.setAttribute('aria-disabled', String(!hasNext));
    if (hasNext) btnNext.title = State.tirinhas[index - 1].titulo;
  }
}

function updateFrameImage(frame, tirinha) {
  frame.innerHTML = '';
  const img = document.createElement('img');
  img.src     = tirinha.imagem;
  img.alt     = tirinha.alt || tirinha.titulo;
  img.loading = 'eager';
  img.draggable = false;
  frame.appendChild(img);
}

function preloadAdjacent(index) {
  [index - 1, index + 1].forEach(i => {
    if (i >= 0 && i < State.tirinhas.length) {
      const pre = new Image();
      pre.src = State.tirinhas[i].imagem;
    }
  });
}

// ── Navegação ──
function navigate(direction) {
  if (State.isAnimating) return;

  const newIndex = direction === 'next'
    ? State.currentIndex - 1
    : State.currentIndex + 1;

  if (newIndex < 0 || newIndex >= State.tirinhas.length) return;

  State.isAnimating = true;
  renderComic(newIndex, true, direction);
}

function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   navigate('prev');
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown')  navigate('next');
  });
}

function initSwipe() {
  let startX = 0, startY = 0;

  document.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 40) return;
    if (dx < 0) navigate('next');
    else         navigate('prev');
  }, { passive: true });
}

// ── Mostrar/ocultar loading ──
function showLoading() {
  const reader  = $('#comic-reader-content');
  const loading = $('#loading-state');
  if (reader)  reader.hidden  = true;
  if (loading) loading.hidden = false;
}

function hideLoading() {
  const reader  = $('#comic-reader-content');
  const loading = $('#loading-state');
  if (loading) loading.hidden = true;
  if (reader)  reader.hidden  = false;
}

function showError(msg) {
  const error   = $('#error-state');
  const loading = $('#loading-state');
  const reader  = $('#comic-reader-content');
  if (loading) loading.hidden = true;
  if (reader)  reader.hidden  = true;
  if (error) {
    error.hidden = false;
    const p = $('p', error);
    if (p) p.textContent = msg;
  }
}

// ── Init — Leitor (index.html) ──
async function initReader() {
  showLoading();
  initCursor();
  initImageProtection();
  updateHeaderDateline();

  try {
    await loadData();

    if (State.tirinhas.length === 0) {
      showError('Nenhuma tirinha encontrada.');
      return;
    }

    hideLoading();

    const targetIndex = getTargetIndex();
    renderComic(targetIndex);
    initLightbox();
    initKeyboard();
    initSwipe();

    const btnPrev = $('#btn-prev');
    const btnNext = $('#btn-next');
    if (btnPrev) btnPrev.addEventListener('click', () => navigate('prev'));
    if (btnNext) btnNext.addEventListener('click', () => navigate('next'));

    window.addEventListener('hashchange', () => {
      const idx = getTargetIndex();
      if (idx !== State.currentIndex) {
        State.isAnimating = false;
        renderComic(idx, true, idx < State.currentIndex ? 'next' : 'prev');
      }
    });

  } catch (err) {
    console.error('Erro ao carregar tirinhas:', err);
    showError('Não foi possível carregar as tirinhas. Tente novamente mais tarde.');
  }
}

// ── Pesquisa no arquivo ──
function searchTirinhas(query, total) {
  if (!query.trim()) return null; // null = sem pesquisa (mostra paginação normal)

  const q = query.toLowerCase().trim();

  return State.tirinhas.filter((t, globalIdx) => {
    const num = String(total - globalIdx).padStart(3, '0');
    const numPlain = String(total - globalIdx);

    // Busca por número: "1", "001", "#001", "#1"
    const numQuery = q.replace(/^#/, '');
    if (/^\d+$/.test(numQuery)) {
      if (num === numQuery.padStart(3, '0') || numPlain === numQuery) return true;
    }

    // Busca por título
    if (t.titulo.toLowerCase().includes(q)) return true;

    // Busca por hashtag
    if (t.hashtags && t.hashtags.some(h => h.toLowerCase().includes(q))) return true;

    return false;
  });
}

// ── Init — Arquivo (arquivo.html) ──
async function initArchive() {
  initCursor();
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

    // ── Renderizar item de arquivo ──
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

    // ── Renderizar página paginada ──
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

    // ── Renderizar resultados de pesquisa ──
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

      // Esconde paginação durante pesquisa
      const paginationEl = $('#archive-pagination');
      if (paginationEl) paginationEl.hidden = true;
    }

    // ── Evento de pesquisa ──
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
  initCursor();
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
      // Card como link para a página wiki do personagem
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
  initCursor();
  initImageProtection();
  updateHeaderDateline();

  const loadingEl  = $('#personagem-loading');
  const contentEl  = $('#personagem-content');
  const notFoundEl = $('#personagem-not-found');

  // Lê o id da URL (?id=1)
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

    // Atualiza o título da página
    document.title = `${p.nome} — Tirinhas`;

    // Popula os campos
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

    // Imagem do personagem
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
