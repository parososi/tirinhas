/* =============================================
   HUMBERTO INCERTO — app.js
   Lógica de navegação, feed, carrossel e animações
   ============================================= */

'use strict';

// ── Estado global ──
const State = {
  tirinhas:    [],    // Array ordenado por data (mais recente primeiro)
  personagens: [],    // Array de personagens
  gridPage:    0,     // Página atual do grid (home)
  GRID_PER_PAGE: 8,   // Tirinhas por página no grid
  archivePage:  0,    // Página atual do arquivo
  ARCHIVE_PER_PAGE: 12,
};

// ── Utilitários ──
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// Formata data para exibição: "12 mar 2026"
function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).replace('.', '');
}

// ── Carregar dados JSON com timeout de segurança ──
async function loadData() {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch('./data/tirinhas.json', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    // Ordena por data, mais recente primeiro
    State.tirinhas    = (json.tirinhas || []).sort((a, b) => new Date(b.data) - new Date(a.data));
    State.personagens = json.personagens || [];
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ── Atualiza a dateline no header com a data atual ──
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

// ── Proteção de imagens: bloqueia arraste e menu de contexto ──
function initImageProtection() {
  document.addEventListener('contextmenu', (e) => {
    const t = e.target;
    if (
      t.tagName === 'IMG' ||
      t.closest('.hero-frame') ||
      t.closest('.strip-card-img') ||
      t.closest('.archive-item-img') ||
      t.closest('.lightbox-img-wrap') ||
      t.closest('.personagem-img-col')
    ) {
      e.preventDefault();
    }
  });

  document.addEventListener('dragstart', (e) => {
    if (e.target.tagName === 'IMG') e.preventDefault();
  });
}

// ── Scroll Reveal via IntersectionObserver ──
function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -30px 0px' });

  $$('.reveal').forEach(el => observer.observe(el));
}

// ─────────────────────────────────────────────
//  LIGHTBOX — CARROSSEL DE QUADROS
//  Suporta tirinha com múltiplos quadros (painéis)
//  ou imagem única como fallback
// ─────────────────────────────────────────────
let _lightbox      = null;
let _lbQuadros     = [];   // array de imagens/quadros da tirinha atual
let _lbCurrentIdx  = 0;    // índice do quadro exibido
let _lbTitle       = '';   // título da tirinha

function createLightbox() {
  const el = document.createElement('div');
  el.className = 'lightbox-overlay';
  el.id = 'lightbox';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Leitura da tirinha');

  el.innerHTML = `
    <div class="lightbox-inner">
      <div class="lightbox-img-wrap" id="lb-img-wrap">
        <img id="lb-img" src="" alt="" draggable="false">
      </div>
      <div class="lightbox-controls" id="lb-controls">
        <button class="lightbox-btn" id="lb-prev" aria-label="Quadro anterior">← Anterior</button>
        <span class="lightbox-counter" id="lb-counter" aria-live="polite"></span>
        <button class="lightbox-btn" id="lb-next" aria-label="Próximo quadro">Próximo →</button>
      </div>
      <p class="lightbox-title" id="lb-title"></p>
    </div>
    <button class="lightbox-close" id="lb-close" aria-label="Fechar">✕</button>
    <p class="lightbox-caption">clique fora para fechar · esc · ← →</p>
  `;

  document.body.appendChild(el);

  // Fechar ao clicar fora do inner
  el.addEventListener('click', (e) => {
    if (e.target === el) closeLightbox();
  });

  el.querySelector('#lb-close').addEventListener('click', closeLightbox);
  el.querySelector('#lb-prev').addEventListener('click', () => showQuadro(_lbCurrentIdx - 1));
  el.querySelector('#lb-next').addEventListener('click', () => showQuadro(_lbCurrentIdx + 1));

  // Navegação por teclado
  document.addEventListener('keydown', (e) => {
    if (!_lightbox || !_lightbox.classList.contains('active')) return;
    if (e.key === 'Escape')      closeLightbox();
    if (e.key === 'ArrowLeft')   showQuadro(_lbCurrentIdx - 1);
    if (e.key === 'ArrowRight')  showQuadro(_lbCurrentIdx + 1);
  });

  // Bloqueia menu de contexto dentro do lightbox
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  return el;
}

// Exibe um quadro específico pelo índice
function showQuadro(idx) {
  if (idx < 0 || idx >= _lbQuadros.length) return;
  _lbCurrentIdx = idx;

  const img     = document.getElementById('lb-img');
  const counter = document.getElementById('lb-counter');
  const prev    = document.getElementById('lb-prev');
  const next    = document.getElementById('lb-next');
  const ctrl    = document.getElementById('lb-controls');

  if (img) {
    img.src = _lbQuadros[idx];
    img.alt = `${_lbTitle} — quadro ${idx + 1}`;
    // Reinicia a animação de entrada
    img.style.animation = 'none';
    img.offsetHeight;    // force reflow
    img.style.animation = '';
  }

  const total = _lbQuadros.length;

  if (counter) counter.textContent = total > 1 ? `${idx + 1} / ${total}` : '';

  // Mostra controles só se houver mais de um quadro
  if (ctrl) ctrl.style.display = total > 1 ? 'flex' : 'none';

  if (prev) prev.disabled = idx === 0;
  if (next) next.disabled = idx === total - 1;
}

// Abre o lightbox com os quadros de uma tirinha
function openLightbox(tirinha) {
  if (!_lightbox) _lightbox = createLightbox();

  // Define a lista de quadros — usa quadros[] se disponível, senão imagem única
  _lbQuadros    = (tirinha.quadros && tirinha.quadros.length > 0)
    ? tirinha.quadros
    : [tirinha.imagem];
  _lbTitle = tirinha.titulo;

  const titleEl = document.getElementById('lb-title');
  if (titleEl) titleEl.textContent = _lbTitle;

  showQuadro(0);

  _lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  if (!_lightbox) return;
  _lightbox.classList.remove('active');
  document.body.style.overflow = '';
}

// ─────────────────────────────────────────────
//  PÁGINA INICIAL — Hero + Grid 3 colunas
// ─────────────────────────────────────────────

// Constrói a seção hero com a tirinha mais recente
function buildHero(tirinha, displayNum) {
  const hero  = document.getElementById('hero-section');
  if (!hero) return;

  const commentHTML = (tirinha.comentario && tirinha.comentario.trim())
    ? `<blockquote class="hero-comment">${tirinha.comentario}</blockquote>`
    : '';

  hero.innerHTML = `
    <p class="hero-eyebrow">Tirinha mais recente</p>
    <h2 class="hero-title">${tirinha.titulo}</h2>
    <div class="hero-meta">
      <span class="hero-num">#${String(displayNum).padStart(3, '0')}</span>
      <time class="hero-date" datetime="${tirinha.data}">${formatDate(tirinha.data)}</time>
    </div>
    <div class="hero-frame"
         role="button"
         tabindex="0"
         aria-label="Ler tirinha: ${tirinha.titulo}"
         title="Clique para ler quadro a quadro">
      <img
        src="${tirinha.imagem}"
        alt="${tirinha.alt || tirinha.titulo}"
        loading="eager"
        draggable="false"
      >
    </div>
    <p class="hero-hint" aria-hidden="true">↑ clique para ler quadro a quadro</p>
    ${commentHTML}
  `;

  // Abre lightbox ao clicar no hero
  const frame = hero.querySelector('.hero-frame');
  const openAction = () => openLightbox(tirinha);
  frame.addEventListener('click', openAction);
  frame.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAction(); }
  });

  hero.hidden = false;
}

