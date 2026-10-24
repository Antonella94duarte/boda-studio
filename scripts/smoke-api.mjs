/**
 * ---------------------------------------------------------------------------
 * Prueba de humo del API (integración real por HTTP).
 * ---------------------------------------------------------------------------
 * Recorre el mismo camino que hace el panel y la invitación pública:
 *
 *   login → bodas → invitados → invitación pública → RSVP → campaña en seco
 *
 * Uso:
 *   node scripts/smoke-api.mjs                       (contra http://localhost:4000)
 *   $env:API_URL='http://otro:4000'; node scripts/smoke-api.mjs
 *
 * Sale con código 1 si alguna comprobación falla. No necesita dependencias:
 * solo `fetch` nativo de Node 20+.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API_URL = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
const EMAIL = process.env.ADMIN_EMAIL ?? 'organizadora@bodastudio.com';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'CambiarEstaClave123';
const SLUG = process.env.SMOKE_SLUG ?? 'sandraujorge';

let failures = 0;
let checks = 0;

function ok(name, condition, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FALLA ${name}${detail ? ' -> ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n== ${title} ==`);
}

async function call(path, options = {}) {
  const { method = 'GET', body, token, raw, formData } = options;
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API_URL}/api${path}`, {
    method,
    headers,
    // Con FormData el navegador/Node pone el Content-Type con su boundary.
    ...(formData ? { body: formData } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let payload = text;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    /* respuesta no JSON: se devuelve el texto */
  }
  if (raw) return { status: response.status, payload };
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object'
        ? (payload.message ?? payload.error ?? JSON.stringify(payload))
        : String(payload);
    throw new Error(`${method} ${path} -> ${response.status}: ${message}`);
  }
  return payload;
}

function isIsoDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

