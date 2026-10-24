/**
 * ---------------------------------------------------------------------------
 * Cliente HTTP tipado del panel y de la invitación pública.
 * ---------------------------------------------------------------------------
 * - Lee el JWT de localStorage y lo manda en `Authorization: Bearer ...`.
 * - Base de las rutas: `/api` (Vite lo proxya a http://localhost:4000 en dev y
 *   nginx hace lo mismo en producción).
 * - Ante una respuesta no-2xx lanza `ApiError` con el mensaje del servidor, así
 *   las pantallas pueden mostrar el error real y no un "algo salió mal".
 *
 * IMPORTANTE — capa de adaptación:
 * Este archivo es el ÚNICO lugar donde se conoce la forma exacta en que responde
 * el API (ver docs/09-contrato-http.md). El API devuelve arreglos y objetos
 * directos (`GET /api/weddings` -> `[...]`); acá se envuelven o se derivan los
 * agregados que esperan las pantallas. Si mañana cambia el API, se toca este
 * archivo y ningún componente.
 */

import type {
  Campaign,
  CampaignItem,
  ColumnMapping,
  CreateCampaign,
  Guest,
  GuestInput,
  ImportOptions,
  PublicGuest,
  RsvpSubmission,
  WeddingConfig,
} from '@boda/shared';
import type {
  CampaignActionResponse,
  CampaignDetailResponse,
  CampaignListResponse,
  CreateCampaignResponse,
  CreateWeddingInput,
  GuestListParams,
  GuestListResponse,
  GuestSummary,
  GuestTokenResponse,
  GuestUpdateInput,
  ImageUploadResponse,
  ImportCommitResponse,
  ImportPreview,
  LinkStatusResponse,
  LoginResponse,
  PublicRsvpResponse,
  PublicWeddingResponse,
  StoredImage,
  UpdateWeddingInput,
  WeddingDetail,
  WeddingListItem,
  WeddingStats,
  WhatsAppQrResponse,
  WhatsAppStatusResponse,
  WhatsAppTestResponse,
} from './types';

/* -------------------------------------------------------------------------- */

export const API_BASE = '/api';
export const TOKEN_STORAGE_KEY = 'boda.token';

/** Base absoluta de la app, para armar el `{{enlace}}` de las plantillas. */
export const PUBLIC_BASE_URL = (import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined) ?? '';

export class ApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

/* --- Token ---------------------------------------------------------------- */

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* modo privado / storage bloqueado: la sesión queda solo en memoria */
  }
}

export function clearToken(): void {
  setToken(null);
}

/* --- Núcleo --------------------------------------------------------------- */

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** `FormData` para la subida del archivo de importación. */
  formData?: FormData;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Peticiones de la invitación pública: sin Authorization. */
  anonymous?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
}

/** Extrae el mensaje de error de cualquier forma que devuelva la API. */
function extractMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string' && payload.trim()) return payload;
  if (payload && typeof payload === 'object') {
    const candidate = payload as Record<string, unknown>;
    const direct = candidate['message'] ?? candidate['error'];
    if (typeof direct === 'string' && direct.trim()) return direct;
    if (Array.isArray(direct) && direct.length > 0 && typeof direct[0] === 'string') {
      return direct.join(' · ');
    }
    const issues = candidate['issues'];
    if (Array.isArray(issues) && issues.length > 0) {
      const first = issues[0] as Record<string, unknown> | undefined;
      if (first && typeof first['message'] === 'string') return first['message'];
    }
  }
  return fallback;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  try {
    return await response.text();
  } catch {
    return null;
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, formData, signal, query, anonymous } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (!anonymous) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  let payload: BodyInit | undefined;
  if (formData) {
    // Ojo: no se define Content-Type, el navegador agrega el boundary.
    payload = formData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      ...(payload !== undefined ? { body: payload } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(
      'No pudimos conectarnos con el servidor. Revisá tu conexión e intentá otra vez.',
      0,
    );
  }

  const parsed = await parseBody(response);

  if (!response.ok) {
    if (response.status === 401 && !anonymous) {
      clearToken();
      window.dispatchEvent(new CustomEvent('boda:unauthorized'));
    }
    const fallback =
      response.status === 404
        ? 'No encontramos lo que buscabas.'
        : `Error ${response.status} del servidor.`;
    throw new ApiError(extractMessage(parsed, fallback), response.status, parsed);
  }

  return parsed as T;
}

