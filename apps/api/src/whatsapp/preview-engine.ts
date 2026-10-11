import {
  WhatsAppEngineBase,
  type SendResult,
  type SessionStatus,
  type WhatsAppEngineId,
} from './engine.js';

/**
 * ---------------------------------------------------------------------------
 * Motor de previsualización (modo seco).
 * ---------------------------------------------------------------------------
 * Se usa en desarrollo y en las pruebas: simula una sesión conectada y
 * "envía" mensajes al log del proceso. Nunca sale a la red, así que es
 * imposible mandarle un WhatsApp a alguien por accidente.
 */

export interface PreviewEngineOptions {
  /** Permite ver en consola el texto exacto que se enviaría. */
  logMessages?: boolean;
}

export class PreviewEngine extends WhatsAppEngineBase {
  override readonly id: WhatsAppEngineId = 'preview';

  private current: SessionStatus = { status: 'connected', phoneNumber: '+000000000' };
  private readonly logMessages: boolean;

  constructor(options: PreviewEngineOptions = {}) {
    super();
    this.logMessages = options.logMessages ?? true;
  }

  override async status(): Promise<SessionStatus> {
    return this.current;
  }

  override async connect(): Promise<void> {
    this.current = { status: 'connected', phoneNumber: '+000000000' };
    this.emitStatus(this.current);
  }

  override async logout(): Promise<void> {
    this.current = { status: 'disconnected' };
    this.emitStatus(this.current);
  }

  override async sendText(to: string, body: string): Promise<SendResult> {
    const messageId = `preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (this.logMessages) {
      console.info(
        `[whatsapp:preview] Para ${to}\n${'-'.repeat(40)}\n${body}\n${'-'.repeat(40)} id=${messageId}`,
      );
    }
    return { messageId };
  }
}
