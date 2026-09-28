window.storage = window.storage || {
  get: async function(k){ return { value: localStorage.getItem(k) }; },
  set: async function(k, v){ localStorage.setItem(k, v); }
};

/* ============================================================
   STATE
   ============================================================ */
let score=0, total=0, streak=0, sessionPts=0;
let recentWords = [];
let current = null; // {type, target, ...}
let checked = false;
let viewMode = 'practice'; // 'practice' | 'review'

const XP_PER_LEVEL = 100;
const BASE_PTS = 10;

/* persistent stats */
let stats = { correct:0, attempts:0, wrong:{}, points:0, bestCombo:0 };
function levelFromPoints(pts){ return Math.floor((pts||0) / XP_PER_LEVEL) + 1; }
function xpInLevel(pts){ return (pts||0) % XP_PER_LEVEL; }
function awardPoints(n){
  sessionPts += n;
  stats.points = (stats.points||0) + n;
  if(streak > (stats.bestCombo||0)) stats.bestCombo = streak;
  saveStats();
  renderXp();
}
function ptsForCorrect(){
  let pts = BASE_PTS;
  if(current && current.type==='I') pts = 25;
  else if(current && (current.type==='D' || current.type==='H2')) pts = 15;
  if(streak >= 8) pts += 15;
  else if(streak >= 5) pts += 10;
  else if(streak >= 3) pts += 5;
  return pts;
}
function renderXp(){
  const pts = stats.points||0;
  const lvl = levelFromPoints(pts);
  const xp = xpInLevel(pts);
  const levelEl = document.getElementById('levelNum');
  const fill = document.getElementById('xpFill');
  const xpNow = document.getElementById('xpNow');
  const sess = document.getElementById('sessionPts');
  if(levelEl) levelEl.textContent = lvl;
  if(fill) fill.style.width = Math.round(xp / XP_PER_LEVEL * 100) + '%';
  if(xpNow) xpNow.textContent = xp;
  if(sess) sess.textContent = sessionPts;
}
function showPtsPop(n, combo){
  const el = document.getElementById('ptsPop');
  if(!el) return;
  el.textContent = combo >= 3 ? `+${n}  COMBO x${combo}` : `+${n}`;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}
async function loadStats(){
  try {
    const r = await window.storage.get('vocab_stats');
    if(r && r.value){
      const parsed = JSON.parse(r.value);
      stats = Object.assign({correct:0, attempts:0, wrong:{}, points:0, bestCombo:0}, parsed);
    }
  } catch(e){}
  renderStatsBar();
  renderXp();
}
async function saveStats(){
  try { await window.storage.set('vocab_stats', JSON.stringify(stats)); } catch(e){}
}
function recordAnswer(target, isCorrect){
  stats.attempts++;
  if(isCorrect){ stats.correct++; }
  else {
    const key = target.w;
    if(!stats.wrong[key]) stats.wrong[key] = {count:0, m:target.m, py:target.py||'', l:target.l, s:target.s};
    stats.wrong[key].count++;
  }
  saveStats();
  renderStatsBar();
}
function renderStatsBar(){
  const el = document.getElementById('statsBar');
  if(!el) return;
  const pct = stats.attempts ? Math.round(stats.correct/stats.attempts*100) : 0;
  const wrongCount = Object.keys(stats.wrong).length;
  el.innerHTML = `正确率 <b>${pct}%</b> (${stats.correct}/${stats.attempts})` +
    (wrongCount ? ` · <span id="reviewLink" style="color:var(--gold);cursor:pointer;text-decoration:underline;">复习错题 (${wrongCount})</span>` : '');
  const link = document.getElementById('reviewLink');
  if(link) link.onclick = showReview;
}

/* ============================================================
   Sound effects (synthesized, no external files needed)
   ============================================================ */