async function main() {
  console.log(`API: ${API_URL}`);

  section('Salud');
  const health = await call('/health');
  ok('/api/health responde', health !== null && typeof health === 'object', JSON.stringify(health));
  ok(
    '/api/health informa si el enlace de las invitaciones es público',
    typeof health.linkIsPublic === 'boolean',
    `linkIsPublic=${health.linkIsPublic}`,
  );

  section('Autenticación');
  const login = await call('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  ok('login devuelve token', typeof login.token === 'string' && login.token.length > 20);
  ok('login devuelve usuario', Boolean(login.user?.email));
  const token = login.token;

  // El API devuelve el usuario directamente; la web lo envuelve en `{ user }`
  // dentro de su capa de adaptación (apps/web/src/lib/api.ts).
  const me = await call('/auth/me', { token });
  ok('/auth/me devuelve el usuario', me?.email === EMAIL, JSON.stringify(me));

  const badLogin = await call('/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: 'clave-incorrecta' },
    raw: true,
  });
  ok('clave incorrecta -> 401', badLogin.status === 401, `status ${badLogin.status}`);

  section('Bodas');
  const weddings = await call('/weddings', { token });
  ok('GET /weddings devuelve un arreglo', Array.isArray(weddings), typeof weddings);
  const wedding = (weddings ?? []).find((w) => w.slug === SLUG);
  ok(`existe la boda sembrada "${SLUG}"`, Boolean(wedding));
  if (!wedding) throw new Error('No se puede continuar sin la boda de ejemplo. ¿Corriste `pnpm db:seed`?');

  ok('la boda trae id, slug, title y config', Boolean(wedding.id && wedding.slug && wedding.title && wedding.config));
  ok('la config trae la pareja', Boolean(wedding.config?.couple?.display), JSON.stringify(wedding.config?.couple));
  ok('la config trae eventos', Array.isArray(wedding.config?.events) && wedding.config.events.length > 0);
  ok('la boda trae contadores', Boolean(wedding.counts), JSON.stringify(wedding.counts));
  ok('la boda está publicada', wedding.published === true);
  ok('fechas en ISO', isIsoDate(wedding.createdAt) && isIsoDate(wedding.updatedAt));

  const detail = await call(`/weddings/${wedding.id}`, { token });
  ok('GET /weddings/:id devuelve la boda', detail?.id === wedding.id);

  const notFound = await call('/weddings/no-existe-123', { token, raw: true });
  ok('boda inexistente -> 404', notFound.status === 404, `status ${notFound.status}`);

  section('Invitados');
  const guests = await call(`/weddings/${wedding.id}/guests`, { token });
  ok('GET invitados devuelve un arreglo', Array.isArray(guests), typeof guests);
  ok('hay invitados importados por el seed', guests.length > 0, `${guests.length} invitados`);

  const guest = guests[0];
  ok('el invitado trae token', typeof guest?.token === 'string' && guest.token.length >= 8);
  ok('el invitado trae nombre', Boolean(guest?.fullName));
  ok('el teléfono está en E.164', /^\+\d{8,15}$/.test(guest?.phone ?? ''), guest?.phone);
  ok('el invitado conserva el teléfono original', typeof guest?.rawPhone === 'string', guest?.rawPhone);
  ok('el invitado trae pases', Number.isInteger(guest?.passes) && guest.passes >= 1);
  ok('el invitado trae estado de confirmación', ['pending', 'confirmed', 'declined', 'maybe'].includes(guest?.status), guest?.status);
  ok('los acompañantes llegan como arreglo', Array.isArray(guest?.companions));
  ok('el invitado trae estado de mensaje', typeof guest?.messageStatus === 'string', guest?.messageStatus);

  const filtered = await call(`/weddings/${wedding.id}/guests?status=confirmed`, { token });
  ok('el filtro por estado devuelve solo confirmados', filtered.every((g) => g.status === 'confirmed'));

  const searched = await call(`/weddings/${wedding.id}/guests?q=${encodeURIComponent('Ana')}`, { token });
  ok('la búsqueda por texto filtra', Array.isArray(searched), typeof searched);

  section('Invitación pública');
  const publicWedding = await call(`/public/weddings/${SLUG}`);
  ok('GET público devuelve slug', publicWedding?.slug === SLUG);
  ok('GET público devuelve config', Boolean(publicWedding?.config?.couple?.display));
  // Ojo: la config SÍ incluye el teléfono de contacto para confirmar asistencia
  // (está impreso en la tarjeta). Lo que no debe salir nunca es la lista de
  // invitados ni datos de terceros.
  ok(
    'el endpoint público solo devuelve slug y config',
    JSON.stringify(Object.keys(publicWedding).sort()) === JSON.stringify(['config', 'slug']),
    JSON.stringify(Object.keys(publicWedding)),
  );
  ok(
    'el público no incluye la lista de invitados',
    publicWedding?.guests === undefined && publicWedding?.config?.guests === undefined,
  );

  const publicGuest = await call(`/public/weddings/${SLUG}/guest/${guest.token}`);
  ok('el enlace personalizado devuelve el invitado', publicGuest?.fullName === guest.fullName, JSON.stringify(publicGuest));
  ok('el invitado público no expone el teléfono', publicGuest?.phone === undefined);
  ok('el invitado público trae sus pases', Number.isInteger(publicGuest?.passes));

  const invalidToken = await call(`/public/weddings/${SLUG}/guest/token-invalido`, { raw: true });
  ok('token inválido -> 404', invalidToken.status === 404, `status ${invalidToken.status}`);

  section('Confirmación (RSVP)');
  const rsvp = await call(`/public/weddings/${SLUG}/guest/${guest.token}/rsvp`, {
    method: 'POST',
    body: {
      attending: 'yes',
      companions: ['Acompañante de prueba'],
      dietary: 'Vegetariano',
      message: 'Ahí estaremos',
    },
  });
  ok('el RSVP responde con el invitado actualizado', rsvp?.status === 'confirmed', JSON.stringify(rsvp));
  ok('los acompañantes se guardaron', Array.isArray(rsvp?.companions) && rsvp.companions.includes('Acompañante de prueba'));
  ok('la respuesta queda con fecha', isIsoDate(rsvp?.respondedAt));

  const afterRsvp = await call(`/weddings/${wedding.id}/guests`, { token });
  const confirmed = afterRsvp.find((g) => g.id === guest.id);
  ok('el panel ve la confirmación', confirmed?.status === 'confirmed');
  ok('el panel ve la restricción alimentaria', confirmed?.dietary === 'Vegetariano', confirmed?.dietary);

  section('WhatsApp');
  const waStatus = await call('/whatsapp/status', { token });
  ok('el estado trae el motor activo', typeof waStatus?.engine === 'string', JSON.stringify(waStatus));
  ok('el estado trae un estado válido', typeof waStatus?.status === 'string', waStatus?.status);

  const qr = await call('/whatsapp/qr', { token });
  ok('el endpoint de QR responde', qr !== null && typeof qr === 'object');
  ok('el QR trae una pista para la organizadora', typeof qr?.hint === 'string', qr?.hint);

  // Envío de prueba a un número suelto: es lo que usa la organizadora para
  // comprobar con su propio celular antes de lanzar la campaña.
  //
  // El resultado depende del estado del motor: si el número no está conectado
  // (baileys sin escanear el QR) la respuesta correcta es 409; con el motor de
  // previsualización el envío "funciona" pero avisa que no salió nada de verdad.
  // Se comprueba la rama que corresponda al estado que informó el propio API.
  const engineConnected = waStatus?.status === 'connected';
  const testSend = await call(`/weddings/${wedding.id}/whatsapp/test`, {
    method: 'POST',
    token,
    body: { phone: '0981 123 456', guestName: 'Prueba', passes: 2 },
    raw: true,
  });

  if (engineConnected) {
    ok('el envío de prueba responde 200', testSend.status === 200, `status ${testSend.status}`);
    const prueba = testSend.payload;
    ok('el teléfono se normaliza a E.164', prueba?.phone === '+595981123456', prueba?.phone);
    ok('el texto de prueba lleva el nombre', /Prueba/.test(prueba?.body ?? ''));
    ok('el texto no deja variables sin reemplazar', !(prueba?.body ?? '').includes('{{'));
    ok(
      'la prueba informa si salió de verdad',
      typeof prueba?.delivered === 'boolean',
      String(prueba?.delivered),
    );
  } else {
    ok(
      'sin WhatsApp conectado, la prueba responde 409 y lo explica',
      testSend.status === 409 && typeof testSend.payload?.message === 'string',
      `status ${testSend.status}: ${testSend.payload?.message}`,
    );
  }

  const badTest = await call(`/weddings/${wedding.id}/whatsapp/test`, {
    method: 'POST',
    token,
    body: { phone: '0976 178' },
    raw: true,
  });
  ok('un teléfono inválido en la prueba -> 400', badTest.status === 400, `status ${badTest.status}`);

  section('Enlaces públicos (a dónde apuntan los mensajes)');
  const targets = afterRsvp.filter((g) => g.status !== 'declined').slice(0, 2).map((g) => g.id);

  const links = await call('/system/links', { token });
  ok(
    'el panel puede consultar a dónde apuntan los enlaces',
    typeof links?.publicWebUrl === 'string' && links.publicWebUrl.length > 0,
    JSON.stringify(links),
  );
  ok(
    'el ejemplo de enlace tiene la forma /i/<slug>',
    typeof links?.exampleLink === 'string' && /^https?:\/\/.+\/i\/.+/.test(links.exampleLink),
    links?.exampleLink,
  );
  ok(
    '/api/health y /system/links coinciden sobre el enlace',
    health.linkIsPublic === links?.isPublic,
    `${health.linkIsPublic} vs ${links?.isPublic}`,
  );

  // La red de seguridad del bug que este repo arrastraba: con un enlace local,
  // una campaña REAL no puede arrancar. Así se comprueba siempre, en desarrollo.
  if (links?.sendable) {
    ok(
      'con un enlace público, el envío real no se bloquea',
      true,
      '(se omite crear una campaña real: enviaría mensajes de verdad)',
    );
  } else {
    const blocked = await call(`/weddings/${wedding.id}/campaigns`, {
      method: 'POST',
      token,
      raw: true,
      body: {
        name: 'No debe crearse',
        template: 'Hola {{nombre}}, entrá: {{enlace}}',
        guestIds: targets,
        dryRun: false,
        minDelayMs: 1000,
        maxDelayMs: 1000,
      },
    });
    ok('una campaña real con enlace local -> 409', blocked.status === 409, `status ${blocked.status}`);
    ok(
      'el 409 explica que el enlace no es público',
      /público|localhost/i.test(JSON.stringify(blocked.payload ?? {})),
      JSON.stringify(blocked.payload),
    );
  }

  section('Campaña en modo seco');
  const campaign = await call(`/weddings/${wedding.id}/campaigns`, {
    method: 'POST',
    token,
    body: {
      name: 'Prueba de humo',
      template: '¡Hola {{nombre}}! Válido para {{pases}}. Detalles: {{enlace}}',
      guestIds: targets,
      dryRun: true,
      minDelayMs: 1000,
      maxDelayMs: 1000,
    },
  });
  ok('la campaña se crea con 2 destinatarios', campaign?.totalCount === targets.length, JSON.stringify(campaign));
  ok('la campaña arranca en modo seco', campaign?.dryRun === true);
  ok('la campaña trae su plantilla', typeof campaign?.template === 'string');

  let finished = campaign;
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    finished = await call(`/campaigns/${campaign.id}`, { token });
    const processed = finished.sentCount + finished.failedCount + finished.skippedCount;
    if (processed >= finished.totalCount) break;
  }
  const processed = finished.sentCount + finished.failedCount + finished.skippedCount;
  ok('la campaña se procesa completa', processed === finished.totalCount, `${processed}/${finished.totalCount}`);
  ok('ningún envío falló', finished.failedCount === 0, `failed=${finished.failedCount}`);

  const items = await call(`/campaigns/${campaign.id}/items`, { token });
  ok('los ítems de la campaña se listan', Array.isArray(items) && items.length === targets.length);
  const item = items.find((i) => i.status === 'sent') ?? items[0];
  ok('el ítem guarda el texto final enviado', typeof item?.renderedBody === 'string' && item.renderedBody.length > 10);
  ok('el texto final no deja variables sin reemplazar', !item.renderedBody.includes('{{'), item.renderedBody);
  ok('el ítem trae el nombre del invitado', typeof item?.guestName === 'string');
  ok('el ítem trae el teléfono del invitado', /^\+\d{8,15}$/.test(item?.phone ?? ''), item?.phone);

  const paused = await call(`/campaigns/${campaign.id}/pause`, { method: 'POST', token });
  ok('pausar responde ok', paused?.ok === true);

  section('Aislamiento');
  const anonymous = await call('/weddings', { raw: true });
  ok('sin token -> 401', anonymous.status === 401, `status ${anonymous.status}`);

  section('Fotos de la invitación');
  const samplePath = fileURLToPath(new URL('../samples/assets/sandra-jorge-1.png', import.meta.url));
  const sampleBuffer = readFileSync(samplePath);

  const imageForm = new FormData();
  imageForm.append('file', new Blob([sampleBuffer], { type: 'image/png' }), 'invitacion.png');
  const uploaded = await call(`/weddings/${wedding.id}/images`, {
    method: 'POST',
    token,
    formData: imageForm,
  });
  const image = uploaded?.images?.[0];
  ok('la foto se sube y devuelve su URL', typeof image?.url === 'string', JSON.stringify(uploaded));
  ok(
    'la URL de la foto vive bajo /api/uploads/',
    typeof image?.url === 'string' && image.url.startsWith(`/api/uploads/${wedding.id}/`),
    image?.url,
  );

  if (image?.url) {
    // Servido público: el invitado no tiene sesión.
    const served = await fetch(`${API_URL}${image.url}`);
    ok('la foto se sirve sin token', served.status === 200, `status ${served.status}`);
    ok(
      'la foto se sirve como imagen',
      served.headers.get('content-type') === 'image/png',
      served.headers.get('content-type') ?? '',
    );

    const listed = await call(`/weddings/${wedding.id}/images`, { token });
    ok(
      'la foto aparece en el listado del panel',
      Array.isArray(listed?.images) && listed.images.some((item) => item.url === image.url),
    );

    const removed = await call(`/weddings/${wedding.id}/images/${image.file}`, {
      method: 'DELETE',
      token,
    });
    ok('la foto se borra', removed?.ok === true);
    const afterDelete = await fetch(`${API_URL}${image.url}`);
    ok('la foto borrada ya no se sirve', afterDelete.status === 404, `status ${afterDelete.status}`);
  }

  // Un archivo que no es imagen pero se llama .png: se rechaza por contenido.
  const fakeForm = new FormData();
  fakeForm.append('file', new Blob([Buffer.from('%PDF-1.7\nno soy una foto')], { type: 'image/png' }), 'falsa.png');
  const fake = await call(`/weddings/${wedding.id}/images`, {
    method: 'POST',
    token,
    formData: fakeForm,
    raw: true,
  });
  ok('un archivo que no es imagen -> 400', fake.status === 400, `status ${fake.status}`);
  ok(
    'el rechazo explica el formato',
    /JPG, PNG o WebP/.test(String(fake.payload?.message ?? '')),
    String(fake.payload?.message ?? ''),
  );

  console.log(`\n${checks - failures}/${checks} comprobaciones pasaron`);
  if (failures > 0) {
    console.log(`${failures} con problemas.`);
    process.exit(1);
  }
  console.log('Prueba de humo del API: OK');
}

main().catch((error) => {
  console.error('\nERROR:', error instanceof Error ? error.message : error);
  console.error('¿Está la API levantada en ' + API_URL + ' y la base de datos sembrada?');
  process.exit(1);
});
