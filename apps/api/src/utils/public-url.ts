/**
 * ---------------------------------------------------------------------------
 * ¿Se puede abrir este enlace desde el teléfono de un invitado?
 * ---------------------------------------------------------------------------
 * El `{{enlace}}` de cada mensaje se arma con `PUBLIC_WEB_URL` (ver
 * `services/tokens.ts`). Si esa variable apunta a `localhost`, a una IP de la
 * red interna o a un dominio de prueba, el mensaje **sale igual** pero ningún
 * invitado puede abrir su invitación: su teléfono busca ese host en su propia
 * red y no encuentra nada. Es el error que arruina una campaña entera, así que
 * se detecta antes de gastar el primer mensaje.
 *
 * Este módulo es puro a propósito (no lee `env`): la API lo usa para bloquear
 * envíos reales y las pruebas lo verifican sin base de datos ni configuración.
 */

/** Motivos por los que una dirección no sirve para un invitado. */
export type PublicUrlProblem =
  | 'invalid'
  | 'protocol'
  | 'loopback'
  | 'local-hostname'
  | 'private-ip'
  | 'link-local'
  | 'reserved-ip'
  | 'reserved-domain';

export interface PublicUrlCheck {
  /** URL normalizada: sin espacios y sin barra final. */
  url: string;
  /** Host en minúsculas y sin corchetes (`bodas.midominio.com`, `192.168.0.5`). */
  host: string;
  /** `https:` es lo esperado; `http:` funciona pero se advierte. */
  protocol: 'http:' | 'https:' | 'other';
  /** `true` solo si un teléfono fuera de esta red puede abrir el enlace. */
  isPublic: boolean;
  /** Motivo del bloqueo; `null` cuando la dirección sí es pública. */
  problem: PublicUrlProblem | null;
  /** Frase en español, lista para el panel y la bitácora. */
  message: string;
  /** Problemas que no impiden enviar, pero conviene corregir. */
  warnings: string[];
}

/** Nombres que siempre significan "esta misma máquina". */
const LOOPBACK_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'broadcasthost',
]);

/** Dominios que solo existen dentro de una red local. */
const LOCAL_DOMAIN_SUFFIXES = [
  '.localhost',
  '.local',
  '.localdomain',
  '.internal',
  '.intranet',
  '.lan',
  '.home',
  '.home.arpa',
];

/**
 * Dominios reservados por RFC 2606/6761 para pruebas y documentación: nunca
 * resuelven a un servidor real. Incluye los subdominios de `example.com` y
 * compañía, que es lo que copia cualquiera al escribir un ejemplo.
 */
const RESERVED_DOMAIN_SUFFIXES = [
  '.test',
  '.example',
  '.example.com',
  '.example.org',
  '.example.net',
  '.invalid',
];

/** Nombres completos reservados: nunca resuelven a un servidor real. */
const RESERVED_HOSTNAMES = new Set([
  'example.com',
  'example.org',
  'example.net',
  'example',
  'invalid',
  'test',
]);

/**
 * Túneles gratuitos cuyo host cambia cada vez que se reinicia el proceso.
 * Sirven para una prueba de cinco minutos, no para enlaces que viven semanas
 * en el teléfono de un invitado.
 */
const EPHEMERAL_TUNNEL_SUFFIXES = [
  '.trycloudflare.com',
  '.ngrok-free.app',
  '.ngrok-free.dev',
  '.ngrok.io',
  '.ngrok.app',
  '.loca.lt',
  '.lhr.life',
  '.serveo.net',
  '.localhost.run',
  '.devtunnels.ms',
  '.tunnel.me',
];

const PROBLEM_MESSAGES: Record<PublicUrlProblem, string> = {
  invalid:
    'La dirección no es una URL válida: tiene que empezar con http:// o https:// y llevar un host.',
  protocol:
    'La dirección usa un protocolo que no se puede abrir en un navegador: tiene que ser http:// o https://.',
  loopback:
    'La dirección apunta a la máquina donde corre la API (localhost). En el teléfono de un invitado, "localhost" es el teléfono mismo: no abre nada.',
  'local-hostname':
    'La dirección usa un nombre de red interna o de prueba, que no existe en internet.',
  'private-ip':
    'La dirección es una IP de red privada: funciona en tu red, pero no desde los datos móviles o el wifi de un invitado.',
  'link-local':
    'La dirección es una IP de enlace local (169.254.x.x o fe80::), que no se enruta por internet.',
  'reserved-ip':
    'La dirección es una IP reservada o multicast: no sirve para publicar una web.',
  'reserved-domain':
    'La dirección usa un dominio reservado para ejemplos o pruebas, que no está publicado en internet.',
};

