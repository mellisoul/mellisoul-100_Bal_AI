import json
import logging
import os
import random
import re
import time
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher
from pathlib import Path
from typing import List

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

MAX_CONTEXT = 12000
MAX_WINDOWS = 8
MAX_TOPICS = 10

LEVELS = {
    1: (
        "Очень лёгкий",
        "Простые определения и факты, ответ дословно есть в тексте.",
    ),
    2: (
        "Лёгкий",
        "Проверка понимания: объяснить своими словами, назвать отличия, "
        "привести пример из текста.",
    ),
    3: (
        "Средний",
        "Применение знаний: небольшая практическая задача или ситуация, "
        "где нужно использовать изученное. Для программирования - написать "
        "короткий код.",
    ),
    4: (
        "Сложный",
        "Анализ ситуаций и ошибок: найти и объяснить ошибку, сравнить "
        "подходы, определить причину результата.",
    ),
    5: (
        "Очень сложный",
        "Нестандартная многошаговая задача, которая объединяет несколько "
        "понятий; нужно предложить решение и обосновать выбор.",
    ),
}

TOPICS_SYSTEM = (
    "Ты помощник преподавателя. Ты выделяешь основные темы учебного "
    "материала. Отвечай только JSON."
)

GENERATE_SYSTEM = (
    "Ты опытный составитель учебных вопросов. Используй только факты из "
    "переданного материала, ничего не выдумывай. Вопросы должны быть "
    "самостоятельными и понятными без самого текста: не пиши «согласно "
    "тексту» и не ссылайся на «фрагмент». Отвечай только JSON."
)

REVIEW_SYSTEM = (
    "Ты строгий рецензент учебных вопросов. Проверяешь вопросы по "
    "материалу и отвечаешь только JSON."
)


class AIConfigError(Exception):
    pass


class AIError(Exception):
    pass


def get_client():
    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        raise AIConfigError(
            "Не задан GEMINI_API_KEY. Создай файл backend/.env со строкой "
            "GEMINI_API_KEY=твой_ключ и перезапусти сервер."
        )

    from openai import OpenAI

    return OpenAI(api_key=api_key, timeout=120, max_retries=0,
                  base_url="https://generativelanguage.googleapis.com/v1beta/openai/")


RETRY_STATUSES = {429, 500, 502, 503, 504}
FALLBACK_STATUSES = {404, 429, 500, 502, 503, 504}
logger = logging.getLogger("ai_service")


def model_chain() -> List[str]:
    main = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
    extra = os.getenv("GEMINI_FALLBACK_MODELS", "gemini-3.1-flash-lite,gemini-2.5-flash")
    models = [main] + [m.strip() for m in extra.split(",") if m.strip()]
    return list(dict.fromkeys(models))


def call_model(client, model: str, system: str, user: str):
    return client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format={"type": "json_object"},
        temperature=0.4,
    )


def ask_json(system: str, user: str) -> dict:
    client = get_client()
    last_error: Exception | None = None
    response = None

    for model in model_chain():
        for attempt in range(3):
            try:
                response = call_model(client, model, system, user)
                break
            except Exception as error:
                last_error = error
                status = getattr(error, "status_code", None)
                logger.warning("Gemini %s attempt %s failed: HTTP %s %s", model, attempt + 1, status, error)

                if status not in RETRY_STATUSES or attempt == 2:
                    break

                time.sleep(2 ** (attempt + 1) + random.random())

        if response is not None:
            break

        if getattr(last_error, "status_code", None) not in FALLBACK_STATUSES:
            break

    if response is None:
        status = getattr(last_error, "status_code", None)

        if status == 429:
            raise AIError("Лимит Gemini исчерпан. Подожди минуту и попробуй снова или проверь квоту в Google AI Studio.")
        if status in {500, 502, 503, 504}:
            raise AIError("Gemini сейчас перегружен. Подожди минуту и попробуй ещё раз.")
        if status in {401, 403}:
            raise AIError("Gemini отклонил доступ. Проверь ключ и разрешения проекта Google AI Studio.")
        if status == 404:
            raise AIError("Выбранная модель Gemini недоступна для этого проекта.")
        raise AIError(f"Не удалось выполнить запрос Gemini (HTTP {status or 'нет ответа'}). Попробуй ещё раз.")

    try:
        data = json.loads(response.choices[0].message.content or "{}")
    except (json.JSONDecodeError, AttributeError, IndexError):
        raise AIError("Модель вернула некорректный JSON. Попробуй ещё раз.")

    if not isinstance(data, dict):
        raise AIError("Модель вернула неожиданный формат ответа.")

    return data


