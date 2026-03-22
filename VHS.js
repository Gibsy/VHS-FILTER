const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');
let W = 640, H = 360;
 
const offCanvas = document.createElement('canvas');
offCanvas.width = W; offCanvas.height = H;
const off = offCanvas.getContext('2d');
 
const prevCanvas = document.createElement('canvas');
prevCanvas.width = W; prevCanvas.height = H;
const prevCtx = prevCanvas.getContext('2d');
 
let REC_W = 960, REC_H = 540;
const recCanvas = document.createElement('canvas');
recCanvas.width = REC_W; recCanvas.height = REC_H;
const recCtx = recCanvas.getContext('2d');
 
let track=30, chroma=4, flicker=20, fog=25, glitch=15, vig=65, phos=40, hsync=20;
let showRGB=false, showFilm=true, showDate=true, soundEnabled=true;
let bgImage=null, bgVideo=null, bgStream=null;
let frame=0, recBlink=true;
let trackLines=[], glitchBlocks=[];
 
let barrelLUT = null;
 
function buildBarrelLUT() {
  barrelLUT = new Int32Array(W * H * 2);
  const cx=W/2, cy=H/2, k=0.06;
  for (let y=0; y<H; y++) {
    for (let x=0; x<W; x++) {
      const nx=(x-cx)/cx, ny=(y-cy)/cy;
      const f=1+k*(nx*nx+ny*ny);
      const sx=Math.round(nx/f*cx+cx), sy=Math.round(ny/f*cy+cy);
      const li=(y*W+x)*2;
      if (sx>=0&&sx<W&&sy>=0&&sy<H) { barrelLUT[li]=sx; barrelLUT[li+1]=sy; }
      else barrelLUT[li]=-1;
    }
  }
}
buildBarrelLUT();
 
let audioCtx = null;
let tapeHissSrc = null, tapeHissGain = null;
let videoAudioSrc = null;   
let videoVolGain  = null;   
let recAudioTrack = null;   
 
