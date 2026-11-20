/**
 * Oznamování změn dat (pro překreslení React komponent) + synchronizace mezi záložkami
 * prohlížeče přes BroadcastChannel. Umožňuje otestovat souběžnou editaci ve dvou oknech.
 */
type Listener = (list: string) => void;

export class ChangeBus {
  private listeners = new Set<Listener>();
  private channel: BroadcastChannel | null = null;
  private version = 0;
  private remoteHandler: ((list: string) => void) | null = null;
  private batchDepth = 0;
  private pending = false;

  constructor(channelName = 'control-hub-sync') {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(channelName);
      this.channel.onmessage = (ev) => {
        const list = (ev.data as { list?: string })?.list;
        if (list && this.remoteHandler) this.remoteHandler(list);
      };
    }
  }

  onRemoteChange(handler: (list: string) => void) {
    this.remoteHandler = handler;
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  getVersion() {
    return this.version;
  }

  /** Seskupí více zápisů do jednoho překreslení. */
  async batch<T>(fn: () => Promise<T>): Promise<T> {
    this.batchDepth++;
    try {
      return await fn();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0 && this.pending) {
        this.pending = false;
        this.flush('*');
      }
    }
  }

  emit(list: string, broadcast: boolean) {
    if (broadcast && this.channel) {
      try {
        this.channel.postMessage({ list });
      } catch {
        /* ignore */
      }
    }
    if (this.batchDepth > 0) {
      this.pending = true;
      return;
    }
    this.flush(list);
  }

  private flush(list: string) {
    this.version++;
    for (const l of this.listeners) l(list);
  }
}
