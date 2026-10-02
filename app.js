/* ============================================================
   HORIZON KORAGAME — app.js (Full)
   Firebase Auth + RTDB + Offline (Spy / Formation / Guess)
   + Online (Lobby / Spy Game with host-driven phases)
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, set, get, onValue, update, push,
  remove, onDisconnect, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ---------- FIREBASE ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyBDIg30xUm8-oH_GAKJqZ9UeDwEDTVsLo4",
  authDomain: "horizon-koragame.firebaseapp.com",
  projectId: "horizon-koragame",
  storageBucket: "horizon-koragame.firebasestorage.app",
  messagingSenderId: "176574187382",
  appId: "1:176574187382:web:9fe8a3e6b862aa087cdc57",
  measurementId: "G-EEC7MRS1FR"
};
const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);
const db    = getDatabase(fbApp);
const googleProvider = new GoogleAuthProvider();

/* ---------- DATA ---------- */
const SPY_PLAYERS_POOL = [
  "محمد صلاح", "ليونيل ميسي", "كريستيانو رونالدو", "كيليان مبابي",
  "إيرلينغ هالاند", "كيفين دي بروين", "لوكا مودريتش", "فيرجيل فان دايك",
  "تيبو كورتوا", "مانويل نوير", "روبرت ليفاندوفسكي", "نيمار",
  "فينيسيوس جونيور", "جود بيلينغهام", "سيرجيو راموس", "أندريس إنييستا",
  "رونالدينيو", "زين الدين زيدان", "جيانلويجي بوفون", "رونالدو نازاريو"
];

const PLAYERS_POOL = {
  gk: [
    { name: "بوفون", ovr: 92 }, { name: "كورتوا", ovr: 90 },
    { name: "نوير", ovr: 91 }, { name: "أليسون", ovr: 89 },
    { name: "إيدرسون", ovr: 88 }, { name: "دوناروما", ovr: 89 },
    { name: "أوبلاك", ovr: 88 }, { name: "شتيغن", ovr: 87 }
  ],
  cb: [
    { name: "راموس", ovr: 91 }, { name: "فان دايك", ovr: 90 },
    { name: "مالديني", ovr: 93 }, { name: "كانافارو", ovr: 89 },
    { name: "تياغو سيلفا", ovr: 88 }, { name: "دي ليخت", ovr: 87 },
    { name: "روبن دياز", ovr: 89 }, { name: "بويت", ovr: 86 }
  ],
  cm: [
    { name: "دي بروين", ovr: 94 }, { name: "مودريتش", ovr: 92 },
    { name: "إنييستا", ovr: 93 }, { name: "تشافي", ovr: 91 },
    { name: "كروس", ovr: 90 }, { name: "بوغبا", ovr: 88 },
    { name: "بيلينغهام", ovr: 91 }, { name: "رودري", ovr: 90 }
  ],
  st: [
    { name: "كريستيانو رونالدو", ovr: 99 }, { name: "ميسي", ovr: 99 },
    { name: "رونالدو نازاريو", ovr: 95 }, { name: "فان باستن", ovr: 94 },
    { name: "ليفاندوفسكي", ovr: 93 }, { name: "بنزيمة", ovr: 92 },
    { name: "هالاند", ovr: 93 }, { name: "مبابي", ovr: 92 }
  ]
};

const FORMATION_SLOTS = ["gk", "cb1", "cb2", "cm1", "cm2", "st1", "st2"];
const SLOT_TYPE = { gk:"gk", cb1:"cb", cb2:"cb", cm1:"cm", cm2:"cm", st1:"st", st2:"st" };
const BUDGETS = [100, 150, 200, 250, 300];

/* ---------- STATE ---------- */
const state = {
  currentScreen: 'screen-splash',
  user: null,
  profile: null,
  isHost: false,
  currentRoom: null,
  roomData: null,
  roomUnsub: null,
  gameUnsub: null,
  chatUnsub: null,
  lobbyChatUnsub: null
};

const spy = {
  players: [], scores: {}, spies: [], commonPlayer: '',
  revealIdx: 0, phase: 'reveal',
  questions: [], qIdx: 0,
  optionalList: [], optionalIdx: 0,
  voteIdx: 0, votes: {}, currentVote: null,
  spyGuessSelected: null, roundNum: 1
};

const form = {
  players: [], budget: 0,
  lineups: {}, remaining: {},
  queue: [],         // [{slot, card}]
  queueIdx: 0,
  winnerSelected: null,
  usedCards: {}      // per slot type: Set of used names
};

const guess = {
  p1:'', p2:'', p1Player:'', p2Player:'', currentIdx:0, vote:null
};

const online = {
  phase: null, timerId: null, hostTimerId: null
};

/* ---------- UTILS ---------- */
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
const pickRandom = a => a[Math.floor(Math.random()*a.length)];
const shuffle = arr => { const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
const genRoomCode = () => String(Math.floor(1000 + Math.random()*9000));
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
  state.currentScreen = id;
}
let toastTimer;
function toast(msg, type='') {
  const t = $('toast'); if (!t) return;
  t.textContent = msg; t.className = 'toast open ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('open'), 2400);
}
function showLoader(v){ const l=$('global-loader'); if(l) l.classList.toggle('open', !!v); }

/* ---------- BOOT ---------- */
setTimeout(()=> showScreen('screen-home'), 2200);