// Constrói um card de tirinha para o grid
function buildStripCard(tirinha, displayNum, isEager) {
  const card = document.createElement('article');
  card.className = 'strip-card reveal';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Ler tirinha: ${tirinha.titulo}`);

  card.innerHTML = `
    <div class="strip-card-img">
      <img
        src="${tirinha.imagem}"
        alt="${tirinha.alt || tirinha.titulo}"
        loading="${isEager ? 'eager' : 'lazy'}"
        draggable="false"
      >
    </div>
    <div class="strip-card-body">
      <div class="strip-card-num">#${String(displayNum).padStart(3, '0')}</div>
      <div class="strip-card-title">${tirinha.titulo}</div>
      <time class="strip-card-date" datetime="${tirinha.data}">${formatDate(tirinha.data)}</time>
    </div>
  `;

  const openAction = () => openLightbox(tirinha);
  card.addEventListener('click', openAction);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAction(); }
  });

  return card;
}

// Renderiza página do grid de tirinhas anteriores
function renderGridPage(page) {
  State.gridPage = page;

  const grid    = document.getElementById('strips-grid');
  const info    = document.getElementById('grid-page-info');
  const prev    = document.getElementById('grid-prev');
  const next    = document.getElementById('grid-next');
  const section = document.getElementById('grid-section');
  const pagEl   = document.getElementById('grid-pagination');

  if (!grid) return;

  const total      = State.tirinhas.length;
  // O primeiro item já é exibido no hero — grid começa do índice 1
  const rest       = State.tirinhas.slice(1);
  const totalPages = Math.ceil(rest.length / State.GRID_PER_PAGE);
  const start      = page * State.GRID_PER_PAGE;
  const slice      = rest.slice(start, start + State.GRID_PER_PAGE);

  // Animação de saída
  grid.style.opacity   = '0';
  grid.style.transform = 'translateY(8px)';
  grid.style.transition = 'opacity 0.16s ease, transform 0.16s ease';

  setTimeout(() => {
    grid.innerHTML = '';

    slice.forEach((tirinha, i) => {
      // displayNum: conta a partir do total, pulando o hero (índice 0)
      const globalIdx  = 1 + start + i;  // +1 porque o hero ocupa o índice 0
      const displayNum = total - globalIdx;
      grid.appendChild(buildStripCard(tirinha, displayNum, false));
    });

    grid.style.opacity   = '1';
    grid.style.transform = 'translateY(0)';

    initScrollReveal();

    // Paginação
    if (info) info.textContent = totalPages > 1 ? `${page + 1} / ${totalPages}` : '';
    if (prev) {
      prev.disabled = page === 0;
      prev.classList.toggle('disabled', page === 0);
    }
    if (next) {
      next.disabled = page >= totalPages - 1;
      next.classList.toggle('disabled', page >= totalPages - 1);
    }
    if (pagEl) pagEl.hidden = totalPages <= 1;

    if (section) section.hidden = slice.length === 0;

    if (page > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 160);
}

// ── Init — Página Inicial (index.html) ──
async function initHome() {
  const loadingEl = document.getElementById('loading-state');
  const errorEl   = document.getElementById('error-state');

  initImageProtection();
  updateHeaderDateline();

  try {
    await loadData();

    if (loadingEl) loadingEl.hidden = true;

    if (State.tirinhas.length === 0) {
      if (errorEl) {
        errorEl.hidden = false;
        const p = $('p', errorEl);
        if (p) p.textContent = 'Nenhuma tirinha encontrada.';
      }
      return;
    }

    const total    = State.tirinhas.length;
    const latest   = State.tirinhas[0];    // mais recente = hero
    const heroNum  = total;                // número de exibição do hero

    buildHero(latest, heroNum);
    renderGridPage(0);

    // Eventos de paginação do grid
    const prev = document.getElementById('grid-prev');
    const next = document.getElementById('grid-next');

    if (prev) prev.addEventListener('click', () => {
      if (State.gridPage > 0) renderGridPage(State.gridPage - 1);
    });

    if (next) next.addEventListener('click', () => {
      const rest  = State.tirinhas.slice(1);
      const total = Math.ceil(rest.length / State.GRID_PER_PAGE);
      if (State.gridPage < total - 1) renderGridPage(State.gridPage + 1);
    });

  } catch (err) {
    console.error('Erro ao carregar tirinhas:', err);
    if (loadingEl) loadingEl.hidden = true;
    if (errorEl) errorEl.hidden = false;
  }
}

// ─────────────────────────────────────────────
//  PÁGINA ARQUIVO — Lista paginada + pesquisa
// ─────────────────────────────────────────────

// Filtra tirinhas por título, hashtag ou número
function searchTirinhas(query, total) {
  if (!query.trim()) return null;

  const q = query.toLowerCase().trim();

  return State.tirinhas.filter((t, globalIdx) => {
    const num      = String(total - globalIdx).padStart(3, '0');
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

async function initArchive() {
  initImageProtection();
  updateHeaderDateline();

  const list        = document.getElementById('archive-list');
  const loading     = document.getElementById('archive-loading');
  const counter     = document.getElementById('archive-total');
  const pgPrev      = document.getElementById('page-prev');
  const pgNext      = document.getElementById('page-next');
  const pgInfo      = document.getElementById('page-info');
  const searchInput = document.getElementById('archive-search');
  const searchInfo  = document.getElementById('archive-search-results');

  if (!list) return;

  try {
    await loadData();

    if (loading) loading.hidden = true;

    const total = State.tirinhas.length;

    if (counter) counter.textContent = `${total} tirinha${total !== 1 ? 's' : ''}`;

    // Constrói item da lista do arquivo
    function buildArchiveItem(tirinha, displayNum) {
      const item = document.createElement('div');
      item.className = 'archive-item';
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.setAttribute('aria-label', `Ler ${tirinha.titulo} — ${formatDate(tirinha.data)}`);

      const hashtagsText = tirinha.hashtags ? tirinha.hashtags.join(' ') : '';
      const hashtagsHTML = hashtagsText
        ? `<div class="archive-item-hashtags">${hashtagsText}</div>` : '';

      item.innerHTML = `
        <div class="archive-item-img">
          <img src="${tirinha.imagem}" alt="${tirinha.alt || tirinha.titulo}" loading="lazy" draggable="false">
        </div>
        <div class="archive-item-body">
          <div class="archive-item-title">${tirinha.titulo}</div>
          <div class="archive-item-date">${formatDate(tirinha.data)}</div>
          ${hashtagsHTML}
        </div>
        <div class="archive-item-num">#${String(displayNum).padStart(3, '0')}</div>
      `;

      const openAction = () => openLightbox(tirinha);
      item.addEventListener('click', openAction);
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAction(); }
      });

      return item;
    }

    function renderPage(page) {
      State.archivePage = page;
      list.innerHTML    = '';

      const start      = page * State.ARCHIVE_PER_PAGE;
      const end        = Math.min(start + State.ARCHIVE_PER_PAGE, total);
      const slice      = State.tirinhas.slice(start, end);
      const totalPages = Math.ceil(total / State.ARCHIVE_PER_PAGE);

      slice.forEach((tirinha, i) => {
        const globalIdx  = start + i;
        const displayNum = total - globalIdx;
        list.appendChild(buildArchiveItem(tirinha, displayNum));
      });

      if (pgInfo)  pgInfo.textContent = totalPages > 1 ? `Pág. ${page + 1} / ${totalPages}` : '';
      if (pgPrev) {
        pgPrev.disabled = page === 0;
        pgPrev.classList.toggle('disabled', page === 0);
      }
      if (pgNext) {
        pgNext.disabled = page >= totalPages - 1;
        pgNext.classList.toggle('disabled', page >= totalPages - 1);
      }

      const pagEl = document.getElementById('archive-pagination');
      if (pagEl) pagEl.hidden = totalPages <= 1;
    }

    function renderSearchResults(results) {
      list.innerHTML = '';

      if (results.length === 0) {
        list.innerHTML = '<p style="padding:1.5rem 0;color:var(--text-tertiary);font-size:0.85rem;font-style:italic">Nenhuma tirinha encontrada.</p>';
        if (searchInfo) searchInfo.textContent = '0 resultados';
        return;
      }

      results.forEach((tirinha) => {
        const globalIdx  = State.tirinhas.indexOf(tirinha);
        const displayNum = total - globalIdx;
        list.appendChild(buildArchiveItem(tirinha, displayNum));
      });

      if (searchInfo) {
        searchInfo.textContent = `${results.length} resultado${results.length !== 1 ? 's' : ''} encontrado${results.length !== 1 ? 's' : ''}`;
      }

      const pagEl = document.getElementById('archive-pagination');
      if (pagEl) pagEl.hidden = true;
    }

    // Pesquisa em tempo real
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim();
        if (!q) {
          if (searchInfo) searchInfo.textContent = '';
          renderPage(0);
        } else {
          renderSearchResults(searchTirinhas(q, total) || []);
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
    if (loading) loading.innerHTML = '<p style="color:var(--text-tertiary);font-style:italic">Erro ao carregar o arquivo.</p>';
    else list.innerHTML = '<p style="color:var(--text-tertiary);padding:2rem 0;font-style:italic">Erro ao carregar o arquivo.</p>';
  }
}

// ─────────────────────────────────────────────
//  PÁGINA PERSONAGENS — Grid de cards
// ─────────────────────────────────────────────
async function initPersonagens() {
  updateHeaderDateline();

  const grid    = document.getElementById('characters-grid');
  const loading = document.getElementById('characters-loading');
  const counter = document.getElementById('characters-total');

  if (!grid) return;

  try {
    await loadData();

    if (loading) loading.hidden = true;

    const personagens = State.personagens;

    if (counter) {
      counter.textContent = `${personagens.length} personagem${personagens.length !== 1 ? 'ns' : ''}`;
    }

    if (personagens.length === 0) {
      grid.innerHTML = '<p style="padding:2rem 0;color:var(--text-tertiary);font-style:italic">Nenhum personagem cadastrado ainda.</p>';
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

      // Imagem ou placeholder tipográfico
      const imgHTML = (p.imagem && !p.imagem.includes('placeholder'))
        ? `<img src="${p.imagem}" alt="Ilustração de ${p.nome}" loading="lazy" draggable="false">`
        : `<span class="char-placeholder" aria-hidden="true">${p.nome.charAt(0)}</span>`;

      card.innerHTML = `
        <div class="character-card-img">${imgHTML}</div>
        <div class="character-card-body">
          <div class="character-name">${p.nome}</div>
          <div class="character-alias">${p.apelido || ''}</div>
          <p class="character-desc">${p.descricao || ''}</p>
          ${traitsHTML ? `<div class="character-traits">${traitsHTML}</div>` : ''}
          <div class="character-debut">1ª aparição: tirinha #${p.primeira_aparicao}</div>
        </div>
      `;

      grid.appendChild(card);
    });

  } catch (err) {
    console.error('Erro ao carregar personagens:', err);
    if (loading) loading.innerHTML = '<p style="color:var(--text-tertiary);font-style:italic">Erro ao carregar personagens.</p>';
  }
}

// ─────────────────────────────────────────────
//  PÁGINA PERSONAGEM — Perfil individual
// ─────────────────────────────────────────────
async function initPersonagem() {
  initImageProtection();
  updateHeaderDateline();

  const loadingEl  = document.getElementById('personagem-loading');
  const contentEl  = document.getElementById('personagem-content');
  const notFoundEl = document.getElementById('personagem-not-found');

  const params = new URLSearchParams(window.location.search);
  const id     = parseInt(params.get('id'), 10);

  if (!id || isNaN(id)) {
    if (loadingEl)  loadingEl.hidden  = true;
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

    document.title = `${p.nome} — Humberto Incerto`;

    const nomeEl    = document.getElementById('personagem-nome');
    const apelidoEl = document.getElementById('personagem-apelido');
    const descEl    = document.getElementById('personagem-descricao');
    const traitsEl  = document.getElementById('personagem-traits');
    const hashEl    = document.getElementById('personagem-hashtag');
    const debutEl   = document.getElementById('personagem-debut');
    const imgCol    = document.getElementById('personagem-img-col');

    if (nomeEl)    nomeEl.textContent    = p.nome;
    if (apelidoEl) apelidoEl.textContent = p.apelido || '';
    if (descEl)    descEl.textContent    = p.descricao || '';

    if (traitsEl) {
      traitsEl.innerHTML = (p.caracteristicas || [])
        .map(t => `<span class="personagem-trait">${t}</span>`)
        .join('');
    }

    if (hashEl && p.hashtag) hashEl.textContent = p.hashtag;

    if (debutEl) {
      debutEl.innerHTML = `1ª aparição: <a href="index.html#tirinha-${p.primeira_aparicao}">tirinha #${p.primeira_aparicao}</a>`;
    }

    if (imgCol) {
      if (p.imagem && !p.imagem.includes('placeholder')) {
        const img = document.createElement('img');
        img.src       = p.imagem;
        img.alt       = `Ilustração de ${p.nome}`;
        img.draggable = false;
        imgCol.appendChild(img);
      } else {
        const ph = document.createElement('div');
        ph.className = 'personagem-img-placeholder';
        ph.setAttribute('aria-hidden', 'true');
        ph.textContent = p.nome.charAt(0);
        imgCol.appendChild(ph);
      }
    }

    if (contentEl) contentEl.hidden = false;

  } catch (err) {
    console.error('Erro ao carregar personagem:', err);
    if (loadingEl)  loadingEl.hidden  = true;
    if (notFoundEl) notFoundEl.hidden = false;
  }
}

// ─────────────────────────────────────────────
//  PÁGINA SOBRE — apenas atualiza dateline
// ─────────────────────────────────────────────
function initSobre() {
  updateHeaderDateline();
}

// ── Bootstrap — detecta página pelo atributo data-page ──
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;

  if (page === 'home')        initHome();
  if (page === 'archive')     initArchive();
  if (page === 'personagens') initPersonagens();
  if (page === 'personagem')  initPersonagem();
  if (page === 'sobre')       initSobre();
});
