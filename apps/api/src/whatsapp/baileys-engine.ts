import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import pino from 'pino';
import QRCode from 'qrcode';
import {
  WhatsAppEngineBase,
  toJid,
  type SendResult,
  type SessionStatus,
  type WhatsAppEngineId,
} from './engine.js';

/**
 * ---------------------------------------------------------------------------
 * Motor Baileys (WhatsApp Web no oficial).
 * ---------------------------------------------------------------------------
 * Es el modo que usa la organizadora en la vida real: escanea un QR una vez y
 * la sesión queda guardada en disco. A partir de ahí la API envía los mensajes
 * desde su propio número.
 *
 * La dependencia `@whiskeysockets/baileys` se carga de forma diferida y con un
 * especificador que TypeScript no resuelve estáticamente: así la API compila y
 * arranca incluso si la dependencia opcional no está instalada. En ese caso el
 * estado queda en 'error' con un mensaje claro para el panel.
 */

// ---------------------------------------------------------------------------
// Interfaces mínimas de Baileys (se declaran localmente: nunca `any`)
// ---------------------------------------------------------------------------

interface BaileysConnectionUpdate {
  connection?: string;
  lastDisconnect?: {
    error?: { message?: string; output?: { statusCode?: number } };
  };
  qr?: string;
  isNewLogin?: boolean;
}

interface BaileysEventEmitter {
  on(event: string, listener: (payload: unknown) => void): void;
}

interface BaileysSocket {
  ev: BaileysEventEmitter;
  user?: { id?: string } | null;
  sendMessage(jid: string, content: { text: string }): Promise<unknown>;
  logout(): Promise<void>;
  end?: (error?: Error) => void;
}

interface BaileysAuthState {
  state: unknown;
  saveCreds: () => Promise<void>;
}

interface BaileysModule {
  makeWASocket: (config: Record<string, unknown>) => BaileysSocket | Promise<BaileysSocket>;
  useMultiFileAuthState: (directory: string) => Promise<BaileysAuthState>;
  DisconnectReason?: Record<string, number | undefined>;
  Browsers?: { ubuntu: (name: string) => unknown };
}

interface QrTerminalModule {
  generate: (text: string, options?: { small?: boolean }) => void;
}

const BAILEYS_ERROR = 'Dependencia @whiskeysockets/baileys no instalada';

let cachedBaileys: BaileysModule | null = null;

/** Carga Baileys en tiempo de ejecución, sin depender de sus tipos. */
async function loadBaileys(): Promise<BaileysModule> {
  if (cachedBaileys) return cachedBaileys;

  // El especificador se declara como `string` a propósito: TypeScript no lo
  // resuelve al compilar, así que la ausencia del paquete no rompe el build.
  const specifier: string = '@whiskeysockets/baileys';

  let imported: unknown;
  try {
    imported = await import(specifier);
  } catch {
    throw new Error(BAILEYS_ERROR);
  }

  const module_ = imported as BaileysModule;
  if (typeof module_.makeWASocket !== 'function' || typeof module_.useMultiFileAuthState !== 'function') {
    throw new Error(BAILEYS_ERROR);
  }

  cachedBaileys = module_;
  return module_;
}

let cachedQrTerminal: QrTerminalModule | null = null;

/** Imprime el QR en la consola cuando la API corre en una terminal. */
async function printQrInTerminal(qr: string): Promise<void> {
  try {
    if (!cachedQrTerminal) {
      const specifier: string = 'qrcode-terminal';
      const imported = (await import(specifier)) as {
        default?: QrTerminalModule;
        generate?: QrTerminalModule['generate'];
      };
      const candidate = imported.default ?? (imported as QrTerminalModule);
      if (typeof candidate.generate !== 'function') return;
      cachedQrTerminal = candidate;
    }
    cachedQrTerminal.generate(qr, { small: true });
  } catch {
    // Es solo una ayuda visual: si el paquete no está, no pasa nada.
  }
}

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------

export interface BaileysEngineOptions {
  /** Carpeta base de sesiones; se crea una subcarpeta por usuario. */
  sessionDir: string;
  userId: string;
}

export class BaileysEngine extends WhatsAppEngineBase {
  override readonly id: WhatsAppEngineId = 'baileys';

