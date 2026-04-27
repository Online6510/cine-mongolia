import { LocalDatabase } from './database.js';
import { AuthService } from './auth.js';
import { SimulatedAPI, apiJson } from './api.js';
import { VideoPlayer } from './player.js';

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const db = new LocalDatabase();
let auth, api, player;
let movies = [], watchlist = [], currentMovie = null;
let heroIndex = 0, heroTimer = null, activeGenre = 'Бүгд';
let currentUser = null, activeProfile = null, deferredInstall = null;
let lang = localStorage.getItem('cine_mongolia_lang') || 'mn';

const i18n = {
  mn:{added:'Жагсаалтад нэмлээ',removed:'Жагсаалтаас хаслаа',loginRequired:'Эхлээд нэвтэрнэ үү.',saved:'Амжилттай хадгаллаа',deleted:'Устгалаа',subscribed:'Төлбөрийн simulation амжилттай',offlineReady:'Offline cache бэлэн боллоо'},
  en:{added:'Added to watchlist',removed:'Removed from watchlist',loginRequired:'Please sign in first.',saved:'Saved successfully',deleted:'Deleted',subscribed:'Payment simulation completed',offlineReady:'Offline cache is ready'}
};

async function init(){
  await db.open();
  auth = new AuthService(db);
  api = new SimulatedAPI(db, auth);
  player = new VideoPlayer({
    api,
    onProgress: async payload => {
      if (!currentUser) return;
      await api.request('/api/me/history', {method:'POST', body:JSON.stringify(payload)});
      renderContinueWatching();
    }
  });
  bindEvents();
  await refreshSession();
  await loadMovies();
  renderAll();
  setupPWA();
  observeReveal();
  startHeroTimer();
  startChatBot();
  hideLoading();
}

function hideLoading(){ setTimeout(() => $('#loading')?.classList.add('hidden'), 450); }
function toast(message){ const el=$('#toast'); el.textContent=message; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2600); }
function t(key){ return i18n[lang]?.[key] || i18n.mn[key] || key; }

async function refreshSession(){
  currentUser = await auth.currentUser();
  activeProfile = await auth.activeProfile();
  await loadWatchlist();
  updateAuthUI();
}

async function loadMovies(params=''){ movies = await apiJson(api, `/api/movies${params}`); }
async function loadWatchlist(){ try{ watchlist = currentUser ? await apiJson(api, '/api/me/watchlist') : []; } catch { watchlist=[]; } }

function bindEvents(){
  document.addEventListener('click', handleClick);
  document.addEventListener('keydown', handleKeys);
  window.addEventListener('scroll',()=>$('#navbar').classList.toggle('scrolled', window.scrollY > 40));
  $('#movieSearch')?.addEventListener('input', debounce(applyMovieFilters, 250));
  $('#genreFilter')?.addEventListener('change', applyMovieFilters);
  $('#sortFilter')?.addEventListener('change', applyMovieFilters);
  $('#searchInput')?.addEventListener('input', debounce(renderSearchResults, 200));
  $('#loginForm')?.addEventListener('submit', login);
  $('#signupForm')?.addEventListener('submit', signup);
  $('#profileForm')?.addEventListener('submit', addProfile);
  $('#movieForm')?.addEventListener('submit', saveMovie);
  $('#reviewForm')?.addEventListener('submit', submitReview);
  $('#chatForm')?.addEventListener('submit', sendChat);
  $$('[data-auth-tab]').forEach(btn => btn.addEventListener('click', () => switchAuthTab(btn.dataset.authTab)));
  $$('[data-fill-login]').forEach(link => link.addEventListener('click', fillDemoLogin));
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstall = event; });
}

