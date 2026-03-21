const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W = 640, H = 360;
const wrap = document.getElementById('wrap');
const dropzone = document.getElementById('dropzone');

const offCanvas = document.createElement('canvas');
offCanvas.width = W; offCanvas.height = H;
const off = offCanvas.getContext('2d');

const prevCanvas = document.createElement('canvas');
prevCanvas.width = W; prevCanvas.height = H;
const prevCtx = prevCanvas.getContext('2d');

let track=30, chroma=4, flicker=20, fog=25, glitch=15, vig=65, phos=40, hsync=20;
let showRGB=false, showFilm=true, showDate=true;
let bgImage = null;
let bgVideo = null;
let frame = 0;
let recBlink = true;
let trackLines = [], glitchBlocks = [];

document.getElementById('s_track').oninput = e => track = +e.target.value;
document.getElementById('s_chroma').oninput = e => chroma = +e.target.value;
document.getElementById('s_flicker').oninput = e => flicker = +e.target.value;
document.getElementById('s_fog').oninput = e => fog = +e.target.value;
document.getElementById('s_glitch').oninput = e => glitch = +e.target.value;
document.getElementById('s_vig').oninput = e => vig = +e.target.value;
document.getElementById('s_phos').oninput = e => phos = +e.target.value;
document.getElementById('s_hsync').oninput = e => hsync = +e.target.value;
document.getElementById('s_rgb').onchange = e => showRGB = e.target.checked;
document.getElementById('s_film').onchange = e => showFilm = e.target.checked;
document.getElementById('s_date').onchange = e => showDate = e.target.checked;

wrap.addEventListener('dragover', e => { e.preventDefault(); wrap.classList.add('dragover'); });
wrap.addEventListener('dragleave', () => wrap.classList.remove('dragover'));
wrap.addEventListener('drop', e => {
  e.preventDefault(); wrap.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (file.type.startsWith('image/')) loadImage(file);
  else if (file.type.startsWith('video/')) loadVideo(file);
});
wrap.addEventListener('click', () => {
  if (bgImage || bgVideo) return;
  const inp = document.createElement('input');
  inp.type='file'; inp.accept='image/*,video/*';
  inp.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.type.startsWith('image/')) loadImage(file);
    else if (file.type.startsWith('video/')) loadVideo(file);
  };
  inp.click();
});

function resizeCanvasTo(w, h) {
  const ratio = w / h;
  W = Math.round(Math.min(w, 1280));
  H = Math.round(W / ratio);
  canvas.width = W; canvas.height = H;
  offCanvas.width = W; offCanvas.height = H;
  prevCanvas.width = W; prevCanvas.height = H;
}

function loadImage(file) {
  if (bgVideo) { bgVideo.pause(); bgVideo.src = ''; bgVideo = null; }
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      resizeCanvasTo(img.width, img.height);
      bgImage = img;
      dropzone.classList.add('hidden');
      document.getElementById('vid-controls').classList.remove('visible');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function loadVideo(file) {
  bgImage = null;
  const url = URL.createObjectURL(file);
  const vid = document.createElement('video');
  vid.src = url;
  vid.loop = true;
  vid.muted = false;
  vid.playsInline = true;
  vid.onloadedmetadata = () => {
    resizeCanvasTo(vid.videoWidth, vid.videoHeight);
    bgVideo = vid;
    vid.play();
    dropzone.classList.add('hidden');
    const vc = document.getElementById('vid-controls');
    vc.classList.add('visible');
    document.getElementById('btn-play').textContent = 'pause';
  };
}

const btnPlay = document.getElementById('btn-play');
const btnMute = document.getElementById('btn-mute');
const vidSeek = document.getElementById('vid-seek');
const vidTime = document.getElementById('vid-time');

btnPlay.onclick = () => {
  if (!bgVideo) return;
  if (bgVideo.paused) { bgVideo.play(); btnPlay.textContent = 'pause'; }
  else { bgVideo.pause(); btnPlay.textContent = 'play'; }
};
btnMute.onclick = () => {
  if (!bgVideo) return;
  bgVideo.muted = !bgVideo.muted;
  btnMute.textContent = bgVideo.muted ? 'unmute' : 'mute';
};
vidSeek.oninput = () => {
  if (!bgVideo || !bgVideo.duration) return;
  bgVideo.currentTime = bgVideo.duration * vidSeek.value / 100;
};

function fmt(s) {
  const m = Math.floor(s/60), sec = Math.floor(s%60);
  return `${m}:${String(sec).padStart(2,'0')}`;
}

function updateVideoUI() {
  if (!bgVideo || !bgVideo.duration) return;
  vidSeek.value = (bgVideo.currentTime / bgVideo.duration) * 100;
  vidTime.textContent = `${fmt(bgVideo.currentTime)} / ${fmt(bgVideo.duration)}`;
}

function applyBarrel(src) {
  const srcData = src.getImageData(0, 0, W, H);
  const dstData = ctx.createImageData(W, H);
  const s = srcData.data, d = dstData.data;
  const cx = W / 2, cy = H / 2;
  const k = 0.06;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = (x - cx) / cx;
      const ny = (y - cy) / cy;
      const r2 = nx*nx + ny*ny;
      const factor = 1 + k * r2;
      const sx = nx / factor * cx + cx;
      const sy = ny / factor * cy + cy;
      const ix = Math.round(sx), iy = Math.round(sy);
      const dst = (y * W + x) * 4;
      if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
        const src2 = (iy * W + ix) * 4;
        d[dst]   = s[src2];
        d[dst+1] = s[src2+1];
        d[dst+2] = s[src2+2];
        d[dst+3] = 255;
      }
    }
  }
  ctx.putImageData(dstData, 0, 0);
}