/* ---------- NAVIGATION ---------- */
$('tile-spy')       && ($('tile-spy').onclick = () => { resetSpy(); showScreen('screen-spy-setup'); });
$('tile-formation') && ($('tile-formation').onclick = () => { resetForm(); showScreen('screen-formation-setup'); });
$('tile-rooms')     && ($('tile-rooms').onclick = openOnlineGate);
$('tile-profile')   && ($('tile-profile').onclick = openRankings);
$('btn-hero-play')  && ($('btn-hero-play').onclick = () => showScreen('screen-play-menu'));
$('btn-playmenu-back') && ($('btn-playmenu-back').onclick = () => showScreen('screen-home'));
$$('.mode-card').forEach(el => el.onclick = () => {
  const m = el.dataset.mode;
  if (m === 'spy-offline')       { resetSpy();  showScreen('screen-spy-setup'); }
  if (m === 'formation-offline') { resetForm(); showScreen('screen-formation-setup'); }
  if (m === 'guess-offline')     { resetGuess(); showScreen('screen-guess-setup'); }
  if (m === 'online')            { openOnlineGate(); }
});
$$('.bottom-nav .nav-item').forEach(el => el.onclick = () => {
  $$('.bottom-nav .nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  const n = el.dataset.nav;
  if (n==='home') goHome();
  if (n==='play') showScreen('screen-play-menu');
  if (n==='rooms') openOnlineGate();
  if (n==='profile') openRankings();
});
function goHome(){ showScreen('screen-home'); }

$('btn-settings')         && ($('btn-settings').onclick = ()=>showScreen('screen-settings'));
$('btn-settings-back')    && ($('btn-settings-back').onclick = ()=>showScreen('screen-home'));
$('btn-settings-about')   && ($('btn-settings-about').onclick = ()=>showScreen('screen-about'));
$('btn-settings-guide')   && ($('btn-settings-guide').onclick = ()=>showScreen('screen-guide'));
$('btn-settings-profile') && ($('btn-settings-profile').onclick = openRankings);
$('btn-about-back')       && ($('btn-about-back').onclick = ()=>showScreen('screen-settings'));
$('btn-guide-back')       && ($('btn-guide-back').onclick = ()=>showScreen('screen-settings'));
$('btn-rankings-back')    && ($('btn-rankings-back').onclick = ()=>showScreen('screen-home'));
$('btn-rank-settings')    && ($('btn-rank-settings').onclick = ()=>showScreen('screen-settings'));
$('btn-rank-help')        && ($('btn-rank-help').onclick = ()=>showScreen('screen-guide'));
$('btn-rank-logout')      && ($('btn-rank-logout').onclick = doSignOut);
$('btn-rank-edit')        && ($('btn-rank-edit').onclick = ()=>toast('قريباً'));

/* ============================================================
   OFFLINE SPY GAME
   ============================================================ */
function resetSpy(){
  spy.players=[]; spy.spies=[]; spy.commonPlayer='';
  spy.revealIdx=0; spy.questions=[]; spy.qIdx=0;
  spy.optionalList=[]; spy.optionalIdx=0;
  spy.voteIdx=0; spy.votes={}; spy.currentVote=null;
  spy.spyGuessSelected=null; spy.phase='reveal';
  renderSpyPlayerList();
}
function renderSpyPlayerList(){
  const ul = $('spy-player-list'); if(!ul) return;
  ul.innerHTML='';
  spy.players.forEach((p,i)=>{
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(p)}</span><button data-i="${i}">×</button>`;
    li.querySelector('button').onclick = ()=>{ spy.players.splice(i,1); renderSpyPlayerList(); };
    ul.appendChild(li);
  });
  $('spy-player-counter') && ($('spy-player-counter').textContent = `${spy.players.length} / 12`);
}
$('btn-spy-add-player') && ($('btn-spy-add-player').onclick = ()=>{
  const inp = $('spy-player-input'); const name = inp.value.trim();
  if (!name) return;
  if (name.length>20) return toast('الاسم طويل','error');
  if (spy.players.includes(name)) return toast('الاسم موجود','error');
  if (spy.players.length>=12) return toast('الحد الأقصى 12','error');
  spy.players.push(name); inp.value=''; inp.focus(); renderSpyPlayerList();
});
$('spy-player-input') && $('spy-player-input').addEventListener('keypress', e => { if (e.key==='Enter') $('btn-spy-add-player').click(); });
$('btn-spysetup-back') && ($('btn-spysetup-back').onclick = ()=>showScreen('screen-play-menu'));
$('btn-spysetup-next') && ($('btn-spysetup-next').onclick = ()=>{
  if (spy.players.length<3) return toast('تحتاج 3 لاعبين','error');
  if (!spy.scores || Object.keys(spy.scores).length===0) spy.scores = {};
  spy.players.forEach(p => { if (!(p in spy.scores)) spy.scores[p]=0; });
  startOfflineSpyRound();
});

function startOfflineSpyRound(){
  const n = spy.players.length;
  const spyCount = n<=5 ? 1 : n<=9 ? 2 : 3;
  spy.spies = shuffle(spy.players).slice(0, spyCount);
  spy.commonPlayer = pickRandom(SPY_PLAYERS_POOL);
  spy.players.forEach(p => { if (!(p in spy.scores)) spy.scores[p]=0; });
  spy.revealIdx = 0;
  showPassScreen();
}

function showPassScreen(){
  if (spy.revealIdx >= spy.players.length) return startQuestions();
  $('spy-pass-name').textContent = spy.players[spy.revealIdx];
  showScreen('screen-spy-pass');
}
$('btn-spy-show-role') && ($('btn-spy-show-role').onclick = ()=>{
  const p = spy.players[spy.revealIdx];
  const isSpy = spy.spies.includes(p);
  $('spy-role-content').textContent = isSpy ? 'أنت الجاسوس' : spy.commonPlayer;
  showScreen('screen-spy-reveal');
  $('btn-spy-reveal-next').disabled = true;
  setTimeout(()=>attachScratch('spy-scratch-canvas', ()=> $('btn-spy-reveal-next').disabled=false), 60);
});
$('btn-spy-reveal-next') && ($('btn-spy-reveal-next').onclick = ()=>{ spy.revealIdx++; showPassScreen(); });

function startQuestions(){
  spy.questions=[];
  const n = spy.players.length;
  for (let i=0;i<n;i++) spy.questions.push({ asker: spy.players[i], answerer: spy.players[(i+1)%n] });
  spy.qIdx=0;
  showQuestionScreen();
}
function showQuestionScreen(){
  if (spy.qIdx >= spy.questions.length) return startOptional();
  const q = spy.questions[spy.qIdx];
  $('spy-question-text').textContent = `${q.asker} اسأل ${q.answerer}`;
  showScreen('screen-spy-questions');
}
$('btn-spy-question-next') && ($('btn-spy-question-next').onclick = ()=>{ spy.qIdx++; showQuestionScreen(); });

/* ---------- OPTIONAL ROUND ---------- */
function startOptional(){
  spy.optionalList = [];
  spy.optionalIdx = 0;
  spy.players.forEach(p => spy.optionalList.push({ player: p, target: null }));
  showOptionalScreen();
}
function showOptionalScreen(){
  if (spy.optionalIdx >= spy.optionalList.length) return buildOptionalQuestions();
  const cur = spy.optionalList[spy.optionalIdx];
  $('spy-optional-player').textContent = cur.player;
  const list = $('spy-optional-list'); list.innerHTML='';
  spy.players.forEach(p => {
    if (p === cur.player) return;
    const btn = document.createElement('button');
    btn.textContent = p;
    btn.onclick = ()=>{ cur.target = p; spy.optionalIdx++; showOptionalScreen(); };
    list.appendChild(btn);
  });
  showScreen('screen-spy-optional');
}
$('btn-spy-optional-skip') && ($('btn-spy-optional-skip').onclick = ()=>{ spy.optionalIdx++; showOptionalScreen(); });

function buildOptionalQuestions(){
  // حوّل الاختيارات لدور أسئلة حقيقي: السائل يسأل الهدف
  const qs = spy.optionalList.filter(o => o.target).map(o => ({ asker: o.player, answerer: o.target, optional: true }));
  if (qs.length === 0) return startVoting();
  // نعرضهم بنفس شاشة الأسئلة مع flag
  spy.questions = qs;
  spy.qIdx = 0;
  spy.phase = 'optionalQ';
  showOptionalQuestionScreen();
}
function showOptionalQuestionScreen(){
  if (spy.qIdx >= spy.questions.length) {
    spy.phase = 'reveal';
    return startVoting();
  }
  const q = spy.questions[spy.qIdx];
  $('spy-question-text').textContent = `${q.asker} اسأل ${q.answerer} (سؤال إضافي)`;
  showScreen('screen-spy-questions');
}

/* ---------- VOTING ---------- */
function startVoting(){
  spy.voteIdx = 0; spy.votes = {}; spy.currentVote = null;
  showVoteScreen();
}
function showVoteScreen(){
  if (spy.voteIdx >= spy.players.length) return startCountdown();
  const voter = spy.players[spy.voteIdx];
  $('spy-vote-player').textContent = voter;
  const list = $('spy-vote-list'); list.innerHTML='';
  spy.players.forEach(p => {
    if (p === voter) return;
    const btn = document.createElement('button');
    btn.textContent = p;
    btn.onclick = ()=>{
      list.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      spy.currentVote = p;
      $('btn-spy-vote-confirm').disabled = false;
    };
    list.appendChild(btn);
  });
  $('btn-spy-vote-confirm').disabled = true;
  showScreen('screen-spy-vote');
}
$('btn-spy-vote-confirm') && ($('btn-spy-vote-confirm').onclick = ()=>{
  if (!spy.currentVote) return;
  spy.votes[spy.players[spy.voteIdx]] = spy.currentVote;
  spy.voteIdx++; spy.currentVote = null;
  showVoteScreen();
});

function startCountdown(){
  showScreen('screen-spy-countdown');
  let c = 3;
  $('spy-countdown').textContent = c;
  const iv = setInterval(()=>{
    c--;
    if (c>0) $('spy-countdown').textContent = c;
    else { clearInterval(iv); revealOfflineSpy(); }
  }, 1000);
}
function revealOfflineSpy(){
  $('spy-names').textContent = spy.spies.join('، ');
  showScreen('screen-spy-spyreveal');
}
$('btn-spy-spyreveal-next') && ($('btn-spy-spyreveal-next').onclick = ()=>{
  const spyPlayer = spy.spies[0];
  $('spy-guess-player').textContent = spyPlayer;
  const list = $('spy-guess-list'); list.innerHTML='';
  const others = shuffle(SPY_PLAYERS_POOL.filter(p => p !== spy.commonPlayer)).slice(0,9);
  const opts = shuffle([spy.commonPlayer, ...others]);
  spy.spyGuessSelected = null;
  opts.forEach(p => {
    const btn = document.createElement('button');
    btn.textContent = p;
    btn.onclick = ()=>{
      list.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      spy.spyGuessSelected = p;
      $('btn-spy-guess-confirm').disabled = false;
    };
    list.appendChild(btn);
  });
  $('btn-spy-guess-confirm').disabled = true;
  showScreen('screen-spy-guess');
});
$('btn-spy-guess-confirm') && ($('btn-spy-guess-confirm').onclick = ()=>{
  if (!spy.spyGuessSelected) return;
  const spyPlayer = spy.spies[0];
  // نقاط المصوتين الصح
  spy.players.forEach(p => {
    if (spy.spies.includes(p)) return;
    const v = spy.votes[p];
    if (v && spy.spies.includes(v)) spy.scores[p] = (spy.scores[p]||0) + 1;
  });
  // نقاط الجاسوس
  if (spy.spyGuessSelected === spy.commonPlayer) spy.scores[spyPlayer] = (spy.scores[spyPlayer]||0) + 3;
  saveScoresForOffline();
  renderPoints();
});

function renderPoints(){
  const list = $('points-list'); list.innerHTML='';
  const sorted = Object.entries(spy.scores).sort((a,b)=>b[1]-a[1]);
  sorted.forEach(([name, sc])=>{
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(name)}</span><strong>${sc}</strong>`;
    list.appendChild(li);
  });
  showScreen('screen-points');
}

