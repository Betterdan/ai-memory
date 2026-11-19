import { escapeHtml } from './markdown.js';

const STATUS_ORDER = ['in-progress', 'accepted', 'designed', 'finalized', 'draft', 'planned', 'done'];
const STATUS_LABEL = {
  'in-progress': '进行中',
  accepted: '待生效',
  designed: '已设计',
  finalized: '已定稿',
  draft: '草稿',
  planned: '待定稿',
  done: '已完成',
};

export function buildHtml({ overview, pages, generatedAt, mermaidSource }) {
  const groups = [];
  for (const page of pages) {
    let bucket = groups.find(item => item.group === page.group);
    if (!bucket) { bucket = { group: page.group, pages: [] }; groups.push(bucket); }
    bucket.pages.push(page);
  }

  const nav = groups.map(bucket => [
    '<div class="nav-group">',
    `<div class="nav-title">${escapeHtml(bucket.group)}</div>`,
    ...bucket.pages.map(page =>
      `<a class="nav-item" href="#${page.id}" data-page="${page.id}">${escapeHtml(page.title)}</a>`),
    '</div>',
  ].join('')).join('');

  const articles = pages.map(page => [
    `<article id="${page.id}" class="page" hidden>`,
    `<div class="page-source">${escapeHtml(page.source)}</div>`,
    page.html,
    '</article>',
  ].join('')).join('');

  const body = pages.length ? `${homeArticle(overview)}${articles}` : emptyState();

  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<title>${escapeHtml(overview.projectName || '项目')} · 项目 wiki</title>`,
    `<style>${STYLES}</style>`,
    '</head>',
    '<body>',
    '<button id="menu" class="menu" type="button" aria-label="打开导航" aria-expanded="false" aria-controls="sidebar"><span aria-hidden="true">☰</span></button>',
    '<aside id="sidebar" aria-label="知识库导航">',
    '<div class="brand-label">项目知识库</div>',
    `<div class="brand"><span class="brand-mark" aria-hidden="true">知</span><span>${escapeHtml(overview.projectName || '项目')}</span></div>`,
    '<input id="search" type="search" placeholder="搜索内容…" aria-label="搜索知识库" autocomplete="off">',
    '<p id="search-empty" class="search-empty" role="status" hidden>没有匹配的内容，请尝试其他关键词。</p>',
    '<nav id="nav" aria-label="页面目录">',
    '<div class="nav-group"><a class="nav-item" href="#home" data-page="home">总览</a></div>',
    nav,
    '</nav>',
    `<div class="stamp">${escapeHtml(generatedAt)} 由 ai-memory kb export 生成</div>`,
    '</aside>',
    `<main id="main" tabindex="-1">${body}</main>`,
    ...(mermaidSource ? [`<script>${mermaidSource}</script>`, `<script>${MERMAID_INIT}</script>`] : []),
    `<script>${SCRIPT}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function homeArticle(overview) {
  const counts = overview.counts;
  const byStatus = new Map();
  for (const point of overview.points) {
    if (!byStatus.has(point.status)) byStatus.set(point.status, []);
    byStatus.get(point.status).push(point);
  }
  const known = STATUS_ORDER.filter(status => byStatus.has(status));
  for (const status of byStatus.keys()) if (!known.includes(status)) known.push(status);

  const summary = known.map(status =>
    `<span class="chip"><b>${byStatus.get(status).length}</b> ${escapeHtml(STATUS_LABEL[status] || status)}</span>`
  ).join('') || '<span class="muted">iterations.md 里还没有需求点</span>';

  const blocks = known.map(status => {
    const rows = byStatus.get(status).map(point => [
      '<tr>',
      `<td>${escapeHtml(point.point)}</td>`,
      `<td>${escapeHtml(point.risk)}</td>`,
      `<td>${escapeHtml(point.version)}</td>`,
      `<td>${escapeHtml(point.note)}</td>`,
      '</tr>',
    ].join('')).join('');
    return [
      `<details class="point-group"${status === 'done' ? '' : ' open'}>`,
      `<summary>${escapeHtml(STATUS_LABEL[status] || status)} · ${byStatus.get(status).length}</summary>`,
      '<table><thead><tr><th>需求点</th><th>风险</th><th>版本</th><th>依赖与顺序</th></tr></thead>',
      `<tbody>${rows}</tbody></table>`,
      '</details>',
    ].join('');
  }).join('');

  const facts = [
    ['技术栈', overview.techStack],
    ['当前迭代', overview.iteration],
    ['目标', overview.goal],
    ['主要调用方', overview.consumers],
  ].filter(([, value]) => value).map(([label, value]) =>
    `<div class="fact"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('');

  const composition = [
    ['对外入口', counts.entries],
    ['业务领域', counts.domains],
    ['架构基线', counts.architecture],
    ['需求点定稿', counts.requirements],
    ['技术设计', counts.designs],
    ['决策记录', counts.decisions],
  ].map(([label, value]) => `<span class="chip"><b>${value}</b> ${escapeHtml(label)}</span>`).join('');

  const decisionNote = counts.decisions
    ? `<p class="muted">生效 ${counts.activeDecisions} · 已取代 ${counts.supersededDecisions}</p>`
    : '';

  return [
    '<article id="home" class="page">',
    '<header class="home-header">',
    '<div class="eyebrow">项目知识库 <span aria-hidden="true">/</span> 总览</div>',
    `<h1>${escapeHtml(overview.projectName || '项目')}</h1>`,
    `<div class="facts">${facts}</div>`,
    '</header>',
    '<h2>需求点进度</h2>',
    `<div class="chips">${summary}</div>`,
    blocks,
    '<h2>系统构成</h2>',
    `<div class="chips">${composition}</div>`,
    decisionNote,
    isEmpty(overview) ? gettingStarted() : '',
    '</article>',
  ].join('');
}

// 全新项目会带出一批空模板页,pages 不为 0,所以「有没有实质内容」要单独判断
function isEmpty(overview) {
  const counts = overview.counts;
  return !overview.points.length
    && counts.entries === 0 && counts.domains === 0
    && counts.decisions === 0 && counts.requirements === 0;
}

function gettingStarted() {
  return [
    '<h2>还没有可展示的内容</h2>',
    '<p>这个项目的知识层还是空的。可以从这几步开始:</p>',
    '<ul>',
    '<li>在 <code>.ai/knowledge/entries/</code> 按 README 的模板建第一个入口页</li>',
    '<li>在 <code>.ai/knowledge/iterations.md</code> 登记需求点与状态</li>',
    '<li>在 <code>docs/architecture/</code> 填写系统上下文与数据模型</li>',
    '</ul>',
    '<p>补完之后重新运行 <code>ai-memory kb export</code>。</p>',
  ].join('');
}

function emptyState() {
  return [
    '<article id="home" class="page">',
    '<h1>还没有可展示的内容</h1>',
    '<p>这个项目的知识层还是空的。可以从这几步开始:</p>',
    '<ul>',
    '<li>在 <code>.ai/knowledge/entries/</code> 按 README 的模板建第一个入口页</li>',
    '<li>在 <code>.ai/knowledge/iterations.md</code> 登记需求点与状态</li>',
    '<li>在 <code>docs/architecture/</code> 填写系统上下文与数据模型</li>',
    '</ul>',
    '<p>补完之后重新运行 <code>ai-memory kb export</code>。</p>',
    '</article>',
  ].join('');
}

const STYLES = `
:root{color-scheme:light;--bg:#fbfcfa;--fg:#1c2b25;--muted:#52655b;--line:#d9e2da;--accent:#17624b;--accent-soft:#dcece3;--accent-ink:#174536;--code:#eef3ef;--side:#f2f6f2;--surface:#fff;--focus:#17624b}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#111a16;--fg:#e3eee6;--muted:#b1c2b7;--line:#364b3d;--accent:#9bdab8;--accent-soft:#244438;--accent-ink:#e0f8e8;--code:#1d2b22;--side:#16231b;--surface:#1a2920;--focus:#9bdab8}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,"PingFang SC","Microsoft YaHei",sans-serif;display:flex;min-height:100vh}
aside{width:288px;flex:0 0 288px;height:100vh;position:sticky;top:0;overflow:auto;overscroll-behavior:contain;background:var(--side);border-right:1px solid var(--line);padding:28px 18px 22px}
.brand-label,.eyebrow{color:var(--muted);font-size:12px;font-weight:600;letter-spacing:.05em}
.brand-label{padding:0 8px;margin-bottom:10px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:16px;line-height:1.35;margin:0 0 24px;padding:0 8px;overflow-wrap:anywhere}
.brand-mark{display:grid;place-items:center;flex:0 0 34px;height:34px;background:var(--accent);color:var(--bg);border-radius:10px;font-size:15px}
#search{width:100%;min-height:42px;padding:9px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--fg);font:inherit;font-size:16px;margin-bottom:20px}
#search::placeholder{color:var(--muted);opacity:1}
.search-empty{font-size:13px;color:var(--muted);margin:-8px 8px 18px}
.nav-group{margin-bottom:20px}
.nav-title{font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--muted);margin:0 8px 7px}
.nav-item{display:block;padding:8px 10px;border-radius:8px;color:var(--fg);text-decoration:none;font-size:14px;line-height:1.45;overflow-wrap:anywhere}
@media (hover:hover){.nav-item:hover{background:var(--code)}}
.nav-item.active{background:var(--accent-soft);color:var(--accent-ink);font-weight:700;box-shadow:inset 3px 0 var(--accent)}
.stamp{border-top:1px solid var(--line);padding:18px 8px 0;margin-top:26px;font-size:12px;line-height:1.5;color:var(--muted)}
main{flex:1;min-width:0;padding:56px clamp(28px,5vw,76px) 96px;max-width:1100px}
.menu{display:none;position:fixed;top:12px;right:12px;z-index:10;border:1px solid var(--line);background:var(--surface);color:var(--fg);border-radius:10px;width:44px;height:44px;font-size:20px;cursor:pointer}
:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
main:focus{outline:none}
.page[hidden],[hidden]{display:none!important}
.page{min-width:0;overflow-wrap:anywhere}
.page-source{font-size:12px;color:var(--muted);margin-bottom:22px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
.home-header{padding:0 0 30px;border-bottom:1px solid var(--line);margin-bottom:38px}
.eyebrow span{padding:0 5px;color:var(--accent)}
h1{font-size:clamp(30px,3vw,40px);line-height:1.2;letter-spacing:-.025em;margin:.4em 0 .7em}
h2{font-size:21px;line-height:1.35;margin:2.25em 0 .7em;padding-bottom:.55em;border-bottom:1px solid var(--line)}
h3{font-size:17px;line-height:1.4;margin:1.7em 0 .6em}
p,li{max-width:75ch}
a{color:var(--accent);text-underline-offset:.18em}
code{background:var(--code);padding:.15em .4em;border-radius:5px;font-size:.9em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
pre{background:var(--code);padding:18px 20px;border:1px solid var(--line);border-radius:12px;overflow:auto}
pre code{background:none;padding:0;overflow-wrap:normal}
table{border-collapse:collapse;width:100%;margin:1em 0;display:block;overflow-x:auto;overscroll-behavior-x:contain}
th,td{border-bottom:1px solid var(--line);padding:11px 14px;text-align:left;vertical-align:top;min-width:88px}
th{background:var(--code);color:var(--muted);font-size:13px;white-space:nowrap}
blockquote{margin:1.5em 0;padding:.25em 1em;border-left:3px solid var(--accent);color:var(--muted)}
img{max-width:100%;height:auto}
hr{border:none;border-top:1px solid var(--line);margin:2em 0}
.facts{display:flex;flex-wrap:wrap;gap:12px 26px;margin-top:18px}
.fact{display:flex;gap:7px;align-items:baseline;min-width:0;flex-wrap:wrap}
.fact span{color:var(--muted);font-size:13px}
.fact b{font-size:14px;font-weight:600;overflow-wrap:anywhere}
.chips{display:flex;flex-wrap:wrap;gap:9px;margin:16px 0 20px}
.chip{background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:7px 12px;font-size:13px;color:var(--muted);line-height:1.4}
.chip b{font-size:15px;color:var(--fg);font-variant-numeric:tabular-nums}
.muted{color:var(--muted)}
.point-group{margin:12px 0;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 18px;overflow-x:auto}
.point-group summary{cursor:pointer;font-weight:700;font-size:14px}
.point-group table{display:table;min-width:300px;margin:14px 0 0;font-size:14px}
.point-group tr:last-child td{border-bottom:0}
@media (max-width:640px){
body{display:block}
aside{position:fixed;left:0;top:0;bottom:0;width:82%;max-width:320px;z-index:9;transform:translateX(-100%);visibility:hidden;transition:transform .2s,visibility .2s;height:100%;box-shadow:0 0 0 100vmax transparent}
aside.open{transform:translateX(0);visibility:visible;box-shadow:0 0 0 100vmax rgba(0,0,0,.35)}
main{padding:76px 20px 64px;max-width:none}
.home-header{padding-bottom:24px;margin-bottom:30px}
.facts{gap:9px 18px}
.point-group{padding:12px}
.point-group th,.point-group td{min-width:0;padding:9px 7px}
.menu{display:block}
}
@media (prefers-reduced-motion:reduce){aside{transition:none}}
`;

const SCRIPT = `
(function(){
  var nav=document.getElementById('nav');
  var pages=document.querySelectorAll('.page');
  var sidebar=document.getElementById('sidebar');
  var main=document.getElementById('main');
  var menu=document.getElementById('menu');
  var search=document.getElementById('search');
  var searchEmpty=document.getElementById('search-empty');

  function closeMenu(){
    if(sidebar) sidebar.classList.remove('open');
    if(menu){ menu.setAttribute('aria-expanded','false'); menu.setAttribute('aria-label','打开导航'); }
  }

  function show(id){
    var menuWasOpen=sidebar && sidebar.classList.contains('open');
    var found=false;
    pages.forEach(function(page){
      var match=page.id===id;
      page.hidden=!match;
      if(match) found=true;
    });
    if(!found && pages.length){ pages[0].hidden=false; id=pages[0].id; }
    nav.querySelectorAll('.nav-item').forEach(function(item){
      var active=item.getAttribute('data-page')===id;
      item.classList.toggle('active',active);
      if(active) item.setAttribute('aria-current','page'); else item.removeAttribute('aria-current');
    });
    closeMenu();
    if(menuWasOpen && main) main.focus({preventScroll:true});
    window.scrollTo(0,0);
    if(window.__renderMermaid) window.__renderMermaid();
  }

  nav.addEventListener('click',function(event){
    var link=event.target.closest('.nav-item');
    if(!link || event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    var id=link.getAttribute('data-page');
    history.replaceState(null,'','#'+id);
    show(id);
  });

  if(menu && sidebar) menu.addEventListener('click',function(){
    var opened=sidebar.classList.toggle('open');
    menu.setAttribute('aria-expanded',String(opened));
    menu.setAttribute('aria-label',opened?'关闭导航':'打开导航');
  });
  window.addEventListener('keydown',function(event){
    if(event.key==='Escape' && sidebar && sidebar.classList.contains('open')){ closeMenu(); if(menu) menu.focus(); }
  });

  if(search) search.addEventListener('input',function(){
    var term=search.value.trim().toLowerCase();
    var total=0;
    nav.querySelectorAll('.nav-group').forEach(function(group){
      var visible=0;
      group.querySelectorAll('.nav-item').forEach(function(item){
        var page=document.getElementById(item.getAttribute('data-page'));
        var haystack=(item.textContent+' '+(page?page.textContent:'')).toLowerCase();
        var hit=!term||haystack.indexOf(term)>=0;
        item.style.display=hit?'':'none';
        if(hit){ visible++; total++; }
      });
      var title=group.querySelector('.nav-title');
      if(title) title.style.display=visible?'':'none';
    });
    if(searchEmpty) searchEmpty.hidden=!term || total>0;
  });

  // 浏览器给出的 hash 是百分号编码的,中文 id 不解码就永远匹配不上
  function current(){
    var raw=(location.hash||'#home').slice(1);
    try{ return decodeURIComponent(raw); }catch(err){ return raw; }
  }

  // 页内链接改写成了 #id,点击只改 hash,需要据此切页;浏览器后退同理
  window.addEventListener('hashchange',function(){ show(current()); });

  show(current());
})();
`;

// 页面默认 hidden,隐藏元素渲染出来的 SVG 尺寸为 0,
// 所以只渲染当前可见且尚未处理的图,由 show() 每次切换时调用
const MERMAID_INIT = `
(function(){
  if(typeof mermaid==='undefined') return;
  var dark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
  mermaid.initialize({startOnLoad:false,theme:dark?'dark':'default'});
  window.__renderMermaid=function(){
    var nodes=[].slice.call(document.querySelectorAll('.mermaid')).filter(function(node){
      return !node.getAttribute('data-processed') && node.offsetParent!==null;
    });
    if(!nodes.length) return;
    try{ mermaid.run({nodes:nodes}); }catch(err){ console.error('mermaid 渲染失败',err); }
  };
})();
`;
