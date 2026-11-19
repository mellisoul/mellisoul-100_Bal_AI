import json
import re
from contextlib import asynccontextmanager
from pathlib import Path

import fitz
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from ai_service import (
    AIConfigError,
    AIError,
    extract_topics,
    generate_questions,
    review_questions,
    split_text_into_pages,
)
from database import get_connection, init_db
from models import GenerateRequest, QuestionUpdate, TestResultCreate

MAX_FILE_SIZE = 10 * 1024 * 1024
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

QUESTION_COLUMNS = """
    id, material_id, question, options, correct_answer, explanation,
    topic, question_type, level, page, quality, quality_note, created_at
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="100 Bal AI API",
    description="API для учебной платформы 100 Bal AI",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def clean_filename(filename: str) -> str:
    name = Path(filename).name
    name = re.sub(r"[^\w.\- ]", "_", name)
    return name[:200] or "material"


def extract_pages(filename: str, file_bytes: bytes) -> list[str]:
    extension = Path(filename).suffix.lower()

    if extension == ".txt":
        for encoding in ("utf-8-sig", "utf-8", "cp1251"):
            try:
                text = file_bytes.decode(encoding).strip()
                return split_text_into_pages(text)
            except UnicodeDecodeError:
                continue

        raise HTTPException(
            status_code=400,
            detail="Не удалось прочитать TXT. Проверь кодировку файла.",
        )

    if extension == ".pdf":
        try:
            with fitz.open(stream=file_bytes, filetype="pdf") as document:
                pages = [page.get_text().strip() for page in document]
        except Exception as error:
            raise HTTPException(
                status_code=400,
                detail=f"Не удалось прочитать PDF: {error}",
            )

        if not any(pages):
            raise HTTPException(
                status_code=400,
                detail=(
                    "В PDF не найден текст. "
                    "Возможно, это скан без распознаваемого текста."
                ),
            )

        return pages

    raise HTTPException(
        status_code=400,
        detail="Поддерживаются только файлы PDF и TXT.",
    )


def parse_json(value, default):
    if not value:
        return default

    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return default


def material_to_dict(row) -> dict:
    item = dict(row)
    item["topics"] = parse_json(item.get("topics"), None)
    return item


def question_to_dict(row) -> dict:
    item = dict(row)
    item["options"] = parse_json(item.get("options"), [])
    return item


def get_material_or_404(conn, material_id: int):
    row = conn.execute(
        "SELECT * FROM materials WHERE id = ?",
        (material_id,),
    ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Материал не найден.")

    return row


def material_pages(row) -> list[str]:
    pages = parse_json(row["pages"], None)

    if isinstance(pages, list) and pages:
        return [str(page) for page in pages]

    return split_text_into_pages(row["content"])


def ai_errors(function, *args, **kwargs):
    try:
        return function(*args, **kwargs)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except AIConfigError as error:
        raise HTTPException(status_code=503, detail=str(error))
    except AIError as error:
        raise HTTPException(status_code=502, detail=str(error))


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/materials")
async def upload_material(file: UploadFile = File(...)):
    filename = clean_filename(file.filename or "")

    if Path(filename).suffix.lower() not in {".pdf", ".txt"}:
        raise HTTPException(status_code=400, detail="Выбери файл PDF или TXT.")

    file_bytes = await file.read(MAX_FILE_SIZE + 1)

    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Максимальный размер файла — 10 МБ.",
        )

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Файл пуст.")

    pages = extract_pages(filename, file_bytes)
    content = "\n".join(pages).strip()

    if not content:
        raise HTTPException(status_code=400, detail="В документе нет текста.")

    title = Path(filename).stem

    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO materials (title, filename, content, file_type, pages)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                title,
                filename,
                content,
                Path(filename).suffix.lower().replace(".", ""),
                json.dumps(pages, ensure_ascii=False),
            ),
        )

        row = conn.execute(
            """
            SELECT id, title, filename, file_type, topics, created_at,
                   0 AS question_count
            FROM materials WHERE id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()

    return {
        "message": "Материал успешно загружен!",
        "material": material_to_dict(row),
        "text_length": len(content),
        "pages_count": len(pages),
    }


