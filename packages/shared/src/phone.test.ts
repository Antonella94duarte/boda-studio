import { describe, expect, it } from 'vitest';
import { COUNTRIES, formatPhone, normalizePhone, toWaMeNumber, waMeLink } from './phone.js';

const ok = (input: string, iso = 'PY') => {
  const result = normalizePhone(input, { defaultCountry: iso });
  if (!result.ok) throw new Error(`Se esperaba válido: "${input}" -> ${result.reason}`);
  return result.e164;
};

describe('normalizePhone', () => {
  it('normaliza el formato local paraguayo quitando el cero inicial', () => {
    expect(ok('0976 178000')).toBe('+595976178000');
    expect(ok('976 178000')).toBe('+595976178000');
    expect(ok('0981 123 456')).toBe('+595981123456');
  });

  it('acepta el número ya internacionalizado', () => {
    expect(ok('+595 976 178 000')).toBe('+595976178000');
    expect(ok('595976178000')).toBe('+595976178000');
    expect(ok('00595 976 178000')).toBe('+595976178000');
  });

  it('tolera separadores y texto pegado al número', () => {
    expect(ok('0982-456-789')).toBe('+595982456789');
    expect(ok('0976 178000 (Sandra)')).toBe('+595976178000');
    expect(ok(' 0976/178-000 ')).toBe('+595976178000');
  });

  it('aplica el país por defecto de cada boda', () => {
    // Los mismos dígitos significan cosas distintas según el país de la lista.
    expect(ok('0981 123 456', 'PY')).toBe('+595981123456');
    expect(ok('011 4123 4567', 'AR')).toBe('+541141234567');
    expect(ok('612 345 678', 'ES')).toBe('+34612345678');
    expect(ok('1 555 123 4567', 'US')).toBe('+15551234567');
  });

  it('rechaza números incompletos o imposibles', () => {
    const short = normalizePhone('0976 178', { defaultCountry: 'PY' });
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.reason).toContain('Longitud inválida');

    expect(normalizePhone('', { defaultCountry: 'PY' }).ok).toBe(false);
    expect(normalizePhone('sin telefono', { defaultCountry: 'PY' }).ok).toBe(false);
    expect(normalizePhone('+999 123456789', { defaultCountry: 'PY' }).ok).toBe(false);
  });

  it('devuelve el país detectado', () => {
    const result = normalizePhone('+54 11 4123 4567', { defaultCountry: 'PY' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.country.iso).toBe('AR');
      expect(result.national).toBe('1141234567');
    }
  });

  it('reconoce todos los países declarados sin ambigüedad de prefijo', () => {
    const dials = COUNTRIES.map((c) => c.dial);
    expect(new Set(dials).size).toBe(dials.length);
  });
});

describe('enlaces y formato', () => {
  it('wa.me usa solo dígitos', () => {
    expect(toWaMeNumber('+595976178000')).toBe('595976178000');
    expect(waMeLink('+595976178000')).toBe('https://wa.me/595976178000');
  });

  it('precarga el mensaje codificado', () => {
    const link = waMeLink('+595976178000', '¡Hola Ana!');
    expect(link).toContain('https://wa.me/595976178000?text=');
    expect(decodeURIComponent(link.split('?text=')[1] ?? '')).toBe('¡Hola Ana!');
  });

  it('da una presentación legible', () => {
    expect(formatPhone('+595976178000')).toBe('+595 976 178 000');
  });
});
