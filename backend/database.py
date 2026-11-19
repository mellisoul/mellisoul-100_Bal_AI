import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "100_bal_ai.db"


def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def add_column(conn, table: str, name: str, definition: str):
    columns = [row["name"] for row in conn.execute(f"PRAGMA table_info({table})")]
    if name not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")


def init_db():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS materials (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                filename TEXT NOT NULL,
                content TEXT NOT NULL,
                file_type TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                material_id INTEGER,
                question TEXT NOT NULL,
                options TEXT,
                correct_answer TEXT,
                explanation TEXT,
                difficulty TEXT DEFAULT 'medium',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (material_id)
                    REFERENCES materials(id)
                    ON DELETE CASCADE
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS test_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                material_id INTEGER,
                total_questions INTEGER NOT NULL,
                correct_answers INTEGER NOT NULL,
                score REAL NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (material_id)
                    REFERENCES materials(id)
                    ON DELETE SET NULL
            )
        """)

        add_column(conn, "materials", "pages", "TEXT")
        add_column(conn, "materials", "topics", "TEXT")
        add_column(conn, "questions", "topic", "TEXT DEFAULT ''")
        add_column(conn, "questions", "question_type", "TEXT DEFAULT 'open'")
        add_column(conn, "questions", "level", "INTEGER DEFAULT 3")
        add_column(conn, "questions", "page", "INTEGER")
        add_column(conn, "questions", "quality", "TEXT DEFAULT 'unchecked'")
        add_column(conn, "questions", "quality_note", "TEXT DEFAULT ''")


if __name__ == "__main__":
    init_db()
    print(f"Database initialized: {DB_PATH}")
