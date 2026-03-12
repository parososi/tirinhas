/* =============================================
   TIRINHAS — app.js
   Lógica de navegação, roteamento e animações
   ============================================= */

'use strict';

// ── Estado global ──
const State = {
  tirinhas: [],       // Array ordenado por data (mais recente primeiro)
  currentIndex: 0,    // Índice atual no array
  isAnimating: false, // Trava durante transições
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

// ── Cursor customizado ──
function initCursor() {
  const cursor = document.getElementById('cursor');
  if (!cursor) return;

  let cx = -100, cy = -100;

  document.addEventListener('mousemove', (e) => {
    cx = e.clientX;
    cy = e.clientY;
    cursor.style.left = cx + 'px';
    cursor.style.top  = cy + 'px';
  });

  document.addEventListener('mouseenter', () => { cursor.style.opacity = '1'; });
  document.addEventListener('mouseleave', () => { cursor.style.opacity = '0'; });

  // Expansão ao hover em elementos interativos
  const interactives = 'a, button, [role="button"], input, label, select';
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest(interactives)) {
      cursor.classList.add('expanded');
    }
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest(interactives)) {
      cursor.classList.remove('expanded');
    }
  });
}

// ── Carregar dados ──
async function loadData() {
  const res = await fetch('./data/tirinhas.json');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();

  // Ordena por data decrescente (mais recente primeiro)
  State.tirinhas = json.tirinhas.sort((a, b) =>
    new Date(b.data) - new Date(a.data)
  );
}

// ── Roteamento por hash ──
function getTargetIndex() {
  const hash = window.location.hash; // e.g. #tirinha-3
  if (!hash) return 0; // Sem hash → mais recente

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

// ── Renderizar tirinha ──
function renderComic(index, animate = false, direction = 'none') {
  const tirinha = State.tirinhas[index];
  if (!tirinha) return;

  State.currentIndex = index;
  updateHash(index);
  preloadAdjacent(index);

  const frame    = $('#comic-frame');
  const title    = $('#comic-title');
  const date     = $('#comic-date');
  const comment  = $('#comic-comment');
  const counter  = $('#comic-counter');
  const btnPrev  = $('#btn-prev');
  const btnNext  = $('#btn-next');

  if (!frame) return;

  // Atualiza texto imediatamente (fadeRefresh via classe)
  if (animate) {
    [title?.parentElement, comment].forEach(el => {
      if (!el) return;
      el.classList.remove('fade-update');
      void el.offsetWidth; // reflow
      el.classList.add('fade-update');
    });
  }

  if (title)    title.textContent   = tirinha.titulo;
  if (date)     date.textContent    = formatDate(tirinha.data);
  if (counter)  counter.textContent = `${State.tirinhas.length - index} / ${State.tirinhas.length}`;

  // Comentário do autor (oculta se vazio)
  if (comment) {
    if (tirinha.comentario && tirinha.comentario.trim()) {
      comment.textContent = tirinha.comentario;
      comment.hidden = false;
    } else {
      comment.hidden = true;
    }
  }

  // Atualiza imagem com animação de slide
  if (animate && direction !== 'none') {
    const outClass = direction === 'next' ? 'slide-out-left' : 'slide-out-right';
    const inClass  = direction === 'next' ? 'slide-in-left'  : 'slide-in-right';

    frame.classList.add(outClass);

    const ANIM_DURATION = 350;
    setTimeout(() => {
      updateFrameImage(frame, tirinha);
      frame.classList.remove(outClass);
      frame.classList.add(inClass);

      frame.addEventListener('animationend', () => {
        frame.classList.remove(inClass);
        State.isAnimating = false;
      }, { once: true });
    }, ANIM_DURATION);
  } else {
    updateFrameImage(frame, tirinha);
    State.isAnimating = false;
  }

  // Atualiza botões
  if (btnPrev) {
    const hasPrev = index < State.tirinhas.length - 1;
    btnPrev.classList.toggle('disabled', !hasPrev);
    btnPrev.setAttribute('aria-disabled', !hasPrev);
    if (hasPrev) {
      const prev = State.tirinhas[index + 1];
      btnPrev.title = prev.titulo;
    }
  }

  if (btnNext) {
    const hasNext = index > 0;
    btnNext.classList.toggle('disabled', !hasNext);
    btnNext.setAttribute('aria-disabled', !hasNext);
    if (hasNext) {
      const next = State.tirinhas[index - 1];
      btnNext.title = next.titulo;
    }
  }
}

function updateFrameImage(frame, tirinha) {
  frame.innerHTML = '';
  const img = document.createElement('img');
  img.src     = tirinha.imagem;
  img.alt     = tirinha.alt || tirinha.titulo;
  img.loading = 'eager'; // já pré-carregado, não usar lazy aqui
  frame.appendChild(img);
}

// ── Pré-carregamento das tirinhas adjacentes ──
function preloadAdjacent(index) {
  const candidates = [index - 1, index + 1];
  candidates.forEach(i => {
    if (i >= 0 && i < State.tirinhas.length) {
      const t = State.tirinhas[i];
      if (t) {
        const pre = new Image();
        pre.src = t.imagem;
      }
    }
  });
}

// ── Navegação ──
function navigate(direction) {
  if (State.isAnimating) return;

  const newIndex = direction === 'next'
    ? State.currentIndex - 1  // próxima = mais recente (índice menor)
    : State.currentIndex + 1; // anterior = mais antiga (índice maior)

  if (newIndex < 0 || newIndex >= State.tirinhas.length) return;

  State.isAnimating = true;
  renderComic(newIndex, true, direction);
}

// ── Teclado ──
function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   navigate('prev');
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown')  navigate('next');
  });
}

