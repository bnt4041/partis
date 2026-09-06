import base64
import copy
import re
import tempfile
from pathlib import Path

from music21 import converter, stream

_VOICE_LINE_RE = re.compile(r"^V:\s*(\S+)(.*)$")


class InvalidAbcError(ValueError):
    pass


def parse_abc(abc_text: str) -> stream.Score:
    if not abc_text.strip():
        raise InvalidAbcError("El ABC generado está vacío.")

    normalized = _normalize_voices(abc_text)

    try:
        parsed = converter.parse(normalized, format="abc")
    except Exception as exc:  # music21 raises various internal exceptions
        raise InvalidAbcError(str(exc)) from exc

    if len(parsed.flatten().notesAndRests) == 0:
        raise InvalidAbcError("El ABC no contiene notas.")

    _dedupe_shared_elements(parsed)
    _ensure_measures(parsed)
    return parsed


def _dedupe_shared_elements(score: stream.Score) -> None:
    """music21's ABC parser can attach the very same TimeSignature/KeySignature/
    MetronomeMark object instance to more than one Part (e.g. a global M:/K:/Q:
    header shared across voices). Later stream operations - MIDI export's
    conductor-track merge in particular - refuse to insert the same object
    twice, so give every part after the first its own independent copy."""
    seen_ids: set[int] = set()
    for part in score.getElementsByClass(stream.Part):
        for el in list(part.recurse()):
            if id(el) in seen_ids:
                new_el = copy.deepcopy(el)
                site = el.activeSite
                if site is not None:
                    site.replace(el, new_el, allDerived=False)
            else:
                seen_ids.add(id(el))


def _normalize_voices(abc_text: str) -> str:
    """Some LLM-generated ABC repeats `V:1 clef=...` / `V:2 clef=...` headers
    once per section instead of declaring each voice only once. music21's ABC
    parser treats every repeated header as a brand new part, exploding a
    2-voice piano piece into a dozen parts. Rewrite the tune body so each
    voice header appears exactly once, followed by all of that voice's music
    concatenated in order."""
    lines = abc_text.splitlines()

    key_line_idx = None
    for i, line in enumerate(lines):
        if line.strip().startswith("K:"):
            key_line_idx = i
            break
    if key_line_idx is None:
        return abc_text

    header = lines[: key_line_idx + 1]
    body = lines[key_line_idx + 1 :]

    voice_order: list[str] = []
    voice_header_line: dict[str, str] = {}
    voice_content: dict[str, list[str]] = {}
    current_voice = None
    saw_voice_header = False

    for line in body:
        match = _VOICE_LINE_RE.match(line.strip())
        if match:
            saw_voice_header = True
            voice_id = match.group(1)
            if voice_id not in voice_order:
                voice_order.append(voice_id)
                voice_header_line[voice_id] = line
                voice_content[voice_id] = []
            current_voice = voice_id
            continue
        if current_voice is not None:
            voice_content[current_voice].append(line)
        else:
            # music before any voice declaration; keep as a pseudo "default" voice
            voice_order_default = voice_content.setdefault("__default__", [])
            voice_order_default.append(line)

    if not saw_voice_header:
        return abc_text

    rebuilt = list(header)
    if "__default__" in voice_content:
        rebuilt.extend(voice_content["__default__"])
    for voice_id in voice_order:
        rebuilt.append(voice_header_line[voice_id])
        rebuilt.extend(voice_content[voice_id])

    return "\n".join(rebuilt)


def _ensure_measures(score: stream.Score) -> None:
    parts = score.getElementsByClass(stream.Part)
    targets = list(parts) if len(parts) > 0 else [score]
    for part in targets:
        if not part.hasMeasures():
            part.makeMeasures(inPlace=True)


def apply_part_names(score: stream.Score, instrument_hint: str | None) -> None:
    """Fills in a sensible part name only where the ABC didn't already set one
    (e.g. via `V:1 name="Piano"`), so it never clobbers user/AI-chosen names."""
    parts = list(score.getElementsByClass(stream.Part))
    if not parts:
        return
    label = instrument_hint.strip().capitalize() if instrument_hint else "Voz"
    if len(parts) == 1:
        if not parts[0].partName:
            parts[0].partName = label
    else:
        for i, part in enumerate(parts, start=1):
            if not part.partName:
                part.partName = f"{label} {i}"


def score_title(score: stream.Score, fallback: str) -> str:
    if score.metadata and score.metadata.title:
        return score.metadata.title
    return fallback


def score_to_musicxml(score: stream.Score) -> str:
    with tempfile.TemporaryDirectory() as tmp_dir:
        out_path = Path(tmp_dir) / "score.musicxml"
        score.write("musicxml", fp=str(out_path))
        return out_path.read_text(encoding="utf-8")


def score_to_midi_base64(score: stream.Score) -> str:
    with tempfile.TemporaryDirectory() as tmp_dir:
        out_path = Path(tmp_dir) / "score.mid"
        score.write("midi", fp=str(out_path))
        midi_bytes = out_path.read_bytes()
        return base64.b64encode(midi_bytes).decode("ascii")
