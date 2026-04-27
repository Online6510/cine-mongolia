import { clone, makeTimestamp } from './database.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export class APIError extends Error{constructor(message,status=400){super(message);this.status=status;}}

export class SimulatedAPI {
  constructor(db,auth){this.db=db;this.auth=auth;}
  async request(path,options={}){
    await sleep(120+Math.random()*180);
    const method=(options.method||'GET').toUpperCase(); const url=new URL(path,location.origin);
    const body=options.body?JSON.parse(options.body):null;
    try{const data=await this.route(url.pathname,method,url.searchParams,body); return {ok:true,status:200,json:async()=>clone(data)};}
    catch(e){return {ok:false,status:e.status||500,json:async()=>({error:e.message||'Server simulation error'})};}
  }
  async route(path,method,query,body){
    if(path==='/api/movies'&&method==='GET')return this.getMovies(query);
    if(path==='/api/movies'&&method==='POST')return this.createMovie(body);
    if(path.match(/^\/api\/movies\/\d+$/)&&method==='GET')return this.getMovie(Number(path.split('/').pop()));
    if(path.match(/^\/api\/movies\/\d+$/)&&method==='PUT')return this.updateMovie(Number(path.split('/').pop()),body);
    if(path.match(/^\/api\/movies\/\d+$/)&&method==='DELETE')return this.deleteMovie(Number(path.split('/').pop()));
    if(path==='/api/me/watchlist'&&method==='GET')return this.getWatchlist();
    if(path==='/api/me/watchlist'&&method==='POST')return this.addWatchlist(body.movieId);
    if(path.match(/^\/api\/me\/watchlist\/\d+$/)&&method==='DELETE')return this.removeWatchlist(Number(path.split('/').pop()));
    if(path==='/api/me/history'&&method==='GET')return this.getHistory();
    if(path==='/api/me/history'&&method==='POST')return this.addHistory(body);
    if(path==='/api/me/profiles'&&method==='GET')return this.auth.getProfiles();
    if(path==='/api/me/profiles'&&method==='POST')return this.auth.addProfile(body);
    if(path.match(/^\/api\/me\/profiles\/.+\/switch$/)&&method==='POST')return this.auth.switchProfile(path.split('/')[4]);
    if(path.match(/^\/api\/movies\/\d+\/reviews$/)&&method==='GET')return this.getReviews(Number(path.split('/')[3]));
    if(path.match(/^\/api\/movies\/\d+\/reviews$/)&&method==='POST')return this.addReview(Number(path.split('/')[3]),body);
    if(path==='/api/recommendations'&&method==='GET')return this.getRecommendations();
    if(path==='/api/analytics/view'&&method==='POST')return this.trackView(body);
    if(path==='/api/admin/analytics'&&method==='GET')return this.analytics();
    if(path==='/api/payments/subscribe'&&method==='POST')return this.subscribe(body.plan);
    if(path==='/api/notifications'&&method==='GET')return this.getNotifications();
    if(path==='/api/notifications'&&method==='POST')return this.addNotification(body);
    if(path==='/api/chat'&&method==='GET')return this.getChat();
    if(path==='/api/chat'&&method==='POST')return this.sendChat(body);
    throw new APIError(`Endpoint not found: ${method} ${path}`,404);
  }
  async getMovies(query){
    let movies=await this.db.getAll('movies'); const search=(query.get('search')||'').trim().toLowerCase();
    const genre=query.get('genre')||''; const is3D=query.get('is3D')||''; const mongolian=query.get('mongolian')||''; const sort=query.get('sort')||'popular';
    if(search)movies=movies.filter(m=>[m.title,m.genre,m.genreKey,m.desc,String(m.year)].join(' ').toLowerCase().includes(search));
    if(genre)movies=movies.filter(m=>m.genreKey===genre||m.genre===genre);
    if(is3D==='true')movies=movies.filter(m=>m.is3D);
    if(mongolian==='true')movies=movies.filter(m=>m.mongolian);
    const sorters={rating:(a,b)=>b.rating-a.rating,newest:(a,b)=>b.year-a.year||b.id-a.id,az:(a,b)=>a.title.localeCompare(b.title),popular:(a,b)=>(b.views||0)-(a.views||0)};
    movies.sort(sorters[sort]||sorters.popular); return movies;
  }
  async getMovie(id){const movie=await this.db.get('movies',id); if(!movie)throw new APIError('Кино олдсонгүй.',404); return movie;}
  async createMovie(movie){await this.auth.requireAdmin(); const movies=await this.db.getAll('movies'); const id=Math.max(0,...movies.map(m=>Number(m.id)))+1; const payload={...movie,id,rating:Number(movie.rating),year:Number(movie.year),views:0,createdAt:makeTimestamp()}; await this.db.put('movies',payload); return payload;}
  async updateMovie(id,movie){await this.auth.requireAdmin(); const old=await this.getMovie(id); const payload={...old,...movie,id,rating:Number(movie.rating),year:Number(movie.year),updatedAt:makeTimestamp()}; await this.db.put('movies',payload); return payload;}
  async deleteMovie(id){await this.auth.requireAdmin(); await this.db.delete('movies',id); return {deleted:true};}
  async getProfileContext(){const user=await this.auth.requireUser(); const profile=await this.auth.activeProfile(); if(!profile)throw new APIError('Идэвхтэй профайл алга.',401); return {user,profile};}
  async getWatchlist(){const {user,profile}=await this.getProfileContext(); const rows=await this.db.find('watchlist',w=>w.userId===user.id&&w.profileId===profile.id); const movies=await this.db.getAll('movies'); return rows.map(w=>movies.find(m=>m.id===w.movieId)).filter(Boolean);}
  async addWatchlist(movieId){const {user,profile}=await this.getProfileContext(); await this.getMovie(Number(movieId)); const id=`${user.id}_${profile.id}_${movieId}`; const row={id,userId:user.id,profileId:profile.id,movieId:Number(movieId),createdAt:makeTimestamp()}; await this.db.put('watchlist',row); return row;}
  async removeWatchlist(movieId){const {user,profile}=await this.getProfileContext(); await this.db.delete('watchlist',`${user.id}_${profile.id}_${movieId}`); return {deleted:true};}
  async getHistory(){const {user,profile}=await this.getProfileContext(); const rows=await this.db.find('watchHistory',h=>h.userId===user.id&&h.profileId===profile.id); const movies=await this.db.getAll('movies'); return rows.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).map(h=>({...h,movie:movies.find(m=>m.id===h.movieId)})).filter(x=>x.movie);}
  async addHistory({movieId,progress=0,seconds=0,duration=0}){const {user,profile}=await this.getProfileContext(); const movie=await this.getMovie(Number(movieId)); const id=`${user.id}_${profile.id}_${movie.id}`; const row={id,userId:user.id,profileId:profile.id,movieId:movie.id,progress,seconds,duration,updatedAt:makeTimestamp()}; await this.db.put('watchHistory',row); return row;}
  async getReviews(movieId){return (await this.db.find('reviews',r=>r.movieId===movieId)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));}
  async addReview(movieId,{rating,text}){const {user,profile}=await this.getProfileContext(); await this.getMovie(movieId); const review={id:this.db.id('review'),movieId,userId:user.id,profileId:profile.id,profileName:profile.name,rating:Number(rating),text:String(text).slice(0,300),createdAt:makeTimestamp()}; await this.db.put('reviews',review); return review;}
  async getRecommendations(){const movies=await this.getMovies(new URLSearchParams('sort=popular')); const user=await this.auth.currentUser(); if(!user)return movies.slice(0,8); const profile=await this.auth.activeProfile(); const history=await this.db.find('watchHistory',h=>h.userId===user.id&&h.profileId===profile?.id); const watchedIds=new Set(history.map(h=>h.movieId)); const watchedMovies=movies.filter(m=>watchedIds.has(m.id)); const fav=new Map(); watchedMovies.forEach(m=>fav.set(m.genreKey,(fav.get(m.genreKey)||0)+1)); return movies.filter(m=>!watchedIds.has(m.id)).map(m=>({...m,score:(fav.get(m.genreKey)||0)*2+(m.rating||0)/2+(m.is3D?.5:0)})).sort((a,b)=>b.score-a.score).slice(0,8);}
  async trackView({movieId,event='view',seconds=0}){const movie=await this.getMovie(Number(movieId)); await this.db.put('movies',{...movie,views:(movie.views||0)+1}); const row={id:this.db.id('analytics'),movieId:movie.id,event,seconds,createdAt:makeTimestamp()}; await this.db.put('analytics',row); return row;}
  async analytics(){await this.auth.requireAdmin(); const movies=await this.db.getAll('movies'); const users=await this.db.getAll('users'); const history=await this.db.getAll('watchHistory'); const reviews=await this.db.getAll('reviews'); const views=movies.reduce((s,m)=>s+(m.views||0),0); const topMovie=[...movies].sort((a,b)=>(b.views||0)-(a.views||0))[0]; return {movies:movies.length,users:users.length,watchEvents:history.length,reviews:reviews.length,totalViews:views,topMovie:topMovie?.title||'-'};}
  async subscribe(plan){const user=await this.auth.requireUser(); const sub={id:`sub_${user.id}`,userId:user.id,plan,status:'active',startedAt:makeTimestamp(),paymentProvider:'CINE_MONGOLIA_PAY_SIMULATION'}; await this.db.put('subscriptions',sub); return sub;}
  async getNotifications(){const user=await this.auth.currentUser(); if(!user)return[]; return this.db.find('notifications',n=>n.userId===user.id||n.userId==='all');}
  async addNotification({title,body,userId='all'}){const row={id:this.db.id('notification'),userId,title,body,read:false,createdAt:makeTimestamp()}; await this.db.put('notifications',row); return row;}
  async getChat(){return (await this.db.getAll('chatMessages')).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)).slice(-50);}
  async sendChat({text}){const user=await this.auth.currentUser(); const profile=await this.auth.activeProfile(); const msg={id:this.db.id('chat'),userId:user?.id||'guest',name:profile?.name||user?.name||'Guest',text:String(text).slice(0,240),createdAt:makeTimestamp()}; await this.db.put('chatMessages',msg); return msg;}
}
export async function apiJson(api,path,options={}){const res=await api.request(path,options); const data=await res.json(); if(!res.ok)throw new APIError(data.error||'API error',res.status); return data;}
