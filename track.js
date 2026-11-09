// One real audio track: no JavaScript callback is needed to sound a cue.
export const SAMPLE_RATE = 8000;
export const MAX_TRACK_SECONDS = 3600;

export function cueSchedule(plan) {
  const cues=[];
  let at=0;
  for(const phase of plan) {
    cues.push({at,frequency:phase.kind==='rest'?523:phase.kind==='work'?880:660,count:phase.kind==='prepare'?1:2});
    for(let left=Math.min(3,phase.seconds-1);left>=1;left--) cues.push({at:at+phase.seconds-left,frequency:660,count:1});
    at+=phase.seconds;
  }
  cues.push({at,frequency:1046,count:3});
  return {cues,seconds:at};
}

export function stateAt(plan,seconds) {
  let start=0;
  for(let index=0;index<plan.length;index++) {
    const end=start+plan[index].seconds;
    if(seconds<end) return {index,remaining:Math.max(0,(end-seconds)*1000),done:false};
    start=end;
  }
  return {index:plan.length-1,remaining:0,done:true};
}

export function makeTrack(plan) {
  const {cues,seconds}=cueSchedule(plan);
  if(seconds>MAX_TRACK_SECONDS) throw new Error('잠금 중 오디오 모드는 총 60분까지 지원해요. 시간을 줄이거나 이 모드를 꺼주세요.');
  const samples=Math.ceil((seconds+.8)*SAMPLE_RATE);
  const bytes=new Uint8Array(44+samples);
  const view=new DataView(bytes.buffer);
  const text=(at,s)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,36+samples,true);text(8,'WAVE');text(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,SAMPLE_RATE,true);view.setUint32(28,SAMPLE_RATE,true);
  view.setUint16(32,1,true);view.setUint16(34,8,true);text(36,'data');view.setUint32(40,samples,true);
  bytes.fill(128,44);
  function tone(at,freq,duration,level) {
    const offset=Math.round(at*SAMPLE_RATE),length=Math.round(duration*SAMPLE_RATE);
    for(let i=0;i<length&&offset+i<samples;i++) {
      const envelope=Math.min(1,i/(SAMPLE_RATE*.008))*Math.exp(-i/(SAMPLE_RATE*duration*.3));
      bytes[44+offset+i]=Math.round(128+level*envelope*Math.sin(2*Math.PI*freq*i/SAMPLE_RATE));
    }
  }
  // A quiet, audible metronome is part of this mode, rather than silent keepalive audio.
  for(let at=.5;at<seconds;at++) tone(at,220,.035,13);
  for(const cue of cues) for(let i=0;i<cue.count;i++)tone(cue.at+i*.23,cue.frequency,.18,75);
  return bytes;
}