$('btn-new-round') && ($('btn-new-round').onclick = ()=>{
  // احتفظ بالنقاط، ابدأ دور جديد
  startOfflineSpyRound();
});
$('btn-exit-round') && ($('btn-exit-round').onclick = ()=>{
  resetSpy(); showScreen('screen-home');
});

/* ============================================================
   SCRATCH
   ============================================================ */
function attachScratch(canvasId, onReveal){
  const canvas = $(canvasId); if (!canvas) return;
  const parent = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const rect = parent.getBoundingClientRect();
  canvas.width = rect.width*dpr; canvas.height = rect.height*dpr;
  canvas.style.width = rect.width+'px'; canvas.style.height = rect.height+'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#111'; ctx.fillRect(0,0,rect.width,rect.height);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 16px Cairo, sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('امسح بصباعك', rect.width/2, rect.height/2);

  let moves = 0, isDrawing = false, done = false;
  function pos(e){ const r=canvas.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top}; }
  function scratch(e){ if (done) return; const {x,y}=pos(e);
    ctx.globalCompositeOperation='destination-out';
    ctx.beginPath(); ctx.arc(x,y,26,0,Math.PI*2); ctx.fill();
    if (++moves>22){ done=true; onReveal(); }
  }
  function down(e){ isDrawing=true; scratch(e); }
  function move(e){ if (isDrawing) scratch(e); }
  function up(){ isDrawing=false; }
  canvas.onpointerdown=down; canvas.onpointermove=move; canvas.onpointerup=up;
  canvas.onpointerleave=up;
}

/* ============================================================
   OFFLINE FORMATION MODE (FIXED)
   ============================================================ */
function resetForm(){
  form.players=[]; form.budget=0; form.lineups={}; form.remaining={};
  form.queue=[]; form.queueIdx=0; form.winnerSelected=null; form.usedCards={};
  renderFormPlayerList();
}
function renderFormPlayerList(){
  const ul = $('form-player-list'); if(!ul) return;
  ul.innerHTML='';
  form.players.forEach((p,i)=>{
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(p)}</span><button data-i="${i}">×</button>`;
    li.querySelector('button').onclick = ()=>{ form.players.splice(i,1); renderFormPlayerList(); };
    ul.appendChild(li);
  });
  $('form-player-counter') && ($('form-player-counter').textContent = `${form.players.length} / 4`);
}
$('btn-formsetup-back') && ($('btn-formsetup-back').onclick = ()=>showScreen('screen-play-menu'));
$('btn-form-add-player') && ($('btn-form-add-player').onclick = ()=>{
  const inp = $('form-player-input'); const name = inp.value.trim();
  if (!name) return;
  if (form.players.includes(name)) return toast('الاسم موجود','error');
  if (form.players.length>=4) return toast('الحد الأقصى 4','error');
  form.players.push(name); inp.value=''; renderFormPlayerList();
});
$('btn-formsetup-next') && ($('btn-formsetup-next').onclick = ()=>{
  if (form.players.length<2) return toast('تحتاج لاعبين على الأقل','error');
  startFormation();
});

function startFormation(){
  form.budget = pickRandom(BUDGETS);
  form.remaining = {}; form.lineups = {};
  form.players.forEach(p => {
    form.remaining[p] = form.budget;
    form.lineups[p] = {};
    FORMATION_SLOTS.forEach(s => form.lineups[p][s] = null);
  });
  form.usedCards = {};
  // ابنِ queue: لكل slot، نولّد كارد لكل لاعب لم يملأه
  form.queue = [];
  FORMATION_SLOTS.forEach(slot => {
    const type = SLOT_TYPE[slot];
    form.usedCards[slot] = new Set();
    const pool = shuffle(PLAYERS_POOL[type]);
    let poolIdx = 0;
    // جيب عدد كاردات = عدد اللاعبين
    const needed = form.players.length;
    const cards = [];
    while (cards.length < needed) {
      if (poolIdx >= pool.length) poolIdx = 0;
      const c = pool[poolIdx++];
      if (form.usedCards[slot].has(c.name)) continue;
      form.usedCards[slot].add(c.name);
      cards.push({ ...c, slot });
    }
    // رتّب الكاردات من الأقوى للأضعف عشان يبان "الحارس الي بعده أقل ovr"
    cards.sort((a,b)=>b.ovr - a.ovr);
    // أضف الكاردات كـ queue: كل كارد يظهر، ويتم اختيار فائز واحد فقط له
    // نوزّعهم بالتناوب على كل اللاعبين
    cards.forEach(c => form.queue.push(c));
  });
  form.queueIdx = 0;
  showFormationDraft();
}

function showFormationDraft(){
  if (form.queueIdx >= form.queue.length) return finishFormation();
  const card = form.queue[form.queueIdx];
  $('form-card-position').textContent = card.slot.toUpperCase();
  $('form-card-name').textContent = card.name;
  $('form-card-ovr').textContent = card.ovr;
  $('form-draft-progress').textContent = `${card.slot.toUpperCase()} — ${form.queueIdx+1}/${form.queue.length}`;
  $('form-budget').textContent = form.budget + 'M';

  // المرشحون: اللاعبين اللي لسه مش عندهم اللاعب في الـ slot
  const winners = $('form-winner-list'); winners.innerHTML='';
  form.winnerSelected = null;
  const candidates = form.players.filter(p => !form.lineups[p][card.slot]);
  if (candidates.length === 0) {
    // كل اللاعبين معاهم الـ slot، تخطى الكارد
    form.queueIdx++;
    return showFormationDraft();
  }
  candidates.forEach(p => {
    const btn = document.createElement('button');
    btn.textContent = p;
    btn.onclick = ()=>{
      winners.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      form.winnerSelected = p;
    };
    winners.appendChild(btn);
  });
  $('form-bid-input').value = '';
  showScreen('screen-formation-draft');
}

$('btn-form-draft-next') && ($('btn-form-draft-next').onclick = ()=>{
  if (!form.winnerSelected) return toast('اختر الفائز بالمزاد','error');
  const price = parseFloat($('form-bid-input').value);
  const winner = form.winnerSelected;
  const card = form.queue[form.queueIdx];

  form.lineups[winner][card.slot] = { ...card, price: isNaN(price) ? 0 : price };
  form.remaining[winner] = Math.max(0, form.remaining[winner] - (isNaN(price) ? 0 : price));

  form.winnerSelected = null;
  form.queueIdx++;

  // هل خلص كل اللاعبين من كل الـ slots؟
  const allDone = form.players.every(p => FORMATION_SLOTS.every(s => form.lineups[p][s]));
  if (allDone) return finishFormation();
  showFormationDraft();
});

function finishFormation(){
  // احسب OVR
  const results = form.players.map(p => {
    let ovr = 0;
    FORMATION_SLOTS.forEach(s => { if (form.lineups[p][s]) ovr += form.lineups[p][s].ovr; });
    return { name: p, ovr, lineup: form.lineups[p], remaining: form.remaining[p] };
  }).sort((a,b)=>b.ovr - a.ovr);

  // اعرض شاشة الـ lineup للفائز
  const winner = results[0];
  showLineupScreen(winner, results);
  saveFormationScores(results);
}

function showLineupScreen(winner, results){
  // عرض الـ pitch ببيانات الفائز
  $$('.pitch .slot').forEach(slotEl => {
    const pos = slotEl.dataset.pos;
    const p = winner.lineup[pos];
    if (p) {
      slotEl.classList.add('filled');
      slotEl.innerHTML = `${p.name}<br><small>${p.ovr}</small>`;
    } else {
      slotEl.classList.remove('filled');
      slotEl.textContent = pos.toUpperCase();
    }
  });
  $('lineup-ovr').textContent = winner.ovr;
  $('lineup-remaining').textContent = winner.remaining + 'M';
  showScreen('screen-formation-lineup');

  // تخزين النتائج للعرض في result
  $('btn-lineup-next').onclick = () => showFormationResults(results);
}

function showFormationResults(results){
  const wrap = $('form-result-teams'); wrap.innerHTML='';
  results.forEach((r,i)=>{
    const card = document.createElement('div');
    card.className = 'team-card';
    if (i===0) card.style.borderColor = 'var(--accent)';
    card.innerHTML = `
      <h4>${escapeHtml(r.name)} ${i===0?'🏆':''}</h4>
      <p>Total OVR: <strong>${r.ovr}</strong></p>
      <p>Remaining: ${r.remaining}M</p>
    `;
    wrap.appendChild(card);
  });
  showScreen('screen-formation-result');
}

$('btn-form-result-next') && ($('btn-form-result-next').onclick = ()=>{
  const list = $('points-list'); list.innerHTML='';
  const results = form.players.map(p => {
    let ovr=0; FORMATION_SLOTS.forEach(s => { if (form.lineups[p][s]) ovr += form.lineups[p][s].ovr; });
    return { name: p, ovr };
  }).sort((a,b)=>b.ovr-a.ovr);
  results.forEach(r => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(r.name)}</span><strong>OVR ${r.ovr}</strong>`;
    list.appendChild(li);
  });
  // زر "دور جديد" في هذه الشاشة يعيد formation، زر الخروج يروح home
  $('btn-new-round').onclick = () => { resetForm(); showScreen('screen-formation-setup'); };
  $('btn-exit-round').onclick = () => { showScreen('screen-home'); };
  showScreen('screen-points');
});

