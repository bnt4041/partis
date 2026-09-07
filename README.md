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

Cualquier usuario autenticado (`director`/`admin`/`musico`) puede guardar la partitura que esté editando con el botón **Guardar** de la barra superior - usa el título del campo `T:` del ABC. Si ya se había guardado antes en esta sesión (o se abrió una desde el archivo), "Guardar" la sobrescribe en el mismo sitio en vez de crear una copia; empezar una pieza nueva (con o sin IA) rompe ese vínculo, así que el siguiente "Guardar" crea una partitura distinta.

El icono **Archivo** del lateral abre la lista de partituras guardadas por cualquiera de la organización (no son privadas por usuario), con quién la guardó y cuándo; "Abrir" carga esa partitura en el editor (sustituyendo la actual) y "🗑" la borra.

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
```
