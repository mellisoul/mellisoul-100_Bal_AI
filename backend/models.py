from typing import Literal

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    topic: str = ""
    count: int = Field(default=10, ge=1, le=30)
    level: int = Field(default=0, ge=0, le=5)
    question_type: Literal["test", "open", "mixed"] = "mixed"
    verify: bool = True


class QuestionUpdate(BaseModel):
    question: str | None = None
    options: list[str] | None = None
    correct_answer: str | None = None
    explanation: str | None = None
    topic: str | None = None
    level: int | None = Field(default=None, ge=1, le=5)


class TestResultCreate(BaseModel):
    material_id: int | None = None
    total_questions: int = Field(ge=1)
    correct_answers: int = Field(ge=0)