function applyRGBMask() {
  try {
    const imgd = ctx.getImageData(0, 0, W, H);
    const d = imgd.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const sub = x % 3;
        if (sub === 0) { d[i] = Math.min(255, d[i] * 1.15); }
        else if (sub === 1) { d[i+1] = Math.min(255, d[i+1] * 1.15); }
        else { d[i+2] = Math.min(255, d[i+2] * 1.15); }
        if (y % 3 === 2) { d[i] *= 0.82; d[i+1] *= 0.82; d[i+2] *= 0.82; }
      }
    }
    ctx.putImageData(imgd, 0, 0);
  } catch(e) {}
}

function applyPhosphor() {
  if (phos < 1) return;
  ctx.globalAlpha = phos / 280;
  ctx.drawImage(prevCanvas, 0, 0);
  ctx.globalAlpha = 1;
}

function applyHSync() {
  if (hsync < 1) return;
  try {
    const amplitude = hsync * 0.3;
    for (let band = 0; band < 3; band++) {
      const y = Math.floor((frame * 1.1 + band * 120) % H);
      const bh = Math.floor(2 + Math.random() * 4);
      const shift = Math.sin(frame * 0.15 + band) * amplitude;
      if (Math.abs(shift) < 0.5) continue;
      const imgd = ctx.getImageData(0, y, W, bh);
      ctx.putImageData(imgd, Math.floor(shift), y);
    }
    if (Math.random() < hsync / 3000) {
      const ry = Math.floor(Math.random() * H);
      const rh = Math.floor(1 + Math.random() * 3);
      const imgd = ctx.getImageData(0, ry, W, rh);
      ctx.putImageData(imgd, Math.floor((Math.random()-0.5) * 40), ry);
    }
  } catch(e) {}
}

function drawBg(target) {
  const src = bgVideo || bgImage;
  if (src) {
    target.filter = `saturate(68%) brightness(${0.52 + (1-flicker/250)}) contrast(1.05)`;
    target.fillStyle = '#000';
    target.fillRect(0, 0, W, H);
    target.drawImage(src, 0, 0, W, H);
    target.filter = 'none';
  } else {
    target.fillStyle = '#080910';
    target.fillRect(0, 0, W, H);
  }
}

function drawFog(c2) {
  if (fog < 1) return;
  const a = fog / 700;
  c2.fillStyle = `rgba(6,15,8,${a*5})`;
  c2.fillRect(0, 0, W, H);
  for (let i = 0; i < 3; i++) {
    const y = ((frame * 0.18 + i * 140) % (H+80)) - 40;
    c2.fillStyle = `rgba(4,10,6,${a*2.5})`;
    c2.fillRect(0, y, W, 70);
  }
}

function drawFlicker(c2) {
  if (flicker < 1) return;
  const a = Math.random() * flicker / 1800;
  if (a > 0.004) { c2.fillStyle = `rgba(0,0,0,${a})`; c2.fillRect(0,0,W,H); }
  const wy = (frame * 1.4) % H;
  c2.fillStyle = `rgba(255,255,210,${flicker/9000})`;
  c2.fillRect(0, wy, W, 2);
}

function drawVignette(c2) {
  if (vig < 1) return;
  const a = vig / 100;
  const grd = c2.createRadialGradient(W/2,H/2,H*0.12,W/2,H/2,H*0.88);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(0.55, `rgba(0,0,0,${a*0.25})`);
  grd.addColorStop(1, `rgba(0,0,0,${a*0.95})`);
  c2.fillStyle = grd;
  c2.fillRect(0, 0, W, H);
  c2.fillStyle = `rgba(0,0,0,${a*0.7})`;
  c2.fillRect(0, 0, W, 7);
  c2.fillRect(0, H-7, W, 7);
}

function drawTracking() {
  if (track < 1) return;
  if (Math.random() < track/450) {
    try {
      const ry = Math.floor(Math.random()*H);
      const rh = Math.floor(1+Math.random()*4);
      const imgd = ctx.getImageData(0,ry,W,rh);
      ctx.putImageData(imgd, Math.floor((Math.random()-0.5)*track*0.5), ry);
    } catch(e) {}
  }
  trackLines.forEach((tl, i) => {
    tl.y += tl.speed; tl.life--;
    if (tl.y > H || tl.life <= 0) { trackLines.splice(i,1); return; }
    try {
      const imgd = ctx.getImageData(0,Math.floor(tl.y),W,Math.ceil(tl.h));
      ctx.putImageData(imgd, tl.offset, Math.floor(tl.y));
    } catch(e) {}
    ctx.fillStyle = `rgba(140,190,140,${tl.alpha*track/220})`;
    ctx.fillRect(0, tl.y, W, tl.h);
  });
  if (Math.random() < track/650) trackLines.push({
    y:Math.random()*H, h:1+Math.random()*7,
    speed:0.4+Math.random()*2, offset:(Math.random()-0.5)*55,
    alpha:0.25+Math.random()*0.5, life:12+Math.random()*45
  });
}