/* ============================================================
   OFFLINE GUESS
   ============================================================ */
function resetGuess(){
  guess.p1=''; guess.p2=''; guess.p1Player=''; guess.p2Player='';
  guess.currentIdx=0; guess.vote=null;
  $('guess-player-1') && ($('guess-player-1').value='');
  $('guess-player-2') && ($('guess-player-2').value='');
}
$('btn-guesssetup-back') && ($('btn-guesssetup-back').onclick = ()=>showScreen('screen-play-menu'));
$('btn-guesssetup-next') && ($('btn-guesssetup-next').onclick = ()=>{
  const p1 = $('guess-player-1').value.trim();
  const p2 = $('guess-player-2').value.trim();
  if (!p1 || !p2) return toast('أدخل الاسمين','error');
  if (p1===p2) return toast('الاسمين متطابقين','error');
  guess.p1=p1; guess.p2=p2;
  guess.p1Player = pickRandom(SPY_PLAYERS_POOL);
  let p2Player = pickRandom(SPY_PLAYERS_POOL);
  while (p2Player === guess.p1Player) p2Player = pickRandom(SPY_PLAYERS_POOL);
  guess.p2Player = p2Player;
  guess.currentIdx = 0;
  showGuessPass();
});
function showGuessPass(){
  $('guess-pass-name').textContent = guess.currentIdx===0 ? guess.p1 : guess.p2;
  showScreen('screen-guess-pass');
}
$('btn-guess-show') && ($('btn-guess-show').onclick = ()=>{
  $('guess-role-content').textContent = guess.currentIdx===0 ? guess.p1Player : guess.p2Player;
  showScreen('screen-guess-reveal');
  $('btn-guess-reveal-next').disabled = true;
  setTimeout(()=>attachScratch('guess-scratch-canvas', ()=> $('btn-guess-reveal-next').disabled=false), 60);
});
$('btn-guess-reveal-next') && ($('btn-guess-reveal-next').onclick = ()=>{
  guess.currentIdx++;
  if (guess.currentIdx>=2) return startGuessVote();
  showGuessPass();
});
function startGuessVote(){
  const list = $('guess-vote-list'); list.innerHTML=''; guess.vote = null;
  [guess.p1, guess.p2].forEach(p => {
    const btn = document.createElement('button');
    btn.textContent = p;
    btn.onclick = ()=>{
      list.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      guess.vote = p;
      $('btn-guess-vote-confirm').disabled = false;
    };
    list.appendChild(btn);
  });
  $('btn-guess-vote-confirm').disabled = true;
  showScreen('screen-guess-vote');
}
$('btn-guess-vote-confirm') && ($('btn-guess-vote-confirm').onclick = ()=>{
  if (!guess.vote) return;
  const list = $('points-list'); list.innerHTML='';
  const li = document.createElement('li');
  li.innerHTML = `<span>الفائز</span><strong>${escapeHtml(guess.vote)}</strong>`;
  list.appendChild(li);
  $('btn-new-round').onclick = ()=>{ resetGuess(); showScreen('screen-guess-setup'); };
  $('btn-exit-round').onclick = ()=>showScreen('screen-home');
  showScreen('screen-points');
});

/* ============================================================
   AUTH
   ============================================================ */
async function doGoogleSignIn(){
  try {
    showLoader(true);
    const res = await signInWithPopup(auth, googleProvider);
    const snap = await get(ref(db, 'users/'+res.user.uid));
    if (snap.exists()){
      state.profile = snap.val();
      afterAuth();
    } else {
      $('user-id-preview').textContent = '#'+res.user.uid.slice(-6);
      showScreen('screen-username');
    }
  } catch(e){ console.error(e); toast('فشل تسجيل الدخول','error'); }
  finally { showLoader(false); }
}
$('btn-google-signin')      && ($('btn-google-signin').onclick = doGoogleSignIn);
$('btn-online-gate-signin') && ($('btn-online-gate-signin').onclick = doGoogleSignIn);
$('btn-login-back')         && ($('btn-login-back').onclick = ()=>showScreen('screen-home'));

async function doSignOut(){
  try { await signOut(auth); state.user=null; state.profile=null; toast('تم تسجيل الخروج','success'); showScreen('screen-home'); }
  catch(e){ toast('خطأ','error'); }
}

$('btn-username-confirm') && ($('btn-username-confirm').onclick = async ()=>{
  if (!state.user) return;
  const username = $('input-username').value.trim().toLowerCase();
  const displayName = $('input-displayname').value.trim();
  if (!username || username.length<3) return toast('الـ Username قصير','error');
  if (!/^[a-z0-9_]+$/.test(username)) return toast('أحرف إنجليزية وأرقام فقط','error');
  if (!displayName) return toast('أدخل الاسم الظاهر','error');
  const unameRef = ref(db, 'usernames/'+username);
  const snap = await get(unameRef);
  if (snap.exists()) return toast('الـ Username مستخدم','error');
  const uid = state.user.uid;
  const id = '#'+uid.slice(-6);
  const profile = { uid, username, displayName, id, createdAt: Date.now(), wins: 0, level: 1, friends: 0 };
  try {
    await set(unameRef, uid);
    await set(ref(db,'users/'+uid), profile);
    await set(ref(db,'scores/'+uid), { displayName, username, wins: 0, level: 1 });
    state.profile = profile;
    toast('تم إنشاء الحساب','success');
    afterAuth();
  } catch(e){ toast('حدث خطأ','error'); }
});