  private readonly authDir: string;
  private socket: BaileysSocket | null = null;
  private current: SessionStatus = { status: 'disconnected' };
  private starting = false;
  private stopped = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: BaileysEngineOptions) {
    super();
    this.authDir = join(options.sessionDir, options.userId);
  }

  override async status(): Promise<SessionStatus> {
    return this.current;
  }

  override async connect(): Promise<void> {
    if (this.starting) return;
    if (this.current.status === 'connected' && this.socket) return;

    this.stopped = false;
    this.starting = true;
    this.setStatus({ status: 'connecting' });

    try {
      const baileys = await loadBaileys();
      await mkdir(this.authDir, { recursive: true });

      const { state, saveCreds } = await baileys.useMultiFileAuthState(this.authDir);
      const logger = pino({ level: 'silent' });

      const socket = await baileys.makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: baileys.Browsers?.ubuntu('Boda Studio') ?? ['Boda Studio', 'Chrome', '1.0.0'],
        logger,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
      });

      this.socket = socket;
      socket.ev.on('creds.update', () => {
        void saveCreds().catch((error: unknown) => {
          console.error('[whatsapp:baileys] No se pudieron guardar las credenciales', error);
        });
      });
      socket.ev.on('connection.update', (payload: unknown) => {
        void this.handleConnectionUpdate(payload as BaileysConnectionUpdate, baileys);
      });
    } catch (error) {
      this.setStatus({
        status: 'error',
        lastError: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.starting = false;
    }
  }

  override async logout(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      await this.socket?.logout();
    } catch (error) {
      console.error('[whatsapp:baileys] Error al cerrar la sesión', error);
    } finally {
      this.socket = null;
      // La sesión cerrada ya no sirve: se borra para que el próximo escaneo
      // genere credenciales nuevas.
      await rm(this.authDir, { recursive: true, force: true }).catch(() => undefined);
      this.setStatus({ status: 'disconnected' });
    }
  }

  override async sendText(to: string, body: string): Promise<SendResult> {
    if (!this.socket || this.current.status !== 'connected') {
      throw new Error(
        'La sesión de WhatsApp no está conectada. Abrí el panel y escaneá el código QR.',
      );
    }

    const result = await this.socket.sendMessage(toJid(to), { text: body });
    const sent = result as { key?: { id?: string | null } | null } | null | undefined;
    const messageId = sent?.key?.id ?? `baileys-${Date.now()}`;
    return { messageId };
  }

  private async handleConnectionUpdate(
    update: BaileysConnectionUpdate,
    baileys: BaileysModule,
  ): Promise<void> {
    if (update.qr) {
      try {
        const qrDataUrl = await QRCode.toDataURL(update.qr, { margin: 1, width: 320 });
        this.setStatus({ status: 'qr', qrDataUrl });
        this.emitQr(qrDataUrl);
      } catch (error) {
        console.error('[whatsapp:baileys] No se pudo generar la imagen del QR', error);
      }
      void printQrInTerminal(update.qr);
    }

    if (update.connection === 'connecting') {
      this.setStatus({ status: 'connecting' });
    }

    if (update.connection === 'open') {
      this.reconnectAttempts = 0;
      this.setStatus({ status: 'connected', phoneNumber: this.phoneFromSocket() });
    }

    if (update.connection === 'close') {
      const statusCode = update.lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode !== undefined && statusCode === baileys.DisconnectReason?.loggedOut;

      if (loggedOut) {
        this.socket = null;
        this.setStatus({
          status: 'disconnected',
          lastError: 'La sesión se cerró desde el teléfono: hay que escanear el QR otra vez.',
        });
        return;
      }

      if (this.stopped) return;

      this.setStatus({
        status: 'connecting',
        lastError: update.lastDisconnect?.error?.message ?? 'La conexión se cerró, reintentando…',
      });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.stopped) return;
    this.reconnectAttempts += 1;

    if (this.reconnectAttempts > 10) {
      this.setStatus({
        status: 'error',
        lastError: 'No se pudo reconectar con WhatsApp después de 10 intentos.',
      });
      return;
    }

    const delay = Math.min(30_000, 2_000 * this.reconnectAttempts);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.stopped) return;
      this.socket = null;
      void this.connect();
    }, delay);
  }

  private phoneFromSocket(): string | undefined {
    const id = this.socket?.user?.id;
    if (!id) return undefined;
    const digits = id.split(':')[0]?.split('@')[0] ?? '';
    if (digits === '') return undefined;
    return digits.startsWith('+') ? digits : `+${digits}`;
  }

  private setStatus(status: SessionStatus): void {
    this.current = status;
    this.emitStatus(status);
  }
}