async function handleClick(event){
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if(action==='toggle-mobile') $('#navLinks').classList.toggle('open');
  if(action==='tab') showTab(actionEl.dataset.tab);
  if(action==='open-search') openSearch();
  if(action==='close-search') closeSearch();
  if(action==='open-auth') currentUser ? await logout() : openAuth();
  if(action==='close-auth') closeAuth();
  if(action==='close-modal') closeModal();
  if(action==='play-current') currentMovie && playMovie(currentMovie);
  if(action==='toggle-watchlist-current') currentMovie && toggleWatchlist(currentMovie.id);
  if(action==='scroll-left'||action==='scroll-right') scrollCarousel(actionEl, action==='scroll-right');
  if(action==='genre') filterGenre(actionEl.dataset.genre);
  if(action==='open-modal') openModal(Number(actionEl.dataset.id));
  if(action==='play') playMovieById(Number(actionEl.dataset.id));
  if(action==='toggle-watchlist') toggleWatchlist(Number(actionEl.dataset.id));
  if(action==='refresh-recommendations') renderRecommendations();
  if(action==='filter-quick') quickFilter(actionEl.dataset.filter);
  if(action==='switch-profile') switchProfile(actionEl.dataset.id);
  if(action==='admin-edit') fillMovieForm(Number(actionEl.dataset.id));
  if(action==='admin-delete') deleteMovie(Number(actionEl.dataset.id));
  if(action==='admin-clear') clearMovieForm();
  if(action==='subscribe') subscribe(actionEl.dataset.plan);
  if(action==='toggle-chat') $('#liveChat').classList.toggle('open');
  if(action==='notify-demo') notifyDemo();
  if(action==='install-pwa') installPWA();
  if(action==='reset-db') resetDb();
  if(action==='toggle-language') toggleLanguage();
  if(action==='close-player') player.close();
  if(action==='player-toggle') player.toggle();
  if(action==='player-back') player.skip(-10);
  if(action==='player-forward') player.skip(10);
  if(action==='player-mute') player.mute();
  if(action==='player-fullscreen') player.fullscreen();
}

function handleKeys(event){
  if(event.key==='Escape'){ closeSearch(); closeModal(); closeAuth(); if($('#playerOverlay').classList.contains('open')) player.close(); }
  if($('#playerOverlay').classList.contains('open')){
    if(event.code==='Space'){ event.preventDefault(); player.toggle(); }
    if(event.key==='ArrowRight') player.skip(10);
    if(event.key==='ArrowLeft') player.skip(-10);
  }
}

function renderAll(){
  renderGenres();
  renderHero();
  renderHomeSections();
  renderMovieFilters();
  renderMovieGrid(movies);
  renderWatchlist();
  renderProfiles();
  renderPlans();
  renderAdmin();
  renderChat();
}

function updateAuthUI(){
  const avatar=$('#avatarBtn');
  if(!currentUser){ avatar.textContent='?'; avatar.title='Нэвтрэх'; }
  else { avatar.textContent=(activeProfile?.avatar || currentUser.name[0] || 'U').toUpperCase(); avatar.title=`${currentUser.name} — гарах`; }
  $$('[data-admin-only]').forEach(el => el.style.display = currentUser?.role === 'admin' ? '' : 'none');
}

