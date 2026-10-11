import {
  WhatsAppEngineBase,
  type SendResult,
  type SessionStatus,
  type WhatsAppEngineId,
} from './engine.js';

/**
 * ---------------------------------------------------------------------------
 * Motor oficial: WhatsApp Cloud API (Meta).
 * ---------------------------------------------------------------------------
 * Alternativa a Baileys cuando la organizadora prefiere el canal oficial.
 * Requiere un número verificado y un token permanente.
 *
 * Nota importante sobre las reglas de Meta: fuera de la ventana de 24 h solo
 * se pueden enviar plantillas aprobadas. Por eso, si hay una plantilla
 * configurada (WHATSAPP_TEMPLATE_NAME), `sendText` envía la plantilla con el
 * texto renderizado como parámetro de cuerpo; si no, envía un mensaje de texto
 * (válido dentro de la ventana de conversación).
 */

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

const MISSING_CREDENTIALS =
  'Faltan WHATSAPP_PHONE_NUMBER_ID y/o WHATSAPP_ACCESS_TOKEN: la API oficial de WhatsApp no está configurada';

export interface CloudApiEngineOptions {
  phoneNumberId?: string | undefined;
  accessToken?: string | undefined;
  templateName?: string | undefined;
  templateLang?: string | undefined;
}

interface GraphMessageResponse {
  messaging_product?: string;
  messages?: Array<{ id?: string }>;
  error?: { message?: string; code?: number; type?: string };
}

interface GraphPhoneResponse {
  display_phone_number?: string;
  verified_name?: string;
  error?: { message?: string; code?: number };
}

function toGraphNumber(e164: string): string {
  return e164.replace(/\D+/g, '');
}

export class CloudApiEngine extends WhatsAppEngineBase {
  override readonly id: WhatsAppEngineId = 'cloud-api';

  private readonly phoneNumberId: string | undefined;
  private readonly accessToken: string | undefined;
  private readonly templateName: string | undefined;
  private readonly templateLang: string;
  private current: SessionStatus;

  constructor(options: CloudApiEngineOptions = {}) {
    super();
    this.phoneNumberId = options.phoneNumberId;
    this.accessToken = options.accessToken;
    this.templateName = options.templateName;
    this.templateLang = options.templateLang ?? 'es';
    this.current = this.hasCredentials()
      ? { status: 'disconnected' }
      : { status: 'error', lastError: MISSING_CREDENTIALS };
  }

  private hasCredentials(): boolean {
    return Boolean(this.phoneNumberId && this.accessToken);
  }

  override async status(): Promise<SessionStatus> {
    return this.current;
  }

  /** Verifica las credenciales contra Graph y guarda el número visible. */
  override async connect(): Promise<void> {
    if (!this.hasCredentials()) {
      this.setStatus({ status: 'error', lastError: MISSING_CREDENTIALS });
      return;
    }

    this.setStatus({ status: 'connecting' });

    try {
      const url = `${GRAPH_BASE}/${this.phoneNumberId}?fields=display_phone_number,verified_name`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      const data = (await response.json()) as GraphPhoneResponse;

      if (!response.ok || data.error) {
        this.setStatus({
          status: 'error',
          lastError: data.error?.message ?? `La API oficial respondió ${response.status}`,
        });
        return;
      }

      this.setStatus({
        status: 'connected',
        phoneNumber: data.display_phone_number ? `+${toGraphNumber(data.display_phone_number)}` : undefined,
      });
    } catch (error) {
      this.setStatus({
        status: 'error',
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  override async logout(): Promise<void> {
    // La API oficial no tiene "sesión" que cerrar: se olvida el estado local.
    this.setStatus({ status: 'disconnected' });
  }

  override async sendText(to: string, body: string): Promise<SendResult> {
    if (!this.hasCredentials()) {
      throw new Error(MISSING_CREDENTIALS);
    }

    const payload = this.templateName
      ? {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toGraphNumber(to),
          type: 'template',
          template: {
            name: this.templateName,
            language: { code: this.templateLang },
            ...(body.trim() === ''
              ? {}
              : {
                  components: [
                    { type: 'body', parameters: [{ type: 'text', text: body }] },
                  ],
                }),
          },
        }
      : {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toGraphNumber(to),
          type: 'text',
          text: { preview_url: true, body },
        };

    const response = await fetch(`${GRAPH_BASE}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as GraphMessageResponse;

    if (!response.ok || data.error) {
      const message = data.error?.message ?? `La API oficial respondió ${response.status}`;
      this.setStatus({ status: 'error', lastError: message });
      throw new Error(message);
    }

    const messageId = data.messages?.[0]?.id;
    if (!messageId) {
      throw new Error('La API oficial aceptó el envío pero no devolvió el id del mensaje');
    }

    return { messageId };
  }

  private setStatus(status: SessionStatus): void {
    this.current = status;
    this.emitStatus(status);
  }
}
