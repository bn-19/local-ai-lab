import { Actor, Persisted } from "terse-sdk/actor";

// Single persisted assignment makes every state transition atomic.
export class Project extends Actor {
  @Persisted private state = "{}";
  async read(): Promise<string> {
    return this.state;
  }
  async put(key: string, value: string): Promise<string> {
    const state = JSON.parse(this.state);
    state[key] = JSON.parse(value);
    this.state = JSON.stringify(state);
    return this.state;
  }
}
export class Device extends Actor {
  @Persisted private state =
    '{"queue":[],"active":null,"history":[],"alarms":0}';
  async read(): Promise<string> {
    return this.state;
  }
  async enqueue(input: string): Promise<string> {
    const s = JSON.parse(this.state),
      job = JSON.parse(input);
    if (
      ![...s.queue, ...s.history, ...(s.active ? [s.active] : [])].some(
        (j) => j.id === job.id,
      )
    ) {
      s.queue.push({ ...job, status: "queued" });
      this.state = JSON.stringify(s);
      if (job.notBefore > Date.now()) await this.alarm.set(job.notBefore);
    }
    return this.state;
  }
  async reserve(executor: string, attempt: string): Promise<string> {
    const s = JSON.parse(this.state);
    if (s.active)
      return s.active.attempt === attempt ? JSON.stringify(s.active) : "null";
    const index = s.queue.findIndex(
      (j) => !j.notBefore || j.notBefore <= Date.now(),
    );
    if (index < 0) return "null";
    const [job] = s.queue.splice(index, 1);
    s.active = {
      ...job,
      executor,
      attempt,
      startedAt: Date.now(),
      status: "running",
      cancel: false,
    };
    this.state = JSON.stringify(s);
    return JSON.stringify(s.active);
  }
  async finish(attempt: string, result: string): Promise<string> {
    const s = JSON.parse(this.state);
    if (!s.active || s.active.attempt !== attempt) {
      if (s.history.some((j) => j.attempt === attempt)) return this.state;
      throw new Error("Stale attempt fenced");
    }
    s.history = [
      ...s.history,
      { ...s.active, ...JSON.parse(result), finishedAt: Date.now() },
    ].slice(-200);
    s.active = null;
    this.state = JSON.stringify(s);
    return this.state;
  }
  async cancel(id: string): Promise<string> {
    const s = JSON.parse(this.state);
    if (s.active?.id === id) s.active = { ...s.active, cancel: true };
    const pending = s.queue.filter((j) => j.id === id);
    s.queue = s.queue.filter((j) => j.id !== id);
    s.history = [
      ...s.history,
      ...pending.map((j) => ({ ...j, status: "cancelled" })),
    ].slice(-200);
    this.state = JSON.stringify(s);
    return this.state;
  }
  // Caller must prove the owning executor stopped. No timeout steals an active GPU job.
  async reconcile(executor: string): Promise<string> {
    const s = JSON.parse(this.state);
    if (s.active?.executor === executor) {
      s.history = [
        ...s.history,
        { ...s.active, status: "interrupted", finishedAt: Date.now() },
      ].slice(-200);
      s.active = null;
      this.state = JSON.stringify(s);
    }
    return this.state;
  }
  async onAlarm(): Promise<void> {
    const s = JSON.parse(this.state);
    s.alarms += 1;
    s.lastAlarmAt = Date.now();
    this.state = JSON.stringify(s);
    const next = s.queue
      .filter((j) => j.notBefore > Date.now())
      .sort((a, b) => a.notBefore - b.notBefore)[0];
    if (next) await this.alarm.set(next.notBefore);
  }
}