function afterAuth(){
  if (state.profile){
    $('rank-username') && ($('rank-username').textContent = state.profile.displayName);
    $('rank-id') && ($('rank-id').textContent = state.profile.id);
    $('rank-avatar') && ($('rank-avatar').textContent = state.profile.displayName.charAt(0).toUpperCase());
  }
  showScreen('screen-online-choose');
}

onAuthStateChanged(auth, async user => {
  if (user){
    state.user = user;
    const snap = await get(ref(db,'users/'+user.uid));
    if (snap.exists()) state.profile = snap.val();
  } else {
    state.user = null; state.profile = null;
  }
});

/* ============================================================
   ONLINE GATE / CHOOSE / CREATE / JOIN
   ============================================================ */
function openOnlineGate(){
  if (state.user && state.profile) showScreen('screen-online-choose');
  else showScreen('screen-online-gate');
}
$('btn-onlinegate-back')   && ($('btn-onlinegate-back').onclick = ()=>showScreen('screen-home'));
$('btn-onlinechoose-back') && ($('btn-onlinechoose-back').onclick = ()=>showScreen('screen-home'));
$('btn-create-room')       && ($('btn-create-room').onclick = ()=>showScreen('screen-create-room'));
$('btn-join-room')         && ($('btn-join-room').onclick = ()=>showScreen('screen-join-room'));
$('btn-createroom-back')   && ($('btn-createroom-back').onclick = ()=>showScreen('screen-online-choose'));
$('btn-joinroom-back')     && ($('btn-joinroom-back').onclick = ()=>showScreen('screen-online-choose'));
$('btn-roomslist-back')    && ($('btn-roomslist-back').onclick = ()=>showScreen('screen-online-choose'));
$('btn-rooms-create')      && ($('btn-rooms-create').onclick = ()=>showScreen('screen-create-room'));

$('btn-create-room-confirm') && ($('btn-create-room-confirm').onclick = async ()=>{
  if (!state.user || !state.profile) return showScreen('screen-online-gate');
  const mode = $('create-mode').value;
  const password = $('create-password').value.trim();
  const limit = Math.max(3, Math.min(12, parseInt($('create-limit').value)||6));
  showLoader(true);
  let code = genRoomCode();
  for (let i=0;i<5;i++){ const s = await get(ref(db,'rooms/'+code)); if (!s.exists()) break; code = genRoomCode(); }
  const room = {
    host: state.user.uid, mode, password: password||'', limit,
    status: 'waiting', createdAt: Date.now(),
    players: {
      [state.user.uid]: {
        uid: state.user.uid,
        username: state.profile.username,
        displayName: state.profile.displayName,
        ready: false, isHost: true, joinedAt: Date.now(), score: 0
      }
    },
    roundNum: 0
  };
  try {
    await set(ref(db,'rooms/'+code), room);
    onDisconnect(ref(db,'rooms/'+code+'/players/'+state.user.uid)).remove();
    state.currentRoom = code; state.isHost = true;
    showLoader(false); enterLobby(code);
  } catch(e){ showLoader(false); console.error(e); toast('فشل إنشاء الغرفة','error'); }
});

$('btn-join-room-confirm') && ($('btn-join-room-confirm').onclick = async ()=>{
  if (!state.user || !state.profile) return showScreen('screen-online-gate');
  const code = $('join-code').value.trim();
  const pass = $('join-password').value.trim();
  if (!code || code.length!==4) return toast('كود الغرفة من 4 أرقام','error');
  showLoader(true);
  try {
    const snap = await get(ref(db,'rooms/'+code));
    if (!snap.exists()){ showLoader(false); return toast('الغرفة غير موجودة','error'); }
    const room = snap.val();
    if (room.password && room.password !== pass){ showLoader(false); return toast('الباسورد خطأ','error'); }
    if (Object.keys(room.players||{}).length >= room.limit){ showLoader(false); return toast('الغرفة ممتلئة','error'); }
    if (room.status !== 'waiting'){ showLoader(false); return toast('اللعبة بدأت','error'); }
    await set(ref(db,`rooms/${code}/players/${state.user.uid}`), {
      uid: state.user.uid, username: state.profile.username,
      displayName: state.profile.displayName,
      ready: false, isHost: false, joinedAt: Date.now(), score: 0
    });
    onDisconnect(ref(db,`rooms/${code}/players/${state.user.uid}`)).remove();
    state.currentRoom = code; state.isHost = false;
    showLoader(false); enterLobby(code);
  } catch(e){ showLoader(false); console.error(e); toast('فشل الدخول','error'); }
});

/* ============================================================
   LOBBY
   ============================================================ */
function enterLobby(code){
  state.currentRoom = code;
  $('lobby-room-code') && ($('lobby-room-code').textContent = code);
  showScreen('screen-room-lobby');
  attachRoomListeners(code);
}
function attachRoomListeners(code){
  if (state.roomUnsub) state.roomUnsub();
  if (state.lobbyChatUnsub) state.lobbyChatUnsub();

  state.roomUnsub = onValue(ref(db,'rooms/'+code), snap => {
    if (!snap.exists()){ toast('تم إغلاق الغرفة','error'); leaveRoom(); return; }
    const room = snap.val(); state.roomData = room;
    renderLobby(room);
    // لو اللعبة بدأت
    if (room.status === 'playing') startOnlineSpyGame();
    if (room.status === 'ended') {
      // عند النهاية، رجّع الكل للوبي
      if (state.currentScreen !== 'screen-room-lobby') {
        toast('انتهى الدور','success');
      }
    }
  });

  state.lobbyChatUnsub = onValue(ref(db,`rooms/${code}/chat`), snap => {
    const body = $('lobby-chat-body'); if (!body) return;
    body.innerHTML = '';
    if (snap.exists()){
      const msgs = Object.values(snap.val()).sort((a,b)=>a.ts-b.ts);
      msgs.forEach(m => body.appendChild(renderChatMsg(m)));
      body.scrollTop = body.scrollHeight;
    }
  });
}
function renderLobby(room){
  const players = room.players || {};
  const arr = Object.values(players);
  $('lobby-count') && ($('lobby-count').textContent = `${arr.length}/${room.limit}`);
  const ul = $('lobby-players'); if (!ul) return;
  ul.innerHTML = '';
  arr.sort((a,b)=>a.joinedAt-b.joinedAt).forEach(p => {
    const li = document.createElement('li');
    const status = p.isHost ? 'host' : (p.ready ? 'ready' : '');
    const statusText = p.isHost ? 'Host' : (p.ready ? 'Ready' : 'Not Ready');
    li.innerHTML = `<span>${escapeHtml(p.displayName)}</span><span class="status ${status}">${statusText}</span>`;
    ul.appendChild(li);
  });
  const btnStart = $('btn-lobby-start');
  const btnReady = $('btn-lobby-ready');
  const isHost = room.host === state.user.uid;
  const allReady = arr.every(p => p.ready || p.isHost);
  if (isHost){
    btnStart.style.display=''; btnReady.style.display='none';
    btnStart.disabled = !(allReady && arr.length>=3);
  } else {
    btnStart.style.display='none'; btnReady.style.display='';
    const me = players[state.user.uid];
    btnReady.textContent = me && me.ready ? 'إلغاء الاستعداد' : 'أنا مستعد';
  }
}

$('btn-lobby-ready') && ($('btn-lobby-ready').onclick = async ()=>{
  const code = state.currentRoom; if (!code || !state.user) return;
  const me = state.roomData?.players?.[state.user.uid]; if (!me) return;
  await update(ref(db,`rooms/${code}/players/${state.user.uid}`), { ready: !me.ready });
});

$('btn-lobby-start') && ($('btn-lobby-start').onclick = async ()=>{
  if (!state.isHost) return;
  const code = state.currentRoom; const room = state.roomData; if (!room) return;
  const players = Object.values(room.players || {});
  if (players.length<3) return toast('تحتاج 3 لاعبين','error');
  if (!players.every(p => p.ready || p.isHost)) return toast('في لاعبين مش مستعدين','error');
  await hostStartOnlineSpy(players);
});