let audioCtx = null;
function getAudioCtx(){
  if(!audioCtx){
    const AC = window.AudioContext || window.webkitAudioContext;
    if(AC) audioCtx = new AC();
  }
  if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function tone(freq, startTime, duration, ctx, gainPeak, type){
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.03);
}
function playCorrectSound(){
  const ctx = getAudioCtx();
  if(!ctx) return;
  const now = ctx.currentTime;
  const notes = [
    {f:523.25, t:0.00, d:0.18, g:0.32},
    {f:659.25, t:0.07, d:0.18, g:0.34},
    {f:783.99, t:0.14, d:0.20, g:0.36},
    {f:1046.5, t:0.22, d:0.32, g:0.38},
    {f:1318.5, t:0.34, d:0.22, g:0.22}
  ];
  notes.forEach(n=>{
    tone(n.f, now + n.t, n.d, ctx, n.g, 'triangle');
    tone(n.f * 2, now + n.t, n.d * 0.45, ctx, n.g * 0.14, 'sine');
  });
}
function playWrongSound(){
  const ctx = getAudioCtx();
  if(!ctx) return;
  const now = ctx.currentTime;
  tone(220, now, 0.16, ctx, 0.20, 'square');
  tone(174.6, now + 0.08, 0.22, ctx, 0.16, 'sine');
}

/* ============================================================
   Star field (background only)
   ============================================================ */
(function initStars(){
  const field = document.getElementById('starfield');
  for(let i=0;i<60;i++){
    const s = document.createElement('span');
    s.style.left = Math.random()*100+'%';
    s.style.top = Math.random()*100+'%';
    s.style.animationDelay = (Math.random()*3)+'s';
    s.style.width = s.style.height = (Math.random()<0.15 ? '3px':'2px');
    field.appendChild(s);
  }
})();

/* ============================================================
   Helpers
   ============================================================ */
function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function escapeHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function levenshtein(a,b){
  const m=a.length, n=b.length;
  const dp = Array.from({length:m+1},()=>new Array(n+1).fill(0));
  for(let i=0;i<=m;i++) dp[i][0]=i;
  for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}
function stripTones(s){
  const map = {'ā':'a','á':'a','ǎ':'a','à':'a','ō':'o','ó':'o','ǒ':'o','ò':'o','ē':'e','é':'e','ě':'e','è':'e',
    'ī':'i','í':'i','ǐ':'i','ì':'i','ū':'u','ú':'u','ǔ':'u','ù':'u','ü':'v','ǖ':'v','ǘ':'v','ǚ':'v','ǜ':'v'};
  return s.split('').map(c=>map[c]||c).join('');
}
function normPy(s){
  return stripTones(s).toLowerCase().replace(/[^a-z]/g,'');
}

function poolFor(needsPy, allowReorderOnly){
  return ALL.filter(e=>{
    if(!allowReorderOnly && e.reorderOnly) return false;
    if(needsPy && !e.py) return false;    return true;
  });
}
function poolForReorder(){
  return ALL.filter(e=>{
    if(!e.chunks) return false;    return true;
  });
}
function poolForCompletion(){
  return ALL.filter(e=>{
    if(e.reorderOnly) return false;
    if(e.s.indexOf('，')===-1) return false;    return true;
  });
}

function pickTarget(pool){
  let candidates = pool.filter(w=>!recentWords.includes(w.w));
  if(candidates.length===0) candidates = pool;
  const t = candidates[Math.floor(Math.random()*candidates.length)];
  recentWords.push(t.w);
  const cap = Math.min(10, Math.max(0,pool.length-1));
  if(recentWords.length>cap) recentWords.shift();
  return t;
}

function pyDistractors(target, count){
  const poolPy = [...new Set(ALL.filter(e=>e.py && e.py!==target.py).map(e=>e.py))];
  const scored = poolPy.map(p=>({p, d:levenshtein(target.py,p)})).sort((a,b)=>a.d-b.d);
  let picks;
  const closeChunk = scored.slice(0, Math.max(count*3,8));
  picks = shuffle(closeChunk).slice(0,count);
  return picks.map(x=>x.p);
}
function wordDistractors(target, count){
  const src = ALL.filter(e=>!e.reorderOnly && e.w!==target.w);
  return shuffle(src).slice(0,count).map(e=>e.w);
}

