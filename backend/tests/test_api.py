import json
import re
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import ai_service
import database
import main

TEXT = "\n".join(
    [
        "Функция в Python определяется ключевым словом def и может возвращать значение.",
        "Аргументы передаются при вызове функции, а параметры указываются в её определении.",
        "Цикл for перебирает элементы последовательности, цикл while работает пока истинно условие.",
        "Класс описывает объект, метод класса получает первым параметром self.",
    ]
    * 40
)


def fake_ask_json(system, user):
    if system == ai_service.TOPICS_SYSTEM:
        numbers = [int(n) for n in re.findall(r"\[Стр\. (\d+)\]", user)]
        return {"topics": [{"name": "Функции", "pages": numbers[:2]}, {"name": "Классы", "pages": numbers[-1:]}]}

    if system == ai_service.GENERATE_SYSTEM:
        amount = int(re.search(r"Нужно вопросов: (\d+)", user).group(1))
        level = int(re.search(r"Уровень сложности: (\d)", user).group(1))
        tests = int(re.search(r"один правильный\) - (\d+)", user).group(1))
        page = int(re.findall(r"\[Стр\. (\d+)\]", user)[0])
        items = []
        for i in range(amount):
            n = f"{level}{i}"
            vocab = ["аргумент", "итератор", "декоратор", "исключение", "словарь", "генератор", "наследование", "рекурсия", "замыкание", "кортеж", "срез", "модуль", "пакет", "файл", "контекст", "переменная", "область", "видимость", "лямбда", "сортировка", "индекс", "множество", "строка", "байты", "поток", "класс", "метод", "свойство", "импорт", "интерпретатор"]
            topic_word = " ".join(vocab[(level * 7 + i * 5 + k * 11) % len(vocab)] for k in range(4))
            if i < tests:
                items.append({"type": "test", "question": f"{topic_word}?", "options": ["a1" + n, "b1" + n, "c1" + n, "d1" + n], "correct_answer": "b1" + n, "explanation": "потому что", "page": page})
            else:
                items.append({"type": "open", "question": f"Опишите: {topic_word}.", "options": [], "correct_answer": "эталон " + n, "explanation": "потому что", "page": 9999})
        return {"questions": items}

    if system == ai_service.REVIEW_SYSTEM:
        data = json.loads(re.search(r"Вопросы:\n(\[.*\])\n", user).group(1))
        return {"reviews": [{"index": q["index"], "topic_match": True, "answer_correct": q["index"] != 0, "level_fits": True, "comment": "эталон не подтверждён"} for q in data]}

    raise AssertionError(system)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "t.db")
    monkeypatch.setattr(ai_service, "ask_json", fake_ask_json)
    with TestClient(main.app) as c:
        yield c


def upload(client):
    r = client.post("/api/materials", files={"file": ("python.txt", TEXT.encode("utf-8"), "text/plain")})
    assert r.status_code == 200, r.text
    return r.json()["material"]["id"]


def test_upload_rejects_bad_type(client):
    r = client.post("/api/materials", files={"file": ("a.docx", b"x", "application/octet-stream")})
    assert r.status_code == 400


def test_upload_and_topics(client):
    mid = upload(client)
    r = client.post(f"/api/materials/{mid}/topics")
    assert r.status_code == 200
    names = [t["name"] for t in r.json()["topics"]]
    assert "Функции" in names
    assert client.get("/api/materials").json()["materials"][0]["topics"]


def test_generate_all_levels_and_review(client):
    mid = upload(client)
    client.post(f"/api/materials/{mid}/topics")
    r = client.post(f"/api/materials/{mid}/generate", json={"topic": "Функции", "count": 10, "level": 0, "question_type": "mixed"})
    assert r.status_code == 200, r.text
    qs = r.json()["questions"]
    assert len(qs) == 10
    assert {q["level"] for q in qs} == {1, 2, 3, 4, 5}
    assert {q["question_type"] for q in qs} == {"test", "open"}
    for q in qs:
        if q["question_type"] == "test":
            assert len(q["options"]) == 4 and q["correct_answer"] in q["options"]
            assert q["page"] is not None
        else:
            assert q["options"] == [] and q["page"] is None
    assert any(q["quality"] == "warn" for q in qs)
    assert any(q["quality"] == "ok" for q in qs)


def test_generate_single_level_and_filter(client):
    mid = upload(client)
    client.post(f"/api/materials/{mid}/generate", json={"count": 3, "level": 4, "question_type": "test"})
    qs = client.get(f"/api/materials/{mid}/questions?level=4").json()["questions"]
    assert len(qs) == 3 and all(q["level"] == 4 and q["question_type"] == "test" for q in qs)
    assert client.get(f"/api/materials/{mid}/questions?level=2").json()["count"] == 0


def test_free_text_topic_not_found(client):
    mid = upload(client)
    r = client.post(f"/api/materials/{mid}/generate", json={"topic": "квантовая хромодинамика", "count": 2})
    assert r.status_code == 400


