const CLASSES = [
  { id: 'all', label: '全部' },
  { id: 'warrior', label: '战士' },
  { id: 'mage', label: '法师' },
  { id: 'priest', label: '牧师' },
  { id: 'archer', label: '射手' },
  { id: 'knight', label: '骑士' },
];

let allRows = [];
let activeClass = 'all';
let query = '';

function norm(s) {
  return (s ?? '').toString().toLowerCase();
}

function matchesQuery(row, q) {
  if (!q) return true;
  const hay = norm(
    [
      row.id,
      row.nameZh,
      row.classLabel,
      row.ageArchetype,
      row.appealTier,
      row.summary,
      row.prompt,
      row.spritePrompt ?? '',
      ...(row.tags || []),
    ].join('\n'),
  );
  return q.split(/\s+/).every((t) => t.length === 0 || hay.includes(t));
}

function filtered() {
  return allRows.filter((row) => {
    if (activeClass !== 'all' && row.class !== activeClass) return false;
    return matchesQuery(row, norm(query.trim()));
  });
}

function renderTabs() {
  const nav = document.getElementById('tabs');
  nav.innerHTML = '';
  for (const c of CLASSES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = c.label;
    b.dataset.class = c.id;
    b.setAttribute('aria-pressed', c.id === activeClass ? 'true' : 'false');
    b.addEventListener('click', () => {
      activeClass = c.id;
      [...nav.querySelectorAll('button')].forEach((btn) =>
        btn.setAttribute('aria-pressed', btn.dataset.class === activeClass ? 'true' : 'false'),
      );
      renderGrid();
    });
    nav.appendChild(b);
  }
}

function renderGrid() {
  const grid = document.getElementById('grid');
  const status = document.getElementById('status');
  const tpl = document.getElementById('card-tpl');
  const rows = filtered();

  grid.innerHTML = '';
  status.textContent =
    rows.length === 0
      ? '没有匹配的设定集。'
      : `显示 ${rows.length} / ${allRows.length} 套 · 职业：${CLASSES.find((c) => c.id === activeClass)?.label ?? ''}`;

  for (const row of rows) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector('.name').textContent = row.nameZh;
    node.querySelector('.meta').textContent = [
      row.classLabel,
      row.ageArchetype,
      row.appealTier === 'alluring' ? '魅力：张力向' : row.appealTier === 'cute' ? '魅力：少年感' : '魅力：气质',
      row.id,
    ].join(' · ');

    const tagWrap = node.querySelector('.tags');
    tagWrap.innerHTML = '';
    for (const t of row.tags || []) {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = t;
      tagWrap.appendChild(span);
    }

    node.querySelector('.summary').textContent = row.summary;
    node.querySelector('.prompt-splash').textContent = row.prompt;
    node.querySelector('.prompt-sprite').textContent = row.spritePrompt ?? '';

    const btnSplash = node.querySelector('.copy-splash');
    const btnSprite = node.querySelector('.copy-sprite');
    const labelSplash = '复制';
    const labelSprite = '复制';

    btnSplash.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(row.prompt);
        btnSplash.textContent = '已复制';
        btnSplash.classList.add('copied');
        setTimeout(() => {
          btnSplash.textContent = labelSplash;
          btnSplash.classList.remove('copied');
        }, 1600);
      } catch {
        btnSplash.textContent = '复制失败';
        setTimeout(() => {
          btnSplash.textContent = labelSplash;
        }, 2000);
      }
    });

    btnSprite.addEventListener('click', async () => {
      const text = row.spritePrompt ?? '';
      try {
        await navigator.clipboard.writeText(text);
        btnSprite.textContent = '已复制';
        btnSprite.classList.add('copied');
        setTimeout(() => {
          btnSprite.textContent = labelSprite;
          btnSprite.classList.remove('copied');
        }, 1600);
      } catch {
        btnSprite.textContent = '复制失败';
        setTimeout(() => {
          btnSprite.textContent = labelSprite;
        }, 2000);
      }
    });

    grid.appendChild(node);
  }
}

async function main() {
  const status = document.getElementById('status');
  status.textContent = '加载 manifest.json…';
  try {
    const res = await fetch('./manifest.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.statusText);
    allRows = await res.json();
    if (!Array.isArray(allRows) || allRows.length === 0) throw new Error('manifest 为空');
  } catch (e) {
    status.textContent =
      '无法加载 manifest.json（若用 file:// 打开会因浏览器限制失败）。请运行 npm run dev 或 npm run preview 后访问 /character-prompts/ 。';
    console.error(e);
    return;
  }

  document.getElementById('q').addEventListener('input', (ev) => {
    query = ev.target.value;
    renderGrid();
  });

  renderTabs();
  renderGrid();
  status.textContent = '';
}

main();