function showTab(tab){
  if(tab==='admin' && currentUser?.role !== 'admin'){ toast('Admin эрхээр нэвтэрнэ үү.'); openAuth(); return; }
  $$('.view').forEach(v=>v.classList.remove('active'));
  const view=$(`#view-${tab}`); if(view) view.classList.add('active');
  const homeVisible=tab==='home';
  $$('[data-home-section], .quality-strip, .genre-bar').forEach(el=>el.style.display=homeVisible?'':'none');
  $$('.nav-links a').forEach(a=>a.classList.toggle('active', a.dataset.tab===tab));
  $('#navLinks').classList.remove('open');
  if(tab==='watchlist') renderWatchlist();
  if(tab==='history') renderHistory();
  if(tab==='profiles') renderProfiles();
  if(tab==='admin') renderAdmin();
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderGenres(){
  const genres=['Бүгд', ...new Set(movies.map(m=>m.genre))];
  $('#genreBar').innerHTML = genres.map(g=>`<button class="genre-pill ${g===activeGenre?'active':''}" data-action="genre" data-genre="${escapeAttr(g)}">${escapeHTML(g)}</button>`).join('');
}

function renderHero(){
  const heroMovies=[...movies].sort((a,b)=>b.rating-a.rating).slice(0,4);
  if(!heroMovies.length) return;
  const movie=heroMovies[heroIndex%heroMovies.length];
  $('#heroBg').style.backgroundImage=`url('${movie.imgWide || movie.img}')`;
  $('#heroContent').innerHTML=`
    <div class="hero-tags"><span class="tag tag-new">● Шинэ</span><span class="tag tag-gold">${movie.is3D?'IMAX 3D':'4K HDR'}</span><span class="tag">${escapeHTML(movie.genre)}</span><span class="tag">${movie.year}</span></div>
    <h1 class="hero-title" id="heroTitle">${escapeHTML(movie.title)}</h1>
    <div class="hero-meta"><span class="rating-badge">★ ${movie.rating}</span><span class="dot"></span><span>${escapeHTML(movie.duration)}</span><span class="dot"></span><span>${escapeHTML(movie.age||'16+')}</span></div>
    <p class="hero-desc">${escapeHTML(movie.desc)}</p>
    <div class="hero-actions"><button class="btn-primary" data-action="play" data-id="${movie.id}">▶ Үзэх</button><button class="btn-secondary" data-action="open-modal" data-id="${movie.id}">ⓘ Дэлгэрэнгүй</button></div>`;
  $('#heroStrip').innerHTML=heroMovies.map((m,i)=>`<button class="hero-thumb ${i===heroIndex?'active':''}" data-hero-index="${i}" aria-label="${escapeAttr(m.title)}"><img src="${escapeAttr(m.img)}" alt="${escapeAttr(m.title)}" loading="lazy"></button>`).join('');
  $$('#heroStrip .hero-thumb').forEach(btn=>btn.addEventListener('click',()=>{ heroIndex=Number(btn.dataset.heroIndex); renderHero(); startHeroTimer(); }));
  const bar=$('#heroProgress'); bar.style.animation='none'; void bar.offsetWidth; bar.style.animation='';
}

function startHeroTimer(){ clearInterval(heroTimer); heroTimer=setInterval(()=>{ heroIndex=(heroIndex+1)%Math.min(4,movies.length); renderHero(); },8000); }

function renderHomeSections(){
  const trending=[...movies].sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,10);
  $('#trending').innerHTML=trending.map((m,idx)=>movieCard(m,{rank:idx+1})).join('');
  $('#carousel3d').innerHTML=movies.filter(m=>m.is3D).map(m=>movieCard(m)).join('');
  renderContinueWatching();
  renderSpotlight();
  renderRecommendations();
}

async function renderRecommendations(){
  const recs=await apiJson(api,'/api/recommendations');
  $('#recommendations').innerHTML=recs.length?recs.map(m=>movieCard(m)).join(''):empty('Санал болгох кино одоогоор алга.');
}

async function renderContinueWatching(){
  const target=$('#continueWatching');
  if(!currentUser){ target.innerHTML=empty('Нэвтэрсний дараа үзсэн түүх энд хадгалагдана.'); return; }
  let history=[]; try{ history=await apiJson(api,'/api/me/history'); }catch{ history=[]; }
  if(!history.length){ target.innerHTML=movies.slice(0,4).map(m=>wideHistoryCard({movie:m,progress:0})).join(''); return; }
  target.innerHTML=history.slice(0,8).map(wideHistoryCard).join('');
}

function wideHistoryCard(item){
  const m=item.movie||item; const progress=item.progress||0;
  return `<article class="wide-card" data-action="play" data-id="${m.id}" tabindex="0"><img class="wide-card-img" src="${escapeAttr(m.imgWide||m.img)}" alt="${escapeAttr(m.title)}" loading="lazy"><div class="wide-card-overlay"></div><div class="wide-card-body"><div class="wide-card-label">Continue watching</div><div class="wide-card-title">${escapeHTML(m.title)}</div><div class="muted">${progress}% үзсэн</div><div class="progress-mini"><div class="progress-mini-bar" style="width:${Number(progress)}%"></div></div></div></article>`;
}