function buildSentenceParts(target){
  const idx = target.s.indexOf(target.w);
  if(idx===-1) return {before:target.s, mid:target.w, after:''};
  return {before:target.s.slice(0,idx), mid:target.w, after:target.s.slice(idx+target.w.length)};
}

/* ============================================================
   Question type generators
   ============================================================ */
function typeWeights(){ return {A:2,B:2,G:2,D:2,H:1,H2:2,F:2,C:2,I:2}; }
function weightedPick(weights, allowed){
  const keys = Object.keys(weights).filter(k=>allowed.includes(k));
  const total = keys.reduce((s,k)=>s+weights[k],0);
  let r = Math.random()*total;
  for(const k of keys){ r -= weights[k]; if(r<=0) return k; }
  return keys[0];
}

function poolZibian(){
  return ZIBIAN.filter(z=>{    return true;
  });
}
function poolDapei(){
  return DAPEI.filter(d=>{    return true;
  });
}
function poolCompletions(){ return COMPLETIONS; }
function poolPassages(){ return PASSAGES; }

/* review panel */
function showReview(){
  viewMode = 'review';
  document.getElementById('practiceView').style.display='none';
  document.querySelector('.bottombar').style.display='none';
  const rv = document.getElementById('reviewView');
  rv.style.display='block';
  const wrongEntries = Object.entries(stats.wrong).sort((a,b)=>b[1].count-a[1].count);
  let html = '<div class="review-panel">';
  html += '<div class="review-title">错题复习 <button class="review-back" id="backBtn">← 返回练习</button></div>';
  if(wrongEntries.length===0){
    html += '<div class="review-empty">还没有错题，继续加油！ 🎉</div>';
  } else {
    wrongEntries.forEach(([word,info])=>{
      const lessonLabel = info.l || '';
      html += `<div class="review-item">
        <div><div class="review-word">${escapeHtml(word)}</div>
        <div class="review-py pinyin">${escapeHtml(info.py||'')}</div>
        <div class="review-meaning">${escapeHtml(info.m)}</div></div>
        <div class="review-meta"><div class="review-count">错 ${info.count} 次</div>
        <div class="review-lesson">${lessonLabel}</div></div></div>`;
    });
    html += `<button class="review-clear" id="clearWrong">清空错题记录</button>`;
  }
  html += '</div>';
  rv.innerHTML = html;
  document.getElementById('backBtn').onclick = hideReview;
  const clearBtn = document.getElementById('clearWrong');
  if(clearBtn) clearBtn.onclick = ()=>{ stats.wrong={}; saveStats(); showReview(); };
}
function hideReview(){
  viewMode = 'practice';
  document.getElementById('practiceView').style.display='block';
  document.querySelector('.bottombar').style.display='block';
  document.getElementById('reviewView').style.display='none';
}

