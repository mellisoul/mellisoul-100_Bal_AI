import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { api, LEVEL_NAMES, type Material, type Stats } from './api'
import Generate from './pages/Generate'
import Materials from './pages/Materials'
import Training from './pages/Training'

type MenuItem =
  | 'Главная'
  | 'Мои материалы'
  | 'Создать вопросы'
  | 'Тренировка'
  | 'Мой прогресс'
  | 'Настройки'

const menuItems: { title: MenuItem; icon: string }[] = [
  { title: 'Главная', icon: '⌂' },
  { title: 'Мои материалы', icon: '▤' },
  { title: 'Создать вопросы', icon: '✦' },
  { title: 'Тренировка', icon: '▷' },
  { title: 'Мой прогресс', icon: '▥' },
  { title: 'Настройки', icon: '⚙' },
]

function App() {
  const [activePage, setActivePage] = useState<MenuItem>('Главная')
  const [studentName, setStudentName] = useState('Студент')
  const [showProfile, setShowProfile] = useState(false)
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

  const openGenerate = (id: number | null) => {
    setSelectedId(id)
    setActivePage('Создать вопросы')
  }

  const averageText = stats?.average_score != null ? `${stats.average_score}%` : '—'

  const renderPage = () => {
    switch (activePage) {
      case 'Мои материалы':
        return <Materials materials={materials} onChanged={refresh} onGenerate={openGenerate} />

      case 'Создать вопросы':
        return (
          <Generate
            materials={materials}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            onChanged={refresh}
            goToMaterials={() => setActivePage('Мои материалы')}
          />
        )

      case 'Тренировка':
        return (
          <Training
            materials={materials}
            onChanged={refresh}
            goToGenerate={() => setActivePage('Создать вопросы')}
          />
        )

      case 'Мой прогресс':
        return (
          <>
            <div className="section-heading">
              <div>
                <span className="eyebrow">ТВОИ РЕЗУЛЬТАТЫ</span>
                <h2>Мой прогресс</h2>
                <p className="muted">Следи за своим учебным путём.</p>
              </div>
            </div>
            <div className="stats-grid">
              <StatCard icon="✓" label="Пройдено тестов" value={String(stats?.tests_taken ?? 0)} note="Всего попыток" color="green" />
              <StatCard icon="✦" label="Правильные ответы" value={String(stats?.correct_answers ?? 0)} note="За все тесты" color="yellow" />
              <StatCard icon="↗" label="Средний результат" value={averageText} note="По всем тестам" color="blue" />
            </div>
            <section className="content-card">
              <h3>Вопросы по уровням сложности</h3>
              <div className="level-bars">
                {[1, 2, 3, 4, 5].map((level) => {
                  const value = stats?.by_level[String(level)] ?? 0
                  const max = Math.max(1, ...Object.values(stats?.by_level ?? {}))
                  return (
                    <div className="level-row" key={level}>
                      <span>
                        {level} · {LEVEL_NAMES[level]}
                      </span>
                      <div className="level-track">
                        <div className="level-fill" style={{ width: `${(value / max) * 100}%` }} />
                      </div>
                      <b>{value}</b>
                    </div>
                  )
                })}
              </div>
            </section>
          </>
        )

      case 'Настройки':
        return (
          <section className="content-card">
            <span className="eyebrow">PERSONAL SETTINGS</span>
            <h2>Настройки профиля</h2>
            <p className="muted">Настрой приложение под себя.</p>
            <label className="standalone-label">
              Имя студента
              <input value={studentName} onChange={(event) => setStudentName(event.target.value)} />
            </label>
            <div className="notice">Тема приложения: фиолетовый + жёлтый + белый 💜💛</div>
            <button className="button button-primary" onClick={() => setActivePage('Главная')}>
              Сохранить и вернуться
            </button>
          </section>
        )

      default:
        return (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="hero-label">✦ ТВОЯ ПЕРСОНАЛЬНАЯ AI-СТУДИЯ</span>
                <h1>
                  От учебных материалов к <span>100 баллам.</span>
                </h1>
                <p>
                  Загружай конспекты, создавай вопросы, тренируйся и отслеживай
                  свой прогресс в одном удобном месте.
                </p>
                <div className="hero-actions">
                  <button className="button button-yellow" onClick={() => openGenerate(materials[0]?.id ?? null)}>
                    ✦ Создать вопросы
                  </button>
                  <button className="button button-outline" onClick={() => setActivePage('Мои материалы')}>
                    Мои материалы →
                  </button>
                </div>
                <div className="hero-footnote">Без сложных настроек. Всё для учёбы — в одном кабинете.</div>
              </div>
              <div className="score-card">
                <span className="score-caption">ТВОЯ ЦЕЛЬ</span>
                <div className="score-circle">
                  <strong>100</strong>
                  <span>БАЛЛОВ</span>
                </div>
                <p>Маленькие шаги → большие результаты</p>
                <div className="score-star">✦</div>
              </div>
              <div className="hero-decoration decoration-one" />
              <div className="hero-decoration decoration-two" />
            </section>

            {loadError && <div className="q-error">{loadError}</div>}

            <div className="section-heading">
              <div>
                <span className="eyebrow">ТВОЯ СТАТИСТИКА</span>
                <h2>Всё под контролем</h2>
                <p className="muted">Твои результаты в одном месте.</p>
              </div>
              <button className="text-button" onClick={() => setActivePage('Мой прогресс')}>
                Подробная статистика →
              </button>
            </div>

            <div className="stats-grid">
              <StatCard icon="▤" label="Материалы" value={String(stats?.materials ?? 0)} note="Загружено документов" color="purple" />
              <StatCard icon="✦" label="Банк вопросов" value={String(stats?.questions ?? 0)} note="Создано AI" color="yellow" />
              <StatCard icon="✓" label="Пройдено тестов" value={String(stats?.tests_taken ?? 0)} note="Начни тренировку" color="green" />
              <StatCard icon="↗" label="Средний результат" value={averageText} note="По всем тестам" color="blue" />
            </div>

            <div className="dashboard-grid">
              <section className="content-card">
                <div className="card-heading">
                  <div>
                    <h3>Быстрый старт</h3>
                    <p className="muted">Выбери, с чего начнём.</p>
                  </div>
                  <span className="mini-icon">✦</span>
                </div>
                <button className="action-row" onClick={() => setActivePage('Мои материалы')}>
                  <span className="action-icon purple">▤</span>
                  <span><strong>Добавить материал</strong><small>PDF или TXT</small></span>
                  <b>→</b>
                </button>
                <button className="action-row" onClick={() => openGenerate(materials[0]?.id ?? null)}>
                  <span className="action-icon yellow">✦</span>
                  <span><strong>Создать вопросы</strong><small>Пять уровней сложности</small></span>
                  <b>→</b>
                </button>
                <button className="action-row" onClick={() => setActivePage('Тренировка')}>
                  <span className="action-icon green">▷</span>
                  <span><strong>Начать тренировку</strong><small>Проверь свои знания</small></span>
                  <b>→</b>
                </button>
              </section>

              <section className="content-card goal-card">
                <span className="eyebrow">ТВОЯ МИССИЯ</span>
                <div className="goal-illustration">100<span>✦</span></div>
                <h3>Стань увереннее в знаниях</h3>
                <p className="muted">Учись в своём темпе, находи пробелы и возвращайся к сложным темам.</p>
                <button className="button button-primary full-width" onClick={() => setActivePage('Тренировка')}>
                  Начать путь →
                </button>
              </section>
            </div>
          </>
        )
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setActivePage('Главная')}>
          <span className="brand-mark">✦</span>
          <span className="brand-text">
            <strong>100 Bal AI</strong>
            <small>LEARN SMARTER</small>
          </span>
        </button>

        <div className="profile-card">
          <div className="avatar">{(studentName.trim()[0] || 'C').toUpperCase()}</div>
          <div><strong>{studentName || 'Студент'}</strong><small>Мой учебный кабинет</small></div>
        </div>

        <div className="nav-label">ОБУЧЕНИЕ</div>
        <nav className="navigation">
          {menuItems.slice(0, 4).map((item) => (
            <button key={item.title} className={`nav-item ${activePage === item.title ? 'active' : ''}`} onClick={() => setActivePage(item.title)}>
              <span>{item.icon}</span>{item.title}
              {item.title === 'Создать вопросы' && <small className="ai-tag">AI</small>}
            </button>
          ))}
        </nav>

        <div className="nav-label">РЕЗУЛЬТАТЫ</div>
        <nav className="navigation">
          {menuItems.slice(4).map((item) => (
            <button key={item.title} className={`nav-item ${activePage === item.title ? 'active' : ''}`} onClick={() => setActivePage(item.title)}>
              <span>{item.icon}</span>{item.title}
            </button>
          ))}
        </nav>

        <div className="sidebar-goal">
          <strong>✦ Твоя цель — 100 баллов</strong>
          <p>Каждый вопрос приближает тебя к цели.</p>
        </div>
        <div className="sidebar-footer">100 Bal AI · Учись с умом © 2026</div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>100 Bal AI</span><b>/</b><strong>{activePage}</strong></div>
          <div className="topbar-right">
            <button className="icon-button" title="Быстрый переход" onClick={() => openGenerate(selectedId)}>✦</button>
            <button className="user-button" onClick={() => setShowProfile(!showProfile)}>
              <span className="user-avatar">{(studentName.trim()[0] || 'C').toUpperCase()}</span>
              <span><strong>{studentName || 'Студент'}</strong><small>Личный кабинет</small></span>
            </button>
            {showProfile && <div className="profile-popover"><strong>{studentName || 'Студент'}</strong><button onClick={() => { setActivePage('Настройки'); setShowProfile(false) }}>Настройки профиля →</button></div>}
          </div>
        </header>

        <div className="page-content">{renderPage()}</div>
      </main>
    </div>
  )
}

function StatCard({ icon, label, value, note, color }: { icon: string; label: string; value: string; note?: string; color: string }) {
  return (
    <section className="stat-card">
      <div className={`stat-icon ${color}`}>{icon}</div>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <small className="stat-note">{note || 'Твоя статистика появится здесь'}</small>
    </section>
  )
}

export default App
