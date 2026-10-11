import { EventEmitter } from 'node:events';

/**
 * ---------------------------------------------------------------------------
 * Contrato del motor de WhatsApp.
 * ---------------------------------------------------------------------------
 * La plataforma puede enviar de tres maneras distintas y el resto del sistema
 * no debería enterarse de cuál está activa:
 *
 *  preview    -> modo seco, no envía nada (desarrollo y pruebas)
 *  baileys    -> WhatsApp Web no oficial, la organizadora escanea un QR
 *  cloud-api  -> API oficial de Meta (requiere credenciales)
 */

export const SESSION_STATUSES = [
  'disconnected',
  'qr',
  'connecting',
  'connected',
  'error',
] as const;

export type SessionStatusValue = (typeof SESSION_STATUSES)[number];

export interface SessionStatus {
  status: SessionStatusValue;
  /** Número conectado, en E.164. */
  phoneNumber?: string;
  /** Último QR como data URL (PNG en base64) para mostrarlo en el panel. */
  qrDataUrl?: string;
  lastError?: string;
}

export interface SendResult {
  /** Id del mensaje según el proveedor, para poder rastrear la entrega. */
  messageId: string;
}

export type WhatsAppEngineId = 'preview' | 'baileys' | 'cloud-api';

export interface WhatsAppEngine {
  readonly id: WhatsAppEngineId;
  status(): Promise<SessionStatus>;
  connect(): Promise<void>;
  logout(): Promise<void>;
  sendText(to: string, body: string): Promise<SendResult>;
  onQr?(handler: (qrDataUrl: string) => void): void;
  onStatus?(handler: (status: SessionStatus) => void): void;
}

/**
 * Base con EventEmitter: las rutas se suscriben para reflejar el estado (y el
 * QR) en la tabla WhatsAppSession sin acoplarse a Baileys ni a Meta.
 */
export abstract class WhatsAppEngineBase implements WhatsAppEngine {
  abstract readonly id: WhatsAppEngineId;

  protected readonly emitter = new EventEmitter();

  onQr(handler: (qrDataUrl: string) => void): void {
    this.emitter.on('qr', handler);
  }

  onStatus(handler: (status: SessionStatus) => void): void {
    this.emitter.on('status', handler);
  }

  protected emitQr(qrDataUrl: string): void {
    this.safeEmit('qr', qrDataUrl);
  }

  protected emitStatus(status: SessionStatus): void {
    this.safeEmit('status', status);
  }

  /** Un suscriptor que falla no debe tumbar el motor. */
  private safeEmit(event: 'qr' | 'status', payload: string | SessionStatus): void {
    try {
      this.emitter.emit(event, payload);
    } catch (error) {
      console.error(`[whatsapp] Error en un suscriptor del evento "${event}"`, error);
    }
  }

  abstract status(): Promise<SessionStatus>;
  abstract connect(): Promise<void>;
  abstract logout(): Promise<void>;
  abstract sendText(to: string, body: string): Promise<SendResult>;
}

/** Normaliza un número E.164 al JID que espera WhatsApp. */
export function toJid(e164: string): string {
  const digits = e164.replace(/\D+/g, '');
  return `${digits}@s.whatsapp.net`;
}