function drawGlitch() {
  if (glitch < 1) return;
  glitchBlocks.forEach((b, i) => {
    b.life--;
    if (b.life <= 0) { glitchBlocks.splice(i,1); return; }
    try {
      const imgd = ctx.getImageData(0,Math.floor(b.y),W,Math.ceil(b.h));
      ctx.putImageData(imgd, Math.floor(b.offset), Math.floor(b.y));
    } catch(e) {}
    ctx.fillStyle = `rgba(180,60,60,0.05)`;
    ctx.fillRect(0, b.y, W, b.h);
  });
  if (Math.random() < glitch/1300) glitchBlocks.push({
    y:Math.random()*H*0.8, h:3+Math.random()*20,
    offset:(Math.random()-0.5)*70, life:2+Math.random()*8
  });
  if (Math.random() < glitch/2200) {
    try {
      const fy=Math.floor(Math.random()*H*0.5), fh=Math.floor(15+Math.random()*50);
      const imgd = ctx.getImageData(0,fy,W,fh);
      ctx.putImageData(imgd, 0, fy+(Math.random()-0.5)*6);
    } catch(e) {}
  }
}

function drawChroma() {
  if (chroma < 1) return;
  try {
    const snap = ctx.getImageData(0,0,W,H);
    const out = ctx.createImageData(W,H);
    const s=snap.data, d=out.data;
    const sh=Math.floor(chroma), ysh=Math.floor(chroma*0.3);
    for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
      const i=(y*W+x)*4;
      const ri=(Math.min(H-1,y+ysh)*W+Math.min(W-1,x+sh))*4;
      const bi=(Math.max(0,y-ysh)*W+Math.max(0,x-sh))*4;
      d[i]=s[ri]; d[i+1]=s[i+1]; d[i+2]=s[bi+2]; d[i+3]=255;
    }
    ctx.putImageData(out, 0, 0);
  } catch(e) {}
}

function drawFilmGrain() {
  if (!showFilm) return;
  ctx.strokeStyle = `rgba(210,200,170,0.10)`;
  ctx.lineWidth = 0.5;
  if (Math.random() < 0.25) {
    const sx = Math.random()*W;
    ctx.beginPath(); ctx.moveTo(sx,0); ctx.lineTo(sx+(Math.random()-0.5)*8,H); ctx.stroke();
  }
  for (let i=0; i<3; i++) if (Math.random()<0.12) {
    ctx.fillStyle = `rgba(190,180,155,${0.04+Math.random()*0.08})`;
    ctx.beginPath(); ctx.arc(Math.random()*W,Math.random()*H,0.5+Math.random()*1.5,0,Math.PI*2); ctx.fill();
  }
  if (Math.random()<0.002) {
    ctx.fillStyle = `rgba(255,245,215,${0.02+Math.random()*0.05})`;
    ctx.fillRect(0,0,W,H);
  }
}

function drawTimestamp() {
  if (!showDate) return;
  const now = new Date();
  const dd = `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`;
  const ts = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillText(dd,13,H-22); ctx.fillText(ts,13,H-10);
  ctx.fillStyle = 'rgba(225,205,125,0.85)'; ctx.fillText(dd,12,H-23); ctx.fillText(ts,12,H-11);
  if (recBlink) {
    ctx.fillStyle='rgba(215,55,55,0.9)'; ctx.fillRect(W-50,H-16,6,6);
    ctx.fillStyle='rgba(215,55,55,0.85)'; ctx.font='bold 10px monospace'; ctx.fillText('REC',W-42,H-9);
  }
  ctx.fillStyle='rgba(170,170,150,0.55)'; ctx.font='9px monospace'; ctx.fillText('SP  T-120',W-58,H-22);
}

function updateHUD() {
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  document.getElementById('timestamp').textContent = (recBlink?'REC ●':'REC  ')+`  ${ts}  SP  T-120`;
}

function loop() {
  frame++;
  drawBg(off);
  drawFog(off);
  ctx.drawImage(offCanvas, 0, 0);
  applyPhosphor();
  drawFilmGrain();
  drawFlicker(ctx);
  drawVignette(ctx);
  drawTracking();
  drawGlitch();
  if (chroma > 0) drawChroma();
  applyHSync();
  if (showRGB) applyRGBMask();
  off.drawImage(canvas, 0, 0);
  applyBarrel(off);
  drawTimestamp();
  prevCtx.drawImage(canvas, 0, 0);
  if (frame % 28 === 0) { recBlink = !recBlink; updateHUD(); }
  if (frame % 3 === 0) updateVideoUI();
  requestAnimationFrame(loop);
}

loop();