function nextQuestion(){
  checked = false;
  document.getElementById('feedback').className = 'feedback';
  document.getElementById('feedback').textContent = '';
  const actionBtn = document.getElementById('actionBtn');
  actionBtn.textContent = 'Check';
  actionBtn.disabled = true;
  actionBtn.classList.remove('ok','no');

  const pReorder = poolForReorder();
  const pCompletion = poolForCompletion();
  const pPy = poolFor(true,false);
  const pWord = poolFor(false,false);
  const pZibian = poolZibian();
  const pDapei = poolDapei();
  const pCompletions = poolCompletions();
  const pPassages = poolPassages();

  const allowed = [];
  if(pWord.length) allowed.push('B');
  if(pPy.length){ allowed.push('A'); allowed.push('G'); }
  if(pReorder.length) allowed.push('D');
  if(pCompletion.length) allowed.push('H');
  if(pCompletions.length) allowed.push('H2');
  if(pPassages.length) allowed.push('I');
  if(pZibian.length) allowed.push('F');
  if(pDapei.length>=4) allowed.push('C');

  if(allowed.length===0){
    document.getElementById('sentence').innerHTML = '暂时没有题目，请稍后再试～';
    document.getElementById('instruction').textContent = '';
    document.getElementById('qbody').innerHTML = '';
    return;
  }

  const type = weightedPick(typeWeights(), allowed);
  let target;
  if(type==='D') target = pickTarget(pReorder);
  else if(type==='H') target = pickTarget(pCompletion);
  else if(type==='H2') target = pCompletions[Math.floor(Math.random()*pCompletions.length)];
  else if(type==='I') target = pPassages[Math.floor(Math.random()*pPassages.length)];
  else if(type==='A'||type==='G') target = pickTarget(pPy);
  else if(type==='F') target = pZibian[Math.floor(Math.random()*pZibian.length)];
  else if(type==='C') target = pDapei[Math.floor(Math.random()*pDapei.length)];
  else target = pickTarget(pWord);

  const chipLabels = {A:'拼音',B:'字词',G:'看拼音',D:'组句',H:'完成句',H2:'完成句',F:'字辨',C:'搭配',I:'短文'};
  document.getElementById('lessonChip').textContent = chipLabels[type] || '练习';

  current = {type, target};

  if(type==='A') renderTypeA(target);
  else if(type==='G') renderTypeG(target);
  else if(type==='B') renderTypeB(target);
  else if(type==='D') renderTypeD(target);
  else if(type==='H') renderTypeH(target);
  else if(type==='H2') renderTypeH2(target);
  else if(type==='F') renderTypeF(target);
  else if(type==='C') renderTypeC(target);
  else if(type==='I') renderTypeI(target);
}

function setInstruction(txt){ document.getElementById('instruction').textContent = txt; }
function setQType(txt){ document.getElementById('qType').textContent = txt; }

/* Type A: 拼音选择 - underline target word, pick correct pinyin */
function renderTypeA(target){
  setQType('拼音选择');
  const parts = buildSentenceParts(target);
  document.getElementById('sentence').innerHTML =
    escapeHtml(parts.before) + `<span class="target">${escapeHtml(parts.mid)}</span>` + escapeHtml(parts.after);
  setInstruction('选出划线词语的正确拼音：');
  const options = shuffle([target.py, ...pyDistractors(target,3)]);
  renderOptions(options, target.py, (val)=>val, true);
}

/* Type G: 看拼音选字 - show pinyin cue in place, choose correct hanzi */
function renderTypeG(target){
  setQType('看拼音选字');
  const parts = buildSentenceParts(target);
  document.getElementById('sentence').innerHTML =
    escapeHtml(parts.before) + `<span class="pinyincue">（${escapeHtml(target.py)}）</span>` + escapeHtml(parts.after);
  setInstruction('根据拼音提示，选出正确的词语：');
  const options = shuffle([target.w, ...wordDistractors(target,3)]);
  renderOptions(options, target.w, (val)=>val, false);
}

/* Type B: 字词填空 - blank word, choose from options */
function renderTypeB(target){
  const isIdiom = target.l==='idiom';
  setQType(isIdiom ? '成语填空' : '字词填空');
  const parts = buildSentenceParts(target);
  const blankLen = Math.max(2, target.w.length);
  document.getElementById('sentence').innerHTML =
    escapeHtml(parts.before) + `<span class="blank">${'＿'.repeat(blankLen)}</span>` + escapeHtml(parts.after);
  setInstruction('选出正确的词语，填入句子的空格中：');
  const options = shuffle([target.w, ...wordDistractors(target,3)]);
  renderOptions(options, target.w, (val)=>val, false);
}

