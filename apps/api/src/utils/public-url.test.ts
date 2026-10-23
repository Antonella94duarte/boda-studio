import { describe, expect, it } from 'vitest';
import { classifyPublicUrl } from './public-url.js';

/**
 * El caso que motiva este módulo: con `PUBLIC_WEB_URL=http://localhost:5173`
 * una campaña real enviaba 200 mensajes con un enlace que nadie podía abrir.
 * Estas pruebas fijan la frontera entre "público" y "solo en mi red".
 */

describe('classifyPublicUrl: direcciones locales (no sirven para invitados)', () => {
  it('detecta localhost con puerto', () => {
    const check = classifyPublicUrl('http://localhost:5173');
    expect(check.isPublic).toBe(false);
    expect(check.problem).toBe('loopback');
    expect(check.host).toBe('localhost');
    expect(check.warnings.length).toBeGreaterThan(0); // http:// sin TLS
  });

  it('detecta 127.0.0.1 y 127.x', () => {
    expect(classifyPublicUrl('http://127.0.0.1:4000').problem).toBe('loopback');
    expect(classifyPublicUrl('http://127.1.2.3').problem).toBe('loopback');
  });

  it('detecta IPv6 de loopback', () => {
    expect(classifyPublicUrl('http://[::1]:5173').problem).toBe('loopback');
  });

  it('detecta rangos privados de IPv4', () => {
    expect(classifyPublicUrl('http://192.168.0.10:5173').problem).toBe('private-ip');
    expect(classifyPublicUrl('http://10.0.0.5').problem).toBe('private-ip');
    expect(classifyPublicUrl('http://172.16.4.4').problem).toBe('private-ip');
    expect(classifyPublicUrl('http://172.31.255.254').problem).toBe('private-ip');
    // 172.32 ya es público: el rango privado termina en 172.31
    expect(classifyPublicUrl('http://172.32.0.1').problem).toBeNull();
  });

  it('detecta enlace local y CGNAT', () => {
    expect(classifyPublicUrl('http://169.254.10.20').problem).toBe('link-local');
    expect(classifyPublicUrl('http://100.100.1.1').problem).toBe('private-ip');
  });

  it('detecta nombres de red interna', () => {
    expect(classifyPublicUrl('http://mi-pc.local:5173').problem).toBe('local-hostname');
    expect(classifyPublicUrl('http://boda.lan').problem).toBe('local-hostname');
    expect(classifyPublicUrl('http://servidor.internal').problem).toBe('local-hostname');
    // Un nombre sin punto solo resuelve en la red local.
    expect(classifyPublicUrl('http://miboda').problem).toBe('local-hostname');
  });

  it('detecta dominios reservados para documentación y pruebas', () => {
    expect(classifyPublicUrl('https://invitacion.test').problem).toBe('reserved-domain');
    expect(classifyPublicUrl('https://ejemplo.example.com').problem).toBe('reserved-domain');
    expect(classifyPublicUrl('https://example.org').problem).toBe('reserved-domain');
    expect(classifyPublicUrl('https://192.0.2.10').problem).toBe('reserved-ip');
  });

  it('normaliza la barra final y los espacios', () => {
    expect(classifyPublicUrl('  https://bodas.midominio.com/  ').url).toBe(
      'https://bodas.midominio.com',
    );
  });
});

describe('classifyPublicUrl: direcciones públicas (sirven para invitados)', () => {
  it('acepta un dominio con https', () => {
    const check = classifyPublicUrl('https://bodas.midominio.com');
    expect(check.isPublic).toBe(true);
    expect(check.problem).toBeNull();
    expect(check.protocol).toBe('https:');
    expect(check.warnings).toEqual([]);
  });

  it('acepta subdominios gratuitos', () => {
    expect(classifyPublicUrl('https://boda-studio.duckdns.org').isPublic).toBe(true);
    expect(classifyPublicUrl('https://boda.pages.dev').isPublic).toBe(true);
    expect(classifyPublicUrl('https://boda.vercel.app').isPublic).toBe(true);
  });

  it('acepta una IP pública, pero advierte que use un dominio', () => {
    const check = classifyPublicUrl('https://8.8.8.8');
    expect(check.isPublic).toBe(true);
    expect(check.warnings.join(' ')).toContain('IP en vez de un dominio');
  });

  it('acepta http pero avisa del cifrado', () => {
    const check = classifyPublicUrl('http://bodas.midominio.com');
    expect(check.isPublic).toBe(true);
    expect(check.warnings.join(' ')).toContain('http:// sin cifrado');
  });

  it('advierte de los túneles temporales', () => {
    const check = classifyPublicUrl('https://algo-random.trycloudflare.com');
    expect(check.isPublic).toBe(true);
    expect(check.warnings.join(' ')).toContain('túnel temporal');
  });
});

describe('classifyPublicUrl: valores inválidos', () => {
  it('rechaza vacío y basura', () => {
    expect(classifyPublicUrl('').problem).toBe('invalid');
    expect(classifyPublicUrl('   ').problem).toBe('invalid');
    expect(classifyPublicUrl('no-es-una-url').problem).toBe('invalid');
    expect(classifyPublicUrl('bodas.midominio.com').problem).toBe('invalid');
  });

  it('rechaza protocolos que no abre un navegador', () => {
    expect(classifyPublicUrl('ftp://bodas.midominio.com').problem).toBe('protocol');
    expect(classifyPublicUrl('javascript:alert(1)').problem).toBe('protocol');
  });
});
