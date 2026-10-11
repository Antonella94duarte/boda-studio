# Datos de ejemplo

Todo lo de esta carpeta es material de prueba **real**, no inventado de relleno: la
configuración de la boda de Sandra & Jorge se extrajo de la tarjeta PDF
(`Tarjeta Boda Religiosa+Civil+Brindis.pdf`), incluidas la Iglesia Cristo Rey, Casa Ardissone,
el versículo de Colosenses y los datos de la mesa de regalos.

| Archivo | Qué es | Para qué sirve |
|---|---|---|
| `boda-sandra-jorge.json` | Configuración completa de una boda (3 eventos, dress code, regalos, tema, secciones) | Lo usa el `seed` de la API para crear la boda demo |
| `boda-vanessayhector.json` | Segunda boda, con otra paleta y secciones desactivadas | Probar el modelo multi-boda y los temas |
| `invitados.csv` | 18 invitados separados por comas | Probar la importación CSV (incluye acentos, comas dentro de comillas y **dos filas con error a propósito**) |
| `invitados.txt` | 8 invitados separados por tabulaciones, con otros encabezados (`Invitado`, `WhatsApp`, `Cupos`, `Mesa`) | Probar la importación TXT/TSV y la detección de alias |
| `invitados.xlsx` | La misma lista del CSV en Excel, con teléfonos como **texto** | Probar la importación XLSX (es el formato que más usan las organizadoras) |
| `assets/` | Ilustraciones en acuarela extraídas del PDF | Portada y galería de la boda demo |

## Qué debe pasar al importar `invitados.csv`

| Resultado | Cantidad | Cuáles |
|---|---|---|
| Filas válidas | 15 | El resto de la lista |
| Con aviso (se importan) | 1 | `Ana Gómez` repetida: el segundo registro se detecta como duplicado |
| Con error (no se importan) | 2 | `Jorge Insfrán` (teléfono incompleto: `0976 178`) y `Sin teléfono` (vacío) |

Teléfonos en formatos distintos a propósito, todos deben quedar en E.164:

| En el archivo | Se guarda como |
|---|---|
| `0981 123 456` | `+595981123456` |
| `+595 985 222 333` | `+595985222333` |
| `595991444555` | `+595991444555` |
| `0982-456-789` | `+595982456789` |

## Qué debe pasar al importar `invitados.txt`

Los 8 invitados se importan sin tocar nada: el sistema reconoce `Invitado` → nombre,
`WhatsApp` → teléfono, `Cupos` → pases y `Mesa` → grupo.

## Cómo regenerar el Excel

```bash
python samples/_build_xlsx.py
```

Los teléfonos se escriben con formato de texto (`@`) a propósito: si Excel los trata como
número, pierde el cero inicial de `0981 123 456` y la importación rechaza la fila.
