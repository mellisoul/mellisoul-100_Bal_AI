import { useState } from 'react'
import { api, type Material, type Question } from '../api'
import LevelDots from '../components/LevelDots'

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
  const [answers, setAnswers] = useState<boolean[]>([])
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState('')

  const correct = answers.filter(Boolean).length

  const start = async (id: number) => {
    setError('')

    try {
      const tests = (await api.questions(id)).filter((q) => q.question_type === 'test')

      if (tests.length === 0) {
        setError('В этом материале нет тестовых вопросов. Создай их в разделе «Вопросы».')
        return
      }

      setMaterialId(id)
      setQuestions(tests)
      setIndex(0)
      setPicked(null)
      setAnswers([])
      setFinished(false)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const pick = (option: string) => {
    if (picked !== null) return
    setPicked(option)
    setAnswers((current) => [...current, option === questions[index].correct_answer])
  }

  const next = async () => {
    if (index + 1 < questions.length) {
      setIndex(index + 1)
      setPicked(null)
      return
    }

    setFinished(true)

    try {
      await api.saveResult(materialId as number, questions.length, correct)
      await onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (materialId === null) {
    const ready = materials.filter((m) => m.question_count > 0)

    return (
      <>
        <header className="page-head">
          <h1>Тренировка</h1>
          <p>Тест из тестовых вопросов выбранного материала. Результат сохранится в «Прогрессе».</p>
        </header>

        {error && <div className="alert alert-error">{error}</div>}

        {ready.length === 0 ? (
          <>
            <p className="empty">Пока не из чего составить тест — сначала создай вопросы.</p>
            <button className="btn btn-primary btn-large" onClick={goToGenerate}>
              Создать вопросы
            </button>
          </>
        ) : (
          <ul className="shelf">
            {ready.map((material) => (
              <li className="book" key={material.id}>
                <div className="book-spine" data-type={material.file_type.toUpperCase()} />
                <div className="book-body">
                  <div className="book-head">
                    <div>
                      <h2>{material.title}</h2>
                      <p>Вопросов в банке: {material.question_count}</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => start(material.id)}>
                      Начать тест
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </>
    )
  }

  if (finished) {
    const percent = Math.round((correct / questions.length) * 100)

    return (
      <section className="sheet result">
        <div className="result-score">
          <strong>{percent}</strong>
          <span>из 100</span>
        </div>
        <div className="result-text">
          <h1>
            {correct} из {questions.length} правильно
          </h1>
          <p>Результат сохранён в разделе «Прогресс».</p>
          <div className="answer-strip" aria-label="Ответы по вопросам">
            {answers.map((ok, i) => (
              <i key={i} className={ok ? 'ok' : 'bad'} title={`Вопрос ${i + 1}`} />
            ))}
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="row-actions">
            <button className="btn btn-primary" onClick={() => start(materialId)}>
              Пройти ещё раз
            </button>
            <button className="btn btn-ghost" onClick={() => setMaterialId(null)}>
              Выбрать другой материал
            </button>
          </div>
        </div>
      </section>
    )
  }

  const current = questions[index]

  return (
    <section className="exam">
      <div className="exam-progress">
        <span>
          Вопрос {index + 1} из {questions.length}
        </span>
        <div className="exam-track">
          <div style={{ width: `${(index / questions.length) * 100}%` }} />
        </div>
        <button className="btn btn-quiet btn-small" onClick={() => setMaterialId(null)}>
          Выйти
        </button>
      </div>

      <div className="sheet exam-sheet">
        <div className="card-meta">
          <LevelDots level={current.level} />
          {current.topic && <span>{current.topic}</span>}
        </div>

        <h1 className="exam-question">{current.question}</h1>

        <ul className="bubbles bubbles-pick">
          {current.options.map((option, i) => {
            let state = ''

            if (picked !== null) {
              if (option === current.correct_answer) state = 'is-correct'
              else if (option === picked) state = 'is-wrong'
            }

            return (
              <li key={i} className={state}>
                <button disabled={picked !== null} onClick={() => pick(option)}>
                  <span className="bubble">{'ABCD'[i]}</span>
                  <span>{option}</span>
                </button>
              </li>
            )
          })}
        </ul>

        {picked !== null && current.explanation && (
          <div className="answer">
            <p>
              <b>{picked === current.correct_answer ? 'Верно.' : 'Неверно.'}</b> {current.explanation}
            </p>
          </div>
        )}

        <div className="row-actions exam-actions">
          <button className="btn btn-primary btn-large" disabled={picked === null} onClick={next}>
            {index + 1 < questions.length ? 'Следующий вопрос' : 'Завершить тест'}
          </button>
        </div>
      </div>
    </section>
  )
}