function renderSpotlight(){
  const movie=[...movies].sort((a,b)=>b.rating-a.rating)[0]; if(!movie) return;
  $('#spotlightSection').innerHTML=`<div class="spotlight-grid"><div class="spotlight-img-wrap"><img class="spotlight-img" src="${escapeAttr(movie.imgWide||movie.img)}" alt="${escapeAttr(movie.title)}"></div><div><p class="eyebrow">Spotlight content</p><h2 class="spotlight-title">${escapeHTML(movie.title)} <em>${movie.is3D?'IMAX':'HDR'}</em></h2><p class="spotlight-desc">${escapeHTML(movie.desc)}</p><div class="spotlight-stats"><div class="stat"><div class="stat-value">${movie.rating}<span>/10</span></div><div class="stat-label">Rating</div></div><div class="stat"><div class="stat-value">${formatNumber(movie.views||0)}</div><div class="stat-label">Views</div></div><div class="stat"><div class="stat-value">${movie.year}</div><div class="stat-label">Year</div></div></div><button class="btn-primary" data-action="play" data-id="${movie.id}">Одоо үзэх</button></div></div>`;
}

function renderMovieFilters(){
  const keys=[...new Map(movies.map(m=>[m.genreKey,m.genre])).entries()];
  $('#genreFilter').innerHTML='<option value="">Бүх төрөл</option>'+keys.map(([key,label])=>`<option value="${escapeAttr(key)}">${escapeHTML(label)}</option>`).join('');
}

async function applyMovieFilters(){
  const search=encodeURIComponent($('#movieSearch').value.trim());
  const genre=encodeURIComponent($('#genreFilter').value);
  const sort=encodeURIComponent($('#sortFilter').value);
  await loadMovies(`?search=${search}&genre=${genre}&sort=${sort}`);
  renderMovieGrid(movies);
}

function quickFilter(filter){
  showTab('movies');
  if(filter==='3d'){ $('#movieSearch').value=''; $('#genreFilter').value=''; $('#sortFilter').value='rating'; loadMovies('?is3D=true&sort=rating').then(()=>renderMovieGrid(movies)); }
}

function filterGenre(genre){
  activeGenre=genre; renderGenres();
  const result=genre==='Бүгд'?movies:movies.filter(m=>m.genre===genre);
  $('#trending').innerHTML=result.map((m,idx)=>movieCard(m,{rank:idx+1})).join('');
}

function renderMovieGrid(list){ $('#movieGrid').innerHTML=list.length?list.map(m=>movieCard(m)).join(''):empty('Илэрц олдсонгүй.'); }

function movieCard(movie,options={}){
  const added=watchlist.some(w=>w.id===movie.id);
  return `<article class="card" tabindex="0">${options.rank?`<div class="card-rank">${options.rank}</div>`:''}${movie.year>=2024?'<div class="card-new-badge">NEW</div>':''}<div class="card-inner"><img class="card-img" src="${escapeAttr(movie.img)}" alt="${escapeAttr(movie.title)}" loading="lazy"><div class="card-overlay"></div><div class="card-info"><div class="card-title">${escapeHTML(movie.title)}</div><div class="card-tags"><span class="tag">${escapeHTML(movie.genre)}</span>${movie.is3D?'<span class="tag tag-new">3D</span>':''}</div><div class="card-rating">★ ${movie.rating} · ${movie.year}</div><div class="card-actions"><button class="mini-btn mini-btn-play" data-action="play" data-id="${movie.id}">▶ Үзэх</button><button class="mini-btn mini-btn-wl ${added?'added':''}" data-action="toggle-watchlist" data-id="${movie.id}">${added?'✓':'+'}</button></div><button class="text-button" data-action="open-modal" data-id="${movie.id}">Дэлгэрэнгүй</button></div></div></article>`;
}

