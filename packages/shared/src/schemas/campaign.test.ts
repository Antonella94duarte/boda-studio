import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPLATE, renderTemplate, usedVariables } from './campaign.js';

const context = {
  nombre: 'Ana Gómez',
  pases: '2 personas',
  enlace: 'https://bodas.example/i/sandraujorge/8f3c9a1d2b4e6f70',
  novios: 'Sandra y Jorge',
  fecha: 'viernes 30 de octubre de 2026',
  lugar: 'Iglesia Cristo Rey, Asunción',
  rsvp: 'https://bodas.example/i/sandraujorge/8f3c9a1d2b4e6f70#rsvp',
};

describe('renderTemplate', () => {
  it('reemplaza todas las variables conocidas', () => {
    const { body, missing } = renderTemplate(DEFAULT_TEMPLATE, context);
    expect(missing).toEqual([]);
    expect(body).toContain('¡Hola Ana Gómez!');
    expect(body).toContain('✅ Válido para 2 personas');
    expect(body).toContain('https://bodas.example/i/sandraujorge/8f3c9a1d2b4e6f70');
    expect(body).toContain('Con cariño, Sandra y Jorge.');
    expect(body).not.toContain('{{');
  });

  it('tolera espacios dentro de las llaves', () => {
    const { body } = renderTemplate('Hola {{ nombre }}', context);
    expect(body).toBe('Hola Ana Gómez');
  });

  it('reporta las variables sin valor en vez de dejar el texto roto', () => {
    const { body, missing } = renderTemplate('Hola {{nombre}}, faltan {{pases}} y {{lugar}}', {
      nombre: 'Ana',
    });
    expect(missing.sort()).toEqual(['lugar', 'pases']);
    expect(body).toBe('Hola Ana, faltan {{pases}} y {{lugar}}');
  });

  it('deja intacto el texto que no es una variable', () => {
    const { body } = renderTemplate('Llaves sueltas { } y {{desconocida}}', context);
    expect(body).toContain('Llaves sueltas { }');
    expect(body).toContain('{{desconocida}}');
  });
});

describe('usedVariables', () => {
  it('lista las variables usadas sin repetir', () => {
    expect(usedVariables('{{nombre}} y {{nombre}} y {{pases}}').sort()).toEqual([
      'nombre',
      'pases',
    ]);
  });

  it('la plantilla por defecto solo usa variables soportadas', () => {
    const soportadas = Object.keys(context);
    for (const variable of usedVariables(DEFAULT_TEMPLATE)) {
      expect(soportadas).toContain(variable);
    }
  });
});
