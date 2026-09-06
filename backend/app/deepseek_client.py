import re

import httpx

from .config import settings

SYSTEM_PROMPT = """Eres un compositor experto que escribe partituras en notación ABC (abcnotation.com).

Reglas estrictas:
- Devuelve UNICAMENTE el código ABC de una unica pieza, sin explicaciones, sin markdown, sin comentarios.
- Incluye siempre las cabeceras: X:1, T:<titulo>, M:<compas>, L:<duracion base>, Q:<tempo>, K:<tonalidad>.
- Si el instrumento es polifonico (ej. piano), usa dos voces con V:1 (clef=treble) y V:2 (clef=bass).
- CRITICO: cada voz (V:1, V:2...) se declara UNA UNICA VEZ, al principio, junto con su clef. Escribe TODA la musica de esa voz seguida (todas sus secciones y repeticiones), de principio a fin, antes de pasar a la cabecera de la siguiente voz. NUNCA repitas "V:1 clef=..." o "V:2 clef=..." más de una vez en la pieza: eso crea voces nuevas por error.
- Usa una sintaxis ABC valida y consistente (barras de compas correctas segun el compas indicado).
- La pieza debe tener entre 8 y 32 compases por voz, con una idea musical coherente (frases, repeticion con variacion, cadencia final clara).
- No inventes campos que no sean ABC estandar.
"""


def _build_user_prompt(prompt: str, key: str | None, tempo: int | None,
                        time_signature: str | None, instrument: str | None) -> str:
    parts = [f"Compón una pieza musical a partir de esta descripción: {prompt}."]
    if key:
        parts.append(f"Tonalidad deseada: {key}.")
    if tempo:
        parts.append(f"Tempo aproximado: {tempo} BPM.")
    if time_signature:
        parts.append(f"Compás: {time_signature}.")
    if instrument:
        parts.append(f"Instrumento(s): {instrument}.")
    parts.append("Devuelve solo el ABC, nada más.")
    return " ".join(parts)


def extract_abc(raw: str) -> str:
    text = raw.strip()
    fence_match = re.search(r"```(?:abc)?\s*(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if fence_match:
        text = fence_match.group(1).strip()
    return text


class DeepSeekError(RuntimeError):
    pass


async def generate_abc(prompt: str, key: str | None, tempo: int | None,
                        time_signature: str | None, instrument: str | None) -> str:
    if not settings.deepseek_api_key:
        raise DeepSeekError("DEEPSEEK_API_KEY no está configurada en el backend.")

    user_prompt = _build_user_prompt(prompt, key, tempo, time_signature, instrument)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    async with httpx.AsyncClient(timeout=60.0) as client:
        content = await _chat(client, messages)
        return extract_abc(content)


async def repair_abc(prompt: str, key: str | None, tempo: int | None,
                      time_signature: str | None, instrument: str | None,
                      previous_abc: str, error: str) -> str:
    if not settings.deepseek_api_key:
        raise DeepSeekError("DEEPSEEK_API_KEY no está configurada en el backend.")

    user_prompt = _build_user_prompt(prompt, key, tempo, time_signature, instrument)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
        {"role": "assistant", "content": previous_abc},
        {"role": "user", "content": (
            f"El ABC anterior no es válido, el parser dio este error: {error}. "
            "Corrige el ABC y devuelve solo el código ABC corregido, completo."
        )},
    ]

    async with httpx.AsyncClient(timeout=60.0) as client:
        content = await _chat(client, messages)
        return extract_abc(content)


CHAT_SYSTEM_PROMPT = """Eres un asistente de composición musical que ayuda a un usuario a editar, de forma conversacional, una partitura escrita en notación ABC (abcnotation.com).

Te llega el ABC actual de la pieza y el mensaje del usuario.

- Si el usuario pide un cambio musical (añadir compases, cambiar melodía, armonía, instrumentación, dinámica, tempo, tonalidad, etc.): responde con un bloque ```abc que contenga el ABC COMPLETO Y ACTUALIZADO de la pieza entera (nunca solo el fragmento cambiado), y después del bloque una frase breve (una línea) en texto explicando qué has cambiado.
- Si el usuario solo hace una pregunta o pide consejo sin querer que edites la partitura: responde SOLO con texto en lenguaje natural, sin ningún bloque ```abc.
- Respeta la estructura de voces (V:) que ya tenga la pieza salvo que el usuario pida explícitamente añadir o quitar pentagramas.
- Declara cada voz una única vez (nunca repitas una cabecera V: con clef en medio de la pieza).
- Mantén siempre una sintaxis ABC válida y no inventes campos no estándar.
"""


def split_reply(raw: str) -> tuple[str | None, str]:
    match = re.search(r"```abc\s*(.*?)```", raw, re.DOTALL | re.IGNORECASE)
    if not match:
        return None, raw.strip()
    abc = match.group(1).strip()
    reply = (raw[: match.start()] + raw[match.end() :]).strip()
    if not reply:
        reply = "He actualizado la partitura."
    return abc, reply


def build_chat_messages(abc_text: str, message: str, history: list[dict]) -> list[dict]:
    messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
    messages.extend(history)
    messages.append({
        "role": "user",
        "content": f"ABC actual de la pieza:\n```abc\n{abc_text}\n```\n\nMensaje del usuario: {message}",
    })
    return messages


async def raw_chat(messages: list[dict]) -> str:
    if not settings.deepseek_api_key:
        raise DeepSeekError("DEEPSEEK_API_KEY no está configurada en el backend.")
    async with httpx.AsyncClient(timeout=60.0) as client:
        return await _chat(client, messages)


async def chat_repair(messages: list[dict], previous_raw: str, error: str) -> str:
    messages = list(messages)
    messages.append({"role": "assistant", "content": previous_raw})
    messages.append({
        "role": "user",
        "content": (
            f"El ABC que devolviste no es válido, el parser dio este error: {error}. "
            "Corrígelo y responde de nuevo con el bloque ```abc completo corregido, "
            "seguido de una breve explicación."
        ),
    })
    return await raw_chat(messages)


async def _chat(client: httpx.AsyncClient, messages: list[dict]) -> str:
    response = await client.post(
        f"{settings.deepseek_base_url}/chat/completions",
        headers={"Authorization": f"Bearer {settings.deepseek_api_key}"},
        json={
            "model": settings.deepseek_model,
            "messages": messages,
            "temperature": 0.8,
            "max_tokens": 2000,
            "stream": False,
        },
    )
    if response.status_code != 200:
        raise DeepSeekError(f"DeepSeek API error {response.status_code}: {response.text}")

    data = response.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as exc:
        raise DeepSeekError(f"Respuesta inesperada de DeepSeek: {data}") from exc
