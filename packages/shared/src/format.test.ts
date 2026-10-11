import { describe, expect, it } from 'vitest';
import { capitalize, countdownTo, formatDateLong, formatPasses, formatTime } from './format.js';

describe('formatDateLong / formatTime', () => {
  it('escribe la fecha en español rioplatense', () => {
    // El PDF original dice literalmente "Viernes 30 de Octubre de 2026".
    expect(formatDateLong('2026-10-30T16:30:00-03:00')).toBe('viernes 30 de octubre de 2026');
    expect(formatDateLong('2026-07-11T19:00:00-04:00')).toBe('sábado 11 de julio de 2026');
  });

  it('respeta la zona horaria del evento, no la del servidor', () => {
    // 30/10/2026 23:30 en Asunción sigue siendo el día 30, aunque en UTC sea el 31.
    expect(formatDateLong('2026-10-30T23:30:00-03:00')).toBe('viernes 30 de octubre de 2026');
    expect(formatTime('2026-10-30T19:00:00-03:00')).toBe('19:00');
  });

  it('devuelve la entrada si la fecha es inválida', () => {
    expect(formatDateLong('no es una fecha')).toBe('no es una fecha');
    expect(formatTime('no es una fecha')).toBe('');
  });
});

describe('formatPasses', () => {
  it('singulariza un solo pase', () => {
    expect(formatPasses(1)).toBe('1 persona');
    expect(formatPasses(2)).toBe('2 personas');
    expect(formatPasses(0)).toBe('0 personas');
  });
});

describe('countdownTo', () => {
  const now = new Date('2026-10-30T16:29:50-03:00');

  it('calcula días, horas, minutos y segundos restantes', () => {
    const c = countdownTo('2026-11-02T16:30:00-03:00', now);
    expect(c.finished).toBe(false);
    expect(c.days).toBe(3);
    expect(c.hours).toBe(0);
    expect(c.minutes).toBe(0);
    expect(c.seconds).toBe(10);
  });

  it('marca terminado cuando la fecha ya pasó', () => {
    expect(countdownTo('2026-10-30T16:29:49-03:00', now).finished).toBe(true);
    expect(countdownTo('2026-10-30T16:29:50-03:00', now).finished).toBe(true);
  });

  it('no explota con una fecha inválida', () => {
    expect(countdownTo('cualquier cosa', now).finished).toBe(true);
  });
});

describe('capitalize', () => {
  it('pone la inicial en mayúscula', () => {
    expect(capitalize('viernes 30 de octubre')).toBe('Viernes 30 de octubre');
    expect(capitalize('')).toBe('');
  });
});
