import type { EngineRequest, EngineResponse, EngineResults, Envelope } from './protocol';

interface Pending { resolve: (value: unknown) => void; reject: (reason: Error) => void }

/**
 * Promise wrapper around the engine worker. Generation can take a few hundred
 * milliseconds for hard grades, so it never runs on the main thread.
 */
export class EngineClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor() {
    this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<EngineResponse>) => {
      const res = event.data;
      const p = this.pending.get(res.id);
      if (!p) return;
      this.pending.delete(res.id);
      if (res.ok) p.resolve(res.result);
      else p.reject(new Error(res.error));
    };
    this.worker.onerror = () => {
      for (const p of this.pending.values()) p.reject(new Error('The puzzle engine stopped unexpectedly.'));
      this.pending.clear();
    };
  }

  request<T extends EngineRequest['type']>(req: Extract<EngineRequest, { type: T }>): Promise<EngineResults[T]> {
    const id = this.nextId++;
    return new Promise<EngineResults[T]>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      const envelope: Envelope = { ...req, id };
      this.worker.postMessage(envelope);
    });
  }
}