async function openModal(id){
  currentMovie=await apiJson(api,`/api/movies/${id}`);
  $('#modalImg').src=currentMovie.imgWide||currentMovie.img; $('#modalImg').alt=currentMovie.title;
  $('#modalTitle').textContent=currentMovie.title;
  $('#modalTags').innerHTML=`<span class="tag tag-gold">★ ${currentMovie.rating}</span><span class="tag">${escapeHTML(currentMovie.genre)}</span><span class="tag">${currentMovie.year}</span><span class="tag">${escapeHTML(currentMovie.duration)}</span>${currentMovie.is3D?'<span class="tag tag-new">IMAX 3D</span>':''}`;
  $('#modalDesc').textContent=currentMovie.desc; updateModalWatchlistButton(); await renderReviews(currentMovie.id); $('#modalOverlay').classList.add('open');
}
function closeModal(){ $('#modalOverlay').classList.remove('open'); }
function updateModalWatchlistButton(){ if(!currentMovie)return; const added=watchlist.some(w=>w.id===currentMovie.id); $('#modalWlBtn').textContent=added?'✓ Жагсаалтаас хасах':'+ Жагсаалтад нэмэх'; }

async function toggleWatchlist(movieId){
  if(!currentUser){toast(t('loginRequired')); openAuth(); return;}
  const added=watchlist.some(w=>w.id===movieId);
  if(added){ await apiJson(api,`/api/me/watchlist/${movieId}`,{method:'DELETE'}); toast(t('removed')); }
  else { await apiJson(api,'/api/me/watchlist',{method:'POST',body:JSON.stringify({movieId})}); toast(t('added')); }
  await loadWatchlist(); renderHomeSections(); renderMovieGrid(movies); renderWatchlist(); updateModalWatchlistButton();
}

function renderWatchlist(){
  const grid=$('#watchlistGrid'); $('#watchlistCount').textContent=currentUser?`${watchlist.length} кино`:'Нэвтэрнэ үү';
  if(!currentUser){grid.innerHTML=empty('Жагсаалтаа хадгалахын тулд нэвтэрнэ үү.'); return;}
  grid.innerHTML=watchlist.length?watchlist.map(m=>movieCard(m)).join(''):empty('Жагсаалт хоосон байна. + товчоор кино нэмнэ.');
}

async function renderHistory(){
  const target=$('#historyList');
  if(!currentUser){ target.innerHTML=empty('Үзсэн түүх харахын тулд нэвтэрнэ үү.'); return; }
  const history=await apiJson(api,'/api/me/history');
  target.innerHTML=history.length?history.map(h=>`<article class="history-item"><img src="${escapeAttr(h.movie.imgWide||h.movie.img)}" alt="${escapeAttr(h.movie.title)}"><div><h3>${escapeHTML(h.movie.title)}</h3><p class="muted">${h.progress}% үзсэн · ${new Date(h.updatedAt).toLocaleString()}</p><div class="progress-mini"><div class="progress-mini-bar" style="width:${h.progress}%"></div></div></div><button class="btn-primary" data-action="play" data-id="${h.movie.id}">Үргэлжлүүлэх</button></article>`).join(''):empty('Үзсэн түүх хоосон байна.');
}

async function renderReviews(movieId){
  const reviews=await apiJson(api,`/api/movies/${movieId}/reviews`);
  const avg=reviews.length?(reviews.reduce((s,r)=>s+Number(r.rating),0)/reviews.length).toFixed(1):'-';
  $('#reviewSummary').textContent=reviews.length?`${avg}/5 · ${reviews.length} сэтгэгдэл`:'Сэтгэгдэл алга';
  $('#reviewList').innerHTML=reviews.length?reviews.map(r=>`<div class="review-item"><strong>${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</strong><p>${escapeHTML(r.text)}</p><small>${escapeHTML(r.profileName)} · ${new Date(r.createdAt).toLocaleString()}</small></div>`).join(''):'<p class="muted">Анхны сэтгэгдлийг үлдээгээрэй.</p>';
}