/* Common option renderer for A/B/G */
function renderOptions(options, correctVal, getVal, isPinyin){
  const body = document.getElementById('qbody');
  body.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'options';
  options.forEach(optVal=>{
    const b = document.createElement('button');
    b.className = 'opt' + (isPinyin ? ' pinyin' : '');
    b.textContent = optVal;
    b.onclick = ()=>{
      if(checked) return;
      document.querySelectorAll('.opt').forEach(o=>o.classList.remove('selected'));
      b.classList.add('selected');
      current.selected = optVal;
      document.getElementById('actionBtn').disabled = false;
    };
    grid.appendChild(b);
  });
  body.appendChild(grid);
}

/* Type D: 组词成句 - tap tokens in order */
function renderTypeD(target){
  setQType('组词成句');
  document.getElementById('sentence').innerHTML = '<span style="color:#8B7F5E;font-size:.95rem;">把下面的词语按正确顺序排成一句话：</span>';
  setInstruction('');
  const body = document.getElementById('qbody');
  const answerArr = [];
  let bankChunks = shuffle(target.chunks);
  let attempts=0;
  while(JSON.stringify(bankChunks)===JSON.stringify(target.chunks) && attempts<5){ bankChunks = shuffle(target.chunks); attempts++; }

  function render(){
    body.innerHTML = '';
    const az = document.createElement('div');
    az.className = 'answerzone';
    answerArr.forEach((tokText, idx)=>{
      const t = document.createElement('div');
      t.className = 'tok placed';
      t.textContent = tokText;
      t.onclick = ()=>{
        if(checked) return;
        answerArr.splice(idx,1);
        render();
      };
      az.appendChild(t);
    });
    body.appendChild(az);

    const bank = document.createElement('div');
    bank.className = 'bank';
    // show each bank tile unless a matching-text instance has already been placed
    const used = {};
    answerArr.forEach(t=>{ used[t]=(used[t]||0)+1; });
    const shown = {};
    bankChunks.forEach(tokText=>{
      shown[tokText]=(shown[tokText]||0)+1;
      const alreadyUsed = used[tokText]||0;
      if(shown[tokText] <= alreadyUsed) return; // this instance is currently placed in the answer
      const t = document.createElement('div');
      t.className = 'tok';
      t.textContent = tokText;
      t.onclick = ()=>{
        if(checked) return;
        answerArr.push(tokText);
        render();
      };
      bank.appendChild(t);
    });
    body.appendChild(bank);

    document.getElementById('actionBtn').disabled = answerArr.length !== target.chunks.length;
  }
  render();
  current.getAnswer = ()=>answerArr;
}

/* Type H: 完成句子 - pick correct completion after first comma */
function renderTypeH(target){
  setQType('完成句子');
  const idx = target.s.indexOf('，');
  const stem = target.s.slice(0, idx+1);
  const correctCompletion = target.s.slice(idx+1);
  document.getElementById('sentence').innerHTML = escapeHtml(stem) + '<span class="blank">……</span>';
  setInstruction('选出最合适的句子，把它补充完整：');

  const others = ALL.filter(e=>e.s!==target.s && e.s.indexOf('，')>-1 && !e.reorderOnly);
  const distractorCompletions = shuffle(others).slice(0,3).map(e=>{
    const i2 = e.s.indexOf('，');
    return e.s.slice(i2+1);
  });
  const options = shuffle([correctCompletion, ...distractorCompletions]);

  const body = document.getElementById('qbody');
  body.innerHTML = '';
  options.forEach(optVal=>{
    const b = document.createElement('button');
    b.className='opt';
    b.style.gridColumn='1 / -1';
    b.style.textAlign='left';
    b.style.fontSize='1.02rem';
    b.textContent = optVal;
    b.onclick=()=>{
      if(checked) return;
      document.querySelectorAll('.opt').forEach(o=>o.classList.remove('selected'));
      b.classList.add('selected');
      current.selected = optVal;
      document.getElementById('actionBtn').disabled = false;
    };
    body.appendChild(b);
  });
  current.correctVal = correctCompletion;
}

