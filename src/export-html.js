import { escapeHtml } from './markdown.js';

const STATUS_ORDER = ['in-progress', 'designed', 'finalized', 'draft', 'planned', 'done'];
const STATUS_LABEL = {
  'in-progress': '进行中',
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
    '<button id="menu" class="menu" type="button" aria-label="导航">☰</button>',
    '<aside id="sidebar">',
    `<div class="brand">${escapeHtml(overview.projectName || '项目')}</div>`,
    '<input id="search" type="search" placeholder="搜索内容…" autocomplete="off">',
    '<nav id="nav">',
    '<div class="nav-group"><a class="nav-item" href="#home" data-page="home">总览</a></div>',
    nav,
    '</nav>',
    `<div class="stamp">${escapeHtml(generatedAt)} 由 ai-memory kb export 生成</div>`,
    '</aside>',
    `<main id="main">${body}</main>`,
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
    `<h1>${escapeHtml(overview.projectName || '项目')}</h1>`,
    `<div class="facts">${facts}</div>`,
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
:root{--bg:#fff;--fg:#1c1e21;--muted:#6b7280;--line:#e5e7eb;--accent:#2563eb;--code:#f6f8fa;--side:#fafafa}
@media (prefers-color-scheme:dark){:root{--bg:#16181c;--fg:#e6e6e6;--muted:#9aa0a6;--line:#2c3038;--accent:#7aa2f7;--code:#1e2128;--side:#1a1d22}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,"PingFang SC","Microsoft YaHei",sans-serif;display:flex}
aside{width:280px;flex:0 0 280px;height:100vh;position:sticky;top:0;overflow:auto;background:var(--side);border-right:1px solid var(--line);padding:20px 16px}
.brand{font-weight:700;font-size:17px;margin-bottom:12px}
#search{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);margin-bottom:16px}
.nav-group{margin-bottom:14px}
.nav-title{font-size:12px;letter-spacing:.08em;color:var(--muted);text-transform:uppercase;margin-bottom:6px}
.nav-item{display:block;padding:5px 8px;border-radius:6px;color:var(--fg);text-decoration:none;font-size:14px}
.nav-item:hover{background:var(--line)}
.nav-item.active{background:var(--accent);color:#fff}
.stamp{margin-top:24px;font-size:12px;color:var(--muted)}
main{flex:1;min-width:0;padding:32px 40px 80px;max-width:900px}
.menu{display:none;position:fixed;top:12px;right:12px;z-index:10;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:8px;padding:8px 12px;font-size:16px}
.page-source{font-size:12px;color:var(--muted);margin-bottom:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
h1{font-size:28px;margin:.2em 0 .6em}
h2{font-size:21px;margin-top:1.8em;padding-bottom:.3em;border-bottom:1px solid var(--line)}
h3{font-size:17px;margin-top:1.5em}
a{color:var(--accent)}
code{background:var(--code);padding:.15em .4em;border-radius:4px;font-size:.9em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
pre{background:var(--code);padding:14px 16px;border-radius:8px;overflow:auto}
pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%;margin:1em 0;display:block;overflow-x:auto}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
th{background:var(--code)}
blockquote{margin:1em 0;padding:.4em 1em;border-left:3px solid var(--line);color:var(--muted)}
img{max-width:100%;height:auto}
hr{border:none;border-top:1px solid var(--line);margin:2em 0}
.facts{display:flex;flex-wrap:wrap;gap:8px 20px;margin-bottom:8px}
.fact span{color:var(--muted);margin-right:6px;font-size:13px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.chip{border:1px solid var(--line);border-radius:999px;padding:4px 12px;font-size:13px}
.chip b{font-size:15px}
.muted{color:var(--muted)}
.point-group{margin:10px 0;border:1px solid var(--line);border-radius:8px;padding:8px 12px}
.point-group summary{cursor:pointer;font-weight:600}
.point-group table{margin:10px 0 4px}
@media (max-width:640px){
body{display:block}
aside{position:fixed;left:0;top:0;bottom:0;width:82%;max-width:320px;z-index:9;transform:translateX(-100%);transition:transform .2s;height:100%}
aside.open{transform:translateX(0)}
main{padding:56px 18px 60px;max-width:none}
.menu{display:block}
}
`;

const SCRIPT = `
(function(){
  var nav=document.getElementById('nav');
  var pages=document.querySelectorAll('.page');
  var sidebar=document.getElementById('sidebar');
  var menu=document.getElementById('menu');
  var search=document.getElementById('search');

  function show(id){
    var found=false;
    pages.forEach(function(page){
      var match=page.id===id;
      page.hidden=!match;
      if(match) found=true;
    });
    if(!found && pages.length){ pages[0].hidden=false; id=pages[0].id; }
    nav.querySelectorAll('.nav-item').forEach(function(item){
      item.classList.toggle('active', item.getAttribute('data-page')===id);
    });
    if(sidebar) sidebar.classList.remove('open');
    window.scrollTo(0,0);
    if(window.__renderMermaid) window.__renderMermaid();
  }

  nav.addEventListener('click',function(event){
    var link=event.target.closest('.nav-item');
    if(!link) return;
    event.preventDefault();
    var id=link.getAttribute('data-page');
    history.replaceState(null,'','#'+id);
    show(id);
  });

  if(menu) menu.addEventListener('click',function(){ sidebar.classList.toggle('open'); });

  if(search) search.addEventListener('input',function(){
    var term=search.value.trim().toLowerCase();
    nav.querySelectorAll('.nav-group').forEach(function(group){
      var visible=0;
      group.querySelectorAll('.nav-item').forEach(function(item){
        var page=document.getElementById(item.getAttribute('data-page'));
        var haystack=(item.textContent+' '+(page?page.textContent:'')).toLowerCase();
        var hit=!term||haystack.indexOf(term)>=0;
        item.style.display=hit?'':'none';
        if(hit) visible++;
      });
      var title=group.querySelector('.nav-title');
      if(title) title.style.display=visible?'':'none';
    });
  });

  show((location.hash||'#home').slice(1));
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