async function submitReview(event){
  event.preventDefault(); if(!currentMovie)return;
  if(!currentUser){toast(t('loginRequired')); openAuth(); return;}
  await apiJson(api,`/api/movies/${currentMovie.id}/reviews`,{method:'POST',body:JSON.stringify({rating:$('#reviewRating').value,text:$('#reviewText').value})});
  $('#reviewText').value=''; await renderReviews(currentMovie.id); toast('Сэтгэгдэл нэмэгдлээ');
}

async function playMovieById(id){ const movie=await apiJson(api,`/api/movies/${id}`); playMovie(movie); }
async function playMovie(movie){ currentMovie=movie; await player.open(movie); if(currentUser) await apiJson(api,'/api/me/history',{method:'POST',body:JSON.stringify({movieId:movie.id,progress:0,seconds:0,duration:0})}); }

function openSearch(){ $('#searchOverlay').classList.add('open'); $('#searchInput').focus(); renderSearchResults(); }
function closeSearch(){ $('#searchOverlay').classList.remove('open'); }
function renderSearchResults(){ const q=$('#searchInput').value.trim().toLowerCase(); const result=q?movies.filter(m=>[m.title,m.genre,m.desc].join(' ').toLowerCase().includes(q)):movies.slice(0,8); $('#searchResults').innerHTML=result.length?result.slice(0,12).map(m=>movieCard(m)).join(''):empty('Илэрц олдсонгүй.'); }

async function login(event){ event.preventDefault(); try{ await auth.login({email:$('#loginEmail').value,password:$('#loginPassword').value}); await refreshSession(); closeAuth(); renderAll(); toast(`Сайн байна уу, ${currentUser.name}`); }catch(e){toast(e.message);} }
async function signup(event){ event.preventDefault(); try{ await auth.register({name:$('#signupName').value,email:$('#signupEmail').value,password:$('#signupPassword').value}); await refreshSession(); closeAuth(); renderAll(); toast('Бүртгэл үүслээ'); }catch(e){toast(e.message);} }
async function logout(){ await auth.logout(); await refreshSession(); renderAll(); toast('Гарлаа'); }
function openAuth(){ $('#authOverlay').classList.add('open'); $('#loginEmail').focus(); }
function closeAuth(){ $('#authOverlay').classList.remove('open'); }
function switchAuthTab(tab){ $$('[data-auth-tab]').forEach(b=>b.classList.toggle('active',b.dataset.authTab===tab)); $$('.auth-form').forEach(f=>f.classList.remove('active')); $(`#${tab}Form`).classList.add('active'); }
function fillDemoLogin(event){ event.preventDefault(); const type=event.target.dataset.fillLogin; openAuth(); switchAuthTab('login'); $('#loginEmail').value=type==='admin'?'admin@cinemongolia.mn':'user@cinemongolia.mn'; $('#loginPassword').value=type==='admin'?'admin123':'user123'; }

async function renderProfiles(){
  const grid=$('#profilesGrid');
  if(!currentUser){grid.innerHTML=empty('Профайл ашиглахын тулд нэвтэрнэ үү.'); return;}
  const profiles=await apiJson(api,'/api/me/profiles'); activeProfile=await auth.activeProfile();
  grid.innerHTML=profiles.map(p=>`<article class="profile-card ${p.id===activeProfile?.id?'active':''}"><div class="profile-avatar">${escapeHTML(p.avatar)}</div><h3>${escapeHTML(p.name)}</h3><p class="muted">Maturity: ${escapeHTML(p.maturity)}</p><button class="btn-secondary" data-action="switch-profile" data-id="${escapeAttr(p.id)}">Сонгох</button></article>`).join('');
}
async function addProfile(event){ event.preventDefault(); if(!currentUser){openAuth(); return;} try{ await apiJson(api,'/api/me/profiles',{method:'POST',body:JSON.stringify({name:$('#profileName').value,maturity:$('#profileMaturity').value})}); event.target.reset(); renderProfiles(); toast('Профайл нэмэгдлээ'); }catch(e){toast(e.message);} }
async function switchProfile(id){ await apiJson(api,`/api/me/profiles/${id}/switch`,{method:'POST'}); await refreshSession(); renderAll(); toast(`Профайл: ${activeProfile?.name}`); }

