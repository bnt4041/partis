from typing import Literal, Optional

from pydantic import BaseModel, Field


class ComposeRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=2000)
    key: Optional[str] = None
    tempo: Optional[int] = Field(default=None, ge=20, le=300)
    time_signature: Optional[str] = None
    instrument: Optional[str] = None


class ComposeResponse(BaseModel):
    title: str
    abc: str
    musicxml: str
    midi_base64: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=4000)


class ChatRequest(BaseModel):
    abc: str = Field(..., min_length=1, max_length=20000)
    message: str = Field(..., min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)


class ChatResponse(BaseModel):
    reply: str
    abc: Optional[str] = None
    musicxml: Optional[str] = None
    midi_base64: Optional[str] = None


class RenderRequest(BaseModel):
    abc: str = Field(..., min_length=1, max_length=20000)


class RenderResponse(BaseModel):
    title: str
    musicxml: str
    midi_base64: str


class SaveScoreRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    abc: str = Field(..., min_length=1, max_length=20000)
    score_id: Optional[str] = None  # set => overwrite that score instead of creating a new one


class ScoreSummary(BaseModel):
    id: str
    title: str
    created_by_username: Optional[str]
    created_at: str
    updated_at: str


class ScoreDetail(ScoreSummary):
    abc: str