$('btn-lobby-copy') && ($('btn-lobby-copy').onclick = ()=>{
  navigator.clipboard.writeText(state.currentRoom||'');
  toast('تم نسخ الكود','success');
});
$('btn-lobby-menu') && ($('btn-lobby-menu').onclick = ()=>openSidebar('lobby-sidebar'));
$('btn-lobby-sidebar-close') && ($('btn-lobby-sidebar-close').onclick = ()=>closeSidebar('lobby-sidebar'));
$('btn-lobby-chat-send') && ($('btn-lobby-chat-send').onclick = ()=>sendRoomChat($('lobby-chat-input')));
$('lobby-chat-input') && $('lobby-chat-input').addEventListener('keypress', e => { if (e.key==='Enter') $('btn-lobby-chat-send').click(); });

function leaveRoom(){
  if (state.roomUnsub){ state.roomUnsub(); state.roomUnsub=null; }
  if (state.lobbyChatUnsub){ state.lobbyChatUnsub(); state.lobbyChatUnsub=null; }
  if (state.gameUnsub){ state.gameUnsub(); state.gameUnsub=null; }
  if (online.hostTimerId){ clearInterval(online.hostTimerId); online.hostTimerId=null; }
  if (online.timerId){ clearInterval(online.timerId); online.timerId=null; }
  state.currentRoom=null; state.roomData=null; state.isHost=false;
  showScreen('screen-online-choose');
}

/* ============================================================
   CHAT
   ============================================================ */
function renderChatMsg(m){
  const div = document.createElement('div');
  const me = m.uid === state.user?.uid;
  div.className = 'chat-msg ' + (me?'me':'them');
  div.innerHTML = `${escapeHtml(m.text)}<span class="meta">${escapeHtml(m.name||'')}</span>`;
  return div;
}
async function sendRoomChat(inputEl){
  const code = state.currentRoom; if (!code || !state.user || !inputEl) return;
  const text = inputEl.value.trim(); if (!text) return;
  inputEl.value = '';
  const msgRef = push(ref(db,`rooms/${code}/chat`));
  await set(msgRef, { uid: state.user.uid, name: state.profile?.displayName||'', text, ts: Date.now() });
}
function openSidebar(id){ $(id) && $(id).classList.add('open'); }
function closeSidebar(id){ $(id) && $(id).classList.remove('open'); }

/* ============================================================
   ONLINE SPY GAME (HOST-DRIVEN)
   ============================================================ */

/* ---------- HOST: START ---------- */
async function hostStartOnlineSpy(players){
  const code = state.currentRoom;
  const n = players.length;
  const spyCount = n<=5 ? 1 : n<=9 ? 2 : 3;
  const spyUids = shuffle(players.map(p=>p.uid)).slice(0, spyCount);
  const commonPlayer = pickRandom(SPY_PLAYERS_POOL);
  const roleMap = {};
  players.forEach(p => {
    roleMap[p.uid] = { isSpy: spyUids.includes(p.uid), commonPlayer: spyUids.includes(p.uid)?null:commonPlayer };
  });
  const uids = players.map(p=>p.uid);
  const questions = uids.map((uid,i)=>({ asker: uid, answerer: uids[(i+1)%uids.length] }));

  await update(ref(db,'rooms/'+code), {
    status: 'playing',
    roundNum: (state.roomData.roundNum||0)+1,
    game: {
      phase: 'reveal',
      commonPlayer, spies: spyUids, roleMap, questions,
      currentQuestionIdx: 0,
      currentQuestion: null,
      optionalDone: false,
      optionalQuestions: [],
      votes: {},
      spyGuess: null,
      countdown: 3,
      timerEnd: Date.now() + 30000,
      startedAt: Date.now()
    }
  });
  // ابدأ الـ host loop
  startHostLoop();
}

/* ---------- GAME LISTENER (ALL CLIENTS) ---------- */
let gameListenerAttached = false;
function startOnlineSpyGame(){
  if (gameListenerAttached) return;
  gameListenerAttached = true;
  showScreen('screen-spy-online-game');
  attachOnlineGameListeners();
}
function attachOnlineGameListeners(){
  const code = state.currentRoom; if (!code) return;
  if (state.gameUnsub) state.gameUnsub();
  state.gameUnsub = onValue(ref(db,`rooms/${code}/game`), snap => {
    if (!snap.exists()) return;
    const g = snap.val();
    online.phase = g.phase;
    renderOnlineGame(g);
    // لو اللعبة انتهت (phase = ended)
    if (g.phase === 'ended'){
      gameListenerAttached = false;
    }
  });
}

/* ---------- HOST TIMER LOOP ---------- */
function startHostLoop(){
  if (!state.isHost) return;
  if (online.hostTimerId) clearInterval(online.hostTimerId);
  online.hostTimerId = setInterval(hostTick, 1000);
}
async function hostTick(){
  if (!state.isHost || !state.currentRoom) { clearInterval(online.hostTimerId); return; }
  const snap = await get(ref(db,`rooms/${state.currentRoom}/game`));
  if (!snap.exists()) return;
  const g = snap.val();
  const now = Date.now();
  const elapsed = now - (g.timerEnd || now);

  // Phase: reveal → ready → asking
  if (g.phase === 'reveal' && now >= (g.timerEnd||0)){
    // انتقل لبدء الأسئلة
    await update(ref(db,`rooms/${state.currentRoom}/game`), {
      phase: 'asking',
      currentQuestionIdx: 0,
      timerEnd: now + 60000
    });
    return;
  }
  // Phase: asking → التحقق من الإجابة وانتهاء الوقت
  if (g.phase === 'asking'){
    const q = g.questions?.[g.currentQuestionIdx];
    if (q && g.currentQuestion?.answer){
      // advance
      await update(ref(db,`rooms/${state.currentRoom}/game`), {
        currentQuestionIdx: g.currentQuestionIdx + 1,
        currentQuestion: null
      });
      const nextIdx = g.currentQuestionIdx + 1;
      if (nextIdx >= (g.questions?.length||0)){
        // انتقل لـ optional مباشرة
        await update(ref(db,`rooms/${state.currentRoom}/game`), {
          phase: 'optional',
          optionalIdx: 0,
          optionalSelections: {},
          optionalDone: false,
          timerEnd: now + 15000
        });
      } else {
        await update(ref(db,`rooms/${state.currentRoom}/game`), { timerEnd: now + 60000 });
      }
    }
  }
  // Phase: optional → بعد انتهاء الوقت، ابنِ أسئلة إضافية وابدأ
  if (g.phase === 'optional' && now >= (g.timerEnd||0)){
    const sel = g.optionalSelections || {};
    const qs = Object.entries(sel).map(([asker, target])=>({ asker, answerer: target, optional: true }));
    if (qs.length === 0){
      // لا أسئلة إضافية، ابدأ التصويت
      await update(ref(db,`rooms/${state.currentRoom}/game`), {
        phase: 'voting',
        votes: {},
        timerEnd: now + 30000
      });
    } else {
      await update(ref(db,`rooms/${state.currentRoom}/game`), {
        optionalQuestions: qs,
        optionalIdx: 0,
        phase: 'askingOptional',
        timerEnd: now + 60000
      });
    }
  }
  // Phase: askingOptional
  if (g.phase === 'askingOptional'){
    const q = g.optionalQuestions?.[g.optionalIdx];
    if (q && g.currentQuestion?.answer){
      const nextIdx = (g.optionalIdx||0)+1;
      const max = g.optionalQuestions?.length||0;
      if (nextIdx >= max){
        await update(ref(db,`rooms/${state.currentRoom}/game`), {
          phase: 'voting', votes: {}, timerEnd: now + 30000
        });
      } else {
        await update(ref(db,`rooms/${state.currentRoom}/game`), {
          optionalIdx: nextIdx, currentQuestion: null, timerEnd: now + 60000
        });
      }
    }
  }
  // Phase: voting → countdown → spyReveal
  if (g.phase === 'voting' && now >= (g.timerEnd||0)){
    // انتهى التصويت
    await update(ref(db,`rooms/${state.currentRoom}/game`), {
      phase: 'countdown',
      countdown: 3,
      timerEnd: now + 3000
    });
  }
  // Phase: countdown → spyReveal
  if (g.phase === 'countdown'){
    const remaining = Math.ceil(((g.timerEnd||now) - now)/1000);
    if (remaining <= 0){
      await update(ref(db,`rooms/${state.currentRoom}/game`), {
        phase: 'spyReveal',
        timerEnd: now + 5000
      });
    } else {
      await update(ref(db,`rooms/${state.currentRoom}/game`), { countdown: remaining });
    }
  }
  // Phase: spyReveal → spyGuess
  if (g.phase === 'spyReveal' && now >= (g.timerEnd||0)){
    await update(ref(db,`rooms/${state.currentRoom}/game`), {
      phase: 'spyGuess',
      timerEnd: now + 15000
    });
  }
  // Phase: spyGuess → نهاية
  if (g.phase === 'spyGuess'){
    if (g.spyGuess || now >= (g.timerEnd||0)){
      // احسب النقاط
      await hostComputeScores(g);
    }
  }
}

