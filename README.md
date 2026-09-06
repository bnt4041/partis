# Partis

Composición musical asistida por IA (DeepSeek), con renderizado de partitura en el navegador.

## Arquitectura

- **backend/** — FastAPI. Pide a DeepSeek una pieza en notación ABC, la valida/convierte con `music21` a MusicXML + MIDI, con hasta 2 reintentos de auto-corrección si el ABC generado no es válido.
- **frontend/** — HTML/JS estático servido por nginx (que también hace de proxy a `/api`). Renderiza y edita la partitura con [abcjs](https://www.abcjs.net/), incluyendo reproducción de audio con su synth integrado.
- **auth/** — FastAPI, arquitectura hexagonal (dominio/aplicación/adaptadores). Registro y login multi-tenant (cada organización es un `tenant` con sus propios usuarios) emitiendo JWT propios. Preparado para sustituir el emisor/verificador de tokens por Keycloak más adelante sin tocar el dominio ni las rutas HTTP - ver `auth/app/domain/ports.py`.
- **db/** — Postgres. Solo contiene el esquema `auth` (tenants/users) por ahora; pensado para alojar también los datos de la propia app (partituras guardadas, etc.) en otro esquema el día que eso exista.

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

El frontend todavía no tiene pantallas de login - el servicio existe y funciona, pero conectarlo a la interfaz es un paso pendiente. Se puede probar directamente:

```bash
# Alta de una organización (tenant) nueva + su usuario propietario
curl -X POST http://localhost:3000/api/auth/tenants \
  -H "Content-Type: application/json" \
  -d '{"tenant_slug":"mi-coro","tenant_name":"Mi Coro","username":"ana","password":"unaClaveSegura123"}'

# Login (devuelve un access_token JWT)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"tenant_slug":"mi-coro","username":"ana","password":"unaClaveSegura123"}'

# Usuario autenticado actual
curl http://localhost:3000/api/auth/me -H "Authorization: Bearer <access_token>"
```

Cada usuario pertenece a un `tenant_id`; el nombre de usuario solo tiene que ser único **dentro** de su organización, no globalmente. No hay envío de email todavía (ni verificación de cuenta ni recuperación de contraseña) - de momento el alta es directa con usuario/contraseña.

Por dentro sigue arquitectura hexagonal: `domain/` (entidades y *ports* - interfaces), `application/` (casos de uso, solo dependen de los *ports*), `adapters/` (implementaciones concretas: Postgres, bcrypt, JWT, y las rutas FastAPI). El día que se integre Keycloak, solo hace falta añadir un adaptador nuevo (p. ej. `KeycloakTokenIssuer`) y cambiar el cableado en `adapters/inbound/http/dependencies.py` - el dominio, los casos de uso y las rutas no cambian.
