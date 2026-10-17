# Compras

Lista de compras personal para iPhone. Es una PWA: HTML, CSS y JavaScript sin
dependencias ni paso de compilación. Los datos se guardan en el propio iPhone
(IndexedDB, con una copia en localStorage), sin cuenta ni servidor.

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Estructura de la pantalla |
| `styles.css` | Diseño (tema oscuro, acentos amarillos, áreas seguras) |
| `app.js` | Interfaz y lógica: lista, habituales, editor, deshacer, arrastrar |
| `store.js` | Guardado local, categorías y datos iniciales |
| `sw.js` | Service worker: hace que la app funcione sin conexión |
| `manifest.webmanifest` | Nombre, icono y modo de pantalla completa |
| `icons/` | Iconos (`tools/make_icons.py` los regenera) |

## Probarla en el Mac

```bash
python3 -m http.server 8000
```

Abre http://localhost:8000 y usa la vista de iPhone del navegador.

## Probarla en el iPhone (misma red Wi‑Fi, sin modo sin conexión)

1. En el Mac, dentro de esta carpeta: `python3 -m http.server 8000`
2. Busca la IP del Mac: `ipconfig getifaddr en0` (p. ej. `192.168.178.65`)
3. En Safari del iPhone abre `http://192.168.178.65:8000`

Funciona todo, pero iOS solo activa el modo sin conexión con **HTTPS**, así que
esta forma sirve para probar y no para el uso diario.

## Instalarla de verdad (HTTPS, funciona sin conexión)

Publica la carpeta en cualquier alojamiento estático gratuito con HTTPS. Solo
el alojamiento necesita cuenta; la app no.

- **GitHub Pages:** crea un repositorio, sube estos archivos y activa
  *Settings → Pages → Deploy from branch*.
- **Netlify:** arrastra la carpeta a https://app.netlify.com/drop.
- **Cloudflare Pages:** *Workers & Pages → Create → Upload assets*.

Después, en el iPhone:

1. Abre la dirección en **Safari**.
2. Toca **Compartir** → **Añadir a pantalla de inicio** → **Añadir**.
3. Abre «Compras» desde su icono. Úsala una vez con conexión; desde entonces
   abre sin Internet.

> **Importante:** la app instalada en la pantalla de inicio tiene su propio
> almacenamiento, distinto del de la pestaña de Safari. Lo que añadas en Safari
> antes de instalarla no aparecerá en la app instalada.

## Actualizar la app

Si cambias algún archivo, sube el número de `VERSION` en `sw.js`
(p. ej. `compras-v2`) y vuelve a publicar. La app se actualiza sola al
abrirla con conexión; el cambio se ve la siguiente vez que la abras.

## Uso rápido

- **Círculo:** marca o desmarca. Lo comprado baja a «Comprado».
- **Nombre:** abre la ficha para cambiar nombre, cantidad, nota y categoría,
  marcarlo como habitual o tarea, o eliminarlo. La nota aparece en gris
  debajo del nombre.
- **Deslizar a la izquierda:** elimina el producto (con «Deshacer»). Un
  deslizamiento corto vuelve a su sitio sin borrar nada.
- **≡** (a la derecha): mantén pulsado y arrastra para cambiar el orden.
- **Campo inferior:** escribe y pulsa intro. Admite cantidad entre
  paréntesis — `Arroz (2 paquetes)` — o `Huevos x12`. Mientras escribes
  aparecen sugerencias de tus habituales.
- **★:** habituales. Un toque lo añade a la lista; otro toque lo quita.
- **···:** agrupar por categoría, deshacer, nueva compra con lo mismo,
  limpiar comprados y vaciar la lista. Las acciones importantes piden
  confirmación y todas se pueden deshacer.