function renderPlans(){
  const plans=[{id:'basic',name:'Basic',price:'₮9,900',features:['HD streaming','1 profile','Mobile + Web']},{id:'standard',name:'Standard',price:'₮16,900',featured:true,features:['Full HD','3 profiles','Offline cache']},{id:'premium',name:'Premium',price:'₮24,900',features:['4K HDR','5 profiles','IMAX / 3D badge','Priority releases']}];
  $('#plansGrid').innerHTML=plans.map(p=>`<article class="plan-card ${p.featured?'featured':''}"><h3>${p.name}</h3><div class="plan-price">${p.price}</div><ul>${p.features.map(f=>`<li>${escapeHTML(f)}</li>`).join('')}</ul><button class="btn-primary" data-action="subscribe" data-plan="${p.id}">Сонгох</button></article>`).join('');
}
async function subscribe(plan){ if(!currentUser){openAuth(); return;} await apiJson(api,'/api/payments/subscribe',{method:'POST',body:JSON.stringify({plan})}); toast(t('subscribed')); }

async function renderAdmin(){
  if(currentUser?.role!=='admin')return;
  const stats=await apiJson(api,'/api/admin/analytics');
  $('#analyticsCards').innerHTML=[['Нийт кино',stats.movies],['Хэрэглэгч',stats.users],['Watch events',stats.watchEvents],['Reviews',stats.reviews],['Total views',formatNumber(stats.totalViews)],['Top movie',stats.topMovie]].map(([label,value])=>`<div class="metric-card"><div class="metric-value">${escapeHTML(String(value))}</div><div class="metric-label">${escapeHTML(label)}</div></div>`).join('');
  const all=await apiJson(api,'/api/movies?sort=newest');
  $('#adminMovies').innerHTML=all.map(m=>`<div class="admin-row"><img src="${escapeAttr(m.img)}" alt="${escapeAttr(m.title)}"><div><strong>${escapeHTML(m.title)}</strong><p class="muted">${escapeHTML(m.genre)} · ${m.year} · ★ ${m.rating}</p></div><div class="admin-actions"><button class="btn-secondary" data-action="admin-edit" data-id="${m.id}">Засах</button><button class="btn-secondary" data-action="admin-delete" data-id="${m.id}">Устгах</button></div></div>`).join('');
}

function fillMovieForm(id){ const m=movies.find(x=>x.id===id); if(!m)return; $('#movieId').value=m.id; $('#movieTitle').value=m.title; $('#movieGenre').value=m.genre; $('#movieGenreKey').value=m.genreKey; $('#movieDesc').value=m.desc; $('#movieYear').value=m.year; $('#movieRating').value=m.rating; $('#movieDuration').value=m.duration; $('#movieAge').value=m.age||'16+'; $('#movieImg').value=m.img; $('#movieImgWide').value=m.imgWide; $('#movieVideo').value=m.videoSrc||''; $('#movieIs3D').checked=m.is3D; $('#movieMongolian').checked=m.mongolian; toast('Засах мэдээллийг форм дээр орууллаа'); }
function clearMovieForm(){ $('#movieForm').reset(); $('#movieId').value=''; }
async function saveMovie(event){ event.preventDefault(); const payload={title:$('#movieTitle').value,genre:$('#movieGenre').value,genreKey:$('#movieGenreKey').value,desc:$('#movieDesc').value,year:Number($('#movieYear').value),rating:Number($('#movieRating').value),duration:$('#movieDuration').value,age:$('#movieAge').value,img:$('#movieImg').value,imgWide:$('#movieImgWide').value,videoSrc:$('#movieVideo').value||'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',is3D:$('#movieIs3D').checked,mongolian:$('#movieMongolian').checked}; const id=$('#movieId').value; if(id) await apiJson(api,`/api/movies/${id}`,{method:'PUT',body:JSON.stringify(payload)}); else await apiJson(api,'/api/movies',{method:'POST',body:JSON.stringify(payload)}); await loadMovies(); renderAll(); clearMovieForm(); toast(t('saved')); }
async function deleteMovie(id){ if(!confirm('Энэ киног устгах уу?'))return; await apiJson(api,`/api/movies/${id}`,{method:'DELETE'}); await loadMovies(); renderAll(); toast(t('deleted')); }

