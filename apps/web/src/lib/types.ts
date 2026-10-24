/**
 * ---------------------------------------------------------------------------
 * Tipos del contrato HTTP entre el panel y la API.
 * ---------------------------------------------------------------------------
 * Los tipos de dominio (WeddingConfig, Guest, Campaign, ...) se importan de
 * @boda/shared: son la única fuente de verdad. Acá viven solo las envolturas
 * de request/response que la API agrega por encima del modelo de datos.
 */

import type {
  Campaign,
  CampaignItem,
  Guest,
  ImportPreview,
  RsvpStatus,
  WeddingConfig,
} from '@boda/shared';

/* --- Autenticación ------------------------------------------------------- */

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface LoginResponse {
  token: string;
  user: SessionUser;
}

/* --- Bodas --------------------------------------------------------------- */

/** Contadores derivados que la API calcula para el listado del panel. */
export interface WeddingStats {
  guestCount: number;
  totalPasses: number;
  confirmed: number;
  pending: number;
  declined: number;
  maybe?: number;
  campaigns?: number;
  [key: string]: number | undefined;
}

export interface WeddingListItem {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  stats: WeddingStats;
  config: WeddingConfig;
}

export interface WeddingDetail {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  config: WeddingConfig;
}

export interface CreateWeddingInput {
  title: string;
  slug: string;
  published?: boolean;
  config: Partial<WeddingConfig>;
}

export type UpdateWeddingInput = Partial<Omit<CreateWeddingInput, 'slug'>> & { slug?: string };

/* --- Invitados ----------------------------------------------------------- */

export interface GuestListParams {
  search?: string;
  status?: RsvpStatus | 'all';
  group?: string | null;
  weddingId?: string;
}

export interface GuestSummary {
  total: number;
  totalPasses: number;
  confirmed: number;
  confirmedPasses: number;
  pending: number;
  declined: number;
  maybe: number;
}

export interface GuestListResponse {
  guests: Guest[];
  summary: GuestSummary;
  groups: string[];
}

export interface GuestUpdateInput {
  fullName?: string;
  /** Número de WhatsApp. El API lo normaliza a E.164 antes de guardarlo. */
  phone?: string;
  passes?: number;
  groupName?: string | null;
  notes?: string | null;
  status?: RsvpStatus;
  companions?: string[];
  dietary?: string | null;
}

export interface GuestTokenResponse {
  guest: Guest;
}

/* --- Importación --------------------------------------------------------- */

export interface ImportCommitResponse {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  /** La API puede devolver el detalle de los rechazos. */
  issues?: { row: number; message: string }[];
}

/** Reexportamos el contrato de importación del paquete compartido. */
export type { ImportPreview };

/* --- Fotos de la invitación ---------------------------------------------- */

/** Una foto ya subida al servidor, lista para usar en la invitación. */
export interface StoredImage {
  /** Nombre del archivo dentro de la carpeta de la boda. */
  file: string;
  /** Ruta pública que se guarda en la configuración (`/api/uploads/…`). */
  url: string;
  size: number;
  uploadedAt: string;
}

export interface ImageUploadResponse {
  images: StoredImage[];
  /** Motivo por archivo cuando alguna no se pudo subir. */
  errors: string[];
}

/* --- Campañas ------------------------------------------------------------ */

export interface CreateCampaignResponse {
  campaign: Campaign;
}

export interface CampaignListResponse {
  campaigns: Campaign[];
}

export interface CampaignDetailResponse {
  campaign: Campaign;
  items: CampaignItem[];
}

export interface CampaignActionResponse {
  campaign: Campaign;
}

/* --- WhatsApp ------------------------------------------------------------ */

export type WhatsAppState =
  | 'disconnected'
  | 'qr'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'unsupported';

export interface WhatsAppStatusResponse {
  engine: string;
  status: WhatsAppState;
  phoneNumber?: string | null;
  /** Último QR conocido (data URL PNG), si el motor es Baileys. */
  qrDataUrl?: string | null;
  hasQr?: boolean;
  lastError?: string | null;
  lastQrAt?: string | null;
  connectedAt?: string | null;
}

export interface WhatsAppQrResponse {
  status: WhatsAppState;
  qrDataUrl?: string | null;
  /** Instrucción para la organizadora (cómo escanear, o por qué no hay QR). */
  hint?: string;
  /** Cuándo se generó: el QR de WhatsApp vence en pocos minutos. */
  updatedAt?: string | null;
}

/** Resultado de un envío de prueba a un número suelto. */
export interface WhatsAppTestResponse {
  ok: boolean;
  engine: string;
  phone: string;
  messageId?: string | null;
  /** `false` con el motor de previsualización: no salió nada de verdad. */
  delivered: boolean;
  /** El texto final que se envió (o se habría enviado). */
  body: string;
  /** ¿El enlace del mensaje se abre desde el teléfono que lo recibe? */
  linkIsPublic?: boolean;
  note?: string;
}

/* --- Estado del sistema -------------------------------------------------- */

/**
 * A dónde apuntan los enlaces que llevan los mensajes de WhatsApp.
 * Si `sendable` es `false`, el envío real queda bloqueado: el enlace no se
 * puede abrir desde el teléfono de un invitado.
 */
export interface LinkStatusResponse {
  publicWebUrl: string;
  publicApiUrl: string;
  isPublic: boolean;
  sendable: boolean;
  /** `null` cuando la dirección sí es pública. */
  problem: string | null;
  message: string;
  warnings: string[];
  /** Enlace de ejemplo, con la forma del `{{enlace}}` real. */
  exampleLink: string;
  /** Qué hacer para arreglarlo. */
  remedy: string | null;
  /** Documento con las opciones de URL pública (gratis y de bajo coste). */
  docs: string;
  whatsappEngine: string;
  warning: string | null;
}

/* --- Invitación pública -------------------------------------------------- */

export interface PublicWeddingResponse {
  wedding: {
    slug: string;
    config: WeddingConfig;
  };
}

export interface PublicRsvpResponse {
  ok: boolean;
  message?: string;
  guest?: {
    token: string;
    fullName: string;
    passes: number;
    status: RsvpStatus;
    companions: string[];
    respondedAt?: string;
  };
}