def split_text_into_pages(text: str, size: int = 3000) -> List[str]:
    parts = [p.strip() for p in text.split("\n") if p.strip()]
    pages: List[str] = []
    current = ""

    for part in parts:
        while len(part) > size:
            if current:
                pages.append(current)
                current = ""
            pages.append(part[:size])
            part = part[size:]

        if current and len(current) + len(part) + 1 > size:
            pages.append(current)
            current = part
        else:
            current = f"{current}\n{part}".strip()

    if current:
        pages.append(current)

    return pages


def even_sample(items: list, k: int) -> list:
    if k >= len(items):
        return list(items)

    if k <= 0:
        return []

    return [items[int(i * len(items) / k)] for i in range(k)]


def build_context(pages: List[str], numbers: List[int], limit: int = MAX_CONTEXT) -> str:
    valid = [
        n for n in numbers
        if 1 <= n <= len(pages) and pages[n - 1].strip()
    ]

    total = sum(len(pages[n - 1]) for n in valid)

    if total > limit and valid:
        average = max(1, total // len(valid))
        valid = even_sample(valid, max(1, limit // average))

    blocks = [f"[Стр. {n}]\n{pages[n - 1].strip()}" for n in valid]
    return "\n\n".join(blocks)[: limit + 2000]


def make_windows(pages: List[str], limit: int = MAX_CONTEXT) -> List[List[int]]:
    windows: List[List[int]] = []
    current: List[int] = []
    size = 0

    for number, text in enumerate(pages, start=1):
        if current and size + len(text) > limit:
            windows.append(current)
            current = []
            size = 0

        current.append(number)
        size += len(text)

    if current:
        windows.append(current)

    return windows


def extract_topics(pages: List[str]) -> List[dict]:
    windows = even_sample(make_windows(pages), MAX_WINDOWS)
    found: List[dict] = []

    for window in windows:
        context = build_context(pages, window)

        if not context.strip():
            continue

        data = ask_json(
            TOPICS_SYSTEM,
            "Выдели от 3 до 6 основных тем этого фрагмента учебного "
            "материала. Название темы короткое (2-5 слов), на языке "
            "материала. Для каждой темы укажи номера страниц из маркеров "
            "[Стр. N], где она раскрывается.\n"
            'Формат: {"topics": [{"name": "...", "pages": [1, 2]}]}\n\n'
            f"Материал:\n{context}",
        )

        for item in data.get("topics", []):
            if not isinstance(item, dict):
                continue

            name = str(item.get("name", "")).strip()

            if not name:
                continue

            numbers = [
                n for n in item.get("pages", [])
                if isinstance(n, int) and n in window
            ] or window

            for existing in found:
                ratio = SequenceMatcher(
                    None, existing["name"].lower(), name.lower()
                ).ratio()

                if ratio > 0.8:
                    existing["pages"] = sorted(set(existing["pages"]) | set(numbers))
                    break
            else:
                found.append({"name": name, "pages": sorted(set(numbers))})

    if not found:
        raise AIError("Не удалось выделить темы из материала.")

    found.sort(key=lambda topic: len(topic["pages"]), reverse=True)
    found = found[:MAX_TOPICS]
    found.sort(key=lambda topic: topic["pages"][0])
    return found


def rank_pages_by_topic(pages: List[str], topic: str) -> List[int]:
    words = [
        word[: max(4, len(word) - 2)]
        for word in re.findall(r"\w+", topic.lower())
        if len(word) >= 4
    ] or [topic.lower().strip()]

    scored = []

    for number, text in enumerate(pages, start=1):
        lowered = text.lower()
        score = sum(lowered.count(word) for word in words)

        if score > 0:
            scored.append((score, number))

    scored.sort(reverse=True)
    return sorted(number for _, number in scored[:15])


def pick_pages(pages: List[str], topic: str, topic_pages: List[int] | None) -> List[int]:
    numbers = [n for n in (topic_pages or []) if 1 <= n <= len(pages)]

    if not numbers and topic:
        numbers = rank_pages_by_topic(pages, topic)

        if not numbers:
            raise ValueError("Тема не найдена в тексте материала.")

    if not numbers:
        numbers = list(range(1, len(pages) + 1))

    return sorted(set(numbers))


def level_plan(count: int, level: int) -> List[tuple]:
    if level in LEVELS:
        return [(level, count)]

    base, extra = divmod(count, 5)
    plan = [
        (value, base + (1 if value - 1 < extra else 0))
        for value in range(1, 6)
    ]
    return [(value, amount) for value, amount in plan if amount > 0]


def type_plan(amount: int, question_type: str) -> tuple:
    if question_type == "test":
        return amount, 0

    if question_type == "open":
        return 0, amount

    tests = (amount + 1) // 2
    return tests, amount - tests


def clean_question(raw: dict, level: int, allowed_pages: set):
    if not isinstance(raw, dict):
        return None

    text = str(raw.get("question", "")).strip()
    answer = str(raw.get("correct_answer", "")).strip()

    if not text or not answer:
        return None

    question_type = "test" if raw.get("type") == "test" else "open"
    options: List[str] = []

    if question_type == "test":
        options = [
            str(option).strip()
            for option in raw.get("options", [])
            if str(option).strip()
        ]
        options = list(dict.fromkeys(options))

        if len(options) != 4:
            return None

        if answer not in options:
            lowered = [option.lower() for option in options]

            if answer.lower() in lowered:
                answer = options[lowered.index(answer.lower())]
            elif len(answer) <= 3 and answer.strip(". )").upper() in "ABCD":
                answer = options["ABCD".index(answer.strip(". )").upper())]
            else:
                return None

        random.shuffle(options)

    page = raw.get("page")

    return {
        "question": text,
        "options": options,
        "correct_answer": answer,
        "explanation": str(raw.get("explanation", "")).strip(),
        "question_type": question_type,
        "level": level,
        "page": page if isinstance(page, int) and page in allowed_pages else None,
    }


def generate_for_level(
    context: str,
    topic: str,
    level: int,
    amount: int,
    question_type: str,
    avoid: List[str],
) -> List[dict]:
    tests, opens = type_plan(amount, question_type)
    name, description = LEVELS[level]
    allowed_pages = {int(n) for n in re.findall(r"\[Стр\. (\d+)\]", context)}

    avoid_text = (
        "Уже существующие вопросы (не повторяй их и не перефразируй):\n- "
        + "\n- ".join(avoid[:15])
        + "\n\n"
        if avoid
        else ""
    )

    data = ask_json(
        GENERATE_SYSTEM,
        f"Тема: {topic or 'весь материал'}\n"
        f"Уровень сложности: {level} из 5 - {name}. {description}\n"
        f"Нужно вопросов: {amount}: тестовых (type=\"test\", ровно 4 "
        f"варианта, один правильный) - {tests}, открытых (type=\"open\", "
        f"без вариантов) - {opens}.\n"
        "Требования:\n"
        "- все вопросы строго уровня сложности выше и по теме;\n"
        "- ответ должен подтверждаться материалом;\n"
        "- неправильные варианты правдоподобные и из той же области, "
        "без вариантов «ничего из перечисленного» и «все верно»;\n"
        "- в тестах правильный вариант должен быть в разных позициях;\n"
        "- для открытых вопросов в correct_answer дай полный эталонный "
        "ответ или решение;\n"
        "- explanation: 1-2 предложения, почему ответ верный;\n"
        "- page: номер страницы из маркера [Стр. N], на основе которой "
        "создан вопрос;\n"
        "- язык вопросов - язык материала.\n"
        'Формат: {"questions": [{"type": "test", "question": "...", '
        '"options": ["...", "...", "...", "..."], "correct_answer": '
        '"точная копия правильного варианта", "explanation": "...", '
        '"page": 1}]}\n'
        "Для open поле options - пустой список.\n\n"
        f"{avoid_text}"
        f"Материал:\n{context}",
    )

    result = []

    for raw in data.get("questions", []):
        cleaned = clean_question(raw, level, allowed_pages)

        if cleaned:
            result.append(cleaned)

    return result[:amount]


def is_duplicate(text: str, known: List[str]) -> bool:
    lowered = text.lower()
    return any(
        SequenceMatcher(None, lowered, other.lower()).ratio() > 0.85
        for other in known
    )


def generate_questions(
    pages: List[str],
    topic: str = "",
    topic_pages: List[int] | None = None,
    count: int = 10,
    level: int = 0,
    question_type: str = "mixed",
    existing: List[str] | None = None,
) -> dict:
    if not pages or not any(page.strip() for page in pages):
        raise ValueError("Учебный материал пуст.")

    if count < 1:
        raise ValueError("Количество вопросов должно быть больше нуля.")

    if level != 0 and level not in LEVELS:
        raise ValueError("Уровень сложности должен быть от 1 до 5.")

    if question_type not in {"test", "open", "mixed"}:
        raise ValueError("Тип вопроса должен быть test, open или mixed.")

    numbers = pick_pages(pages, topic, topic_pages)
    context = build_context(pages, numbers)

    if not context.strip():
        raise ValueError("В выбранной теме нет текста для создания вопросов.")

    known = list(existing or [])
    plan = level_plan(count, level)

    with ThreadPoolExecutor(max_workers=min(2, len(plan))) as pool:
        futures = [
            pool.submit(
                generate_for_level,
                context,
                topic,
                value,
                amount + 1 if amount > 1 else amount,
                question_type,
                known,
            )
            for value, amount in plan
        ]
        batches = [future.result() for future in futures]

    questions: List[dict] = []
    skipped = 0

    for (value, amount), batch in zip(plan, batches):
        quota = dict(zip(("test", "open"), type_plan(amount, question_type)))
        chosen: List[dict] = []
        rest: List[dict] = []

        for question in batch:
            if is_duplicate(question["question"], known):
                skipped += 1
                continue

            if quota[question["question_type"]] > 0:
                quota[question["question_type"]] -= 1
                known.append(question["question"])
                chosen.append(question)
            else:
                rest.append(question)

        for question in rest:
            if len(chosen) >= amount:
                break

            known.append(question["question"])
            chosen.append(question)

        questions.extend(chosen[:amount])

    if not questions:
        raise AIError("Модель не смогла создать подходящие вопросы. Попробуй ещё раз.")

    return {"questions": questions, "context": context, "skipped_duplicates": skipped}


def review_questions(context: str, topic: str, questions: List[dict]) -> List[dict]:
    if not questions:
        return questions

    payload = [
        {
            "index": index,
            "level": question["level"],
            "level_name": LEVELS[question["level"]][0],
            "level_description": LEVELS[question["level"]][1],
            "type": question["question_type"],
            "question": question["question"],
            "options": question["options"],
            "correct_answer": question["correct_answer"],
        }
        for index, question in enumerate(questions)
    ]

    data = ask_json(
        REVIEW_SYSTEM,
        f"Тема: {topic or 'весь материал'}\n"
        "Для каждого вопроса проверь:\n"
        "1) topic_match - вопрос относится к теме и к материалу;\n"
        "2) answer_correct - correct_answer верный и подтверждается "
        "материалом (для тестов правильный ровно один вариант);\n"
        "3) level_fits - сложность соответствует заявленному уровню.\n"
        "В comment напиши коротко, что не так (пустая строка, если всё "
        "хорошо).\n"
        'Формат: {"reviews": [{"index": 0, "topic_match": true, '
        '"answer_correct": true, "level_fits": true, "comment": ""}]}\n\n'
        f"Вопросы:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"Материал:\n{context}",
    )

    reviews = {
        item.get("index"): item
        for item in data.get("reviews", [])
        if isinstance(item, dict)
    }

    for index, question in enumerate(questions):
        review = reviews.get(index)

        if review is None:
            question["quality"] = "unchecked"
            question["quality_note"] = ""
            continue

        problems = []

        if not review.get("topic_match"):
            problems.append("не по теме")

        if not review.get("answer_correct"):
            problems.append("ответ сомнителен")

        if not review.get("level_fits"):
            problems.append("уровень не соответствует")

        comment = str(review.get("comment", "")).strip()
        question["quality"] = "warn" if problems else "ok"
        question["quality_note"] = "; ".join(
            problems + ([comment] if comment and problems else [])
        )

    return questions
