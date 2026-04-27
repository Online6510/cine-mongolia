export class VideoPlayer {
  constructor({api,onProgress}) {
    this.api=api; this.onProgress=onProgress; this.movie=null; this.progressTimer=null; this.usingMSE=false;
    this.overlay=document.getElementById('playerOverlay');
    this.video=document.getElementById('playerVideo');
    this.embed=document.getElementById('playerEmbed');
    this.fake=document.getElementById('playerFake');
    this.bgTitle=document.getElementById('playerBgTitle');
    this.topTitle=document.getElementById('playerTopTitle');
    this.seek=document.getElementById('playerSeek');
    this.currentTime=document.getElementById('playerCurrentTime');
    this.duration=document.getElementById('playerDuration');
    this.volume=document.getElementById('playerVol');
    this.quality=document.getElementById('playerQuality');
    this.video.addEventListener('timeupdate',()=>this.syncProgress());
    this.video.addEventListener('loadedmetadata',()=>this.syncProgress());
    this.video.addEventListener('play',()=>this.startTracking());
    this.video.addEventListener('pause',()=>this.stopTracking());
    this.seek.addEventListener('input',()=>this.seekTo(Number(this.seek.value)));
    this.volume.addEventListener('input',()=>this.setVolume(Number(this.volume.value)));
  }
  async open(movie) {
    this.movie=movie; this.overlay.classList.add('open'); this.bgTitle.textContent=movie.title; this.topTitle.textContent=movie.title;
    this.quality.textContent=movie.isReal ? (movie.license || 'LEGAL STREAM') : (movie.is3D?'IMAX 3D':'4K HDR');
    this.video.pause(); this.video.removeAttribute('src'); this.video.load();
    if (this.embed) { this.embed.src='about:blank'; this.embed.hidden=true; }
    if (movie.embedSrc) {
      this.overlay.classList.add('embed-mode');
      this.fake.classList.remove('visible');
      this.video.hidden=true;
      if (this.embed) {
        this.embed.hidden=false;
        this.embed.src=movie.embedSrc;
        this.embed.title=movie.title;
      }
      await this.track('start');
      return;
    }
    this.overlay.classList.remove('embed-mode');
    this.video.hidden=false;
    this.fake.classList.add('visible');
    await this.attachStream(movie.videoSrc);
    setTimeout(()=>this.fake.classList.remove('visible'),650); this.video.play().catch(()=>{}); await this.track('start');
  }
  async attachStream(url) {
    // Media Source Extensions support is detected; demo uses progressive mp4 fallback for reliability.
    this.usingMSE=Boolean(window.MediaSource||window.ManagedMediaSource);
    if(url){this.video.src=url; this.video.volume=Number(this.volume.value)/100;} else this.fake.classList.add('visible');
  }
  async track(event){if(!this.movie)return; try{await this.api.request('/api/analytics/view',{method:'POST',body:JSON.stringify({movieId:this.movie.id,event,seconds:Math.round(this.video.currentTime||0)})});}catch{}}
  startTracking(){this.stopTracking(); this.progressTimer=setInterval(()=>this.saveProgress(),5000);}
  stopTracking(){if(this.progressTimer)clearInterval(this.progressTimer); this.progressTimer=null; this.saveProgress();}
  async saveProgress(){if(!this.movie||!this.onProgress)return; const duration=this.video.duration||0; const seconds=this.video.currentTime||0; const progress=duration?Math.round(seconds/duration*100):0; await this.onProgress({movieId:this.movie.id,progress,seconds,duration});}
  close(){this.stopTracking(); this.video.pause(); if(this.embed){this.embed.src='about:blank'; this.embed.hidden=true;} this.video.hidden=false; this.overlay.classList.remove('open','embed-mode');}
  toggle(){if(this.video.paused)this.video.play().catch(()=>{}); else this.video.pause();}
  skip(seconds){if(!this.video.duration)return; this.video.currentTime=Math.min(Math.max(0,this.video.currentTime+seconds),this.video.duration);}
  seekTo(percent){if(!this.video.duration)return; this.video.currentTime=percent/100*this.video.duration;}
  setVolume(value){this.video.volume=value/100; this.video.muted=value===0;}
  mute(){this.video.muted=!this.video.muted;}
  fullscreen(){const wrap=document.getElementById('playerWrap'); if(!document.fullscreenElement)wrap.requestFullscreen?.(); else document.exitFullscreen?.();}
  syncProgress(){const duration=this.video.duration||0; const current=this.video.currentTime||0; this.seek.value=duration?Math.round(current/duration*100):0; this.currentTime.textContent=this.format(current); this.duration.textContent=this.format(duration);}
  format(seconds){if(!Number.isFinite(seconds))return'0:00'; const s=Math.floor(seconds%60).toString().padStart(2,'0'); const m=Math.floor(seconds/60%60); const h=Math.floor(seconds/3600); return h?`${h}:${String(m).padStart(2,'0')}:${s}`:`${m}:${s}`;}
}