function getAC() {
  if (!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  return audioCtx;
}
function resumeAC() { const ac=getAC(); if(ac.state==='suspended') ac.resume(); }
 
function playClick() {
  if (!soundEnabled) return;
  try {
    const ac=getAC(); resumeAC();
    const buf=ac.createBuffer(1,ac.sampleRate*0.025,ac.sampleRate);
    const d=buf.getChannelData(0);
    for (let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.exp(-i/(d.length*0.1));
    const src=ac.createBufferSource(), g=ac.createGain();
    src.buffer=buf; g.gain.value=0.055;
    src.connect(g); g.connect(ac.destination); src.start();
  } catch(e){}
}
 
function playBeep(freq=880, dur=0.07, vol=0.08) {
  if (!soundEnabled) return;
  try {
    const ac=getAC(); resumeAC();
    const osc=ac.createOscillator(), g=ac.createGain();
    osc.frequency.value=freq; osc.type='sine';
    g.gain.setValueAtTime(vol,ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+dur);
    osc.connect(g); g.connect(ac.destination);
    osc.start(); osc.stop(ac.currentTime+dur+0.01);
  } catch(e){}
}
 
function startTapeHiss() {
  if (!soundEnabled) return;
  stopTapeHiss();
  try {
    const ac=getAC(); resumeAC();
    const len=ac.sampleRate*3;
    const buf=ac.createBuffer(1,len,ac.sampleRate);
    const d=buf.getChannelData(0);
    for (let i=0;i<len;i++) d[i]=Math.random()*2-1;
    const src=ac.createBufferSource();
    src.buffer=buf; src.loop=true;
    const hpf=ac.createBiquadFilter();
    hpf.type='highpass'; hpf.frequency.value=6000; hpf.Q.value=0.5;
    const g=ac.createGain(); g.gain.value=0;
    src.connect(hpf); hpf.connect(g); g.connect(ac.destination);
    src.start();
    g.gain.linearRampToValueAtTime(0.016, ac.currentTime+1.0);
    tapeHissSrc=src; tapeHissGain=g;
  } catch(e){}
}
 
function stopTapeHiss() {
  try {
    if (tapeHissSrc && tapeHissGain) {
      tapeHissGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime+0.5);
      const s=tapeHissSrc;
      setTimeout(()=>{ try{s.stop();}catch(e){} }, 600);
      tapeHissSrc=null; tapeHissGain=null;
    }
  } catch(e){}
}
 
function setupVideoAudioRouting(vid) {
  try {
    const ac=getAC(); resumeAC();
    if (videoAudioSrc) { try{videoAudioSrc.disconnect();}catch(e){} }
    if (videoVolGain)  { try{videoVolGain.disconnect(); }catch(e){} }
    videoAudioSrc = ac.createMediaElementSource(vid);
    videoVolGain  = ac.createGain();
    videoVolGain.gain.value = document.getElementById('vid-vol')
      ? document.getElementById('vid-vol').value / 100 : 0.8;
    const dest = ac.createMediaStreamDestination();
    videoAudioSrc.connect(videoVolGain);
    videoVolGain.connect(dest);
    videoVolGain.connect(ac.destination); 
    recAudioTrack = dest.stream.getAudioTracks()[0] || null;
  } catch(e) { recAudioTrack=null; }
}
 
function setVideoVolume(v) { 
  if (videoVolGain) videoVolGain.gain.value = v;
}
 
document.getElementById('s_track').oninput   = e => track   = +e.target.value;
document.getElementById('s_chroma').oninput  = e => chroma  = +e.target.value;
document.getElementById('s_flicker').oninput = e => flicker = +e.target.value;
document.getElementById('s_fog').oninput     = e => fog     = +e.target.value;
document.getElementById('s_glitch').oninput  = e => glitch  = +e.target.value;
document.getElementById('s_vig').oninput     = e => vig     = +e.target.value;
document.getElementById('s_phos').oninput    = e => phos    = +e.target.value;
document.getElementById('s_hsync').oninput   = e => hsync   = +e.target.value;
document.getElementById('s_rgb').onchange    = e => { showRGB=e.target.checked;  playClick(); };
document.getElementById('s_film').onchange   = e => { showFilm=e.target.checked; playClick(); };
document.getElementById('s_date').onchange   = e => { showDate=e.target.checked; playClick(); };
document.getElementById('s_sound').onchange  = e => { soundEnabled=e.target.checked; };
 
function getSettings() {
  return { track, chroma, flicker, fog, glitch, vig, phos, hsync, showRGB, showFilm, showDate };
}
function applySettings(s) {
  track=s.track; chroma=s.chroma; flicker=s.flicker; fog=s.fog;
  glitch=s.glitch; vig=s.vig; phos=s.phos; hsync=s.hsync;
  showRGB=s.showRGB; showFilm=s.showFilm; showDate=s.showDate;
  document.getElementById('s_track').value   = track;
  document.getElementById('s_chroma').value  = chroma;
  document.getElementById('s_flicker').value = flicker;
  document.getElementById('s_fog').value     = fog;
  document.getElementById('s_glitch').value  = glitch;
  document.getElementById('s_vig').value     = vig;
  document.getElementById('s_phos').value    = phos;
  document.getElementById('s_hsync').value   = hsync;
  document.getElementById('s_rgb').checked   = showRGB;
  document.getElementById('s_film').checked  = showFilm;
  document.getElementById('s_date').checked  = showDate;
}
function updatePresetUI() {
  for (let i=0; i<4; i++) {
    const has=!!localStorage.getItem('vhs_preset_'+i);
    document.getElementById('slot-'+i).querySelectorAll('button').forEach(b=>b.classList.toggle('has-data',has));
  }
}
document.querySelectorAll('.load-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const s=localStorage.getItem('vhs_preset_'+btn.dataset.slot);
    if (s) { applySettings(JSON.parse(s)); playBeep(660,0.06); setStatus('preset loaded'); }
    else   { localStorage.setItem('vhs_preset_'+btn.dataset.slot,JSON.stringify(getSettings())); updatePresetUI(); playBeep(880,0.06); setStatus('preset saved — right-click to overwrite'); }
  });
  btn.addEventListener('contextmenu', e => {
    e.preventDefault();
    localStorage.setItem('vhs_preset_'+btn.dataset.slot,JSON.stringify(getSettings()));
    updatePresetUI(); playBeep(880,0.06); setStatus('preset overwritten');
  });
});
document.querySelectorAll('.save-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const key='vhs_preset_'+btn.dataset.slot;
    if (btn.classList.contains('has-data')) { localStorage.removeItem(key); updatePresetUI(); playClick(); setStatus('preset cleared'); }
    else { localStorage.setItem(key,JSON.stringify(getSettings())); updatePresetUI(); playBeep(880,0.06); setStatus('preset saved'); }
  });
});
updatePresetUI();
 