/* Type F: 字辨 - pick the correct look-alike character */
function renderTypeF(target){
  setQType('字辨');
  const parts = target.s.split('___');
  document.getElementById('sentence').innerHTML =
    escapeHtml(parts[0]) + `<span class="blank">＿</span>` + (parts[1] ? escapeHtml(parts[1]):'');
  setInstruction(`根据拼音提示 <span class="pinyin" style="color:var(--ink);font-weight:700;">${escapeHtml(target.py)}</span>，选出正确的汉字：`);
  document.getElementById('instruction').innerHTML = document.getElementById('instruction').textContent;
  // re-render with innerHTML since we used a span
  document.getElementById('instruction').innerHTML =
    `根据拼音提示 <span class="pinyin" style="color:#1B2340;font-weight:700;">${escapeHtml(target.py)}</span>，选出正确的汉字：`;
  const options = shuffle([target.correct, ...target.wrong]);
  const body = document.getElementById('qbody');
  body.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'options';
  options.forEach(optVal=>{
    const b = document.createElement('button');
    b.className = 'opt';
    b.textContent = optVal;
    b.style.fontSize = '1.5rem';
    b.onclick = ()=>{
      if(checked) return;
      document.querySelectorAll('.opt').forEach(o=>o.classList.remove('selected'));
      b.classList.add('selected');
      current.selected = optVal;
      document.getElementById('actionBtn').disabled = false;
    };
    grid.appendChild(b);
  });
  body.appendChild(grid);
}

/* Type C: 词语搭配 - pick the matching collocate */
function renderTypeC(target){
  setQType('词语搭配');
  const showLeft = Math.random() < 0.5;
  const shown = showLeft ? target.left : target.right;
  const answer = showLeft ? target.right : target.left;
  document.getElementById('sentence').innerHTML =
    showLeft ? `${escapeHtml(shown)} + <span class="blank">？</span>` :
              `<span class="blank">？</span> + ${escapeHtml(shown)}`;
  setInstruction('选出最合适的词语搭配：');
  // distractors: other DAPEI entries' matching side
  const others = DAPEI.filter(d=>d!==target);
  const distPool = showLeft ? others.map(d=>d.right) : others.map(d=>d.left);
  const uniqueDist = [...new Set(distPool.filter(d=>d!==answer))];
  const distractors = shuffle(uniqueDist).slice(0,3);
  const options = shuffle([answer, ...distractors]);
  const body = document.getElementById('qbody');
  body.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'options';
  options.forEach(optVal=>{
    const b = document.createElement('button');
    b.className = 'opt';
    b.textContent = optVal;
    b.onclick = ()=>{
      if(checked) return;
      document.querySelectorAll('.opt').forEach(o=>o.classList.remove('selected'));
      b.classList.add('selected');
      current.selected = optVal;
      current.correctVal = answer;
      document.getElementById('actionBtn').disabled = false;
    };
    grid.appendChild(b);
  });
  body.appendChild(grid);
  current.correctVal = answer;
}


function renderTypeH2(target){
  setQType('完成句子');
  const display = target.mode==='prefix'
    ? '<span class="blank">……</span>' + escapeHtml(target.suffix)
    : escapeHtml(target.prefix) + '<span class="blank">……</span>';
  document.getElementById('sentence').innerHTML = display;
  setInstruction('选出最合适的部分，把句子补充完整：');
  const body = document.getElementById('qbody'); body.innerHTML=''; shuffle(target.options.slice()).forEach(optVal=>{
    const b = document.createElement('button');
    b.className='opt';
    b.style.gridColumn='1 / -1';
    b.style.textAlign='left';
    b.style.fontSize='1.02rem';
    b.textContent = optVal;
    b.onclick=()=>{
      if(checked) return;
      document.querySelectorAll('.opt').forEach(o=>o.classList.remove('selected'));
      b.classList.add('selected');
      current.selected = optVal;
      document.getElementById('actionBtn').disabled = false;
    };
    body.appendChild(b);
  });
  current.correctVal = target.correct;
}