/* --------------------------------------------------------------------------
   Adaptación: del DTO del API a lo que esperan las pantallas
   -------------------------------------------------------------------------- */

/** `WeddingDto` tal como lo devuelve apps/api (ver docs/09-contrato-http.md). */
interface WeddingApiDto {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  config: WeddingConfig;
  createdAt: string;
  updatedAt: string;
  counts: {
    guests: number;
    totalPasses: number;
    pending: number;
    confirmed: number;
    declined: number;
    maybe: number;
    campaigns: number;
  };
}

function toStats(counts: WeddingApiDto['counts']): WeddingStats {
  return {
    guestCount: counts.guests,
    totalPasses: counts.totalPasses,
    confirmed: counts.confirmed,
    pending: counts.pending,
    declined: counts.declined,
    maybe: counts.maybe,
    campaigns: counts.campaigns,
  };
}

function toWeddingDetail(dto: WeddingApiDto): WeddingDetail {
  const { counts: _counts, ...rest } = dto;
  return rest;
}

function toWeddingListItem(dto: WeddingApiDto): WeddingListItem {
  return { ...toWeddingDetail(dto), stats: toStats(dto.counts) };
}

function toGuestSummary(guests: Guest[]): GuestSummary {
  const sum = (list: Guest[]) => list.reduce((total, guest) => total + guest.passes, 0);
  const confirmed = guests.filter((guest) => guest.status === 'confirmed');
  return {
    total: guests.length,
    totalPasses: sum(guests),
    confirmed: confirmed.length,
    confirmedPasses: sum(confirmed),
    pending: guests.filter((guest) => guest.status === 'pending').length,
    declined: guests.filter((guest) => guest.status === 'declined').length,
    maybe: guests.filter((guest) => guest.status === 'maybe').length,
  };
}

/** Opciones de importación como las espera el API: el mapeo va adentro. */
function importForm(
  file: File,
  options: Partial<ImportOptions>,
  columnMapping?: ColumnMapping,
): FormData {
  const form = new FormData();
  form.append('file', file);
  form.append(
    'options',
    JSON.stringify(columnMapping ? { ...options, columnMapping } : options),
  );
  return form;
}

/* --------------------------------------------------------------------------
   Endpoints
   -------------------------------------------------------------------------- */

