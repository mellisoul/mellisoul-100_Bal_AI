import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { api, LEVEL_NAMES, type Material, type Stats } from './api'
import LevelDots from './components/LevelDots'
import Generate from './pages/Generate'
import Materials from './pages/Materials'
import Training from './pages/Training'

type Page = 'home' | 'materials' | 'generate' | 'training' | 'progress'

const tabs: { id: Page; title: string }[] = [
  { id: 'home', title: 'Главная' },
  { id: 'materials', title: 'Материалы' },
  { id: 'generate', title: 'Вопросы' },
  { id: 'training', title: 'Тренировка' },
  { id: 'progress', title: 'Прогресс' },
]

const sampleOptions = ['def', 'func', 'function', 'lambda']

function App() {
  const [page, setPage] = useState<Page>('home')
  const [materials, setMaterials] = useState<Material[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loadError, setLoadError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [list, summary] = await Promise.all([api.materials(), api.stats()])
      setMaterials(list)
      setStats(summary)
      setLoadError('')
    } catch (e) {
      setLoadError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [page])

  const openGenerate = (id: number | null) => {
    setSelectedId(id)
    setPage('generate')
  }

  const average = stats?.average_score != null ? `${stats.average_score}%` : '—'

  const renderPage = () => {
    switch (page) {
      case 'materials':
        return <Materials materials={materials} onChanged={refresh} onGenerate={openGenerate} />

      case 'generate':
        return (
          <Generate
            materials={materials}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            onChanged={refresh}
            goToMaterials={() => setPage('materials')}
          />
        )

      case 'training':
        return (
          <Training
            materials={materials}
            onChanged={refresh}
            goToGenerate={() => setPage('generate')}
          />
        )

      case 'progress': {
        const max = Math.max(1, ...Object.values(stats?.by_level ?? {}))
        return (
          <>
            <header className="page-head">
              <h1>Прогресс</h1>
              <p>Результаты тестов и то, сколько вопросов накоплено на каждом уровне.</p>
            </header>

            <div className="tally">
              <Tally value={String(stats?.tests_taken ?? 0)} label="тестов пройдено" />
              <Tally value={String(stats?.correct_answers ?? 0)} label="правильных ответов" />
              <Tally value={average} label="средний результат" />
            </div>

            <section className="sheet">
              <div className="sheet-head">
                <h2 className="sheet-title">Банк вопросов по уровням</h2>
                {(stats?.questions ?? 0) > 0 && (
                  <div className="export">
                    <span>Скачать все вопросы</span>
                    <a className="btn btn-ghost btn-small" href="/api/export?format=csv" download>
                      CSV
                    </a>
                    <a className="btn btn-ghost btn-small" href="/api/export?format=json" download>
                      JSON
                    </a>
                  </div>
                )}
              </div>
              <div className="level-table">
                {[1, 2, 3, 4, 5].map((level) => {
                  const value = stats?.by_level[String(level)] ?? 0
                  return (
                    <div className="level-table-row" key={level}>
                      <LevelDots level={level} />
                      <div className="level-bar">
                        <div style={{ width: `${(value / max) * 100}%` }} />
                      </div>
                      <b>{value}</b>
                    </div>
                  )
                })}
              </div>
            </section>
          </>
        )
      }

      default:
        return (
          <>
            <section className="hero">
              <div className="hero-text">
                <h1>Учебник на входе — вопросы на&nbsp;выходе</h1>
                <p>
                  Загрузи PDF или TXT. AI найдёт в нём темы и составит вопросы пяти
                  уровней сложности — с ответами и объяснениями.
                </p>
                <div className="hero-actions">
                  <button className="btn btn-primary btn-large" onClick={() => setPage('materials')}>
                    Загрузить учебник
                  </button>
                  <button
                    className="btn btn-ghost btn-large"
                    onClick={() => openGenerate(materials[0]?.id ?? null)}
                  >
                    Создать вопросы
                  </button>
                </div>
              </div>

              <div className="hero-sample" aria-label="Пример вопроса">
                <div className="sample-sheet">
                  <div className="sample-meta">
                    <span>Python · Функции</span>
                    <LevelDots level={1} />
                  </div>
                  <p className="sample-question">
                    Каким ключевым словом в Python объявляют функцию?
                  </p>
                  <ul className="bubbles">
                    {sampleOptions.map((option, index) => (
                      <li key={option} className={index === 0 ? 'is-correct' : ''}>
                        <span className="bubble">{'ABCD'[index]}</span>
                        <code>{option}</code>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="sample-sheet sample-back" aria-hidden="true" />
              </div>
            </section>

            {loadError && <div className="alert alert-error">{loadError}</div>}

            <div className="tally">
              <Tally value={String(stats?.materials ?? 0)} label="учебных материалов" />
              <Tally value={String(stats?.questions ?? 0)} label="вопросов в банке" />
              <Tally value={String(stats?.tests_taken ?? 0)} label="тестов пройдено" />
              <Tally value={average} label="средний результат" />
            </div>

            <section className="steps">
              <h2>Как это работает</h2>
              <ol>
                <li>
                  <button onClick={() => setPage('materials')}>
                    <b>Загрузи материал</b>
                    <span>PDF с текстом или TXT до 10 МБ. AI выделит основные темы.</span>
                  </button>
                </li>
                <li>
                  <button onClick={() => openGenerate(materials[0]?.id ?? null)}>
                    <b>Выбери тему и уровень</b>
                    <span>
                      От «{LEVEL_NAMES[1].toLowerCase()}» до «{LEVEL_NAMES[5].toLowerCase()}»:
                      тесты и открытые вопросы.
                    </span>
                  </button>
                </li>
                <li>
                  <button onClick={() => setPage('training')}>
                    <b>Проверь себя</b>
                    <span>Пройди тест по своим вопросам и следи за результатом.</span>
                  </button>
                </li>
              </ol>
            </section>
          </>
        )
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <button className="brand" onClick={() => setPage('home')}>
            <span className="brand-mark" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            100 Bal AI
          </button>

          <nav className="tabs" aria-label="Разделы">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={page === tab.id ? 'is-active' : ''}
                aria-current={page === tab.id ? 'page' : undefined}
                onClick={() => setPage(tab.id)}
              >
                {tab.title}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="page">{renderPage()}</main>

      <footer className="footer">100 Bal AI — учебный проект КазНУ, 2026</footer>
    </div>
  )
}

function Tally({ value, label }: { value: string; label: string }) {
  return (
    <div className="tally-item">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

export default App