function renderTypeI(passage){
  setQType('短文填空');
  document.getElementById('sentence').innerHTML = escapeHtml(passage.title);
  setInstruction('先点金色空格，再点下面的词语填进去。点已填的空格可以把词放回去。');
  const fills = new Array(passage.answers.length).fill(null);
  let bankWords = shuffle(passage.bank.slice());
  let activeBlank = 0;
  function render(){
    const body = document.getElementById('qbody');
    body.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'wordbank';
    const lab = document.createElement('div');
    lab.className = 'wordbank-label';
    lab.textContent = bankWords.length ? '词库 · tap a word' : '词库已用完 · tap a blank to undo';
    wrap.appendChild(lab);
    const bank = document.createElement('div');
    bank.className = 'bank';
    bankWords.forEach(w=>{
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'tok';
      t.textContent = w;
      t.onclick = ()=>{
        if(checked) return;
        let slot = activeBlank;
        if(slot < 0 || fills[slot] !== null){
          slot = fills.findIndex(x=>x===null);
          if(slot === -1) return;
        }
        fills[slot] = w;
        const bi = bankWords.indexOf(w);
        if(bi>-1) bankWords.splice(bi,1);
        activeBlank = fills.findIndex(x=>x===null);
        if(activeBlank === -1) activeBlank = 0;
        render();
      };
      bank.appendChild(t);
    });
    wrap.appendChild(bank);
    body.appendChild(wrap);

    const passageEl = document.createElement('div');
    passageEl.className = 'passage-text sentence';
    passageEl.style.fontSize = '1.12rem';
    passageEl.style.lineHeight = '1.85';
    passage.pieces.forEach(p=>{
      if(p.t) passageEl.appendChild(document.createTextNode(p.t));
      else {
        const idx = p.b;
        const slot = document.createElement('span');
        slot.className = 'passage-blank' + (fills[idx] ? ' filled' : '') + (activeBlank === idx && !checked ? ' active' : '');
        slot.textContent = fills[idx] || '＿＿';
        slot.onclick = ()=>{
          if(checked) return;
          if(fills[idx]){
            bankWords.push(fills[idx]);
            fills[idx] = null;
          }
          activeBlank = idx;
          render();
        };
        passageEl.appendChild(slot);
      }
    });
    body.appendChild(passageEl);
    document.getElementById('actionBtn').disabled = fills.some(x=>x===null);
  }
  render();
  current.getAnswer = ()=>fills.slice();
  current.passageAnswers = passage.answers;
  current.recordLabel = passage.title;
}

/* ============================================================
   Grading / Duolingo-style check flow
   ============================================================ */
