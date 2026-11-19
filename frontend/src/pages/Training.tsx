import { useState } from 'react'
import { api, type Material, type Question } from '../api'

type Props = {
  materials: Material[]
  onChanged: () => Promise<void>
  goToGenerate: () => void
}

export default function Training({ materials, onChanged, goToGenerate }: Props) {
  const [materialId, setMaterialId] = useState<number | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [correct, setCorrect] = useState(0)
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState('')

  const start = async (id: number) => {
    setError('')

    try {
      const all = await api.questions(id)
      const tests = all.filter((q) => q.question_type === 'test')

      if (tests.length === 0) {
        setError('В этом материале нет тестовых вопросов. Создай их на странице генерации.')
        return
      }

      setMaterialId(id)
      setQuestions(tests)
      setIndex(0)
      setPicked(null)
      setCorrect(0)
      setFinished(false)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const next = async () => {
    const current = questions[index]
    const gained = picked === current.correct_answer ? 1 : 0
    const total = correct + gained

    if (index + 1 < questions.length) {
      setCorrect(total)
      setIndex(index + 1)
      setPicked(null)
      return
    }

    setCorrect(total)
    setFinished(true)

    try {
      await api.saveResult(materialId as number, questions.length, total)
      await onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (materialId === null) {
    return (
      <section className="content-card">
        <span className="eyebrow">PRACTICE MODE</span>
        <h2>Время тренироваться!</h2>
        <p className="muted">Выбери материал и пройди тест из созданных вопросов.</p>

        {materials.length === 0 && (
          <button className="button button-primary" onClick={goToGenerate}>
            Создать вопросы
          </button>
        )}

        <div className="material-list">
          {materials.map((material) => (
            <article className="material-item" key={material.id}>
              <div className="material-head">
                <div>
                  <strong>{material.title}</strong>
                  <small>вопросов: {material.question_count}</small>
                </div>
                <button className="button button-primary" onClick={() => start(material.id)}>
                  Начать тест
                </button>
              </div>
            </article>
          ))}
        </div>

        {error && <div className="q-error">{error}</div>}
      </section>
    )
  }

  if (finished) {
    const percent = Math.round((correct / questions.length) * 100)

    return (
      <section className="content-card">
        <span className="eyebrow">РЕЗУЛЬТАТ</span>
        <h2>
          {correct} из {questions.length} ({percent}%)
        </h2>
        <p className="muted">Результат сохранён в разделе «Мой прогресс».</p>
        {error && <div className="q-error">{error}</div>}
        <div className="q-actions">
          <button className="button button-primary" onClick={() => start(materialId)}>
            Пройти ещё раз
          </button>
          <button className="button button-light" onClick={() => setMaterialId(null)}>
            Другой материал
          </button>
        </div>
      </section>
    )
  }

  const current = questions[index]

  return (
    <section className="content-card">
      <span className="eyebrow">
        ВОПРОС {index + 1} ИЗ {questions.length}
      </span>
      <h2 className="q-text-large">{current.question}</h2>

      <ul className="q-options q-options-active">
        {current.options.map((option, i) => {
          let state = ''

          if (picked !== null) {
            if (option === current.correct_answer) state = 'correct'
            else if (option === picked) state = 'wrong'
          }

          return (
            <li key={i} className={state}>
              <button disabled={picked !== null} onClick={() => setPicked(option)}>
                <b>{'ABCD'[i]}</b>
                {option}
              </button>
            </li>
          )
        })}
      </ul>

      {picked !== null && current.explanation && (
        <div className="q-answer">
          <p>
            <strong>Объяснение:</strong> {current.explanation}
          </p>
        </div>
      )}

      <div className="q-actions">
        <button className="button button-primary" disabled={picked === null} onClick={next}>
          {index + 1 < questions.length ? 'Дальше →' : 'Завершить'}
        </button>
        <button className="button button-light" onClick={() => setMaterialId(null)}>
          Выйти
        </button>
      </div>
    </section>
  )
}