@app.get("/api/materials")
def list_materials():
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT m.id, m.title, m.filename, m.file_type, m.topics,
                   m.created_at,
                   (SELECT COUNT(*) FROM questions q
                    WHERE q.material_id = m.id) AS question_count
            FROM materials m
            ORDER BY m.id DESC
            """
        ).fetchall()

    return {"materials": [material_to_dict(row) for row in rows]}


@app.get("/api/materials/{material_id}")
def get_material(material_id: int):
    with get_connection() as conn:
        row = get_material_or_404(conn, material_id)

    item = material_to_dict(row)
    item["pages_count"] = len(material_pages(row))
    item.pop("pages", None)
    return item


@app.delete("/api/materials/{material_id}")
def delete_material(material_id: int):
    with get_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM materials WHERE id = ?",
            (material_id,),
        )

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Материал не найден.")

    return {"message": "Материал удалён."}


@app.post("/api/materials/{material_id}/topics")
def detect_topics(material_id: int):
    with get_connection() as conn:
        row = get_material_or_404(conn, material_id)

    topics = ai_errors(extract_topics, material_pages(row))

    with get_connection() as conn:
        conn.execute(
            "UPDATE materials SET topics = ? WHERE id = ?",
            (json.dumps(topics, ensure_ascii=False), material_id),
        )

    return {"material_id": material_id, "topics": topics}


@app.get("/api/materials/{material_id}/topics")
def list_topics(material_id: int):
    with get_connection() as conn:
        row = get_material_or_404(conn, material_id)

    return {
        "material_id": material_id,
        "topics": parse_json(row["topics"], []),
    }


@app.post("/api/materials/{material_id}/generate")
def generate_material_questions(material_id: int, request: GenerateRequest):
    topic = request.topic.strip()

    with get_connection() as conn:
        row = get_material_or_404(conn, material_id)
        existing = [
            item["question"]
            for item in conn.execute(
                "SELECT question FROM questions WHERE material_id = ? "
                "ORDER BY id DESC LIMIT 40",
                (material_id,),
            ).fetchall()
        ]

    topic_pages = None

    for item in parse_json(row["topics"], []):
        if item.get("name", "").strip().lower() == topic.lower():
            topic_pages = item.get("pages")
            break

    result = ai_errors(
        generate_questions,
        pages=material_pages(row),
        topic=topic,
        topic_pages=topic_pages,
        count=request.count,
        level=request.level,
        question_type=request.question_type,
        existing=existing,
    )

    questions = result["questions"]

    if request.verify:
        try:
            review_questions(result["context"], topic, questions)
        except (AIError, AIConfigError):
            for question in questions:
                question["quality"] = "unchecked"
                question["quality_note"] = "Проверка не выполнена"

    saved = []

    with get_connection() as conn:
        for question in questions:
            cursor = conn.execute(
                """
                INSERT INTO questions (
                    material_id, question, options, correct_answer,
                    explanation, difficulty, topic, question_type, level,
                    page, quality, quality_note
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    material_id,
                    question["question"],
                    json.dumps(question["options"], ensure_ascii=False),
                    question["correct_answer"],
                    question["explanation"],
                    str(question["level"]),
                    topic or "Весь материал",
                    question["question_type"],
                    question["level"],
                    question["page"],
                    question.get("quality", "unchecked"),
                    question.get("quality_note", ""),
                ),
            )

            saved.append(
                question_to_dict(
                    conn.execute(
                        f"SELECT {QUESTION_COLUMNS} FROM questions WHERE id = ?",
                        (cursor.lastrowid,),
                    ).fetchone()
                )
            )

    return {
        "material_id": row["id"],
        "material_title": row["title"],
        "count": len(saved),
        "skipped_duplicates": result["skipped_duplicates"],
        "questions": saved,
    }


