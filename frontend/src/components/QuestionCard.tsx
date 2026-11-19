import { useState } from 'react'
import { api, LEVEL_NAMES, type Question } from '../api'

type Props = {
  question: Question
  onChange: (question: Question) => void
  onDelete: (id: number) => void
}

export default function QuestionCard({ question, onChange, onDelete }: Props) {
  const [revealed, setRevealed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(question)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const startEdit = () => {
    setDraft(question)
    setError('')
    setEditing(true)
  }

  const save = async () => {
    setBusy(true)
    setError('')

    try {
      const updated = await api.updateQuestion(question.id, {
        question: draft.question,
        options: draft.options,
        correct_answer: draft.correct_answer,
        explanation: draft.explanation,
        level: draft.level,
      })
      onChange(updated)
      setEditing(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!window.confirm('Удалить этот вопрос?')) return

    try {
      await api.deleteQuestion(question.id)
      onDelete(question.id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const setOption = (index: number, value: string) => {
    const options = [...draft.options]
    const wasCorrect = options[index] === draft.correct_answer
    options[index] = value
    setDraft({
      ...draft,
      options,
      correct_answer: wasCorrect ? value : draft.correct_answer,
    })
  }

  if (editing) {
    return (
      <article className="q-card q-editing">
        <label className="q-field">
          Вопрос
          <textarea
            rows={3}
            value={draft.question}
            onChange={(e) => setDraft({ ...draft, question: e.target.value })}
          />
        </label>

        {draft.question_type === 'test' ? (
          <div className="q-field">
            Варианты (отметь правильный)
            {draft.options.map((option, index) => (
              <div className="q-option-edit" key={index}>
                <input
                  type="radio"
                  name={`correct-${question.id}`}
                  checked={option === draft.correct_answer}
                  onChange={() => setDraft({ ...draft, correct_answer: option })}
                />
                <input value={option} onChange={(e) => setOption(index, e.target.value)} />
              </div>
            ))}
          </div>
        ) : (
          <label className="q-field">
            Правильный ответ
            <textarea
              rows={4}
              value={draft.correct_answer}
              onChange={(e) => setDraft({ ...draft, correct_answer: e.target.value })}
            />
          </label>
        )}

        <label className="q-field">
          Объяснение
          <textarea
            rows={2}
            value={draft.explanation}
            onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
          />
        </label>

        <label className="q-field">
          Уровень
          <select
            value={draft.level}
            onChange={(e) => setDraft({ ...draft, level: Number(e.target.value) })}
          >
            {[1, 2, 3, 4, 5].map((level) => (
              <option key={level} value={level}>
                {level} — {LEVEL_NAMES[level]}
              </option>
            ))}
          </select>
        </label>

        {error && <div className="q-error">{error}</div>}

        <div className="q-actions">
          <button className="button button-primary" onClick={save} disabled={busy}>
            {busy ? 'Сохраняю…' : 'Сохранить'}
          </button>
          <button className="button button-light" onClick={() => setEditing(false)}>
            Отмена
          </button>
        </div>
      </article>
    )
  }

  return (
    <article className="q-card">
      <div className="q-meta">
        <span className={`q-badge level-${question.level}`}>
          {question.level} · {LEVEL_NAMES[question.level]}
        </span>
        <span className="q-badge neutral">
          {question.question_type === 'test' ? 'Тест' : 'Открытый'}
        </span>
        <span className="q-badge neutral">{question.topic}</span>
        {question.page && <span className="q-badge neutral">стр. {question.page}</span>}
        {question.quality === 'ok' && <span className="q-badge ok">✓ проверен</span>}
        {question.quality === 'warn' && (
          <span className="q-badge warn" title={question.quality_note}>
            ⚠ проверь
          </span>
        )}
      </div>

      <p className="q-text">{question.question}</p>

      {question.question_type === 'test' && (
        <ul className="q-options">
          {question.options.map((option, index) => (
            <li
              key={index}
              className={revealed && option === question.correct_answer ? 'correct' : ''}
            >
              <b>{'ABCD'[index]}</b>
              {option}
            </li>
          ))}
        </ul>
      )}

      {question.quality === 'warn' && question.quality_note && (
        <div className="q-note warn">{question.quality_note}</div>
      )}

      {revealed && (
        <div className="q-answer">
          {question.question_type === 'open' && (
            <p>
              <strong>Ответ:</strong> {question.correct_answer}
            </p>
          )}
          {question.explanation && (
            <p>
              <strong>Объяснение:</strong> {question.explanation}
            </p>
          )}
        </div>
      )}

      {error && <div className="q-error">{error}</div>}

      <div className="q-actions">
        <button className="button button-light" onClick={() => setRevealed(!revealed)}>
          {revealed ? 'Скрыть ответ' : 'Показать ответ'}
        </button>
        <button className="button button-light" onClick={startEdit}>
          Изменить
        </button>
        <button className="button button-danger" onClick={remove}>
          Удалить
        </button>
      </div>
    </article>
  )
}
