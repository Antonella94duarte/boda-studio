import { describe, expect, it } from 'vitest';
import { decodeText, detectDelimiter, parseDelimited } from './csv.js';

describe('parseDelimited', () => {
  it('separa por comas', () => {
    expect(parseDelimited('nombre,telefono\nAna,0976178000')).toEqual([
      ['nombre', 'telefono'],
      ['Ana', '0976178000'],
    ]);
  });

  it('separa por punto y coma (formato Excel en español)', () => {
    expect(parseDelimited('Nombre;Celular\nAna Gómez;0976 178000')).toEqual([
      ['Nombre', 'Celular'],
      ['Ana Gómez', '0976 178000'],
    ]);
  });

  it('separa por tabulación y por barra', () => {
    expect(parseDelimited('nombre\ttelefono\nAna\t0976178000')).toEqual([
      ['nombre', 'telefono'],
      ['Ana', '0976178000'],
    ]);
    expect(parseDelimited('nombre|telefono\nAna|0976178000')).toEqual([
      ['nombre', 'telefono'],
      ['Ana', '0976178000'],
    ]);
  });

  it('detecta el separador correcto', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(detectDelimiter('a,b,c')).toBe(',');
  });

  it('respeta comillas con separadores dentro', () => {
    expect(parseDelimited('nombre,nota\n"Pérez, Ana","Mesa 1; ventana"')).toEqual([
      ['nombre', 'nota'],
      ['Pérez, Ana', 'Mesa 1; ventana'],
    ]);
  });

  it('interpreta "" como una comilla literal', () => {
    expect(parseDelimited('nombre\n"Ana ""la jefa"" Gómez"')).toEqual([
      ['nombre'],
      ['Ana "la jefa" Gómez'],
    ]);
  });

  it('mantiene los saltos de línea dentro de comillas', () => {
    expect(parseDelimited('nombre,nota\nAna,"linea 1\nlinea 2"')).toEqual([
      ['nombre', 'nota'],
      ['Ana', 'linea 1\nlinea 2'],
    ]);
  });

  it('ignora el BOM inicial', () => {
    expect(parseDelimited('\uFEFFnombre,telefono\nAna,123')).toEqual([
      ['nombre', 'telefono'],
      ['Ana', '123'],
    ]);
  });

  it('ignora las líneas totalmente vacías', () => {
    expect(parseDelimited('nombre,telefono\n\nAna,123\n\n\nJorge,456\n')).toEqual([
      ['nombre', 'telefono'],
      ['Ana', '123'],
      ['Jorge', '456'],
    ]);
    expect(parseDelimited('a;b\n;\n1;2', ';')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('recorta espacios y tolera archivos sin salto final', () => {
    expect(parseDelimited(' nombre , telefono \n Ana , 123 ')).toEqual([
      ['nombre', 'telefono'],
      ['Ana', '123'],
    ]);
  });

  it('devuelve una sola columna cuando no hay separadores', () => {
    expect(parseDelimited('Ana\nJorge')).toEqual([['Ana'], ['Jorge']]);
  });
});

describe('decodeText', () => {
  it('lee UTF-8 correctamente', () => {
    expect(decodeText(Buffer.from('Ramón Núñez', 'utf8'))).toBe('Ramón Núñez');
  });

  it('cae a latin-1 cuando el archivo no es UTF-8 válido', () => {
    const latin1 = Buffer.from('Ramón;Núñez', 'latin1');
    expect(decodeText(latin1)).toBe('Ramón;Núñez');
  });
});
