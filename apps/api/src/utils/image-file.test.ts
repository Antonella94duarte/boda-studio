import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_BYTES,
  detectImage,
  formatBytes,
  imageRejectionMessage,
  isSafeSegment,
  isStoredImageName,
  mimeForStoredName,
} from './image-file.js';

/**
 * La subida de fotos es la única parte del API donde el archivo lo elige el
 * usuario: estas pruebas fijan qué se acepta y qué se rechaza, sin mirar la
 * extensión ni el `Content-Type` que manda el navegador.
 */

/** Cabeceras reales de cada formato, con relleno para pasar el mínimo de 12 bytes. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.from([0x56, 0x50, 0x38, 0x20]),
]);

describe('detectImage: reconoce por bytes, no por extensión', () => {
  it('reconoce JPEG', () => {
    expect(detectImage(JPEG)).toEqual({ kind: 'jpeg', extension: 'jpg', mime: 'image/jpeg' });
  });

  it('reconoce PNG', () => {
    expect(detectImage(PNG)).toEqual({ kind: 'png', extension: 'png', mime: 'image/png' });
  });

  it('reconoce WebP', () => {
    expect(detectImage(WEBP)).toEqual({ kind: 'webp', extension: 'webp', mime: 'image/webp' });
  });

  it('rechaza un PDF con extensión .jpg', () => {
    expect(detectImage(Buffer.from('%PDF-1.7\n%âãÏÓ\n'))).toBeNull();
  });

  it('rechaza un SVG (puede llevar scripts)', () => {
    expect(detectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });

  it('rechaza un archivo vacío o diminuto', () => {
    expect(detectImage(Buffer.alloc(0))).toBeNull();
    expect(detectImage(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  it('rechaza un GIF', () => {
    expect(detectImage(Buffer.from('GIF89a..................', 'ascii'))).toBeNull();
  });
});

describe('imageRejectionMessage', () => {
  it('no dice nada cuando la imagen es válida', () => {
    expect(imageRejectionMessage(JPEG.length, detectImage(JPEG))).toBeNull();
  });

  it('explica el peso máximo', () => {
    const message = imageRejectionMessage(MAX_IMAGE_BYTES + 1, detectImage(JPEG));
    expect(message).toContain('máximo');
    expect(message).toContain('8.0 MB');
  });

  it('explica el formato cuando no se reconoce', () => {
    const message = imageRejectionMessage(100, null);
    expect(message).toContain('JPG, PNG o WebP');
    expect(message).toContain('HEIC');
  });

  it('avisa del archivo vacío', () => {
    expect(imageRejectionMessage(0, null)).toContain('vacío');
  });
});

describe('isStoredImageName: nombres que genera el sistema', () => {
  it('acepta los nombres que genera el servidor', () => {
    expect(isStoredImageName('m1k2j3-a1b2c3d4.jpg')).toBe(true);
    expect(isStoredImageName('m1k2j3-a1b2c3d4.webp')).toBe(true);
  });

  it('rechaza intentos de salir de la carpeta', () => {
    expect(isStoredImageName('../../../etc/passwd')).toBe(false);
    expect(isStoredImageName('..%2F..%2Fapp.jpg')).toBe(false);
    expect(isStoredImageName('foto.png')).toBe(false);
    expect(isStoredImageName('m1k2j3-a1b2c3d4.gif')).toBe(false);
  });

  it('rechaza nombres demasiado largos o vacíos', () => {
    expect(isStoredImageName('')).toBe(false);
    expect(isStoredImageName(`${'a'.repeat(90)}-ff.jpg`)).toBe(false);
  });
});

describe('isSafeSegment: ids de boda usados como carpeta', () => {
  it('acepta un cuid', () => {
    expect(isSafeSegment('cmvlif1em00027ox5u1mp5s7f')).toBe(true);
  });

  it('rechaza barras, puntos y vacíos', () => {
    expect(isSafeSegment('../etc')).toBe(false);
    expect(isSafeSegment('a/b')).toBe(false);
    expect(isSafeSegment('')).toBe(false);
  });
});

describe('mimeForStoredName', () => {
  it('devuelve el tipo correcto para servir', () => {
    expect(mimeForStoredName('x-y.jpg')).toBe('image/jpeg');
    expect(mimeForStoredName('x-y.png')).toBe('image/png');
    expect(mimeForStoredName('x-y.webp')).toBe('image/webp');
    expect(mimeForStoredName('x-y.exe')).toBe('application/octet-stream');
  });
});

describe('formatBytes', () => {
  it('muestra unidades legibles', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