// ── Swipe touch ──
function initSwipe() {
  let startX = 0;
  let startY = 0;

  document.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;

    // Ignora swipes predominantemente verticais
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (Math.abs(dx) < 40) return;

    if (dx < 0) navigate('next');
    else         navigate('prev');
  }, { passive: true });
}

// ── Mostrar/ocultar loading ──
function showLoading() {
  const reader = $('#comic-reader-content');
  const loading = $('#loading-state');
  if (reader)  reader.hidden  = true;
  if (loading) loading.hidden = false;
}

function hideLoading() {
  const reader = $('#comic-reader-content');
  const loading = $('#loading-state');
  if (reader)  reader.hidden  = false;
  if (loading) loading.hidden = true;
}

function showError(msg) {
  const error = $('#error-state');
  if (error) {
    error.hidden = false;
    const p = $('p', error);
    if (p) p.textContent = msg;
  }
  const loading = $('#loading-state');
  if (loading) loading.hidden = true;
  const reader = $('#comic-reader-content');
  if (reader) reader.hidden = true;
}

// ── Init — Leitor (index.html) ──
async function initReader() {
  showLoading();
  initCursor();

  try {
    await loadData();

    if (State.tirinhas.length === 0) {
      showError('Nenhuma tirinha encontrada.');
      return;
    }

    hideLoading();

    const targetIndex = getTargetIndex();
    renderComic(targetIndex);
    initKeyboard();
    initSwipe();

    // Navegação pelos botões
    const btnPrev = $('#btn-prev');
    const btnNext = $('#btn-next');

    if (btnPrev) {
      btnPrev.addEventListener('click', () => navigate('prev'));
    }
    if (btnNext) {
      btnNext.addEventListener('click', () => navigate('next'));
    }

    // Reage à mudança do hash (botão voltar do browser)
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

// ── Init — Arquivo (arquivo.html) ──
async function initArchive() {
  initCursor();

  const grid    = $('#archive-grid');
  const loading = $('#archive-loading');
  const counter = $('#archive-total');

  if (!grid) return;

  try {
    await loadData();

    if (loading) loading.hidden = true;

    if (counter) {
      counter.textContent = `${State.tirinhas.length} tirinha${State.tirinhas.length !== 1 ? 's' : ''}`;
    }

    State.tirinhas.forEach((tirinha, idx) => {
      const card = document.createElement('a');
      card.href  = `index.html#tirinha-${tirinha.id}`;
      card.className = 'archive-card';
      card.setAttribute('aria-label', `${tirinha.titulo} — ${formatDate(tirinha.data)}`);

      const isSVG = tirinha.imagem.toLowerCase().endsWith('.svg');
      const imgTag = `<img src="${tirinha.imagem}" alt="${tirinha.alt || tirinha.titulo}" loading="lazy">`;

      card.innerHTML = `
        <div class="archive-card-img">${imgTag}</div>
        <div class="archive-card-body">
          <div class="archive-card-title">${tirinha.titulo}</div>
          <div class="archive-card-date">${formatDate(tirinha.data)}</div>
        </div>
        <span class="archive-card-num">#${String(State.tirinhas.length - idx).padStart(3, '0')}</span>
      `;

      grid.appendChild(card);

      // Stagger de entrada via IntersectionObserver
      const delay = Math.min(idx * 80, 600);
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setTimeout(() => {
              entry.target.style.animationDelay = `${delay}ms`;
              entry.target.classList.add('visible');
            }, 0);
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1 });

      observer.observe(card);
    });

  } catch (err) {
    console.error('Erro ao carregar arquivo:', err);
    if (loading) {
      loading.innerHTML = '<p style="color:var(--ink-light)">Erro ao carregar o arquivo.</p>';
    }
  }
}

// ── Bootstrap ──
// Cada página chama a função correta via atributo data-page
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'reader')  initReader();
  if (page === 'archive') initArchive();
});