async function sendChat(event){ event.preventDefault(); const input=$('#chatInput'); const text=input.value.trim(); if(!text)return; await apiJson(api,'/api/chat',{method:'POST',body:JSON.stringify({text})}); input.value=''; renderChat(); }
async function renderChat(){ const messages=await apiJson(api,'/api/chat'); $('#chatMessages').innerHTML=messages.length?messages.map(m=>`<div class="chat-message"><strong>${escapeHTML(m.name)}</strong><p>${escapeHTML(m.text)}</p><small>${new Date(m.createdAt).toLocaleTimeString()}</small></div>`).join(''):'<p class="muted">Live chat хоосон байна.</p>'; $('#chatMessages').scrollTop=$('#chatMessages').scrollHeight; }
function startChatBot(){ const texts=['Шинэ 3D кино нэмэгдлээ!','Cine Mongolia Premium дээр 4K HDR идэвхтэй.','Та watchlist-ээ хадгалаад offline горимд ашиглаж болно.']; setInterval(async()=>{ if(document.hidden)return; const text=texts[Math.floor(Math.random()*texts.length)]; await db.put('chatMessages',{id:db.id('chat'),userId:'bot',name:'Cine Mongolia Bot',text,createdAt:new Date().toISOString()}); if($('#liveChat').classList.contains('open')) renderChat(); },30000); }

async function notifyDemo(){ await apiJson(api,'/api/notifications',{method:'POST',body:JSON.stringify({title:'Cine Mongolia',body:'Шинэ кинонууд нэмэгдлээ!'})}); if('Notification' in window){ const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission(); if(permission==='granted') new Notification('Cine Mongolia',{body:'Шинэ кинонууд нэмэгдлээ!'}); } toast('Push notification simulation ажиллалаа'); }
function setupPWA(){ if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js').then(()=>toast(t('offlineReady'))).catch(()=>{}); } }
async function installPWA(){ if(!deferredInstall){toast('Install prompt одоогоор идэвхгүй байна. Browser menu → Add to Home Screen ашиглана уу.'); return;} deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall=null; }
async function resetDb(){ if(!confirm('Database reset хийх үү?'))return; await db.reset(); await auth.logout(); await refreshSession(); await loadMovies(); renderAll(); toast('Database шинэчлэгдлээ'); }
function toggleLanguage(){ lang=lang==='mn'?'en':'mn'; localStorage.setItem('cine_mongolia_lang',lang); toast(lang==='mn'?'Монгол хэл идэвхтэй':'English mode active'); }
function scrollCarousel(button,next=true){ const wrap=button.closest('.carousel-wrap'); const carousel=$('.carousel',wrap); carousel.scrollBy({left:next?520:-520,behavior:'smooth'}); }
function observeReveal(){ const observer=new IntersectionObserver(entries=>entries.forEach(entry=>entry.target.classList.toggle('visible',entry.isIntersecting)),{threshold:.1}); $$('.fade-up').forEach(el=>observer.observe(el)); }
function empty(text){ return `<div class="no-results">${escapeHTML(text)}</div>`; }
function debounce(fn,ms){ let timer; return (...args)=>{clearTimeout(timer); timer=setTimeout(()=>fn(...args),ms);}; }
function escapeHTML(value){ return String(value??'').replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch])); }
function escapeAttr(value){ return escapeHTML(value).replaceAll('`','&#096;'); }
function formatNumber(value){ return new Intl.NumberFormat('mn-MN',{notation:value>9999?'compact':'standard'}).format(value); }

init().catch(error=>{ console.error(error); hideLoading(); toast(error.message||'Алдаа гарлаа'); });
