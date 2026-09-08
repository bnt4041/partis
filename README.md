# Partis

Composición musical asistida por IA (DeepSeek), con renderizado de partitura en el navegador.

## Arquitectura

- **backend/** — FastAPI. Pide a DeepSeek una pieza en notación ABC, la valida/convierte con `music21` a MusicXML + MIDI, con hasta 2 reintentos de auto-corrección si el ABC generado no es válido.
- **frontend/** — HTML/JS estático servido por nginx (que también hace de proxy a `/api`). Renderiza y edita la partitura con [abcjs](https://www.abcjs.net/), incluyendo reproducción de audio con su synth integrado.
- **auth/** — FastAPI, arquitectura hexagonal (dominio/aplicación/adaptadores). Registro y login multi-tenant (cada organización es un `tenant` con sus propios usuarios) emitiendo JWT propios. Preparado para sustituir el emisor/verificador de tokens por Keycloak más adelante sin tocar el dominio ni las rutas HTTP - ver `auth/app/domain/ports.py`.
- **db/** — Postgres, un único volumen con nombre (`db_data`) que persiste entre reinicios/recreaciones de los contenedores (`docker compose down && docker compose up` incluido - solo se pierde si se borra el volumen a propósito, p. ej. `docker compose down -v`). Dos esquemas: `auth` (tenants/users) y `scores` (partituras guardadas).

## Arrancar

1. Copia `.env.example` a `.env`, pon tu clave de DeepSeek y sustituye `POSTGRES_PASSWORD`/`JWT_SECRET` por valores propios (p. ej. `openssl rand -hex 32`):

   ```bash
   cp .env.example .env
   ```

2. Levanta todo:

   ```bash
   docker compose up --build
   ```

3. Abre http://localhost:3000

## Notas

- El formato intermedio entre la IA y el resto del sistema es **ABC notation** (texto plano), no MusicXML directamente: es mucho más fiable que un LLM genere ABC válido que XML válido, y `music21` se encarga de la conversión determinista a MusicXML/MIDI.
- Si el ABC generado no parsea, el backend le devuelve el error a DeepSeek y le pide que lo corrija (hasta 2 veces) antes de fallar.

## Editar la partitura

**Notas y figuras.** El panel **Notas** (♪) tiene la paleta de figuras (de cuadrada a semifusa) y de silencios: se arrastran directamente al pentagrama y sueltan ahí (la altura la decide dónde se suelten), o se pulsan una vez para **armarlas** - el botón queda resaltado - y entonces cada clic sobre el pentagrama coloca una nota en ese punto, sin tener que volver a coger el botón cada vez; un segundo clic sobre el mismo botón, elegir otra figura o `Esc` lo desarma. Junto a ellas: alteraciones (incluidos doble sostenido y doble bemol), **puntillo y doble puntillo**, y **grupos especiales** (dosillo, tresillo, cuatrillo, cincillo, seisillo, septillo y nonillo). El puntillo y el grupo especial armado se aplican a lo que coloques a continuación; sobre notas ya seleccionadas, el botón **Aplicar a selección** (junto al selector de grupo especial) o el menú contextual → *Grupo especial* las convierte en ese grupo, y **Quitar grupo** lo deshace.

**Acordes (notas dobles).** Tres formas:
- Haz clic justo encima o debajo de una nota ya escrita: se le añade esa altura como nota de acorde (misma duración que la nota, sin necesidad de tener nada armado ni marcar ninguna casilla); si la alteración del panel Notas tiene algo elegido, se aplica a la nota añadida igual que a una nota nueva. Un clic sobre una altura que el acorde ya tiene no la duplica. Después, para alterar solo esa nota del acorde (y no las demás), clic derecho justo sobre ella → *Altura* → *Subir/Bajar semitono (esta nota)*.
- Activa **Apilar en acorde** en el panel de notas y suelta una figura encima de una nota existente: se le añade esa altura en vez de escribir una nota nueva al lado.
- Con notas seleccionadas, los botones **+3ª / +5ª / +8ª / −3ª / −5ª / −8ª** añaden esa altura, **Unir** funde varias notas seleccionadas en un solo acorde y **Quitar** elimina la nota más aguda. Lo mismo está en el menú contextual → *Acorde*.

**Varias voces en un mismo pentagrama.** El botón **+ Pentagrama** siempre crea uno nuevo; para que una voz adicional comparta el pentagrama de otra (por ejemplo, una segunda línea melódica u otra armonía sonando a la vez, con las plicas en direcciones opuestas), usa *Añadir voz en este pentagrama* - en el menú contextual del propio pentagrama o en el de su fila dentro del panel **Pentagramas**. Al hacer clic o arrastrar sobre un pentagrama compartido, qué voz recibe la nota se decide por cuál de las dos tiene una nota más cercana en ese punto (por tiempo y, si coinciden, por altura).

**Percusión.** El botón **+ Percusión** del panel Pentagramas añade un pentagrama de batería (`clef=perc`, canal MIDI 10 y un `%%MIDI drummap` por instrumento). Con él en la partitura aparece una paleta de percusión (bombo, caja, toms, charles, platillo): cada botón se arrastra al pentagrama de batería (o se arma con un clic, igual que la paleta de notas) y coloca su golpe en la línea que le corresponde, sin depender de dónde se suelte verticalmente.

**Matices, articulación y ligaduras.** Sobre la selección: `ppp`…`fff`, `sfz`, reguladores de crescendo/diminuendo, staccato, acento, tenuto, marcato, calderón, trino, mordente, grupeto, arpegio, arco arriba/abajo y respiración; ligadura de unión (una nota con la siguiente), ligadura de expresión (sobre varias) y apoyaturas. También barras de repetición y casillas de 1ª/2ª vez.

**Seleccionar varias notas.** Arrastra el ratón por una zona vacía de la partitura para dibujar un rectángulo: se seleccionan todas las notas que toque, de todos los pentagramas que abarque. `Ctrl`/`Mayús` mientras haces clic (o mientras arrastras) suma a la selección; `Ctrl+A` selecciona toda la partitura; `Esc` deselecciona. Casi todo lo anterior funciona sobre la selección entera de una vez.

**Copiar y pegar.** Botones **Copiar / Cortar / Pegar** en el panel de notas, las mismas opciones en el menú contextual (con *Pegar aquí* en el punto exacto donde hiciste clic derecho) y los atajos `Ctrl+C` / `Ctrl+X` / `Ctrl+V`. Cortar y borrar dejan silencios de la misma duración en lugar de un hueco, para que el compás no se descuadre.

**Reproducción.** La **barra espaciadora** reproduce y pausa (salvo mientras escribes en un campo de texto). El menú contextual del pentagrama tiene *Reproducir desde aquí*, que salta al punto exacto donde pinchaste.

**Silenciar pentagramas.** Al inicio de cada pentagrama hay un altavoz: púlsalo para silenciar esa voz durante la reproducción (se ve en rojo 🔇). Se guarda dentro del propio ABC como un comentario `%partis-mute`, así que se conserva al guardar y reabrir la partitura, y no afecta a la exportación a MusicXML/MIDI.

## Autenticación (`auth/`)

**No hay alta pública.** Los roles son:

- **`app_admin`** — administra la plataforma, no pertenece a ninguna organización. Es el único que puede crear (y editar el nombre de) organizaciones, desde una consola de administración propia, no el editor de partituras. Desde ahí, desplegando "Usuarios" en cada organización, también puede ver, crear, editar (usuario/contraseña/rol) y eliminar cualquier usuario de cualquier organización - no solo los suyos, a diferencia de un `director`/`admin`. Se crea automáticamente al primer arranque a partir de `ADMIN_BOOTSTRAP_USERNAME`/`ADMIN_BOOTSTRAP_PASSWORD` (`.env`).
- **`director`** — se crea junto con la organización (uno por organización). Puede crear `admin` o `musico` dentro de su organización.
- **`admin`** — administrador de una organización, creado por su `director`. Puede crear `musico`.
- **`musico`** — usuario normal, usa el editor de partituras.

El identificador de organización (`slug`) se genera automáticamente a partir de su nombre - no lo elige nadie a mano, y no hace falta conocerlo para iniciar sesión (ver login abajo). El usuario puede ser un email (o cualquier texto; no hay restricción de formato).

**Login sin organización, con desambiguación si hace falta.** El formulario de acceso solo pide usuario/email y contraseña - nunca una organización. Por dentro:
1. El backend busca esa combinación de usuario/contraseña en todas las organizaciones (y entre los `app_admin`).
2. Si solo coincide en una cuenta, entra directamente.
3. Si la misma persona tiene cuentas en varias organizaciones (mismo usuario/contraseña válido en más de una), el backend no elige por ella: devuelve la lista y el frontend pregunta con cuál quiere entrar antes de pedir el token definitivo.

Flujo completo: `app_admin` inicia sesión → consola de administración → crea una organización (nombre + usuario/contraseña del director) → el `director` inicia sesión → panel "Organización" del editor → crea los `admin`/`musico` que necesite.

El token se guarda en `localStorage` y se envía en cada llamada a `/api/compose`, `/api/chat`, `/api/render` y a las rutas de `/api/auth/...`; el `backend` valida ese JWT (comparte `JWT_SECRET` con `auth` vía `.env`) y responde 401 si falta o ha caducado.

También se puede usar directamente por API:

```bash
# Login - sin organización. Si la cuenta es única, responde con access_token
# directamente; si hay varias, responde con requires_organization=true y una
# lista de {tenant_slug, name} para elegir.
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<ADMIN_BOOTSTRAP_PASSWORD>"}'

# Login ya sabiendo la organización (p. ej. tras elegir en la lista anterior)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"ana@example.com","password":"unaClaveSegura123","tenant_slug":"mi-coro"}'

# Crear una organización (requiere token de app_admin) - el slug se genera solo
curl -X POST http://localhost:3000/api/auth/admin/organizations \
  -H "Content-Type: application/json" -H "Authorization: Bearer <token>" \
  -d '{"name":"Mi Coro","director_username":"ana@example.com","director_password":"unaClaveSegura123"}'

# Renombrar una organización (requiere token de app_admin)
curl -X PATCH http://localhost:3000/api/auth/admin/organizations/<tenant_id> \
  -H "Content-Type: application/json" -H "Authorization: Bearer <token>" \
  -d '{"name":"Mi Coro (nuevo nombre)"}'

# El director/admin crea un usuario en su propia organización
curl -X POST http://localhost:3000/api/auth/org/users \
  -H "Content-Type: application/json" -H "Authorization: Bearer <token-de-ana>" \
  -d '{"username":"pedro@example.com","password":"otraClaveSegura123","role":"musico"}'
```

Cada usuario pertenece a un `tenant_id` (`NULL` para un `app_admin`); el nombre de usuario solo tiene que ser único **dentro** de su organización (o entre los `app_admin`, que no tienen organización), no globalmente - por eso la misma persona puede tener cuentas independientes (mismo email, distinta contraseña si quiere) en varias organizaciones. No hay envío de email todavía (ni verificación de cuenta ni recuperación de contraseña).

Por dentro sigue arquitectura hexagonal: `domain/` (entidades y *ports* - interfaces), `application/` (casos de uso, solo dependen de los *ports*, incluida toda la lógica de "qué rol puede crear qué rol" y la desambiguación del login), `adapters/` (implementaciones concretas: Postgres, bcrypt, JWT, y las rutas FastAPI). El día que se integre Keycloak, solo hace falta añadir un adaptador nuevo (p. ej. `KeycloakTokenIssuer`) y cambiar el cableado en `adapters/inbound/http/dependencies.py` - el dominio, los casos de uso y las rutas no cambian.

## Partituras guardadas

Cualquier usuario autenticado (`director`/`admin`/`musico`) puede guardar la partitura que esté editando con el botón **Guardar** de la barra superior, que pregunta el título (precargado con el `T:` actual, editable ahí mismo). Si ya se había guardado antes en esta sesión (o se abrió una desde el archivo), "Guardar" la sobrescribe en el mismo sitio en vez de crear una copia; empezar una pieza nueva (con o sin IA) rompe ese vínculo, así que el siguiente "Guardar" crea una partitura distinta.

El título también se puede cambiar en cualquier momento desde el panel **Partitura** (⚙), que además tiene campos para **Encabezado** y **Pie de página** - texto que aparece arriba/abajo de la página impresa (usa las directivas `%%header`/`%%footer` de abcjs, que solo se dibujan en la vista **Hoja**: forzarlas obliga a renderizar a tamaño de página completa, así que en la vista **Seguida** se ignoran para no romper la cinta continua).

El icono **Archivo** del lateral abre la lista de partituras guardadas por cualquiera de la organización (no son privadas por usuario), con quién la guardó y cuándo; "Abrir" carga esa partitura en el editor (sustituyendo la actual) y "🗑" la borra.

**Deshacer / rehacer.** Los botones ↶/↷ de la barra superior (o `Ctrl+Z` / `Ctrl+Y`, también `Ctrl+Shift+Z`) recorren el historial de cambios de la partitura abierta - cualquier edición cuenta: notas, acordes, letra, cabecera, editar el ABC a mano... Escribir directamente en el panel **ABC** agrupa las pulsaciones seguidas en un solo paso de deshacer en vez de una por tecla. El historial se reinicia al empezar una pieza nueva, abrir otra partitura guardada o cargar una versión anterior (ver abajo) - deshacer nunca cruza de una pieza a otra.

**Versiones.** Cada vez que "Guardar" sobrescribe una partitura ya guardada, el contenido anterior no se pierde: el backend lo archiva automáticamente antes de sobrescribir (si el contenido no cambió, no archiva nada). El botón **Versiones** de la barra superior lista esas copias con fecha y quién guardó cada una; abrir una la carga en el editor - igual que abrir una partitura del archivo, sustituyendo el trabajo actual - sin sobrescribir nada por sí sola: hace falta pulsar Guardar para conservarla (lo que a su vez archiva lo que hubiera antes, así que nunca se pierde nada por recuperar una versión antigua).

Vive en `backend/` (tabla `scores.scores`, tenant-scoped igual que todo lo demás) en vez de en `auth/`, ya que es dominio "partituras" no "identidad" - el `backend` ya tenía la lógica de ABC/MusicXML y ahora también su propia conexión a Postgres (comparte el mismo `DATABASE_URL` que `auth`, cada uno con sus propias tablas).

```bash
# Guardar (crea nueva si no se manda score_id, sobrescribe si sí)
curl -X POST http://localhost:3000/api/scores \
  -H "Content-Type: application/json" -H "Authorization: Bearer <token>" \
  -d '{"title":"Vals de Otoño","abc":"X:1\nT:Vals de Otoño\nK:C\nC2 D2 E2 F2 |"}'

# Listar las de mi organización
curl http://localhost:3000/api/scores -H "Authorization: Bearer <token>"

# Abrir una
curl http://localhost:3000/api/scores/<id> -H "Authorization: Bearer <token>"

# Borrar una
curl -X DELETE http://localhost:3000/api/scores/<id> -H "Authorization: Bearer <token>"

# Versiones archivadas de una partitura (la más reciente primero)
curl http://localhost:3000/api/scores/<id>/versions -H "Authorization: Bearer <token>"

# Contenido completo de una versión concreta
curl http://localhost:3000/api/scores/<id>/versions/<version_id> -H "Authorization: Bearer <token>"
```