function stopSource() {
  if (bgVideo) { bgVideo.pause(); bgVideo.src=''; bgVideo=null; }
  if (bgStream) { bgStream.getTracks().forEach(t=>t.stop()); bgStream=null; }
  bgImage=null; recAudioTrack=null;
  stopTapeHiss();
}
 
document.getElementById('btn-source').addEventListener('click', () => {
  stopSource();
  document.getElementById('dropzone').classList.remove('hidden');
  document.getElementById('vid-controls').classList.remove('visible');
  playClick();
});
 
const wrap = document.getElementById('wrap');
wrap.addEventListener('dragover',  e => { e.preventDefault(); wrap.classList.add('dragover'); });
wrap.addEventListener('dragleave', () => wrap.classList.remove('dragover'));
wrap.addEventListener('drop', e => {
  e.preventDefault(); wrap.classList.remove('dragover');
  const file=e.dataTransfer.files[0]; if (!file) return;
  file.type.startsWith('image/')?loadImage(file):loadVideo(file);
});
document.getElementById('btn-file').addEventListener('click', e => {
  e.stopPropagation();
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*,video/*';
  inp.onchange=ev=>{ const f=ev.target.files[0]; if(!f) return; f.type.startsWith('image/')?loadImage(f):loadVideo(f); };
  inp.click(); playClick();
});
 
document.getElementById('btn-webcam').addEventListener('click', async e => {
  e.stopPropagation();
  try {
    
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width:{ideal:1280}, height:{ideal:720} },
      audio: true
    });
    stopSource();
    bgStream = stream;
 
    
    const aTracks = stream.getAudioTracks();
    recAudioTrack = aTracks.length ? aTracks[0] : null;
 
    const vid = document.createElement('video');
    vid.srcObject = stream;
    vid.muted = true; 
    vid.playsInline = true;
    vid.onloadedmetadata = () => {
      resizeCanvasTo(vid.videoWidth||1280, vid.videoHeight||720);
      bgVideo=vid; vid.play();
      document.getElementById('dropzone').classList.add('hidden');
      document.getElementById('vid-controls').classList.remove('visible');
      startTapeHiss();
      setStatus('webcam active'); playBeep(440,0.05,0.08);
    };
  } catch(err) { setStatus('webcam: '+err.message); }
});
 
function resizeCanvasTo(w, h) {
  const ratio=w/h;
  W=Math.round(Math.min(w,1280)); H=Math.round(W/ratio);
  canvas.width=W; canvas.height=H;
  offCanvas.width=W; offCanvas.height=H;
  prevCanvas.width=W; prevCanvas.height=H;
  buildBarrelLUT();
}
 
function loadImage(file) {
  stopSource();
  const reader=new FileReader();
  reader.onload=ev=>{
    const img=new Image();
    img.onload=()=>{
      resizeCanvasTo(img.width,img.height); bgImage=img;
      document.getElementById('dropzone').classList.add('hidden');
      document.getElementById('vid-controls').classList.remove('visible');
      playBeep(550,0.05,0.08); setStatus('image loaded');
    };
    img.src=ev.target.result;
  };
  reader.readAsDataURL(file);
}
 
function loadVideo(file) {
  stopSource();
  const url = URL.createObjectURL(file);
  const vid = document.createElement('video');
  vid.src = url; vid.loop = true; vid.playsInline = true;
  vid.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus('video blocked by server CSP — use webcam or open file locally');
  };
  vid.onloadedmetadata = () => {
    resizeCanvasTo(vid.videoWidth, vid.videoHeight);
    bgVideo = vid;
    setupVideoAudioRouting(vid);
    vid.play();
    document.getElementById('dropzone').classList.add('hidden');
    document.getElementById('vid-controls').classList.add('visible');
    document.getElementById('btn-play').textContent = 'pause';
    startTapeHiss();
    playBeep(550, 0.05, 0.08); setStatus('video loaded');
  };
}
 
const btnPlay=document.getElementById('btn-play');
const btnMute=document.getElementById('btn-mute');
const vidSeek=document.getElementById('vid-seek');
const vidTime=document.getElementById('vid-time');
 
btnPlay.onclick=()=>{
  if (!bgVideo||bgStream) return;
  if (bgVideo.paused){bgVideo.play();btnPlay.textContent='pause';}
  else{bgVideo.pause();btnPlay.textContent='play';}
  playClick();
};
btnMute.onclick=()=>{
  if (!bgVideo) return;
  bgVideo.muted=!bgVideo.muted;
  btnMute.textContent=bgVideo.muted?'unmute':'mute';
  playClick();
};
document.getElementById('vid-vol').oninput = e => {
  const v = e.target.value / 100;
  setVideoVolume(v);
  if (bgVideo && !videoAudioSrc) bgVideo.volume = v; 
};
vidSeek.oninput=()=>{ if(!bgVideo||!bgVideo.duration) return; bgVideo.currentTime=bgVideo.duration*vidSeek.value/100; };
 
function fmt(s){ const m=Math.floor(s/60); return `${m}:${String(Math.floor(s%60)).padStart(2,'0')}`; }
function updateVideoUI(){ if(!bgVideo||!bgVideo.duration||bgStream) return; vidSeek.value=(bgVideo.currentTime/bgVideo.duration)*100; vidTime.textContent=`${fmt(bgVideo.currentTime)} / ${fmt(bgVideo.duration)}`; }
 
let mediaRecorder=null, recChunks=[], recStart=0, recInterval=null;
const btnRecord=document.getElementById('btn-record');
const recTimer=document.getElementById('rec-timer');
 
btnRecord.addEventListener('click',()=>{
  if (mediaRecorder&&mediaRecorder.state==='recording') stopRecording();
  else startRecording();
});
 
function startRecording() {
  resumeAC();
  
  const videoTrack = recCanvas.captureStream(30).getVideoTracks()[0];
  const tracks = [videoTrack];
 
  
  if (recAudioTrack && recAudioTrack.readyState==='live') {
    tracks.push(recAudioTrack);
  }
 
  const stream = new MediaStream(tracks);
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
 
  mediaRecorder = new MediaRecorder(stream, { mimeType:mime, videoBitsPerSecond:1200000 });
  recChunks=[];
  mediaRecorder.ondataavailable=e=>{ if(e.data.size>0) recChunks.push(e.data); };
  mediaRecorder.onstop=saveRecording;
  mediaRecorder.start(100);
  recStart=Date.now();
  recTimer.classList.add('visible');
  recInterval=setInterval(updateRecTimer,500);
  btnRecord.classList.add('rec-active');
  btnRecord.textContent='stop';
  playBeep(880,0.1,0.12); setStatus('recording...');
}
 
function stopRecording() {
  if (!mediaRecorder) return;
  mediaRecorder.stop(); clearInterval(recInterval);
  recTimer.classList.remove('visible');
  btnRecord.classList.remove('rec-active');
  btnRecord.textContent='rec';
  playBeep(440,0.1,0.12); setStatus('saving...');
}
 
function updateRecTimer() {
  const e=Math.floor((Date.now()-recStart)/1000);
  recTimer.textContent=`${String(Math.floor(e/60)).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`;
}
 
function saveRecording() {
  const blob=new Blob(recChunks,{type:'video/webm'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`vhs-${Date.now()}.webm`; a.click();
  URL.revokeObjectURL(url); setStatus('recording saved');
}
 
document.getElementById('btn-snap').addEventListener('click',()=>{
  playBeep(1100,0.04,0.1);
  canvas.toBlob(blob=>{
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`vhs-snap-${Date.now()}.png`; a.click();
    URL.revokeObjectURL(url); setStatus('snapshot saved');
  },'image/png');
});
 
const crtOuter=document.getElementById('crt-outer');
document.getElementById('btn-fs').addEventListener('click',()=>{
  if (!document.fullscreenElement) crtOuter.requestFullscreen().catch(()=>{});
  else document.exitFullscreen();
  playClick();
});
 
let is43 = false;
document.getElementById('btn-43').addEventListener('click', () => {
  is43 = !is43;
  crtOuter.classList.toggle('mode43', is43);
  document.getElementById('btn-43').classList.toggle('active43', is43);
  
  REC_W = is43 ? 720 : 960;
  REC_H = 540;
  recCanvas.width = REC_W; recCanvas.height = REC_H;
  playClick();
});
 
let timeOffset = 0; 
let customTimeActive = false;
 
function getVHSDate() {
  return new Date(Date.now() + timeOffset);
}
 
document.getElementById('btn-settime').addEventListener('click', () => {
  const panel = document.getElementById('timepanel');
  panel.classList.toggle('visible');
  if (panel.classList.contains('visible')) {
    
    const now = getVHSDate();
    document.getElementById('tp-date').value =
      `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`;
    document.getElementById('tp-time').value =
      `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  }
  playClick();
});
 
document.getElementById('tp-set').addEventListener('click', () => {
  const dStr = document.getElementById('tp-date').value.trim(); 
  const tStr = document.getElementById('tp-time').value.trim(); 
  const dp = dStr.split('.');
  const tp = tStr.split(':');
  if (dp.length !== 3 || tp.length !== 3) { setStatus('invalid format'); return; }
  const d = parseInt(dp[0]), m = parseInt(dp[1])-1, y = parseInt(dp[2]);
  const h = parseInt(tp[0]), min = parseInt(tp[1]), s = parseInt(tp[2]);
  if ([d,m,y,h,min,s].some(isNaN)) { setStatus('invalid date/time'); return; }
  const target = new Date(y, m, d, h, min, s);
  timeOffset = target.getTime() - Date.now();
  customTimeActive = true;
  document.getElementById('tp-status').textContent = `custom: ${dStr} ${tStr}`;
  document.getElementById('tp-status').classList.add('tp-active');
  document.getElementById('timepanel').classList.remove('visible');
  playBeep(660, 0.06, 0.1); setStatus('custom time set');
});
 
document.getElementById('tp-reset').addEventListener('click', () => {
  timeOffset = 0; customTimeActive = false;
  document.getElementById('tp-status').textContent = 'system time active';
  document.getElementById('tp-status').classList.remove('tp-active');
  document.getElementById('timepanel').classList.remove('visible');
  playClick(); setStatus('system time restored');
});
 
['tp-date','tp-time'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('tp-set').click();
  });
});
let statusTimer=null;
function setStatus(msg) {
  const el=document.getElementById('bar-status'); el.textContent=msg;
  clearTimeout(statusTimer); statusTimer=setTimeout(()=>el.textContent='',3000);
}
 
function applyBarrel(src) {
  const srcData=src.getImageData(0,0,W,H), dstData=ctx.createImageData(W,H);
  const s=srcData.data, d=dstData.data, lut=barrelLUT, px=W*H;
  for (let i=0;i<px;i++) {
    const li=i*2, sx=lut[li]; if(sx<0) continue;
    const sp=(lut[li+1]*W+sx)*4, dp=i*4;
    d[dp]=s[sp]; d[dp+1]=s[sp+1]; d[dp+2]=s[sp+2]; d[dp+3]=255;
  }
  ctx.putImageData(dstData,0,0);
}
 
function applyRGBMask() {
  try {
    const imgd=ctx.getImageData(0,0,W,H), d=imgd.data, len=W*H*4;
    for (let p=0;p<len;p+=4) {
      const sub=(p>>2)%3;
      if(sub===0) d[p]=Math.min(255,d[p]*1.15);
      else if(sub===1) d[p+1]=Math.min(255,d[p+1]*1.15);
      else d[p+2]=Math.min(255,d[p+2]*1.15);
      if(((p>>2)/W|0)%3===2){d[p]*=0.82;d[p+1]*=0.82;d[p+2]*=0.82;}
    }
    ctx.putImageData(imgd,0,0);
  } catch(e){}
}
 
function applyPhosphor() {
  if(phos<1) return;
  ctx.globalAlpha=phos/280; ctx.drawImage(prevCanvas,0,0); ctx.globalAlpha=1;
}
 
function applyHSync() {
  if(hsync<1) return;
  try {
    const amp=hsync*0.3;
    for (let b=0;b<3;b++) {
      const y=Math.floor((frame*1.1+b*120)%H), bh=Math.floor(2+Math.random()*4);
      const shift=Math.sin(frame*0.15+b)*amp; if(Math.abs(shift)<0.5) continue;
      const imgd=ctx.getImageData(0,y,W,bh); ctx.putImageData(imgd,Math.floor(shift),y);
    }
    if(Math.random()<hsync/3000){
      const ry=Math.floor(Math.random()*H),rh=Math.floor(1+Math.random()*3);
      const imgd=ctx.getImageData(0,ry,W,rh); ctx.putImageData(imgd,Math.floor((Math.random()-0.5)*40),ry);
    }
  } catch(e){}
}
 
function drawBg(target) {
  const src=bgVideo||bgImage;
  if(src){
    target.filter=`saturate(68%) brightness(${0.52+(1-flicker/250)}) contrast(1.05)`;
    target.fillStyle='#000'; target.fillRect(0,0,W,H);
    target.drawImage(src,0,0,W,H); target.filter='none';
  } else {
    target.fillStyle='#080910'; target.fillRect(0,0,W,H);
  }
}
 
function drawFog(c2) {
  if(fog<1) return;
  const a=fog/700;
  c2.fillStyle=`rgba(6,15,8,${a*5})`; c2.fillRect(0,0,W,H);
  for(let i=0;i<3;i++){
    const y=((frame*0.18+i*140)%(H+80))-40;
    c2.fillStyle=`rgba(4,10,6,${a*2.5})`; c2.fillRect(0,y,W,70);
  }
}
 
function drawFlicker(c2) {
  if(flicker<1) return;
  const a=Math.random()*flicker/1800;
  if(a>0.004){c2.fillStyle=`rgba(0,0,0,${a})`;c2.fillRect(0,0,W,H);}
  c2.fillStyle=`rgba(255,255,210,${flicker/9000})`; c2.fillRect(0,(frame*1.4)%H,W,2);
}
 
function drawVignette(c2) {
  if(vig<1) return;
  const a=vig/100;
  const grd=c2.createRadialGradient(W/2,H/2,H*0.12,W/2,H/2,H*0.88);
  grd.addColorStop(0,'rgba(0,0,0,0)');
  grd.addColorStop(0.55,`rgba(0,0,0,${a*0.25})`);
  grd.addColorStop(1,`rgba(0,0,0,${a*0.95})`);
  c2.fillStyle=grd; c2.fillRect(0,0,W,H);
  c2.fillStyle=`rgba(0,0,0,${a*0.7})`;
  c2.fillRect(0,0,W,7); c2.fillRect(0,H-7,W,7);
}
 
function drawTracking() {
  if(track<1) return;
  if(Math.random()<track/450){
    try{const ry=Math.floor(Math.random()*H),rh=Math.floor(1+Math.random()*4);const imgd=ctx.getImageData(0,ry,W,rh);ctx.putImageData(imgd,Math.floor((Math.random()-0.5)*track*0.5),ry);}catch(e){}
  }
  for(let i=trackLines.length-1;i>=0;i--){
    const tl=trackLines[i]; tl.y+=tl.speed; tl.life--;
    if(tl.y>H||tl.life<=0){trackLines.splice(i,1);continue;}
    try{const imgd=ctx.getImageData(0,Math.floor(tl.y),W,Math.ceil(tl.h));ctx.putImageData(imgd,tl.offset,Math.floor(tl.y));}catch(e){}
    ctx.fillStyle=`rgba(140,190,140,${tl.alpha*track/220})`; ctx.fillRect(0,tl.y,W,tl.h);
  }
  if(Math.random()<track/650) trackLines.push({y:Math.random()*H,h:1+Math.random()*7,speed:0.4+Math.random()*2,offset:(Math.random()-0.5)*55,alpha:0.25+Math.random()*0.5,life:12+Math.random()*45});
}
 
function drawGlitch() {
  if(glitch<1) return;
  for(let i=glitchBlocks.length-1;i>=0;i--){
    const b=glitchBlocks[i]; b.life--;
    if(b.life<=0){glitchBlocks.splice(i,1);continue;}
    try{const imgd=ctx.getImageData(0,Math.floor(b.y),W,Math.ceil(b.h));ctx.putImageData(imgd,Math.floor(b.offset),Math.floor(b.y));}catch(e){}
    ctx.fillStyle='rgba(180,60,60,0.05)'; ctx.fillRect(0,b.y,W,b.h);
  }
  if(Math.random()<glitch/1300) glitchBlocks.push({y:Math.random()*H*0.8,h:3+Math.random()*20,offset:(Math.random()-0.5)*70,life:2+Math.random()*8});
  if(Math.random()<glitch/2200){
    try{const fy=Math.floor(Math.random()*H*0.5),fh=Math.floor(15+Math.random()*50);const imgd=ctx.getImageData(0,fy,W,fh);ctx.putImageData(imgd,0,fy+(Math.random()-0.5)*6);}catch(e){}
  }
}
 
function drawChroma() {
  if(chroma<1) return;
  try{
    const snap=ctx.getImageData(0,0,W,H), out=ctx.createImageData(W,H);
    const s=snap.data, d=out.data, sh=chroma|0, ysh=(chroma*0.3)|0;
    for(let y=0;y<H;y++){
      const ry=Math.min(H-1,y+ysh), by=Math.max(0,y-ysh);
      for(let x=0;x<W;x++){
        const i=(y*W+x)*4;
        const ri=(ry*W+Math.min(W-1,x+sh))*4, bi=(by*W+Math.max(0,x-sh))*4;
        d[i]=s[ri]; d[i+1]=s[i+1]; d[i+2]=s[bi+2]; d[i+3]=255;
      }
    }
    ctx.putImageData(out,0,0);
  } catch(e){}
}
 
function drawFilmGrain() {
  if(!showFilm) return;
  ctx.strokeStyle='rgba(210,200,170,0.10)'; ctx.lineWidth=0.5;
  if(Math.random()<0.25){const sx=Math.random()*W;ctx.beginPath();ctx.moveTo(sx,0);ctx.lineTo(sx+(Math.random()-0.5)*8,H);ctx.stroke();}
  for(let i=0;i<3;i++) if(Math.random()<0.12){ctx.fillStyle=`rgba(190,180,155,${0.04+Math.random()*0.08})`;ctx.beginPath();ctx.arc(Math.random()*W,Math.random()*H,0.5+Math.random()*1.5,0,Math.PI*2);ctx.fill();}
  if(Math.random()<0.002){ctx.fillStyle=`rgba(255,245,215,${0.02+Math.random()*0.05})`;ctx.fillRect(0,0,W,H);}
}
 
function drawTimestamp() {
  if(!showDate) return;
  const now=getVHSDate();
  const dd=`${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`;
  const ts=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
 
  const fs  = Math.max(11, Math.round(H/30));
  const bx  = Math.round(W*0.018);
  const by2 = H - Math.round(H*0.025);
  const by1 = by2 - Math.round(fs*1.35);
 
  ctx.font=`bold ${fs}px monospace`;
  ctx.fillStyle='rgba(0,0,0,0.9)'; ctx.fillText(dd,bx+1,by1+1); ctx.fillText(ts,bx+1,by2+1);
  ctx.fillStyle='rgba(240,220,130,1)'; ctx.fillText(dd,bx,by1); ctx.fillText(ts,bx,by2);
 
  if(recBlink){
    const rx=W-Math.round(W*0.075);
    const rdot=Math.round(fs*0.6);
    ctx.fillStyle='rgba(220,45,45,1)';
    ctx.fillRect(rx, by1-rdot+2, rdot, rdot);
    ctx.fillText('REC', rx+rdot+4, by1);
  }
  ctx.fillStyle='rgba(190,185,165,0.7)';
  ctx.font=`${Math.max(9,fs-2)}px monospace`;
  ctx.fillText('SP  T-120', W-Math.round(W*0.085), by1);
}
 
function updateHUD() {
  const now=getVHSDate();
  const ts=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  document.getElementById('timestamp').textContent=(recBlink?'REC \u25CF':'REC  ')+`  ${ts}  SP  T-120`;
}
 
function loop() {
  frame++;
  drawBg(off); drawFog(off);
  ctx.drawImage(offCanvas,0,0);
  applyPhosphor();
  drawFilmGrain(); drawFlicker(ctx); drawVignette(ctx);
  drawTracking(); drawGlitch();
  if(chroma>0) drawChroma();
  applyHSync();
  if(showRGB) applyRGBMask();
  off.drawImage(canvas,0,0);
  applyBarrel(off);
  drawTimestamp();
  prevCtx.drawImage(canvas,0,0);
 
  
  recCtx.drawImage(canvas, 0, 0, REC_W, REC_H);
 
  if(frame%28===0){ recBlink=!recBlink; updateHUD(); }
  if(frame%3===0) updateVideoUI();
  requestAnimationFrame(loop);
}
 
loop();
