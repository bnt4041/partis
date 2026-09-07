import logging

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .auth import require_auth
from .config import settings
from .deepseek_client import (
    DeepSeekError,
    build_chat_messages,
    chat_repair,
    generate_abc,
    raw_chat,
    repair_abc,
    split_reply,
)
from .music_service import (
    InvalidAbcError,
    apply_part_names,
    parse_abc,
    score_title,
    score_to_midi_base64,
    score_to_musicxml,
)
from .schemas import (
    ChatRequest,
    ChatResponse,
    ComposeRequest,
    ComposeResponse,
    RenderRequest,
    RenderResponse,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("partis")

app = FastAPI(title="Partis API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origins] if settings.cors_origins != "*" else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_REPAIR_ATTEMPTS = 2


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/compose", response_model=ComposeResponse)
async def compose(req: ComposeRequest, claims: dict = Depends(require_auth)):
    try:
        abc_text = await generate_abc(req.prompt, req.key, req.tempo, req.time_signature, req.instrument)
    except DeepSeekError as exc:
        logger.error("DeepSeek error: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))

    last_error = None
    score = None
    for attempt in range(MAX_REPAIR_ATTEMPTS + 1):
        try:
            score = parse_abc(abc_text)
            last_error = None
            break
        except InvalidAbcError as exc:
            last_error = str(exc)
            logger.warning("ABC inválido (intento %s): %s", attempt, last_error)
            if attempt < MAX_REPAIR_ATTEMPTS:
                try:
                    abc_text = await repair_abc(
                        req.prompt, req.key, req.tempo, req.time_signature, req.instrument,
                        abc_text, last_error,
                    )
                except DeepSeekError as exc2:
                    raise HTTPException(status_code=502, detail=str(exc2))

    if score is None:
        raise HTTPException(
            status_code=422,
            detail=f"No se pudo generar una partitura válida tras varios intentos: {last_error}",
        )

    apply_part_names(score, req.instrument)

    try:
        musicxml = score_to_musicxml(score)
        midi_b64 = score_to_midi_base64(score)
    except Exception as exc:
        logger.exception("Error exportando la partitura")
        raise HTTPException(status_code=500, detail=f"Error exportando la partitura: {exc}")

    title = score_title(score, fallback=req.prompt[:60])

    return ComposeResponse(title=title, abc=abc_text, musicxml=musicxml, midi_base64=midi_b64)


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, claims: dict = Depends(require_auth)):
    history = [h.model_dump() for h in req.history]
    messages = build_chat_messages(req.abc, req.message, history)

    try:
        raw = await raw_chat(messages)
    except DeepSeekError as exc:
        logger.error("DeepSeek error: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))

    abc_text, reply_text = split_reply(raw)

    if abc_text is None:
        return ChatResponse(reply=reply_text)

    last_error = None
    score = None
    for attempt in range(MAX_REPAIR_ATTEMPTS + 1):
        try:
            score = parse_abc(abc_text)
            last_error = None
            break
        except InvalidAbcError as exc:
            last_error = str(exc)
            logger.warning("ABC de chat inválido (intento %s): %s", attempt, last_error)
            if attempt < MAX_REPAIR_ATTEMPTS:
                try:
                    raw = await chat_repair(messages, raw, last_error)
                except DeepSeekError as exc2:
                    raise HTTPException(status_code=502, detail=str(exc2))
                new_abc, reply_text = split_reply(raw)
                abc_text = new_abc if new_abc is not None else ""

    if score is None:
        raise HTTPException(
            status_code=422,
            detail=f"No se pudo aplicar el cambio de forma válida: {last_error}",
        )

    apply_part_names(score, None)

    try:
        musicxml = score_to_musicxml(score)
        midi_b64 = score_to_midi_base64(score)
    except Exception as exc:
        logger.exception("Error exportando la partitura tras el chat")
        raise HTTPException(status_code=500, detail=f"Error exportando la partitura: {exc}")

    return ChatResponse(reply=reply_text, abc=abc_text, musicxml=musicxml, midi_base64=midi_b64)


@app.post("/api/render", response_model=RenderResponse)
async def render(req: RenderRequest, claims: dict = Depends(require_auth)):
    try:
        score = parse_abc(req.abc)
    except InvalidAbcError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    apply_part_names(score, None)

    try:
        musicxml = score_to_musicxml(score)
        midi_b64 = score_to_midi_base64(score)
    except Exception as exc:
        logger.exception("Error exportando la partitura")
        raise HTTPException(status_code=500, detail=f"Error exportando la partitura: {exc}")

    title = score_title(score, fallback="Partitura")
    return RenderResponse(title=title, musicxml=musicxml, midi_base64=midi_b64)