def test_edit_delete_question(client):
    mid = upload(client)
    q = client.post(f"/api/materials/{mid}/generate", json={"count": 1, "level": 1, "question_type": "test"}).json()["questions"][0]
    r = client.put(f"/api/questions/{q['id']}", json={"question": "Новый текст?"})
    assert r.status_code == 200 and r.json()["question"] == "Новый текст?"
    bad = client.put(f"/api/questions/{q['id']}", json={"correct_answer": "нет такого"})
    assert bad.status_code == 400
    assert client.delete(f"/api/questions/{q['id']}").status_code == 200
    assert client.delete(f"/api/questions/{q['id']}").status_code == 404


def test_no_api_key_returns_503(client, monkeypatch):
    def broken(system, user):
        raise ai_service.AIConfigError("Не задан GEMINI_API_KEY.")

    monkeypatch.setattr(ai_service, "ask_json", broken)
    mid = upload(client)
    r = client.post(f"/api/materials/{mid}/topics")
    assert r.status_code == 503 and "GEMINI_API_KEY" in r.json()["detail"]


def test_get_client_requires_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(ai_service.AIConfigError):
        ai_service.get_client()


def test_stats_and_results(client):
    mid = upload(client)
    client.post(f"/api/materials/{mid}/generate", json={"count": 5, "level": 0, "question_type": "open", "verify": False})
    assert client.post("/api/test-results", json={"material_id": mid, "total_questions": 4, "correct_answers": 3}).json()["score"] == 75.0
    s = client.get("/api/stats").json()
    assert s["materials"] == 1 and s["questions"] == 5 and s["tests_taken"] == 1 and s["average_score"] == 75.0
    assert sum(s["by_level"].values()) == 5


def test_text_pdf_upload_without_ai_key(client, monkeypatch):
    import fitz
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with fitz.open() as document:
        page = document.new_page()
        page.insert_text((72, 72), "Photosynthesis converts light into chemical energy.")
        pdf = document.tobytes()
    response = client.post("/api/materials", files={"file": ("lesson.pdf", pdf, "application/pdf")})
    assert response.status_code == 200, response.text
    material = response.json()["material"]
    assert material["file_type"] == "pdf"
    assert material["topics"] is None
    assert any(item["id"] == material["id"] for item in client.get("/api/materials").json()["materials"])


def test_pdf_without_text_has_clear_error(client):
    import fitz
    with fitz.open() as document:
        document.new_page()
        pdf = document.tobytes()
    response = client.post("/api/materials", files={"file": ("scan.pdf", pdf, "application/pdf")})
    assert response.status_code == 400
    assert "скан" in response.json()["detail"]


def test_only_google_client_is_configured(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-google-key")
    monkeypatch.setenv("OPENAI_API_KEY", "must-not-use")
    with ai_service.get_client() as client:
        assert client.api_key == "test-google-key"
        assert str(client.base_url) == "https://generativelanguage.googleapis.com/v1beta/openai/"
        assert client.max_retries == 0


def test_no_fallback_to_openai(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "old-key")
    with pytest.raises(ai_service.AIConfigError, match="GEMINI_API_KEY"):
        ai_service.get_client()


def test_gemini_json_response(monkeypatch):
    from types import SimpleNamespace
    def create(**kwargs):
        assert kwargs["model"] == "gemini-3.5-flash-lite"
        assert kwargs["response_format"] == {"type": "json_object"}
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{"topics": []}'))])
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    monkeypatch.setattr(ai_service, "get_client", lambda: SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))))
    assert ai_service.ask_json("JSON", "Topics") == {"topics": []}


def test_transient_gemini_failure_retries(monkeypatch):
    from types import SimpleNamespace
    calls = []
    class Unavailable(Exception):
        status_code = 503
    def create(**kwargs):
        calls.append(1)
        if len(calls) < 3:
            raise Unavailable()
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{"ok": true}'))])
    monkeypatch.setattr(ai_service.time, "sleep", lambda seconds: None)
    monkeypatch.setattr(ai_service, "get_client", lambda: SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))))
    assert ai_service.ask_json("JSON", "Test") == {"ok": True}
    assert len(calls) == 3


def test_export_csv_and_json(client):
    mid = upload(client)
    client.post(f"/api/materials/{mid}/generate", json={"count": 5, "level": 0, "question_type": "mixed", "verify": False})
    r = client.get(f"/api/materials/{mid}/export?format=csv")
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    text = r.content.decode("utf-8-sig")
    lines = [line for line in text.splitlines() if line.strip()]
    assert lines[0].startswith("ID;Материал;Тема;Уровень")
    j = client.get("/api/export?format=json").json()
    assert j["count"] == 5 and {q["level"] for q in j["questions"]} == {1, 2, 3, 4, 5}
    assert client.get("/api/export?format=xml").status_code == 400
    assert client.get("/api/materials/999/export").status_code == 404