export const api = {
  /* --- Sesión ----------------------------------------------------------- */
  auth: {
    login: (email: string, password: string) =>
      request<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
        anonymous: true,
      }),
    // El API responde con el usuario directo; las pantallas esperan `{ user }`.
    me: async (signal?: AbortSignal): Promise<{ user: LoginResponse['user'] }> => {
      const user = await request<LoginResponse['user']>('/auth/me', { signal });
      return { user };
    },
  },

  /* --- Bodas ------------------------------------------------------------ */
  weddings: {
    list: async (signal?: AbortSignal): Promise<{ weddings: WeddingListItem[] }> => {
      const weddings = await request<WeddingApiDto[]>('/weddings', { signal });
      return { weddings: weddings.map(toWeddingListItem) };
    },
    create: async (input: CreateWeddingInput): Promise<{ wedding: WeddingDetail }> => {
      const wedding = await request<WeddingApiDto>('/weddings', { method: 'POST', body: input });
      return { wedding: toWeddingDetail(wedding) };
    },
    get: async (id: string, signal?: AbortSignal): Promise<{ wedding: WeddingDetail }> => {
      const wedding = await request<WeddingApiDto>(`/weddings/${id}`, { signal });
      return { wedding: toWeddingDetail(wedding) };
    },
    update: async (id: string, input: UpdateWeddingInput): Promise<{ wedding: WeddingDetail }> => {
      const wedding = await request<WeddingApiDto>(`/weddings/${id}`, {
        method: 'PATCH',
        body: input,
      });
      return { wedding: toWeddingDetail(wedding) };
    },
    remove: async (id: string): Promise<{ ok: boolean }> => {
      await request<{ ok: boolean }>(`/weddings/${id}`, { method: 'DELETE' });
      return { ok: true };
    },
    /** Publicar o despublicar sin tocar el resto de la configuración. */
    publish: async (id: string, published: boolean): Promise<{ wedding: WeddingDetail }> => {
      const wedding = await request<WeddingApiDto>(`/weddings/${id}/publish`, {
        method: 'POST',
        body: { published },
      });
      return { wedding: toWeddingDetail(wedding) };
    },
  },

  /* --- Invitados -------------------------------------------------------- */
  guests: {
    list: async (
      weddingId: string,
      params: GuestListParams = {},
      signal?: AbortSignal,
    ): Promise<GuestListResponse> => {
      const guests = await request<Guest[]>(`/weddings/${weddingId}/guests`, {
        signal,
        query: {
          // El API filtra por `q` (nombre, teléfono o grupo) y por estado/grupo.
          q: params.search,
          status: params.status && params.status !== 'all' ? params.status : undefined,
          group: params.group,
        },
      });
      const groups = [...new Set(guests.map((guest) => guest.groupName).filter(Boolean))].sort() as
        string[];
      return { guests, summary: toGuestSummary(guests), groups };
    },
    create: async (weddingId: string, input: GuestInput): Promise<{ guest: Guest }> => {
      const guest = await request<Guest>(`/weddings/${weddingId}/guests`, {
        method: 'POST',
        body: input,
      });
      return { guest };
    },
    update: async (
      _weddingId: string,
      guestId: string,
      input: GuestUpdateInput,
    ): Promise<{ guest: Guest }> => {
      const guest = await request<Guest>(`/guests/${guestId}`, { method: 'PATCH', body: input });
      return { guest };
    },
    remove: async (_weddingId: string, guestId: string): Promise<{ ok: boolean }> => {
      await request<{ ok: boolean; id: string }>(`/guests/${guestId}`, { method: 'DELETE' });
      return { ok: true };
    },
    regenerateToken: async (
      weddingId: string,
      guestId: string,
    ): Promise<GuestTokenResponse> => {
      const guest = await request<Guest>(
        `/weddings/${weddingId}/guests/${guestId}/regenerate-token`,
        { method: 'POST' },
      );
      return { guest };
    },
  },

  /* --- Importación ------------------------------------------------------ */
  imports: {
    /** Paso 1: sube el archivo y devuelve la previsualización con los errores. */
    preview: (
      weddingId: string,
      file: File,
      options: Partial<ImportOptions>,
      columnMapping?: ColumnMapping,
    ) =>
      request<ImportPreview>(`/weddings/${weddingId}/import/preview`, {
        method: 'POST',
        formData: importForm(file, options, columnMapping),
      }),

    /**
     * Paso 2: confirma la importación.
     *
     * El API guarda las filas ya revisadas (`ImportRowPreview[]`), no el archivo.
     * Para que la pantalla pueda seguir mandando el archivo, acá se hace la
     * previsualización y el commit seguido: así lo que se guarda es exactamente
     * lo que el servidor acaba de validar, y la pantalla no conoce el detalle.
     */
    commit: async (
      weddingId: string,
      file: File,
      options: Partial<ImportOptions>,
      columnMapping: ColumnMapping,
    ): Promise<ImportCommitResponse> => {
      const preview = await request<ImportPreview>(`/weddings/${weddingId}/import/preview`, {
        method: 'POST',
        formData: importForm(file, options, columnMapping),
      });

      const result = await request<{
        created: number;
        updated: number;
        skipped: number;
        errors: { row: number; message: string }[];
      }>(`/weddings/${weddingId}/import/commit`, {
        method: 'POST',
        body: { rows: preview.rows, options: { ...options, columnMapping } },
      });

      return {
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors.length,
        issues: result.errors,
      };
    },
  },

  /* --- Campañas --------------------------------------------------------- */
  campaigns: {
    list: async (weddingId: string, signal?: AbortSignal): Promise<CampaignListResponse> => {
      const campaigns = await request<Campaign[]>(`/weddings/${weddingId}/campaigns`, { signal });
      return { campaigns };
    },
    get: async (
      _weddingId: string,
      campaignId: string,
      signal?: AbortSignal,
    ): Promise<CampaignDetailResponse> => {
      const [campaign, items] = await Promise.all([
        request<Campaign>(`/campaigns/${campaignId}`, { signal }),
        request<CampaignItem[]>(`/campaigns/${campaignId}/items`, { signal }),
      ]);
      return { campaign, items };
    },
    create: async (
      weddingId: string,
      input: CreateCampaign,
    ): Promise<CreateCampaignResponse> => {
      const campaign = await request<Campaign>(`/weddings/${weddingId}/campaigns`, {
        method: 'POST',
        body: input,
      });
      return { campaign };
    },
    pause: async (_weddingId: string, campaignId: string): Promise<CampaignActionResponse> => {
      const { campaign } = await request<{ ok: boolean; campaign: Campaign }>(
        `/campaigns/${campaignId}/pause`,
        { method: 'POST' },
      );
      return { campaign };
    },
    resume: async (_weddingId: string, campaignId: string): Promise<CampaignActionResponse> => {
      const { campaign } = await request<{ ok: boolean; campaign: Campaign }>(
        `/campaigns/${campaignId}/resume`,
        { method: 'POST' },
      );
      return { campaign };
    },
    cancel: async (_weddingId: string, campaignId: string): Promise<CampaignActionResponse> => {
      const { campaign } = await request<{ ok: boolean; campaign: Campaign }>(
        `/campaigns/${campaignId}/cancel`,
        { method: 'POST' },
      );
      return { campaign };
    },
  },

  /* --- WhatsApp --------------------------------------------------------- */
  whatsapp: {
    status: async (signal?: AbortSignal): Promise<WhatsAppStatusResponse> => {
      const status = await request<{
        engine: string;
        status: WhatsAppStatusResponse['status'];
        phoneNumber: string | null;
        qrDataUrl: string | null;
        lastError: string | null;
        hasQr: boolean;
      }>('/whatsapp/status', { signal });
      return {
        engine: status.engine,
        status: status.status,
        phoneNumber: status.phoneNumber,
        qrDataUrl: status.qrDataUrl,
        lastError: status.lastError,
        hasQr: status.hasQr,
      };
    },
    connect: async (): Promise<WhatsAppStatusResponse> => {
      const status = await request<{
        engine: string;
        status: WhatsAppStatusResponse['status'];
        phoneNumber: string | null;
        qrDataUrl: string | null;
        lastError: string | null;
        hasQr: boolean;
      }>('/whatsapp/connect', { method: 'POST' });
      return {
        engine: status.engine,
        status: status.status,
        phoneNumber: status.phoneNumber,
        qrDataUrl: status.qrDataUrl,
        lastError: status.lastError,
        hasQr: status.hasQr,
      };
    },
    qr: async (signal?: AbortSignal): Promise<WhatsAppQrResponse> => {
      const qr = await request<{
        engine: string;
        status: WhatsAppQrResponse['status'];
        qrDataUrl: string | null;
        updatedAt: string | null;
        hint: string;
      }>('/whatsapp/qr', { signal });
      return {
        status: qr.status,
        qrDataUrl: qr.qrDataUrl,
        hint: qr.hint,
        updatedAt: qr.updatedAt,
      };
    },
    logout: async (): Promise<{ ok: boolean }> => {
      await request<{ engine: string; status: string }>('/whatsapp/logout', { method: 'POST' });
      return { ok: true };
    },
    /**
     * Manda el mensaje a un número concreto (el de la organizadora, por
     * ejemplo) sin crear ni tocar invitados: sirve para comprobar que el
     * número quedó bien conectado antes de lanzar una campaña.
     */
    testSend: (
      weddingId: string,
      input: { phone: string; template?: string; guestName?: string; passes?: number },
    ) =>
      request<WhatsAppTestResponse>(`/weddings/${weddingId}/whatsapp/test`, {
        method: 'POST',
        body: input,
      }),
  },

  /* --- Fotos de la invitación ------------------------------------------- */
  uploads: {
    /** Fotos ya subidas de esta boda (la "biblioteca" reutilizable). */
    list: async (weddingId: string, signal?: AbortSignal): Promise<{ images: StoredImage[] }> =>
      request<{ images: StoredImage[] }>(`/weddings/${weddingId}/images`, { signal }),

    /**
     * Sube una o varias fotos. La API valida el formato real del archivo y el
     * peso; si alguna falla, devuelve las que sí se guardaron y el motivo del
     * resto en `errors`.
     */
    upload: async (weddingId: string, files: File[]): Promise<ImageUploadResponse> => {
      const form = new FormData();
      for (const file of files) form.append('file', file);
      return request<ImageUploadResponse>(`/weddings/${weddingId}/images`, {
        method: 'POST',
        formData: form,
      });
    },

    remove: async (weddingId: string, file: string): Promise<{ ok: boolean }> =>
      request<{ ok: boolean }>(`/weddings/${weddingId}/images/${encodeURIComponent(file)}`, {
        method: 'DELETE',
      }),
  },

  /* --- Estado del sistema ----------------------------------------------- */
  system: {
    /**
     * A dónde apuntan los enlaces de las invitaciones.
     *
     * El panel lo consulta al entrar: si `sendable` es `false`, los envíos
     * reales quedan bloqueados y hay que avisarlo antes de que la organizadora
     * cargue una lista de 200 invitados.
     */
    links: (signal?: AbortSignal): Promise<LinkStatusResponse> =>
      request<LinkStatusResponse>('/system/links', { signal }),
  },

  /* --- Invitación pública (sin token) ----------------------------------- */
  public: {
    wedding: async (slug: string, signal?: AbortSignal): Promise<PublicWeddingResponse> => {
      const data = await request<{ slug: string; config: WeddingConfig }>(
        `/public/weddings/${encodeURIComponent(slug)}`,
        { signal, anonymous: true },
      );
      return { wedding: data };
    },
    guest: async (
      slug: string,
      token: string,
      signal?: AbortSignal,
    ): Promise<{ guest: PublicGuest }> => {
      const guest = await request<PublicGuest>(
        `/public/weddings/${encodeURIComponent(slug)}/guest/${encodeURIComponent(token)}`,
        { signal, anonymous: true },
      );
      return { guest };
    },
    rsvp: async (
      slug: string,
      token: string,
      submission: RsvpSubmission,
    ): Promise<PublicRsvpResponse> => {
      const guest = await request<PublicGuest>(
        `/public/weddings/${encodeURIComponent(slug)}/guest/${encodeURIComponent(token)}/rsvp`,
        { method: 'POST', body: submission, anonymous: true },
      );
      return { ok: true, guest };
    },
  },
};

/* --------------------------------------------------------------------------
   Utilidades compartidas por las pantallas
   -------------------------------------------------------------------------- */

/** URL pública de la invitación (no la del token personal). */
export function invitationUrl(slug: string): string {
  return `${PUBLIC_BASE_URL}/i/${slug}`;
}

/** URL del enlace personal de un invitado. */
export function guestLink(slug: string, token: string): string {
  return `${PUBLIC_BASE_URL}/i/${slug}/${token}`;
}

/** Enlace a la sección de confirmación (para la variable {{rsvp}}). */
export function guestRsvpLink(slug: string, token: string): string {
  return `${guestLink(slug, token)}#rsvp`;
}

/** Normaliza una boda que llega del endpoint público a su config. */
export function asWeddingConfig(config: WeddingConfig): WeddingConfig {
  return config;
}

/** Copia texto al portapapeles con fallback para navegadores sin permiso. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* seguimos con el fallback */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** Pequeña espera reutilizable (reintentos de polling). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
