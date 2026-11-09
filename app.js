import {makePlan, IntervalTimer} from './engine.js';
import {makeTrack, stateAt, MAX_TRACK_SECONDS} from './track.js';
const $=id=>document.getElementById(id);
const inputs=['work','rest','sets','prepare','sound','background'];
let timer=null, audio=null, wakeLock=null, wakeRequest=false, lastCount=null;
const player=$('workout-audio');
let trackURL=null, trackMode=false, pendingPlay=false, playGeneration=0;
const format=seconds=>`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
function config() { return {work:Number($('work').value),rest:Number($('rest').value),sets:Number($('sets').value),prepare:$('prepare').checked,sound:$('sound').checked,background:$('background').checked}; }
try { const saved=JSON.parse(localStorage.getItem('teum-settings')); if(saved) for (const id of inputs) if(typeof saved[id]===($(id).type==='checkbox'?'boolean':'number')) { if($(id).type==='checkbox') $(id).checked=saved[id]; else $(id).value=saved[id]; } makePlan(config()); } catch { $('work').value=40; $('rest').value=20; $('sets').value=8; }
function save() { try {localStorage.setItem('teum-settings',JSON.stringify(config()));} catch {} }
function updateSettings() {
  try {
    const cfg=config(), plan=makePlan(cfg), total=plan.reduce((n,p)=>n+p.seconds,0);
    if(cfg.background&&total>MAX_TRACK_SECONDS) throw new Error('잠금 중 오디오 모드는 총 60분까지 지원해요. 시간을 줄이거나 이 모드를 꺼주세요.');
    $('total').textContent=`총 ${Math.floor(total/60)}분 ${total%60}초`;
    $('error').textContent=''; save();
    if(!timer) { $('time').textContent=format(cfg.work); $('next').textContent=cfg.sets>1?`다음 · 휴식 ${format(cfg.rest)}`:'한 세트에 집중해 보세요'; $('round').textContent=`1 / ${cfg.sets} SET`; drawDots(0,cfg.sets); }
    document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('selected',b.dataset.preset===`${cfg.work},${cfg.rest},${cfg.sets}`));
    return true;
  } catch(e) { $('error').textContent=e.message; return false; }
}
function drawDots(set,total) { $('dots').replaceChildren(...Array.from({length:Math.min(total,20)},(_,i)=>{const dot=document.createElement('span');dot.className=`dot${i<set-1?' done':i===set-1?' active':''}`;return dot;})); }
function render() {
  if(!timer) return;
  const p=timer.phase, cfg=config();
  const names={prepare:['준비','GET READY'],work:['운동','KEEP GOING'],rest:['휴식','BREATHE & RESET']};
  $('phase').textContent=timer.done?'운동 완료':names[p.kind][0];
  $('phase-caption').textContent=timer.done?'YOU DID IT':names[p.kind][1];
  $('time').textContent=format(Math.ceil(timer.remaining/1000));
  const next=timer.plan[timer.index+1];
  $('next').textContent=timer.done?'오늘도 한 걸음 더 나아갔어요':next?`다음 · ${names[next.kind][0]} ${format(next.seconds)}`:'마지막 세트예요';
  $('round').textContent=`${p.set} / ${cfg.sets} SET`;
  $('progress').style.strokeDashoffset=String(747.7*(1-timer.remaining/(p.seconds*1000)));
  $('start').textContent=timer.done?'한 번 더 시작 ↗':timer.running?'일시정지 Ⅱ':'이어 시작 ▶';
  $('skip').disabled=timer.done; $('reset').disabled=false;
  document.body.classList.toggle('rest',p.kind==='rest'&&!timer.done);
  document.body.classList.toggle('finished',timer.done);
  drawDots(timer.done?cfg.sets+1:p.set,cfg.sets);
}
async function unlockAudio() {
  try { if(!audio) audio=new (window.AudioContext||window.webkitAudioContext)(); if(audio.state==='suspended') await audio.resume(); }
  catch { $('error').textContent='이 브라우저에서는 소리를 재생할 수 없어요.'; }
}
function beep(frequency=880,count=1) {
  if(!$('sound').checked||!audio||audio.state!=='running') return;
  for(let i=0;i<count;i++) {const at=audio.currentTime+i*.23, osc=audio.createOscillator(), gain=audio.createGain();osc.type='sine';osc.frequency.value=frequency;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.22,at+.015);gain.gain.exponentialRampToValueAtTime(.001,at+.17);osc.connect(gain);gain.connect(audio.destination);osc.start(at);osc.stop(at+.2);}
}
async function keepAwake() {
  if(wakeLock||wakeRequest||!timer?.running||document.hidden||!navigator.wakeLock) return;
  wakeRequest=true;
  try { const lock=await navigator.wakeLock.request('screen'); if(!timer?.running||document.hidden) {await lock.release();return;} wakeLock=lock;lock.addEventListener('release',()=>{if(wakeLock===lock)wakeLock=null;}); } catch {} finally {wakeRequest=false;}
}
function releaseWake() { if(wakeLock) {const lock=wakeLock;wakeLock=null;lock.release().catch(()=>{});} }
function finish() { $('status').textContent='수고했어요! 오늘의 루틴을 마쳤습니다.'; releaseWake(); }
function updateMode() {
  const enabled=$('background').checked;
  if(enabled)$('sound').checked=true;
  $('sound').disabled=enabled;
  $('mode-tip').textContent=enabled?'잠금·앱 이동 중 오디오 재생 시도':'화면 잠금·앱 이동 시 자동 일시정지';
  $('mode-detail').textContent=enabled?'작은 박자음과 구간 알림을 재생해요. 다른 미디어·통화로 중단될 수 있어요. 탭 닫기·강제 종료는 지원하지 않아요.':'화면을 켜두고 사용해 주세요. 돌아와서 이어 시작할 수 있어요.';
}
function syncTrack() {
  if(!trackMode||!timer)return;
  const wasDone=timer.done;
  Object.assign(timer,stateAt(timer.plan,player.currentTime));
  timer.running=!player.paused&&!timer.done;
  if(timer.done&&!wasDone)finish();
  render();
}
function disposeTrack() {
  playGeneration++;pendingPlay=false;trackMode=false;
  player.pause();player.removeAttribute('src');player.load();
  if(trackURL){URL.revokeObjectURL(trackURL);trackURL=null;}
  if('mediaSession' in navigator){navigator.mediaSession.playbackState='none';navigator.mediaSession.metadata=null;}
}
function pauseTrack() {
  playGeneration++;pendingPlay=false;player.pause();syncTrack();
  if(timer&&!timer.done)$('status').textContent='오디오가 멈췄어요. 이어 시작을 눌러 주세요.';
  releaseWake();
}
function playTrack() {
  const generation=++playGeneration;pendingPlay=true;
  $('start').disabled=true;
  try {if(navigator.audioSession)navigator.audioSession.type='playback';}catch{}
  // Call directly inside the user's tap to retain Safari playback permission.
  const promise=player.play();
  promise.then(()=>{
    if(generation!==playGeneration)return;
    pendingPlay=false;syncTrack();
    $('status').textContent='오디오 재생 중 · 화면을 잠그기 전 소리를 확인하세요.';
    if('mediaSession' in navigator)navigator.mediaSession.playbackState='playing';
    void keepAwake();
  }).catch(()=>{
    if(generation!==playGeneration)return;
    pendingPlay=false;syncTrack();$('error').textContent='오디오를 시작하지 못했어요. Safari에서 이어 시작을 눌러 주세요.';
  }).finally(()=>{if(generation===playGeneration)$('start').disabled=false;});
}
function setUpTrack() {
  const bytes=makeTrack(timer.plan);
  trackURL=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
  trackMode=true;player.src=trackURL;player.load();
  if(audio?.state==='running')void audio.suspend();
  if('mediaSession' in navigator) {
    if('MediaMetadata' in window)navigator.mediaSession.metadata=new MediaMetadata({title:'틈 · 운동 타이머',artist:`운동 ${config().work}초 · 휴식 ${config().rest}초 · ${config().sets}세트`});
    for(const [action,handler] of Object.entries({play:()=>{if(timer&&!timer.done)playTrack();},pause:pauseTrack,seekto:event=>{if(Number.isFinite(event.seekTime)){player.currentTime=event.seekTime;syncTrack();}}})) {
      try{navigator.mediaSession.setActionHandler(action,handler);}catch{}
    }
  }
}
player.addEventListener('timeupdate',syncTrack);
player.addEventListener('ended',()=>{syncTrack();if('mediaSession' in navigator)navigator.mediaSession.playbackState='none';});
player.addEventListener('pause',()=>{
  if(!trackMode||pendingPlay)return;
  syncTrack();releaseWake();
  if(timer&&!timer.done)$('status').textContent='오디오가 중단됐어요. 이어 시작을 눌러 주세요.';
  if('mediaSession' in navigator)navigator.mediaSession.playbackState='paused';
});
player.addEventListener('playing',()=>{if(trackMode){syncTrack();if('mediaSession' in navigator)navigator.mediaSession.playbackState='playing';}});
player.addEventListener('error',()=>{if(trackMode){pendingPlay=false;$('start').disabled=false;syncTrack();$('error').textContent='오디오를 재생할 수 없어요. 초기화 후 다시 시작하거나 잠금 중 오디오 모드를 꺼주세요.';}});
function transition() { lastCount=null;beep(timer.done?1046:timer.phase.kind==='rest'?523:880,timer.done?3:2);if(timer.done) finish();else $('status').textContent=timer.phase.kind==='rest'?'천천히 호흡하며 쉬어 주세요.':timer.phase.kind==='work'?'좋아요, 나의 페이스로 움직여 보세요.':'곧 운동을 시작합니다.'; }
$('start').addEventListener('click',async()=>{
  if(pendingPlay)return;
  if(trackMode&&timer?.running){pauseTrack();return;}
  if(timer?.running) {timer.pause(performance.now());releaseWake();$('status').textContent='잠시 멈췄어요. 준비되면 이어 시작하세요.';render();return;}
  if(!timer||timer.done) {
    if(!updateSettings()) return;
    disposeTrack();timer=new IntervalTimer(makePlan(config()));lastCount=null;
    try{if(config().background)setUpTrack();}catch(e){disposeTrack();timer=null;$('error').textContent=e.message;return;}
    $('settings').disabled=true;$('background').disabled=true;
  }
  if(trackMode){render();playTrack();return;}
  // Start audio from this tap; the timer itself must not wait for audio permission.
  void unlockAudio().then(()=>beep(660));
  timer.start(performance.now());$('status').textContent='나의 페이스로, 차근차근 시작해요.';render();void keepAwake();
});
$('reset').addEventListener('click',()=>{disposeTrack();timer=null;releaseWake();lastCount=null;$('settings').disabled=false;$('background').disabled=false;$('start').disabled=false;document.body.classList.remove('rest','finished');$('phase').textContent='시작 준비';$('phase-caption').textContent='READY WHEN YOU ARE';$('status').textContent='호흡을 가다듬고 시작해 보세요.';$('start').innerHTML='운동 시작 <span aria-hidden="true">▶</span>';$('reset').disabled=true;$('skip').disabled=true;$('progress').style.strokeDashoffset='0';updateSettings();});
$('skip').addEventListener('click',()=>{
  if(!timer||pendingPlay)return;
  if(trackMode){syncTrack();if(timer.done)return;player.currentTime=timer.plan.slice(0,timer.index+1).reduce((n,p)=>n+p.seconds,0);syncTrack();return;}
  timer.skip(performance.now());transition();if(!timer.running&&!timer.done)$('status').textContent='구간을 넘겼어요. 이어 시작을 눌러 주세요.';render();
});
$('test-sound').addEventListener('click',async()=>{if(trackMode){$('status').textContent='재생 중인 박자음과 구간 알림으로 소리를 확인해 주세요.';return;}await unlockAudio();if(!$('sound').checked){$('status').textContent='전환 알림음을 켠 뒤 다시 확인해 주세요.';return;}beep(880,2);});
inputs.forEach(id=>$(id).addEventListener('change',()=>{if(id==='background')updateMode();if(id==='sound')save();else updateSettings();}));
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{const [w,r,s]=b.dataset.preset.split(',');$('work').value=w;$('rest').value=r;$('sets').value=s;updateSettings();}));
setInterval(()=>{if(trackMode){if(!document.hidden)syncTrack();return;}if(!timer?.running)return;const changed=timer.tick(performance.now());if(changed)transition();const count=Math.ceil(timer.remaining/1000);if(timer.running&&count<=3&&count>0&&count!==lastCount){lastCount=count;beep(660);}render();},100);
document.addEventListener('visibilitychange',()=>{if(trackMode){if(document.hidden)releaseWake();else{syncTrack();void keepAwake();}return;}if(document.hidden&&timer?.running){timer.pause(performance.now());releaseWake();if(timer.done)finish();else $('status').textContent='화면을 벗어나 자동으로 멈췄어요. 이어 시작을 눌러 주세요.';render();}});
window.addEventListener('pagehide',()=>{if(!trackMode&&timer?.running){timer.pause(performance.now());releaseWake();render();}});
window.addEventListener('online',()=>{$('connection').textContent='온라인';});
window.addEventListener('offline',()=>{$('connection').textContent='오프라인';});
updateMode();updateSettings();
if('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(async registration=>{await navigator.serviceWorker.ready;$('offline').textContent='오프라인 준비 완료 · 이 기기에 저장됐어요.';}).catch(()=>{$('offline').textContent='오프라인 저장을 사용할 수 없어요. 인터넷에 연결해 사용해 주세요.';});
}