@app.get("/api/materials/{material_id}/questions")
def list_material_questions(
    material_id: int,
    level: int = 0,
    topic: str = "",
):
    with get_connection() as conn:
        get_material_or_404(conn, material_id)

        query = f"SELECT {QUESTION_COLUMNS} FROM questions WHERE material_id = ?"
        params: list = [material_id]

        if level:
            query += " AND level = ?"
            params.append(level)

        if topic:
            query += " AND topic = ?"
            params.append(topic)

        rows = conn.execute(query + " ORDER BY id DESC", params).fetchall()

    questions = [question_to_dict(row) for row in rows]

    return {
        "material_id": material_id,
        "count": len(questions),
        "questions": questions,
    }


@app.put("/api/questions/{question_id}")
def update_question(question_id: int, update: QuestionUpdate):
    changes = update.model_dump(exclude_unset=True, exclude_none=True)

    if "question" in changes and not changes["question"].strip():
        raise HTTPException(status_code=400, detail="Текст вопроса пуст.")

    with get_connection() as conn:
        row = conn.execute(
            f"SELECT {QUESTION_COLUMNS} FROM questions WHERE id = ?",
            (question_id,),
        ).fetchone()

        if row is None:
            raise HTTPException(status_code=404, detail="Вопрос не найден.")

        current = question_to_dict(row)
        merged = {**current, **changes}

        if current["question_type"] == "test":
            options = [str(option).strip() for option in merged["options"]]

            if len(options) != 4 or len(set(options)) != 4 or "" in options:
                raise HTTPException(
                    status_code=400,
                    detail="В тесте должно быть 4 разных варианта ответа.",
                )

            if merged["correct_answer"] not in options:
                raise HTTPException(
                    status_code=400,
                    detail="Правильный ответ должен совпадать с одним из вариантов.",
                )

            merged["options"] = options

        conn.execute(
            """
            UPDATE questions
            SET question = ?, options = ?, correct_answer = ?,
                explanation = ?, topic = ?, level = ?, difficulty = ?
            WHERE id = ?
            """,
            (
                merged["question"].strip(),
                json.dumps(merged["options"], ensure_ascii=False),
                merged["correct_answer"],
                merged["explanation"],
                merged["topic"],
                merged["level"],
                str(merged["level"]),
                question_id,
            ),
        )

        updated = conn.execute(
            f"SELECT {QUESTION_COLUMNS} FROM questions WHERE id = ?",
            (question_id,),
        ).fetchone()

    return question_to_dict(updated)


@app.delete("/api/questions/{question_id}")
def delete_question(question_id: int):
    with get_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM questions WHERE id = ?",
            (question_id,),
        )

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Вопрос не найден.")

    return {"message": "Вопрос удалён."}


@app.post("/api/test-results")
def save_test_result(result: TestResultCreate):
    if result.correct_answers > result.total_questions:
        raise HTTPException(
            status_code=400,
            detail="Правильных ответов больше, чем вопросов.",
        )

    score = round(result.correct_answers / result.total_questions * 100, 1)

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO test_results
                (material_id, total_questions, correct_answers, score)
            VALUES (?, ?, ?, ?)
            """,
            (
                result.material_id,
                result.total_questions,
                result.correct_answers,
                score,
            ),
        )

    return {"score": score}


@app.get("/api/stats")
def get_stats():
    with get_connection() as conn:
        materials = conn.execute("SELECT COUNT(*) FROM materials").fetchone()[0]
        questions = conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
        by_level = {
            row["level"]: row["total"]
            for row in conn.execute(
                "SELECT level, COUNT(*) AS total FROM questions GROUP BY level"
            ).fetchall()
        }
        tests = conn.execute(
            """
            SELECT COUNT(*) AS total,
                   COALESCE(SUM(correct_answers), 0) AS correct,
                   AVG(score) AS average
            FROM test_results
            """
        ).fetchone()

    return {
        "materials": materials,
        "questions": questions,
        "by_level": {str(level): by_level.get(level, 0) for level in range(1, 6)},
        "tests_taken": tests["total"],
        "correct_answers": tests["correct"],
        "average_score": (
            round(tests["average"], 1) if tests["average"] is not None else None
        ),
    }


if FRONTEND_DIR.exists():
    app.mount(
        "/",
        StaticFiles(directory=FRONTEND_DIR, html=True),
        name="frontend",
    )