async function hostComputeScores(g){
  const code = state.currentRoom;
  const roomSnap = await get(ref(db,'rooms/'+code));
  const room = roomSnap.val();
  const players = Object.values(room.players||{});
  const spies = g.spies||[];
  const votes = g.votes||{};
  const updates = {};
  players.forEach(p => {
    let add = 0;
    if (spies.includes(p.uid)){
      // الجاسوس: لو خمّن صح +3
      if (g.spyGuess === g.commonPlayer) add = 3;
    } else {
      // عادي: لو صوّت صح +1
      if (spies.includes(votes[p.uid])) add = 1;
    }
    updates[`rooms/${code}/players/${p.uid}/score`] = (p.score||0) + add;
  });
  updates[`rooms/${code}/game/phase`] = 'points';
  updates[`rooms/${code}/game/timerEnd`] = Date.now() + 60000;
  await update(ref(db), updates);
  // حفظ أفضل نقاط في scores
  saveOnlineScores(players, updates, code);
}

async function saveOnlineScores(players, updates, code){
  // حدّث scores لكل لاعب
  for (const p of players){
    const scoreRef = ref(db,'scores/'+p.uid);
    const s = await get(scoreRef);
    const cur = s.val() || { displayName: p.displayName, username: p.username, wins: 0, level: 1 };
    // لو اللاعب عادي والمجموع أعلى؟ لا نحسم هنا، فقط نحدّث أعلى نقاط
    // نزود wins لو كان في الفريق الفائز (نستخدم add كـ wins لو > 0)
    const add = updates[`rooms/${code}/players/${p.uid}/score`] - (p.score||0);
    cur.wins = (cur.wins||0) + add;
    cur.level = Math.max(1, Math.floor(cur.wins/10)+1);
    cur.displayName = p.displayName;
    cur.username = p.username;
    await set(scoreRef, cur);
  }
}

/* ---------- RENDER ONLINE GAME (ALL CLIENTS) ---------- */
function renderOnlineGame(g){
  const myRole = g.roleMap?.[state.user?.uid];
  if (!myRole) return;
  const badge = $('spy-online-role');
  if (badge) badge.textContent = myRole.isSpy ? 'أنت الجاسوس' : 'اللاعب: ' + myRole.commonPlayer;

  const askC = $('spy-online-ask-controls');
  const ansC = $('spy-online-answer-controls');
  const timer = $('spy-online-timer');

  // إخفاء الكنترولز افتراضياً
  askC.style.display = 'none';
  ansC.style.display = 'none';
  timer.style.display = 'none';

  // phase: reveal
  if (g.phase === 'reveal'){
    showScreen('screen-spy-online-game');
    $('spy-online-round') && ($('spy-online-round').textContent = state.roomData?.roundNum||1);
    timer.style.display = '';
    timer.textContent = Math.max(0, Math.ceil(((g.timerEnd||0) - Date.now())/1000)) + 's';
    // chat area
    renderOnlineChatFromGame(g);
    return;
  }
  // phase: asking / askingOptional
  if (g.phase === 'asking' || g.phase === 'askingOptional'){
    showScreen('screen-spy-online-game');
    const q = g.phase === 'asking'
      ? g.questions?.[g.currentQuestionIdx]
      : g.optionalQuestions?.[g.optionalIdx];
    if (!q) return;
    const isAsker = q.asker === state.user.uid;
    const isAnswerer = q.answerer === state.user.uid;
    if (isAsker) askC.style.display = 'flex';
    if (isAnswerer) ansC.style.display = 'flex';
    timer.style.display = '';
    timer.textContent = Math.max(0, Math.ceil(((g.timerEnd||0) - Date.now())/1000)) + 's';
    // عرض السؤال الحالي في الشات
    renderOnlineChatFromGame(g);
    return;
  }
  // phase: optional
  if (g.phase === 'optional'){
    // كل لاعب يختار حد
    if (state.currentScreen !== 'screen-spy-online-game') showScreen('screen-spy-online-game');
    askC.style.display = 'none';
    ansC.style.display = 'none';
    timer.style.display = '';
    timer.textContent = Math.max(0, Math.ceil(((g.timerEnd||0) - Date.now())/1000)) + 's';
    // عرض قائمة اختيار في الشات
    renderOnlineChatFromGame(g, true);
    return;
  }
  // phase: voting
  if (g.phase === 'voting'){
    if (state.currentScreen !== 'screen-spy-online-vote'){
      showScreen('screen-spy-online-vote');
      renderOnlineVoteList();
    }
    const vt = $('spy-online-vote-timer');
    if (vt) vt.textContent = Math.max(0, Math.ceil(((g.timerEnd||0) - Date.now())/1000));
    // trigger timer render
    setTimeout(()=>{ if (state.currentScreen === 'screen-spy-online-vote') renderOnlineGame(g); }, 1000);
    return;
  }
  // phase: countdown
  if (g.phase === 'countdown'){
    showScreen('screen-spy-online-game');
    askC.style.display = 'none'; ansC.style.display = 'none';
    timer.style.display = '';
    timer.textContent = g.countdown || 3;
    return;
  }
  // phase: spyReveal
  if (g.phase === 'spyReveal'){
    showScreen('screen-spy-online-game');
    askC.style.display='none'; ansC.style.display='none';
    const spies = (g.spies||[]).map(uid => state.roomData?.players?.[uid]?.displayName || '?').join('، ');
    const badge2 = $('spy-online-role');
    if (badge2) badge2.textContent = 'الجاسوس: ' + spies;
    timer.style.display = 'none';
    return;
  }
  // phase: spyGuess
  if (g.phase === 'spyGuess'){
    showScreen('screen-spy-online-guess');
    renderOnlineGuessList(g.commonPlayer);
    const gt = $('spy-online-guess-timer');
    if (gt) gt.textContent = Math.max(0, Math.ceil(((g.timerEnd||0) - Date.now())/1000));
    return;
  }
  // phase: points
  if (g.phase === 'points'){
    // اعرض النقاط
    renderOnlinePoints();
    return;
  }
}

function renderOnlineChatFromGame(g, showOptionalPicker){
  const box = $('spy-online-chat'); if (!box) return;
  // الشات بيجي من onValue منفصل، هنا بس نضيف الأسئلة الحالية كنص
  box.innerHTML = '';
  // جيب الشات من roomData مباشرة
  const chatSnap = state.roomData?.chat;
  if (chatSnap){
    Object.values(chatSnap).sort((a,b)=>a.ts-b.ts).forEach(m => {
      const div = document.createElement('div');
      const me = m.uid === state.user?.uid;
      div.className = 'chat-msg ' + (me?'me':'them');
      div.innerHTML = `${escapeHtml(m.text)}<span class="meta">${escapeHtml(m.name||'')}</span>`;
      box.appendChild(div);
    });
  }
  if (showOptionalPicker){
    // اعرض أزرار اختيار اللاعبين للسؤال الإضافي
    const pickWrap = document.createElement('div');
    pickWrap.className = 'btn-grid';
    pickWrap.style.marginTop = '8px';
    const players = Object.values(state.roomData?.players||{});
    players.forEach(p => {
      if (p.uid === state.user.uid) return;
      const b = document.createElement('button');
      b.textContent = 'اسأل ' + p.displayName;
      b.onclick = async ()=>{
        if (!state.currentRoom) return;
        await update(ref(db,`rooms/${state.currentRoom}/game/optionalSelections`), { [state.user.uid]: p.uid });
        toast('تم اختيار ' + p.displayName,'success');
      };
      pickWrap.appendChild(b);
    });
    box.appendChild(pickWrap);
  }
  box.scrollTop = box.scrollHeight;
}