/** `null` si el host no es una IPv4. */
function ipv4Problem(host: string): PublicUrlProblem | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;

  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  if (octets.some((octet) => Number.isNaN(octet) || octet > 255)) return null;

  const a = octets[0] ?? 0;
  const b = octets[1] ?? 0;
  const c = octets[2] ?? 0;

  if (a === 127) return 'loopback';
  if (a === 0) return 'reserved-ip';
  if (a === 10) return 'private-ip';
  if (a === 172 && b >= 16 && b <= 31) return 'private-ip';
  if (a === 192 && b === 168) return 'private-ip';
  if (a === 169 && b === 254) return 'link-local';
  // 100.64.0.0/10: direcciones de operador (CGNAT), no accesibles desde fuera.
  if (a === 100 && b >= 64 && b <= 127) return 'private-ip';
  // Rangos de documentación y de benchmark (RFC 5737 y RFC 2544): no se enrutan.
  if (a === 192 && b === 0 && c === 2) return 'reserved-ip';
  if (a === 198 && b === 51 && c === 100) return 'reserved-ip';
  if (a === 198 && (b === 18 || b === 19)) return 'reserved-ip';
  if (a === 203 && b === 0 && c === 113) return 'reserved-ip';
  if (a >= 224) return 'reserved-ip'; // multicast (224-239) y reservado (240-255)

  return null;
}

/** `null` si el host no es una IPv6. */
function ipv6Problem(host: string): PublicUrlProblem | null {
  const value = host.toLowerCase();
  if (!value.includes(':')) return null;

  if (value === '::1' || value === '::') return 'loopback';
  if (/^fe[89ab][0-9a-f]:/.test(value)) return 'link-local';
  if (/^f[cd][0-9a-f]{2}:/.test(value)) return 'private-ip'; // fc00::/7 (ULA)
  if (value.startsWith('2001:db8:')) return 'reserved-ip'; // documentación (RFC 3849)

  // IPv4 mapeada (`::ffff:192.168.0.5`): se juzga por la IPv4 de dentro.
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice('::ffff:'.length);
    return ipv4Problem(mapped) ?? 'private-ip';
  }

  return null;
}

function isBareIpv4(host: string): boolean {
  return ipv4Problem(host) !== null || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function warningsFor(host: string, protocol: PublicUrlCheck['protocol']): string[] {
  const warnings: string[] = [];

  if (protocol === 'http:') {
    warnings.push(
      'El enlace usa http:// sin cifrado: WhatsApp lo muestra como "no seguro" y algunos navegadores avisan antes de abrirlo. Usá https://.',
    );
  }

  if (isBareIpv4(host)) {
    warnings.push(
      'El enlace usa una IP en vez de un dominio: si la IP del servidor cambia, todos los enlaces ya enviados dejan de funcionar.',
    );
  }

  if (EPHEMERAL_TUNNEL_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    warnings.push(
      'Es un túnel temporal: el host cambia cada vez que se reinicia el proceso y los enlaces ya enviados quedan muertos. Sirve para probar, no para una campaña real.',
    );
  }

  return warnings;
}

/**
 * Clasifica la URL pública de la web.
 *
 * @example
 * classifyPublicUrl('http://localhost:5173').isPublic   // false
 * classifyPublicUrl('https://bodas.midominio.com').isPublic // true
 */
export function classifyPublicUrl(raw: string): PublicUrlCheck {
  // Se limpia una sola vez: así el valor que se muestra coincide con el que se
  // usa para armar el enlace (los dos sin barra final).
  const url = String(raw ?? '')
    .trim()
    .replace(/\/+$/, '');

  const local = (problem: PublicUrlProblem): PublicUrlCheck => ({
    url,
    host: '',
    protocol: 'other',
    isPublic: false,
    problem,
    message: PROBLEM_MESSAGES[problem],
    warnings: [],
  });

  if (url === '') return local('invalid');

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return local('invalid');
  }

  const protocol: PublicUrlCheck['protocol'] =
    parsed.protocol === 'https:' ? 'https:' : parsed.protocol === 'http:' ? 'http:' : 'other';

  // Node devuelve las IPv6 entre corchetes (`[::1]`).
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (protocol === 'other' || host === '') {
    return { ...local('protocol'), host, protocol };
  }

  const base = {
    url,
    host,
    protocol,
    warnings: warningsFor(host, protocol),
  };

  const problem = ((): PublicUrlProblem | null => {
    if (LOOPBACK_HOSTNAMES.has(host)) return 'loopback';
    if (RESERVED_HOSTNAMES.has(host)) return 'reserved-domain';
    if (RESERVED_DOMAIN_SUFFIXES.some((suffix) => host.endsWith(suffix))) return 'reserved-domain';
    if (LOCAL_DOMAIN_SUFFIXES.some((suffix) => host.endsWith(suffix))) return 'local-hostname';

    const ipProblem = ipv4Problem(host) ?? ipv6Problem(host);
    if (ipProblem) return ipProblem;

    // Un nombre sin punto (`http://miboda`) solo resuelve dentro de la red local.
    if (!host.includes('.') && !host.includes(':')) return 'local-hostname';

    return null;
  })();

  return {
    ...base,
    isPublic: problem === null,
    problem,
    message: problem === null ? 'La dirección es pública.' : PROBLEM_MESSAGES[problem],
  };
}
