type Handler = (msg: any) => void;

export class WSClient {
  private url: string;
  private ws: WebSocket | null = null;
  private onMessage: Handler;
  private reconnectTimer: any = null;
  private token: string | null;
  private queue: any[] = [];

  constructor(url: string, onMessage: Handler, token: string | null = null) {
    this.url = url;
    this.onMessage = onMessage;
    this.token = token;
  }

  connect() {
    const sep = this.url.includes('?') ? '&' : '?';
    const wsUrl = this.token ? `${this.url}${sep}token=${encodeURIComponent(this.token)}` : this.url;
    this.ws = new WebSocket(wsUrl);
    this.ws.onopen = () => {
      this.flush();
    };
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        this.onMessage(msg);
      } catch {
        // ignore
      }
    };
    this.ws.onclose = () => {
      this.ws = null;
      this.reconnect();
    };
    this.ws.onerror = () => {};
  }

  reconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }

  private flush() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    while (this.queue.length) {
      const msg = this.queue.shift();
      try {
        this.ws.send(JSON.stringify(msg));
      } catch {
        // stop flushing if send fails
        this.queue.unshift(msg);
        break;
      }
    }
  }

  send(msg: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      // queue until connection opens
      this.queue.push(msg);
    }
  }
}