function renderOnlineVoteList(){
  const list = $('spy-online-vote-list'); if (!list) return;
  list.innerHTML = '';
  const players = Object.values(state.roomData?.players||{});
  players.forEach(p => {
    if (p.uid === state.user.uid) return;
    const btn = document.createElement('button');
    btn.textContent = p.displayName;
    btn.onclick = ()=>{
      list.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      $('btn-spy-online-vote-confirm').disabled = false;
      $('btn-spy-online-vote-confirm').dataset.target = p.uid;
    };
    list.appendChild(btn);
  });
}
$('btn-spy-online-vote-confirm') && ($('btn-spy-online-vote-confirm').onclick = async ()=>{
  const target = $('btn-spy-online-vote-confirm').dataset.target;
  if (!target || !state.currentRoom) return;
  await set(ref(db,`rooms/${state.currentRoom}/game/votes/${state.user.uid}`), target);
  toast('تم تسجيل صوتك','success');
});

function renderOnlineGuessList(commonPlayer){
  const list = $('spy-online-guess-list'); if (!list) return;
  const spies = state.roomData?.game?.spies || [];
  // فقط الجاسوس يقدر يختار
  const amSpy = spies.includes(state.user.uid);
  if (!amSpy){
    list.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);font-weight:700;">في انتظار تخمين الجاسوس...</p>';
    return;
  }
  list.innerHTML = '';
  const others = shuffle(SPY_PLAYERS_POOL.filter(p => p !== commonPlayer)).slice(0,9);
  const opts = shuffle([commonPlayer, ...others]);
  opts.forEach(p => {
    const btn = document.createElement('button');
    btn.textContent = p;
    btn.onclick = async ()=>{
      if (!state.currentRoom) return;
      await set(ref(db,`rooms/${state.currentRoom}/game/spyGuess`), p);
      toast('تم التخمين','success');
    };
    list.appendChild(btn);
  });
}

function renderOnlinePoints(){
  const list = $('points-list'); if (!list) return;
  list.innerHTML = '';
  const players = Object.values(state.roomData?.players||{}).sort((a,b)=>(b.score||0)-(a.score||0));
  players.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(p.displayName)}</span><strong>${p.score||0}</strong>`;
    list.appendChild(li);
  });
  // في الأونلاين، زر الخروج يرجع للوبي، زر دور جديد يعيد اللعب في نفس الغرفة
  $('btn-new-round').onclick = async ()=>{
    if (!state.isHost) return toast('فقط صاحب الغرفة يبدأ دور جديد','error');
    // رجّع كل اللاعبين ready = false، status = waiting
    const room = state.roomData;
    const players = Object.values(room.players||{});
    const upd = { 'rooms/'+state.currentRoom+'/status': 'waiting' };
    players.forEach(p => { upd[`rooms/${state.currentRoom}/players/${p.uid}/ready`] = false; });
    await update(ref(db), upd);
    gameListenerAttached = false;
    if (online.hostTimerId){ clearInterval(online.hostTimerId); online.hostTimerId = null; }
    enterLobby(state.currentRoom);
  };
  $('btn-exit-round').onclick = async ()=>{
    if (!state.isHost) return toast('فقط صاحب الغرفة يمكنه إغلاق الجولة','error');
    await update(ref(db,'rooms/'+state.currentRoom), { status: 'waiting' });
    gameListenerAttached = false;
    if (online.hostTimerId){ clearInterval(online.hostTimerId); online.hostTimerId = null; }
    enterLobby(state.currentRoom);
  };
  showScreen('screen-points');
}

/* ---------- ASK / ANSWER ---------- */
$('btn-spy-ask-send') && ($('btn-spy-ask-send').onclick = async ()=>{
  const text = $('spy-online-ask-input').value.trim();
  if (!text || !state.currentRoom) return;
  const g = state.roomData?.game; if (!g) return;
  $('spy-online-ask-input').value = '';
  const qIdx = g.phase === 'askingOptional' ? g.optionalIdx : g.currentQuestionIdx;
  await update(ref(db,`rooms/${state.currentRoom}/game`), {
    currentQuestion: { text, answer: null, asker: state.user.uid },
    currentQuestionIdx: qIdx
  });
  const msgRef = push(ref(db,`rooms/${state.currentRoom}/chat`));
  await set(msgRef, {
    uid: state.user.uid, name: state.profile?.displayName||'',
    text: 'سؤال: ' + text, ts: Date.now()
  });
});

$$('.btn-answer').forEach(btn => btn.onclick = ()=>{
  $$('.btn-answer').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
  $('btn-spy-answer-confirm').dataset.answer = btn.dataset.answer;
});
$('btn-spy-answer-confirm') && ($('btn-spy-answer-confirm').onclick = async ()=>{
  const ans = $('btn-spy-answer-confirm').dataset.answer;
  if (!ans || !state.currentRoom) return;
  await update(ref(db,`rooms/${state.currentRoom}/game/currentQuestion`), { answer: ans });
  const labels = { yes:'نعم', no:'لا', idk:'معرفش' };
  const msgRef = push(ref(db,`rooms/${state.currentRoom}/chat`));
  await set(msgRef, {
    uid: state.user.uid, name: state.profile?.displayName||'',
    text: 'إجابة: ' + labels[ans], ts: Date.now()
  });
});

/* ============================================================
   SCORES / RANKINGS
   ============================================================ */
async function saveScoresForOffline(){
  // لو المستخدم مسجل دخول، احفظ النقاط في Firebase (كـ XP)
  if (!state.user) return;
  const total = Object.values(spy.scores).reduce((a,b)=>a+b,0);
  if (total === 0) return;
  const scoreRef = ref(db,'scores/'+state.user.uid);
  const snap = await get(scoreRef);
  const cur = snap.val() || { wins: 0, level: 1 };
  cur.wins = (cur.wins||0) + (spy.scores[state.profile?.displayName]||0);
  cur.level = Math.max(1, Math.floor(cur.wins/10)+1);
  cur.displayName = state.profile?.displayName || '';
  cur.username = state.profile?.username || '';
  await set(scoreRef, cur);
}
async function saveFormationScores(results){
  if (!state.user) return;
  const me = results.find(r => r.name === state.profile?.displayName);
  if (!me) return;
  const scoreRef = ref(db,'scores/'+state.user.uid);
  const snap = await get(scoreRef);
  const cur = snap.val() || { wins: 0, level: 1 };
  if (me.ovr > 0){
    cur.wins = (cur.wins||0) + Math.floor(me.ovr/100);
    cur.level = Math.max(1, Math.floor(cur.wins/10)+1);
  }
  cur.displayName = state.profile?.displayName || '';
  cur.username = state.profile?.username || '';
  await set(scoreRef, cur);
}

async function openRankings(){
  if (state.profile){
    $('rank-username').textContent = state.profile.displayName;
    $('rank-id').textContent = state.profile.id;
    $('rank-avatar').textContent = state.profile.displayName.charAt(0).toUpperCase();
    // اجلب الإحصائيات
    const snap = await get(ref(db,'scores/'+state.user.uid));
    const s = snap.val() || { wins: 0, level: 1 };
    $('stat-wins').textContent = s.wins||0;
    $('stat-level').textContent = s.level||1;
    $('stat-friends').textContent = 0;
    $('rank-level').textContent = 'Level ' + (s.level||1);
  }
  showScreen('screen-rankings');
}

/* ============================================================
   CLEANUP ON UNLOAD
   ============================================================ */
window.addEventListener('beforeunload', ()=>{
  if (state.currentRoom && state.user){
    remove(ref(db,`rooms/${state.currentRoom}/players/${state.user.uid}`));
  }
});

console.log('%cHorizon Koragame — app.js loaded','color:#e11d2e;font-weight:bold');