function doCheck(){
  if(checked){ nextQuestion(); return; }
  checked = true;
  total++;
  let isCorrect = false;
  const fb = document.getElementById('feedback');
  const actionBtn = document.getElementById('actionBtn');
  const target = current.target;

  if(current.type==='A' || current.type==='G' || current.type==='B'){
    const correctVal = current.type==='B' ? target.w : (current.type==='G' ? target.w : target.py);
    isCorrect = current.selected === correctVal;
    document.querySelectorAll('.opt').forEach(o=>{
      o.disabled = true;
      if(o.textContent === correctVal) o.classList.add('correct');
      else if(o.classList.contains('selected') && !isCorrect) o.classList.add('wrong');
      else o.classList.add('dim');
    });
  } else if(current.type==='H' || current.type==='H2' || current.type==='C'){
    isCorrect = current.selected === current.correctVal;
    document.querySelectorAll('.opt').forEach(o=>{
      o.disabled = true;
      if(o.textContent === current.correctVal) o.classList.add('correct');
      else if(o.classList.contains('selected') && !isCorrect) o.classList.add('wrong');
      else o.classList.add('dim');
    });
  } else if(current.type==='F'){
    isCorrect = current.selected === target.correct;
    document.querySelectorAll('.opt').forEach(o=>{
      o.disabled = true;
      if(o.textContent === target.correct) o.classList.add('correct');
      else if(o.classList.contains('selected') && !isCorrect) o.classList.add('wrong');
      else o.classList.add('dim');
    });
  } else if(current.type==='I'){
    const ans = current.getAnswer();
    isCorrect = JSON.stringify(ans) === JSON.stringify(current.passageAnswers);
    document.querySelectorAll('.passage-blank').forEach((el,i)=>{
      el.classList.add(ans[i] === current.passageAnswers[i] ? 'tokcorrect' : 'tokwrong');
    });
    document.querySelectorAll('#qbody .bank .tok').forEach(t=>t.style.opacity='.4');
  } else if(current.type==='D'){
    const ans = current.getAnswer();
    isCorrect = JSON.stringify(ans) === JSON.stringify(target.chunks);
    document.querySelectorAll('.tok.placed').forEach(t=>{
      t.classList.add(isCorrect ? 'tokcorrect':'tokwrong');
    });
    document.querySelectorAll('.tok:not(.placed)').forEach(t=>t.style.opacity='.4');
  }

  /* build a pseudo-target for recording stats (F and C targets lack .w/.m) */
  const recordTarget = (current.type==='F')
    ? {w:target.correct, m:'字辨', py:target.py||'', l:'', s:target.s}
    : (current.type==='C')
    ? {w:target.left+'+'+target.right, m:'词语搭配', py:'', l:'', s:''}
    : (current.type==='H2')
    ? {w:target.correct, m:'完成句子', py:'', l:'', s:target.correct}
    : (current.type==='I')
    ? {w:current.recordLabel, m:'短文填空', py:'', l:'', s:current.passageAnswers.join('、')}
    : target;
  recordAnswer(recordTarget, isCorrect);

  if(isCorrect){
    score++; streak++;
    const gained = ptsForCorrect();
    awardPoints(gained);
    playCorrectSound();
    showPtsPop(gained, streak);
    fb.classList.add('ok'); fb.classList.remove('no');
    let extra = '';
    if(current.type==='A') extra = `「${target.w}」读作 <b class="pinyin">${target.py}</b>`;
    else if(current.type==='D') extra = '句子顺序正确！';
    else if(current.type==='F') extra = `正确答案是「${target.correct}」`;
    else if(current.type==='C') extra = `${target.left} + ${target.right}`;
    else if(current.type==='I') extra = '短文全部填对了！';
    else if(current.type==='H2') extra = '句子补充正确！';
    else extra = `「${target.w}」`;
    const comboNote = streak >= 3 ? ` Combo x${streak}!` : '';
    const meaning = target.m || '';
    fb.innerHTML = `+${gained} pts${comboNote} ${extra}` + (meaning ? `<span class="meaning">意思：${meaning}</span>` : '');
    actionBtn.classList.add('ok');
  } else {
    streak = 0;
    playWrongSound();
    fb.classList.add('no'); fb.classList.remove('ok');
    let correctDisplay = target.w || '';
    if(current.type==='A') correctDisplay = target.py;
    else if(current.type==='H'||current.type==='H2'||current.type==='C') correctDisplay = current.correctVal;
    else if(current.type==='D') correctDisplay = target.chunks.join('');
    else if(current.type==='F') correctDisplay = target.correct;
    else if(current.type==='I') correctDisplay = current.passageAnswers.join('、');
    const meaning = target.m || '';
    fb.innerHTML = `正确答案是「${correctDisplay}」` + (meaning ? `<span class="meaning">${meaning}</span>` : '');
    actionBtn.classList.add('no');
  }
  fb.classList.add('show');
  actionBtn.textContent = 'Continue';
  actionBtn.disabled = false;

  document.getElementById('scoreNum').textContent = score;
  document.getElementById('totalNum').textContent = total;
  document.getElementById('streakNum').textContent = streak;
}

document.getElementById('actionBtn').onclick = ()=>{ getAudioCtx(); doCheck(); };
document.getElementById('skipBtn').onclick = ()=>{ getAudioCtx(); nextQuestion(); };

/* ============================================================
   Init
   ============================================================ */
renderXp();
loadStats();
nextQuestion();
