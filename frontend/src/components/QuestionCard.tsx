import { useState } from 'react'
import { api, LEVEL_NAMES, type Question } from '../api'
import LevelDots from './LevelDots'

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
    setDraft({ ...draft, options, correct_answer: wasCorrect ? value : draft.correct_answer })
  }

  if (editing) {
    return (
      <article className="card card-editing">
        <div className="field">
          <label htmlFor={`q-${question.id}`}>Вопрос</label>
          <textarea
            id={`q-${question.id}`}
            rows={3}
            value={draft.question}
            onChange={(e) => setDraft({ ...draft, question: e.target.value })}
          />
        </div>

        {draft.question_type === 'test' ? (
          <fieldset className="field">
            <legend>Варианты — отметь правильный</legend>
            <div className="option-edit-list">
              {draft.options.map((option, index) => (
                <label className="option-edit" key={index}>
                  <input
                    type="radio"
                    name={`correct-${question.id}`}
                    checked={option === draft.correct_answer}
                    onChange={() => setDraft({ ...draft, correct_answer: option })}
                  />
                  <span className="bubble">{'ABCD'[index]}</span>
                  <input value={option} onChange={(e) => setOption(index, e.target.value)} />
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <div className="field">
            <label htmlFor={`a-${question.id}`}>Правильный ответ</label>
            <textarea
              id={`a-${question.id}`}
              rows={4}
              value={draft.correct_answer}
              onChange={(e) => setDraft({ ...draft, correct_answer: e.target.value })}
            />
          </div>
        )}

        <div className="field">
          <label htmlFor={`e-${question.id}`}>Объяснение</label>
          <textarea
            id={`e-${question.id}`}
            rows={2}
            value={draft.explanation}
            onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
          />
        </div>

        <div className="field">
          <label htmlFor={`l-${question.id}`}>Уровень</label>
          <select
            id={`l-${question.id}`}
            value={draft.level}
            onChange={(e) => setDraft({ ...draft, level: Number(e.target.value) })}
          >
            {[1, 2, 3, 4, 5].map((level) => (
              <option key={level} value={level}>
                {level} — {LEVEL_NAMES[level]}
              </option>
            ))}
          </select>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="row-actions">
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Сохраняю…' : 'Сохранить'}
          </button>
          <button className="btn btn-ghost" onClick={() => setEditing(false)}>
            Отмена
          </button>
        </div>
      </article>
    )
  }

  return (
    <article className={`card ${question.quality === 'warn' ? 'card-warn' : ''}`}>
      <div className="card-meta">
        <LevelDots level={question.level} />
        <span>{question.question_type === 'test' ? 'Тест' : 'Открытый'}</span>
        {question.topic && <span>{question.topic}</span>}
        {question.page && <span>стр. {question.page}</span>}
        {question.quality === 'ok' && <span className="mark mark-ok">Проверен AI</span>}
        {question.quality === 'warn' && <span className="mark mark-warn">Проверь вручную</span>}
      </div>

      <p className="card-question">{question.question}</p>

      {question.question_type === 'test' && (
        <ul className="bubbles">
          {question.options.map((option, index) => (
            <li
              key={index}
              className={revealed && option === question.correct_answer ? 'is-correct' : ''}
            >
              <span className="bubble">{'ABCD'[index]}</span>
              <span>{option}</span>
            </li>
          ))}
        </ul>
      )}

      {question.quality === 'warn' && question.quality_note && (
        <p className="card-note">{question.quality_note}</p>
      )}

      {revealed && (
        <div className="answer">
          {question.question_type === 'open' && (
            <p>
              <b>Ответ.</b> {question.correct_answer}
            </p>
          )}
          {question.explanation && (
            <p>
              <b>Почему.</b> {question.explanation}
            </p>
          )}
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card-actions">
        <button className="btn btn-ghost btn-small" onClick={() => setRevealed(!revealed)}>
          {revealed ? 'Скрыть ответ' : 'Показать ответ'}
        </button>
        <button className="btn btn-quiet btn-small" onClick={startEdit}>
          Изменить
        </button>
        <button className="btn btn-quiet btn-small btn-danger" onClick={remove}>
          Удалить
        </button>
      </div>
    </article>
  )
}
