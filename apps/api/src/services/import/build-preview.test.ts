import { describe, expect, it } from 'vitest';
import { buildMapping, buildPreview, resolveImportOptions } from './build-preview.js';

/**
 * Estas pruebas corren sin base de datos: `buildPreview` es una función pura.
 */

const HEADERS = ['Nombre completo', 'Celular', 'WhatsApp', 'Pases', 'Grupo'];

function row(
  fullName: string,
  celular: string,
  whatsapp = '',
  passes = '',
  group = '',
): Record<string, string> {
  return {
    'Nombre completo': fullName,
    Celular: celular,
    WhatsApp: whatsapp,
    Pases: passes,
    Grupo: group,
  };
}

describe('buildMapping', () => {
  it('reconoce alias en español, con acentos, Celular y WhatsApp', () => {
    const mapping = buildMapping(['Nombre completo', 'Teléfono', 'Celular', 'WhatsApp', 'Nro', 'Pases', 'Grupo']);
    expect(mapping['Nombre completo']).toBe('fullName');
    expect(mapping['Teléfono']).toBe('phone');
    expect(mapping['Celular']).toBe('phone');
    expect(mapping['WhatsApp']).toBe('phone');
    expect(mapping['Nro']).toBe('phone');
    expect(mapping['Pases']).toBe('passes');
    expect(mapping['Grupo']).toBe('groupName');
  });

  it('deja en "ignore" las columnas que no reconoce', () => {
    const mapping = buildMapping(['Nombre', 'Código interno', 'Fecha de carga']);
    expect(mapping['Nombre']).toBe('fullName');
    expect(mapping['Código interno']).toBe('ignore');
    expect(mapping['Fecha de carga']).toBe('ignore');
  });

  it('respeta el mapeo manual por encima de la detección automática', () => {
    const mapping = buildMapping(['Nombre', 'Dato raro'], {
      columnMapping: { 'Dato raro': 'phone' },
    });
    expect(mapping['Dato raro']).toBe('phone');
  });
});

describe('buildPreview', () => {
  const options = resolveImportOptions({ groupByFamily: true });

  it('normaliza teléfonos paraguayos en sus dos formatos habituales', () => {
    const preview = buildPreview({
      headers: HEADERS,
      rows: [
        row('Ana Gómez', '0976 178000', '', '2', 'Familia Gómez'),
        row('Jorge Benítez', '+595 976 178 001', '', '3', 'Familia Benítez'),
      ],
      options,
    });

    expect(preview.rows[0]?.phone).toBe('+595976178000');
    expect(preview.rows[1]?.phone).toBe('+595976178001');
    expect(preview.rows[0]?.rawPhone).toBe('0976 178000');
    expect(preview.rows[0]?.level).toBe('ok');
    expect(preview.rows[0]?.passes).toBe(2);
    expect(preview.rows[1]?.passes).toBe(3);
    expect(preview.validRows).toBe(2);
    expect(preview.errorRows).toBe(0);
    expect(preview.rows[0]?.issues).toEqual([]);
  });

  it('usa la columna WhatsApp cuando Celular está vacío', () => {
    const preview = buildPreview({
      headers: HEADERS,
      rows: [row('Marta Ruiz', '', '0981 123 456')],
      options,
    });

    expect(preview.rows[0]?.phone).toBe('+595981123456');
    expect(preview.rows[0]?.level).toBe('ok');
  });

  it('marca error cuando el teléfono no es válido', () => {
    const preview = buildPreview({
      headers: HEADERS,
      rows: [row('Luis Franco', '123'), row('Sofía Ayala', '')],
      options,
    });

    expect(preview.rows[0]?.level).toBe('error');
    expect(preview.rows[0]?.phone).toBeUndefined();
    expect(preview.rows[0]?.issues.join(' ')).toContain('Teléfono inválido');
    expect(preview.rows[1]?.level).toBe('error');
    expect(preview.rows[1]?.issues).toContain('Falta el teléfono');
    expect(preview.errorRows).toBe(2);
  });

  it('marca error cuando falta el nombre', () => {
    const preview = buildPreview({
      headers: HEADERS,
      rows: [row('', '0976 178000')],
      options,
    });

    expect(preview.rows[0]?.level).toBe('error');
    expect(preview.rows[0]?.issues).toContain('Falta el nombre del invitado');
    expect(preview.rows[0]?.phone).toBe('+595976178000');
  });

  it('avisa (sin descartar) cuando el teléfono se repite en el archivo', () => {
    const preview = buildPreview({
      headers: HEADERS,
      rows: [
        row('Ana Gómez', '0976 178000'),
        row('Ana Gómez (repetida)', '+595 976 178 000'),
      ],
      options,
    });

    expect(preview.rows[0]?.level).toBe('ok');
    expect(preview.rows[1]?.level).toBe('warning');
    expect(preview.rows[1]?.issues.join(' ')).toContain('repetido');
    expect(preview.warningRows).toBe(1);
    expect(preview.validRows).toBe(1);
  });

  it('avisa cuando los pases no se entienden y aplica el valor por defecto', () => {
    const preview = buildPreview({
      headers: HEADERS,
      rows: [row('Ana Gómez', '0976 178000', '', 'dos')],
      options: resolveImportOptions({ defaultPasses: 4 }),
    });

    expect(preview.rows[0]?.level).toBe('warning');
    expect(preview.rows[0]?.passes).toBe(4);
  });

  it('cuenta los grupos distintos cuando groupByFamily está activo', () => {
    const preview = buildPreview({
      headers: HEADERS,
      rows: [
        row('Ana Gómez', '0976 178000', '', '2', 'Familia Gómez'),
        row('Jorge Benítez', '0976 178001', '', '2', 'Familia Benítez'),
        row('Luis Franco', '123', '', '2', 'Familia Gómez'),
        row('Marta López', '0976 178002', '', '2', 'Familia López'),
      ],
      options,
    });

    // Tres grupos reales: la fila con error no cuenta.
    expect(preview.groupCount).toBe(3);
    expect(preview.totalRows).toBe(4);
    expect(preview.validRows).toBe(3);
    expect(preview.errorRows).toBe(1);
  });

  it('no cuenta grupos si groupByFamily está desactivado', () => {
    const preview = buildPreview({
      headers: HEADERS,
      rows: [row('Ana Gómez', '0976 178000', '', '2', 'Familia Gómez')],
      options: resolveImportOptions({ groupByFamily: false }),
    });

    expect(preview.groupCount).toBe(0);
  });

  it('ignora filas completamente vacías y no las cuenta', () => {
    const preview = buildPreview({
      headers: HEADERS,
      rows: [row('', '', '', '', ''), row('Ana Gómez', '0976 178000')],
      options,
    });

    expect(preview.totalRows).toBe(1);
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]?.row).toBe(2);
  });

  it('devuelve el mapeo detectado junto con los encabezados', () => {
    const preview = buildPreview({
      headers: HEADERS,
      rows: [row('Ana Gómez', '0976 178000')],
      options,
    });

    expect(preview.headers).toEqual(HEADERS);
    expect(preview.mapping['Celular']).toBe('phone');
    expect(preview.mapping['Nombre completo']).toBe('fullName');
  });

  it('aplica las opciones por defecto del contrato compartido', () => {
    const defaults = resolveImportOptions();
    expect(defaults.defaultCountry).toBe('PY');
    expect(defaults.defaultPasses).toBe(2);
    expect(defaults.onDuplicate).toBe('skip');
    expect(defaults.groupByFamily).toBe(false);
  });
});
