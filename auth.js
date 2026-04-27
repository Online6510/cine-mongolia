import { makeTimestamp } from './database.js';

function b64url(input){return btoa(unescape(encodeURIComponent(input))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
function parseB64url(input){return decodeURIComponent(escape(atob(input.replaceAll('-','+').replaceAll('_','/'))));}

export class AuthService {
  constructor(db){this.db=db;this.tokenKey='cine_mongolia_token';this.profileKey='cine_mongolia_active_profile';}
  createToken(user){
    const header=b64url(JSON.stringify({alg:'HS256',typ:'JWT',demo:true}));
    const payload=b64url(JSON.stringify({sub:user.id,email:user.email,role:user.role,iat:Date.now(),exp:Date.now()+1000*60*60*24*7}));
    const signature=b64url(`cine-mongolia-demo-signature-${user.id}`);
    return `${header}.${payload}.${signature}`;
  }
  parseToken(token){try{return JSON.parse(parseB64url(token.split('.')[1]));}catch{return null;}}
  async register({name,email,password}){
    const normalized=email.trim().toLowerCase();
    const exists=(await this.db.find('users',u=>u.email===normalized))[0];
    if(exists) throw new Error('Энэ имэйл бүртгэлтэй байна.');
    const user={id:this.db.id('user'),name:name.trim(),email:normalized,passwordHash:password,role:'user',createdAt:makeTimestamp()};
    await this.db.put('users',user);
    const profile={id:this.db.id('profile'),userId:user.id,name:user.name,avatar:user.name.slice(0,1).toUpperCase(),maturity:'all',active:true,createdAt:makeTimestamp()};
    await this.db.put('profiles',profile);
    return this.login({email,password});
  }
  async login({email,password}){
    const normalized=email.trim().toLowerCase();
    const user=(await this.db.find('users',u=>u.email===normalized&&u.passwordHash===password))[0];
    if(!user) throw new Error('Имэйл эсвэл нууц үг буруу байна.');
    const token=this.createToken(user);
    await this.db.put('sessions',{token,userId:user.id,createdAt:makeTimestamp(),expiresAt:new Date(Date.now()+1000*60*60*24*7).toISOString()});
    localStorage.setItem(this.tokenKey,token);
    const profiles=await this.getProfiles(user.id);
    const active=profiles.find(p=>p.active)||profiles[0];
    if(active) localStorage.setItem(this.profileKey,active.id);
    return {token,user};
  }
  async logout(){const token=this.getToken(); if(token) await this.db.delete('sessions',token); localStorage.removeItem(this.tokenKey); localStorage.removeItem(this.profileKey);}
  getToken(){return localStorage.getItem(this.tokenKey);}
  async currentUser(){
    const token=this.getToken(); if(!token) return null;
    const payload=this.parseToken(token); const session=await this.db.get('sessions',token);
    if(!payload||!session||payload.exp<Date.now()){await this.logout(); return null;}
    return this.db.get('users',payload.sub);
  }
  async requireUser(){const user=await this.currentUser(); if(!user) throw new Error('Эхлээд нэвтэрнэ үү.'); return user;}
  async requireAdmin(){const user=await this.requireUser(); if(user.role!=='admin') throw new Error('Admin эрх шаардлагатай.'); return user;}
  async getProfiles(userId=null){const user=userId?{id:userId}:await this.requireUser(); return this.db.find('profiles',p=>p.userId===user.id);}
  async activeProfile(){
    const user=await this.currentUser(); if(!user) return null;
    const profiles=await this.getProfiles(user.id); const selectedId=localStorage.getItem(this.profileKey);
    return profiles.find(p=>p.id===selectedId)||profiles.find(p=>p.active)||profiles[0]||null;
  }
  async addProfile({name,maturity}){
    const user=await this.requireUser(); const profiles=await this.getProfiles(user.id);
    if(profiles.length>=5) throw new Error('Нэг аккаунтад 5 хүртэл профайл үүсгэнэ.');
    const profile={id:this.db.id('profile'),userId:user.id,name:name.trim(),avatar:name.trim().slice(0,1).toUpperCase(),maturity,active:false,createdAt:makeTimestamp()};
    await this.db.put('profiles',profile); return profile;
  }
  async switchProfile(profileId){
    const user=await this.requireUser(); const profiles=await this.getProfiles(user.id);
    if(!profiles.find(p=>p.id===profileId)) throw new Error('Профайл олдсонгүй.');
    for(const p of profiles) await this.db.put('profiles',{...p,active:p.id===profileId});
    localStorage.setItem(this.profileKey,profileId);
    return this.activeProfile();
  }
}
