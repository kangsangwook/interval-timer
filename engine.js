export function makePlan({work, rest, sets, prepare}) {
  for (const [key, value] of Object.entries({work, rest, sets})) {
    const max = key === 'sets' ? 99 : 3600;
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error('시간은 1~3600초, 세트는 1~99회 정수로 입력해 주세요.');
  }
  const plan = [];
  if (prepare) plan.push({kind:'prepare', seconds:5, set:1});
  for (let set=1; set<=sets; set++) {
    plan.push({kind:'work', seconds:work, set});
    if (set<sets) plan.push({kind:'rest', seconds:rest, set});
  }
  return plan;
}

export class IntervalTimer {
  constructor(plan) { this.plan=plan; this.index=0; this.remaining=plan[0].seconds*1000; this.running=false; this.done=false; }
  get phase() { return this.plan[this.index]; }
  start(now) { if (!this.done && !this.running) { this.deadline=now+this.remaining; this.running=true; } }
  tick(now) {
    let changed=false;
    if (!this.running) return changed;
    while (now>=this.deadline) {
      changed=true;
      if (this.index===this.plan.length-1) { this.remaining=0; this.running=false; this.done=true; return changed; }
      this.index++;
      this.deadline+=this.phase.seconds*1000;
    }
    this.remaining=Math.max(0,this.deadline-now);
    return changed;
  }
  pause(now) { this.tick(now); this.running=false; }
  skip(now) {
    if (this.done) return;
    if (this.index===this.plan.length-1) { this.done=true; this.running=false; this.remaining=0; return; }
    this.index++; this.remaining=this.phase.seconds*1000;
    if (this.running) this.deadline=now+this.remaining;
  }
}
