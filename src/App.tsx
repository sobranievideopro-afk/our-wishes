import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  Bell, BellRing, Building2, CalendarDays, Camera, Car, Check, CheckCircle2, ChevronLeft,
  CircleUserRound, Compass, ExternalLink, Filter, Flower2, Gem, Gift, Heart,
  HeartHandshake, House, Image as ImageIcon, Link2, LoaderCircle, MapPin,
  LayoutGrid, MessageCircle, MoreHorizontal, Paperclip, Plane, Plus, RectangleHorizontal, Search, Send,
  Settings, Share2, Shuffle, SlidersHorizontal, Sparkles, Star, TreePine,
  Upload, UserRound, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { categories } from './data'
import { CalendarView } from './CalendarView'
import { fileToDataUrl, formatPrice, formatShortDate, importFromLink, isDemoMode, loadDemoData, saveDemoData, supabase, uid } from './lib'
import {
  authenticateCloud, createCloudCouple, deleteCloudEvent, fetchCloudData, insertCloudComment, insertCloudEvent, insertCloudMessage, insertCloudWish,
  joinCloudCouple, linkCloudAccount, restoreProfile, setCloudCompleted, setCloudLike, setCloudMessageLike, setCloudReservation,
  signOutCloud, subscribeToCloud, type AuthMode, type CloudProfile,
} from './cloud'
import type { AppData, CalendarEvent, CategoryId, ChatMessage, Role, Tab, Wish } from './types'

const iconMap: Record<string, LucideIcon> = {
  Gift, HeartHandshake, TreePine, Flower2, MapPin, Plane, Car, House, Building2, Gem,
}

const navItems: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'wishes', label: 'Желания', icon: Heart },
  { id: 'moodboard', label: 'Карта', icon: Sparkles },
  { id: 'calendar', label: 'Календарь', icon: CalendarDays },
  { id: 'chat', label: 'Чат', icon: MessageCircle },
  { id: 'done', label: 'Сбылось', icon: CheckCircle2 },
]

type Sort = 'new' | 'stars' | 'cheap' | 'expensive'

function App() {
  const [role, setRoleState] = useState<Role | null>(() => isDemoMode ? localStorage.getItem('our-wishes-role') as Role | null : null)
  const [data, setData] = useState<AppData>(() => isDemoMode ? loadDemoData() : { wishes: [], comments: [], messages: [], events: [] })
  const [cloudProfile, setCloudProfile] = useState<CloudProfile | null>(null)
  const [cloudState, setCloudState] = useState<'checking' | 'welcome' | 'auth' | 'joining' | 'ready'>(() => isDemoMode ? 'ready' : 'checking')
  const [pendingRole, setPendingRole] = useState<Role>('wife')
  const [cloudError, setCloudError] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('wishes')
  const [selectedWishId, setSelectedWishId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => { if (isDemoMode) saveDemoData(data) }, [data])
  useEffect(() => {
    if (isDemoMode) return
    restoreProfile().then((profile) => {
      if (profile) { setCloudProfile(profile); setRoleState(profile.role); setCloudState('ready') }
      else setCloudState('welcome')
    }).catch(() => setCloudState('welcome'))
  }, [])
  useEffect(() => {
    if (!cloudProfile) return
    let active = true
    const refresh = () => fetchCloudData(cloudProfile).then((next) => { if (active) setData(next) }).catch(() => setCloudError('Не удалось синхронизировать данные'))
    refresh()
    const channel = subscribeToCloud(cloudProfile, refresh)
    return () => { active = false; if (supabase) void supabase.removeChannel(channel) }
  }, [cloudProfile])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  async function setRole(next: Role | null) {
    if (isDemoMode) {
      if (next) localStorage.setItem('our-wishes-role', next)
      else localStorage.removeItem('our-wishes-role')
      setRoleState(next)
      return
    }
    if (!next) {
      await signOutCloud()
      setRoleState(null); setCloudProfile(null); setCloudState('welcome'); setData({ wishes: [], comments: [], messages: [], events: [] })
      return
    }
    try {
      setCloudError(''); setCloudState('checking')
      const profile = await createCloudCouple(next)
      if (profile === 'join-required') { setRoleState('husband'); setCloudState('joining'); return }
      setCloudProfile(profile); setRoleState(profile.role); setCloudState('ready')
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : 'Не удалось войти')
      setCloudState('welcome')
    }
  }

  function chooseRole(next: Role) {
    if (isDemoMode) { void setRole(next); return }
    setPendingRole(next)
    setCloudError('')
    setCloudState('auth')
  }

  async function authenticate(email: string, password: string, mode: AuthMode) {
    try {
      setCloudError(''); setCloudState('checking')
      const result = await authenticateCloud(email, password, pendingRole, mode)
      if (result === 'confirm-required') {
        setCloudError('Подтвердите адрес по ссылке из письма, затем войдите.')
        setCloudState('auth')
        return
      }
      if (result === 'join-required') { setRoleState('husband'); setCloudState('joining'); return }
      setCloudProfile(result); setRoleState(result.role); setCloudState('ready')
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : 'Не удалось войти')
      setCloudState('auth')
    }
  }

  async function protectAccount(email: string, password: string) {
    try {
      const account = await linkCloudAccount(email, password)
      setCloudProfile((current) => current ? { ...current, ...account } : current)
      setToast(account.anonymous ? 'Подтвердите email по ссылке из письма' : 'Кабинет защищён email и паролем')
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Не удалось сохранить аккаунт')
    }
  }

  async function joinPair(code: string) {
    try {
      setCloudError(''); setCloudState('checking')
      const profile = await joinCloudCouple(code)
      setCloudProfile(profile); setRoleState(profile.role); setCloudState('ready')
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : 'Проверьте код пары')
      setCloudState('joining')
    }
  }

  async function addWish(wish: Wish) {
    setData((current) => ({ ...current, wishes: [wish, ...current.wishes] }))
    setShowAdd(false)
    setActiveTab('wishes')
    setToast('Желание добавлено ✨')
    if (cloudProfile) {
      try { await insertCloudWish(wish, cloudProfile) }
      catch { setData((current) => ({ ...current, wishes: current.wishes.filter((item) => item.id !== wish.id) })); setToast('Не удалось сохранить желание') }
    }
  }

  function patchWish(id: string, patch: Partial<Wish>) {
    setData((current) => ({
      ...current,
      wishes: current.wishes.map((wish) => wish.id === id ? { ...wish, ...patch } : wish),
    }))
    if (cloudProfile) {
      const operation = patch.likedByHusband != null ? setCloudLike(id, patch.likedByHusband, cloudProfile)
        : patch.reservedByHusband != null ? setCloudReservation(id, patch.reservedByHusband, cloudProfile)
        : Object.prototype.hasOwnProperty.call(patch, 'completedAt') ? setCloudCompleted(id, Boolean(patch.completedAt))
        : Promise.resolve()
      operation.catch(() => { setToast('Не удалось синхронизировать изменение'); fetchCloudData(cloudProfile).then(setData) })
    }
  }

  function addComment(wishId: string, text: string) {
    if (!role || !text.trim()) return
    const comment = { id: uid('comment'), wishId, author: role, text: text.trim(), createdAt: new Date().toISOString() }
    setData((current) => ({ ...current, comments: [...current.comments, comment] }))
    if (cloudProfile) insertCloudComment(comment, cloudProfile).catch(() => setToast('Комментарий не отправлен. Проверьте интернет.'))
  }

  function addMessage(message: Omit<ChatMessage, 'id' | 'createdAt' | 'read'>) {
    const next: ChatMessage = { ...message, id: uid('message'), createdAt: new Date().toISOString(), read: false }
    setData((current) => ({ ...current, messages: [...current.messages, next] }))
    if (cloudProfile) insertCloudMessage(next, cloudProfile).catch(() => {
      setData((current) => ({ ...current, messages: current.messages.filter((item) => item.id !== next.id) }))
      setToast('Сообщение не отправлено. Проверьте интернет.')
    })
  }

  function toggleMessageLike(id: string) {
    const message = data.messages.find((item) => item.id === id)
    if (!message) return
    const liked = !message.likedByMe
    setData((current) => ({ ...current, messages: current.messages.map((item) => item.id === id ? { ...item, likedByMe: liked, likeCount: Math.max(0, (item.likeCount || 0) + (liked ? 1 : -1)) } : item) }))
    if (cloudProfile) setCloudMessageLike(id, liked, cloudProfile).catch(() => { setToast('Не удалось поставить лайк'); fetchCloudData(cloudProfile).then(setData) })
  }

  function addEvent(event: CalendarEvent) {
    setData((current) => ({ ...current, events: [...current.events, event] }))
    setToast('Событие добавлено в календарь')
    if (cloudProfile) insertCloudEvent(event, cloudProfile).catch(() => { setData((current) => ({ ...current, events: current.events.filter((item) => item.id !== event.id) })); setToast('Не удалось сохранить событие') })
  }

  function deleteEvent(id: string) {
    setData((current) => ({ ...current, events: current.events.filter((item) => item.id !== id) }))
    if (cloudProfile) deleteCloudEvent(id).catch(() => { setToast('Не удалось удалить событие'); fetchCloudData(cloudProfile).then(setData) })
  }

  if (!isDemoMode && cloudState === 'checking') return <CloudLoading />
  if (!isDemoMode && cloudState === 'auth') return <AuthScreen role={pendingRole} error={cloudError} onSubmit={authenticate} onAnonymous={() => setRole(pendingRole)} onBack={() => { setCloudError(''); setCloudState('welcome') }} />
  if (!isDemoMode && cloudState === 'joining') return <JoinCouple error={cloudError} onJoin={joinPair} onBack={() => setRole(null)} />
  if (!role) return <Welcome onChoose={chooseRole} error={cloudError} />

  const selectedWish = data.wishes.find((wish) => wish.id === selectedWishId)
  const unread = data.messages.filter((message) => message.author !== role && !message.read).length
  const completedCount = data.wishes.filter((wish) => wish.completedAt).length

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" onClick={() => setActiveTab('wishes')} role="button" tabIndex={0}>
          <div className="brand-mark"><Heart size={18} fill="currentColor" /></div>
          <div><strong>Наши желания</strong><span>только для вас двоих</span></div>
        </div>
        <div className="top-actions">
          {isDemoMode && <span className="demo-badge">Демо</span>}
          <button className="icon-button" aria-label="Уведомления" onClick={() => setActiveTab('settings')}><Bell size={20} /></button>
          <button className="avatar" aria-label="Профиль" onClick={() => setActiveTab('settings')}>{role === 'wife' ? 'А' : 'С'}</button>
        </div>
      </header>

      <main className="main-content">
        {activeTab === 'wishes' && <WishesView data={data} role={role} onOpen={setSelectedWishId} onAdd={() => setShowAdd(true)} onPatch={patchWish} />}
        {activeTab === 'moodboard' && <MoodboardView wishes={data.wishes.filter((wish) => !wish.completedAt)} onOpen={setSelectedWishId} />}
        {activeTab === 'calendar' && <CalendarView events={data.events} role={role} onAdd={addEvent} onDelete={deleteEvent} />}
        {activeTab === 'done' && <DoneView wishes={data.wishes.filter((wish) => wish.completedAt)} onOpen={setSelectedWishId} />}
        {activeTab === 'chat' && <ChatView role={role} messages={data.messages} onSend={addMessage} onLike={toggleMessageLike} onRead={() => setData((current) => ({ ...current, messages: current.messages.map((m) => ({ ...m, read: true })) }))} />}
        {activeTab === 'settings' && <SettingsView role={role} profile={cloudProfile} onProtect={protectAccount} onSwitch={() => setRole(null)} />}
      </main>

      <nav className="bottom-nav" aria-label="Основная навигация">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <button key={item.id} className={activeTab === item.id ? 'active' : ''} onClick={() => setActiveTab(item.id)}>
              <span className="nav-icon"><Icon size={21} strokeWidth={activeTab === item.id ? 2.4 : 1.8} />{item.id === 'chat' && unread > 0 && <i>{unread}</i>}{item.id === 'done' && completedCount > 0 && <i className="done-count">{completedCount}</i>}</span>
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {role === 'wife' && ['wishes', 'moodboard', 'done'].includes(activeTab) && (
        <button className="floating-add" aria-label="Добавить желание" onClick={() => setShowAdd(true)}><Plus size={22} /><span>Добавить</span></button>
      )}

      {showAdd && <AddWishModal onClose={() => setShowAdd(false)} onAdd={addWish} />}
      {selectedWish && (
        <WishDetail
          wish={selectedWish}
          role={role}
          comments={data.comments.filter((comment) => comment.wishId === selectedWish.id)}
          onClose={() => setSelectedWishId(null)}
          onPatch={(patch) => patchWish(selectedWish.id, patch)}
          onComment={(text) => addComment(selectedWish.id, text)}
          onToast={setToast}
        />
      )}
      {toast && <div className="toast"><Check size={18} />{toast}</div>}
    </div>
  )
}

function Welcome({ onChoose, error }: { onChoose: (role: Role) => void; error?: string }) {
  return (
    <div className="welcome-screen">
      <div className="welcome-orb orb-one" /><div className="welcome-orb orb-two" />
      <div className="welcome-content">
        <div className="welcome-icon"><Heart fill="currentColor" size={42} /></div>
        <p className="eyebrow">Личное пространство для двоих</p>
        <h1>Мечтайте.<br />Замечайте.<br /><em>Исполняйте.</em></h1>
        <p className="welcome-copy">Все желания, тёплые слова и маленькие планы — в одном красивом месте.</p>
        <div className="role-picker">
          <p>Кто сейчас открывает приложение?</p>
          <button onClick={() => onChoose('wife')}><span className="role-avatar wife">А</span><span><strong>Алла</strong><small>добавляю желания</small></span><ChevronLeft className="role-arrow" size={19} /></button>
          <button onClick={() => onChoose('husband')}><span className="role-avatar husband">С</span><span><strong>Стас</strong><small>исполняю желания</small></span><ChevronLeft className="role-arrow" size={19} /></button>
          {error && <p className="form-error">{error}</p>}
        </div>
        <small className="privacy-note"><Heart size={12} fill="currentColor" /> Ваш список видите только вы двое</small>
      </div>
    </div>
  )
}

function CloudLoading() {
  return <div className="cloud-screen"><div className="welcome-icon"><Heart fill="currentColor" size={38} /></div><LoaderCircle className="spin" /><p>Открываем ваше пространство…</p></div>
}

function AuthScreen({ role, error, onSubmit, onAnonymous, onBack }: {
  role: Role
  error?: string
  onSubmit: (email: string, password: string, mode: AuthMode) => void
  onAnonymous: () => void
  onBack: () => void
}) {
  const [mode, setMode] = useState<AuthMode>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    if (email.trim() && password.length >= 6) onSubmit(email.trim().toLowerCase(), password, mode)
  }
  return (
    <div className="welcome-screen">
      <div className="welcome-orb orb-one" /><div className="welcome-orb orb-two" />
      <div className="welcome-content auth-content">
        <div className="welcome-icon"><CircleUserRound size={42} /></div>
        <p className="eyebrow">Личный кабинет</p>
        <h1>{role === 'wife' ? 'Кабинет Аллы' : 'Кабинет Стаса'}</h1>
        <p className="welcome-copy">Email и пароль сохранят доступ к вашему списку при смене или переустановке телефона.</p>
        <div className="auth-card">
          <div className="mode-switch"><button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Создать кабинет</button><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Войти</button></div>
          <form onSubmit={submit}>
            <label className="field"><span>Email</span><input autoFocus type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></label>
            <label className="field"><span>Пароль</span><input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Минимум 6 символов" /></label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-button wide" disabled={!email.trim() || password.length < 6}>{mode === 'register' ? 'Создать кабинет' : 'Войти'}<Heart size={18} /></button>
          </form>
          <button className="text-button auth-skip" type="button" onClick={onAnonymous}>Продолжить на этом телефоне без email</button>
          <button className="text-button" type="button" onClick={onBack}>Назад</button>
        </div>
      </div>
    </div>
  )
}

function JoinCouple({ error, onJoin, onBack }: { error?: string; onJoin: (code: string) => void; onBack: () => void }) {
  const [code, setCode] = useState('')
  return (
    <div className="welcome-screen">
      <div className="welcome-content join-content">
        <div className="welcome-icon"><HeartHandshake size={40} /></div>
        <p className="eyebrow">Соединить два телефона</p>
        <h1>Введите код<br /><em>вашей пары</em></h1>
        <p className="welcome-copy">Код отображается у жены в настройках приложения. Он нужен только один раз.</p>
        <form className="join-form" onSubmit={(event) => { event.preventDefault(); if (code.trim()) onJoin(code.trim()) }}>
          <label className="field"><span>Код приглашения</span><input autoFocus value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Например, A1B2C3D4" maxLength={8} /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button wide" disabled={code.trim().length < 6}>Присоединиться<Heart size={18} /></button>
          <button type="button" className="text-button" onClick={onBack}>Назад</button>
        </form>
      </div>
    </div>
  )
}

function WishesView({ data, role, onOpen, onAdd, onPatch }: {
  data: AppData; role: Role; onOpen: (id: string) => void; onAdd: () => void; onPatch: (id: string, patch: Partial<Wish>) => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryId | 'all'>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [sort, setSort] = useState<Sort>('new')
  const [minStars, setMinStars] = useState(0)
  const [maxPrice, setMaxPrice] = useState<number | undefined>()
  const [onlyReserved, setOnlyReserved] = useState(false)
  const [viewMode, setViewMode] = useState<'single' | 'double'>(() => localStorage.getItem('our-wishes-view') === 'single' ? 'single' : 'double')

  function changeView(mode: 'single' | 'double') {
    setViewMode(mode)
    localStorage.setItem('our-wishes-view', mode)
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru')
    return data.wishes
      .filter((wish) => !wish.completedAt)
      .filter((wish) => !needle || `${wish.title} ${wish.description}`.toLocaleLowerCase('ru').includes(needle))
      .filter((wish) => category === 'all' || wish.categories.includes(category))
      .filter((wish) => wish.stars >= minStars)
      .filter((wish) => maxPrice == null || wish.price == null || wish.price <= maxPrice)
      .filter((wish) => !onlyReserved || wish.reservedByHusband)
      .sort((a, b) => {
        if (sort === 'stars') return b.stars - a.stars
        if (sort === 'cheap') return (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER)
        if (sort === 'expensive') return (b.price ?? -1) - (a.price ?? -1)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
  }, [data.wishes, query, category, minStars, maxPrice, onlyReserved, sort])

  return (
    <div className="page page-wishes">
      <section className="hero-row">
        <div><p className="eyebrow">{role === 'wife' ? 'Твоя коллекция мечтаний' : 'Её мечты — твои подсказки'}</p><h1>{role === 'wife' ? 'Чего хочется?' : 'Выбери её мечту'}</h1></div>
        <div className="wish-count"><strong>{data.wishes.filter((w) => !w.completedAt).length}</strong><span>желаний</span></div>
      </section>

      <div className="search-row">
        <label className="search-box"><Search size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти желание" /><kbd>⌘ K</kbd></label>
        <button className={`filter-button ${showFilters ? 'active' : ''}`} onClick={() => setShowFilters(!showFilters)} aria-label="Фильтры"><SlidersHorizontal size={20} /></button>
      </div>

      <div className="category-scroll">
        <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}><Compass size={17} />Все</button>
        {categories.map((item) => {
          const Icon = iconMap[item.icon]
          return <button key={item.id} className={category === item.id ? 'active' : ''} onClick={() => setCategory(item.id)}><Icon size={17} />{item.label}</button>
        })}
      </div>

      {showFilters && (
        <div className="filters-panel">
          <label><span>Сортировка</span><select value={sort} onChange={(e) => setSort(e.target.value as Sort)}><option value="new">Сначала новые</option><option value="stars">Самые желанные</option><option value="cheap">Сначала недорогие</option><option value="expensive">Сначала дорогие</option></select></label>
          <label><span>Не дороже</span><select value={maxPrice ?? ''} onChange={(e) => setMaxPrice(e.target.value ? Number(e.target.value) : undefined)}><option value="">Любая стоимость</option><option value="5000">5 000 ₽</option><option value="15000">15 000 ₽</option><option value="50000">50 000 ₽</option><option value="100000">100 000 ₽</option></select></label>
          <label><span>Сила желания</span><div className="mini-stars">{[1,2,3,4,5].map((value) => <button key={value} onClick={() => setMinStars(minStars === value ? 0 : value)}><Star size={19} fill={value <= minStars ? 'currentColor' : 'none'} /></button>)}</div></label>
          {role === 'husband' && <label className="check-label"><input type="checkbox" checked={onlyReserved} onChange={(e) => setOnlyReserved(e.target.checked)} />Только выбранные мной</label>}
        </div>
      )}

      <div className="results-head"><span>{filtered.length} {plural(filtered.length, ['желание', 'желания', 'желаний'])}</span><div className="results-controls">{(query || category !== 'all' || minStars || maxPrice || onlyReserved) && <button onClick={() => { setQuery(''); setCategory('all'); setMinStars(0); setMaxPrice(undefined); setOnlyReserved(false) }}>Сбросить</button>}<div className="view-switch" aria-label="Вид карточек"><button className={viewMode === 'single' ? 'active' : ''} onClick={() => changeView('single')} aria-label="Одна карточка в ряд"><RectangleHorizontal size={16} /></button><button className={viewMode === 'double' ? 'active' : ''} onClick={() => changeView('double')} aria-label="Две карточки в ряд"><LayoutGrid size={16} /></button></div></div></div>

      {filtered.length ? <div className={`wish-grid ${viewMode}`}>{filtered.map((wish) => <WishCard key={wish.id} wish={wish} role={role} onOpen={() => onOpen(wish.id)} onPatch={(patch) => onPatch(wish.id, patch)} />)}</div> : (
        <EmptyState icon={<Search />} title="Ничего не нашлось" text="Попробуйте изменить фильтры или добавить новое желание." action={role === 'wife' ? <button className="primary-button" onClick={onAdd}><Plus size={18} />Добавить желание</button> : undefined} />
      )}
    </div>
  )
}

function WishCard({ wish, role, onOpen, onPatch }: { wish: Wish; role: Role; onOpen: () => void; onPatch: (patch: Partial<Wish>) => void }) {
  const category = categories.find((item) => item.id === wish.categories[0])
  return (
    <article className="wish-card" onClick={onOpen}>
      <div className="wish-image-wrap">
        {wish.image ? <img src={wish.image} alt="" loading="lazy" /> : <div className="image-placeholder"><Gift size={34} /></div>}
        {category && <span className="category-pill">{category.label}</span>}
        {role === 'husband' && (
          <button className={`heart-button ${wish.likedByHusband ? 'liked' : ''}`} onClick={(e) => { e.stopPropagation(); onPatch({ likedByHusband: !wish.likedByHusband }) }} aria-label="Нравится">
            <Heart size={19} fill={wish.likedByHusband ? 'currentColor' : 'rgba(255,255,255,.2)'} />
          </button>
        )}
        {role === 'husband' && wish.reservedByHusband && <span className="reserved-badge"><Check size={13} />Выбрано</span>}
      </div>
      <div className="wish-card-body">
        <div className="stars" aria-label={`${wish.stars} из 5`}>{[1,2,3,4,5].map((n) => <Star key={n} size={12} fill={n <= wish.stars ? 'currentColor' : 'none'} />)}</div>
        <h3>{wish.title}</h3>
        <div className="card-meta"><strong>{formatPrice(wish.price)}</strong><span className={wish.targetDate ? 'target-date' : ''}>{wish.targetDate ? `До ${formatTargetDate(wish.targetDate)}` : formatShortDate(wish.createdAt)}</span></div>
      </div>
    </article>
  )
}

function MoodboardView({ wishes, onOpen }: { wishes: Wish[]; onOpen: (id: string) => void }) {
  const [shuffled, setShuffled] = useState(wishes)
  const [category, setCategory] = useState<CategoryId | 'all'>('all')
  useEffect(() => setShuffled(wishes), [wishes])
  const visible = shuffled.filter((wish) => category === 'all' || wish.categories.includes(category))
  return (
    <div className="page moodboard-page">
      <section className="centered-head"><p className="eyebrow">Ваша общая карта</p><h1>Мечты в картинках</h1><p>Иногда достаточно просто посмотреть, чтобы снова захотеть.</p></section>
      <div className="moodboard-tools">
        <select value={category} onChange={(e) => setCategory(e.target.value as CategoryId | 'all')}><option value="all">Все разделы</option>{categories.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select>
        <button onClick={() => setShuffled([...shuffled].sort(() => Math.random() - .5))}><Shuffle size={17} />Перемешать</button>
      </div>
      <div className="masonry">
        {visible.map((wish, index) => <button key={wish.id} className={`masonry-item tone-${index % 4}`} onClick={() => onOpen(wish.id)}>{wish.image ? <img src={wish.image} alt={wish.title} loading="lazy" /> : <Gift size={34} />}<span><small>{categories.find((c) => c.id === wish.categories[0])?.label}</small><strong>{wish.title}</strong></span></button>)}
      </div>
    </div>
  )
}

function DoneView({ wishes, onOpen }: { wishes: Wish[]; onOpen: (id: string) => void }) {
  return <div className="page"><section className="hero-row"><div><p className="eyebrow">Ваша история</p><h1>Исполненные мечты</h1></div><div className="wish-count complete"><strong>{wishes.length}</strong><span>сбылось</span></div></section>{wishes.length ? <div className="completed-list">{wishes.map((wish) => <button key={wish.id} onClick={() => onOpen(wish.id)}>{wish.image ? <img src={wish.image} alt="" /> : <div className="thumb-placeholder"><Gift /></div>}<span><small>Исполнено {formatShortDate(wish.completedAt!)}</small><strong>{wish.title}</strong><em>{wish.completionNote || 'Ещё одна мечта стала реальностью'}</em></span><CheckCircle2 /></button>)}</div> : <EmptyState icon={<CheckCircle2 />} title="Здесь появится ваша история" text="Когда желание исполнится, оно останется здесь тёплым воспоминанием." />}</div>
}

function ChatView({ role, messages, onSend, onLike, onRead }: { role: Role; messages: ChatMessage[]; onSend: (message: Omit<ChatMessage, 'id' | 'createdAt' | 'read'>) => void; onLike: (id: string) => void; onRead: () => void }) {
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { onRead(); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  function send(event?: FormEvent) {
    event?.preventDefault()
    if (!text.trim()) return
    onSend({ author: role, text: text.trim() })
    setText('')
  }
  async function attach(file?: File) {
    if (!file) return
    onSend({ author: role, image: await fileToDataUrl(file) })
  }
  return (
    <div className="chat-page">
      <div className="chat-head"><div className="couple-avatars"><span>{role === 'wife' ? 'С' : 'А'}</span><span>{role === 'wife' ? 'А' : 'С'}</span></div><div><h1>Только мы</h1><p><i /> ваш личный чат</p></div><button><MoreHorizontal /></button></div>
      <div className="messages">
        <div className="chat-date">Сегодня</div>
        {messages.map((message, index) => {
          const own = message.author === role
          const showAvatar = !own && messages[index + 1]?.author !== message.author
          return <div key={message.id} className={`message-row ${own ? 'own' : ''}`}>
            {!own && <span className={`message-avatar ${showAvatar ? '' : 'hidden'}`}>{message.author === 'wife' ? 'А' : 'С'}</span>}
            <div className="message-wrap"><div className="message-bubble">{message.image && <img src={message.image} alt="Отправленное фото" />}{message.text && <p>{message.text}</p>}<time>{new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.createdAt))}{own && <Check size={12} />}</time></div><button className={`message-like ${message.likedByMe ? 'liked' : ''}`} aria-label="Лайкнуть сообщение" onClick={() => onLike(message.id)}><Heart size={13} fill={message.likedByMe ? 'currentColor' : 'none'} />{Boolean(message.likeCount) && <span>{message.likeCount}</span>}</button></div>
          </div>
        })}
        <div ref={bottomRef} />
      </div>
      <form className="chat-composer" onSubmit={send}>
        <button type="button" onClick={() => fileRef.current?.click()}><Paperclip size={21} /></button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => attach(e.target.files?.[0])} />
        <div className="composer-input"><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Написать сообщение…" /><button type="button" onClick={() => setText((value) => `${value} 🤍`)}>☺</button></div>
        <button className="send-button" type="submit" disabled={!text.trim()}><Send size={19} /></button>
      </form>
    </div>
  )
}

function SettingsView({ role, profile, onProtect, onSwitch }: { role: Role; profile: CloudProfile | null; onProtect: (email: string, password: string) => void; onSwitch: () => void }) {
  const [notificationStatus, setNotificationStatus] = useState(Notification.permission)
  const [installed, setInstalled] = useState(window.matchMedia('(display-mode: standalone)').matches)
  const [showAccount, setShowAccount] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  async function askNotifications() {
    const status = await Notification.requestPermission()
    setNotificationStatus(status)
  }
  return (
    <div className="page settings-page">
      <section className="hero-row"><div><p className="eyebrow">Ваше пространство</p><h1>Настройки</h1></div></section>
      <div className="profile-card"><div className="profile-avatar">{role === 'wife' ? 'А' : 'С'}</div><div><h2>{role === 'wife' ? 'Алла' : 'Стас'}</h2><p>{role === 'wife' ? 'Добавляет мечты' : 'Исполняет мечты'}</p></div><span className="online">в сети</span></div>
      <div className="settings-group"><h3>Приложение</h3>
        <button onClick={askNotifications}><span className="setting-icon"><BellRing /></span><span><strong>Уведомления</strong><small>{notificationStatus === 'granted' ? 'Включены' : notificationStatus === 'denied' ? 'Запрещены в браузере' : 'Получать новости о желаниях'}</small></span><em>{notificationStatus === 'granted' ? 'Вкл.' : 'Настроить'}</em></button>
        <button onClick={() => setInstalled(true)}><span className="setting-icon"><Upload /></span><span><strong>Установить приложение</strong><small>{installed ? 'Открывается как приложение' : 'Добавьте на домашний экран'}</small></span><em>{installed ? 'Готово' : 'Как?'}</em></button>
      </div>
      {!isDemoMode && <div className="settings-group"><h3>Личный кабинет</h3>
        {profile?.email && !profile.anonymous ? <div className="account-ready"><CircleUserRound /><span><strong>Вход защищён</strong><small>{profile.email}</small></span><CheckCircle2 /></div> : <>
          <button onClick={() => setShowAccount((value) => !value)}><span className="setting-icon"><CircleUserRound /></span><span><strong>Добавить email и пароль</strong><small>Чтобы не потерять доступ при смене телефона</small></span><em>{showAccount ? 'Скрыть' : 'Настроить'}</em></button>
          {showAccount && <form className="account-form" onSubmit={(event) => { event.preventDefault(); if (email.trim() && password.length >= 6) onProtect(email.trim().toLowerCase(), password) }}><label className="field"><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="field"><span>Пароль</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Минимум 6 символов" /></label><button className="primary-button wide" disabled={!email.trim() || password.length < 6}>Сохранить кабинет</button></form>}
        </>}
      </div>}
      <div className="settings-group"><h3>Пара</h3><div className="pair-card"><span className="role-avatar wife">А</span><Heart size={18} fill="currentColor" /><span className="role-avatar husband">С</span><div><strong>Алла и Стас</strong><small>вместе в приложении</small></div></div></div>
      {profile?.inviteCode && <button className="invite-code" onClick={() => { void navigator.clipboard?.writeText(profile.inviteCode) }}><span><small>Код пары</small><strong>{profile.inviteCode}</strong></span><em>Нажмите, чтобы скопировать</em></button>}
      {isDemoMode && <div className="demo-note"><Sparkles /><div><strong>Сейчас включён демо-режим</strong><p>Все функции можно попробовать в этом браузере. Подключите Supabase по инструкции в README, чтобы синхронизировать два телефона.</p></div></div>}
      <button className="secondary-button switch-user" onClick={onSwitch}><UserRound size={18} />Сменить пользователя</button>
    </div>
  )
}

function AddWishModal({ onClose, onAdd }: { onClose: () => void; onAdd: (wish: Wish) => void }) {
  const [mode, setMode] = useState<'link' | 'manual'>('manual')
  const [link, setLink] = useState('')
  const [loadingLink, setLoadingLink] = useState(false)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [stars, setStars] = useState<1 | 2 | 3 | 4 | 5>(5)
  const [selectedCategories, setSelectedCategories] = useState<CategoryId[]>(['everyday'])
  const [image, setImage] = useState<string>()
  const [details, setDetails] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  async function importLink() {
    try {
      setError(''); setLoadingLink(true)
      const imported = await importFromLink(link)
      setTitle(imported.title || '')
      setDescription(imported.description || '')
      setPrice(imported.price ? String(imported.price) : '')
      setImage(imported.image)
      setMode('manual')
    } catch {
      setError('Не удалось прочитать страницу. Ссылка сохранена — дополните желание вручную.')
      setMode('manual')
    } finally { setLoadingLink(false) }
  }
  async function chooseImage(file?: File) { if (file) setImage(await fileToDataUrl(file)) }
  function toggleCategory(id: CategoryId) { setSelectedCategories((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) { setError('Добавьте название желания'); return }
    onAdd({ id: uid('wish'), title: title.trim(), description: description.trim(), link: link.trim() || undefined, price: price ? Number(price) : undefined, image, images: image ? [image] : [], categories: selectedCategories.length ? selectedCategories : ['everyday'], stars, details: details.trim() || undefined, targetDate: targetDate || undefined, createdAt: new Date().toISOString() })
  }

  return (
    <Modal onClose={onClose} className="add-modal">
      <div className="modal-head"><div><p className="eyebrow">Новая мечта</p><h2>Добавить желание</h2></div><button className="icon-button" onClick={onClose}><X /></button></div>
      <div className="mode-switch"><button className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}><Sparkles size={18} />Вручную</button><button className={mode === 'link' ? 'active' : ''} onClick={() => setMode('link')}><Link2 size={18} />По ссылке</button></div>
      {mode === 'link' ? (
        <div className="link-import">
          <div className="import-illustration"><Link2 size={34} /><span><Sparkles size={14} /></span></div>
          <h3>Просто вставьте ссылку</h3><p>Попробуем сами найти название, фотографию и стоимость. Всё можно поправить перед сохранением.</p>
          <label className="field"><span>Ссылка на товар или место</span><div className="input-with-icon"><Link2 size={18} /><input autoFocus type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" /></div></label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button wide" disabled={!isValidUrl(link) || loadingLink} onClick={importLink}>{loadingLink ? <><LoaderCircle className="spin" size={19} />Загружаем…</> : <>Продолжить<ExternalLink size={18} /></>}</button>
          <button className="text-button" onClick={() => setMode('manual')}>Добавить без ссылки</button>
        </div>
      ) : (
        <form className="wish-form" onSubmit={submit}>
          {link && <div className="imported-link"><Link2 size={16} /><span>{safeHost(link)}</span><button type="button" onClick={() => setLink('')}><X size={15} /></button></div>}
          <div className="photo-picker">{image ? <><img src={image} alt="Выбранная обложка" /><button type="button" className="remove-photo" onClick={() => setImage(undefined)}><X size={16} /></button></> : <><div><Camera size={25} /></div><strong>Добавить фотографию</strong><span>выберите удобный способ</span></>}<div className="photo-actions"><button type="button" onClick={() => galleryRef.current?.click()}><ImageIcon size={17} />Галерея</button><button type="button" onClick={() => cameraRef.current?.click()}><Camera size={17} />Камера</button></div><input ref={galleryRef} type="file" hidden accept="image/*" onChange={(e) => { void chooseImage(e.target.files?.[0]); e.currentTarget.value = '' }} /><input ref={cameraRef} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { void chooseImage(e.target.files?.[0]); e.currentTarget.value = '' }} /></div>
          <label className="field"><span>Название *</span><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="О чём мечтаешь?" /></label>
          <label className="field"><span>Описание</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Расскажи подробнее…" rows={3} /></label>
          {!link && <label className="field"><span>Ссылка</span><div className="input-with-icon"><Link2 size={18} /><input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" /></div></label>}
          <div className="form-two"><label className="field"><span>Стоимость, ₽</span><input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} placeholder="Необязательно" /></label><label className="field"><span>Когда хочется исполнить</span><input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></label></div>
          <label className="field"><span>Насколько хочется</span><div className="form-stars">{[1,2,3,4,5].map((n) => <button type="button" key={n} onClick={() => setStars(n as 1|2|3|4|5)}><Star size={22} fill={n <= stars ? 'currentColor' : 'none'} /></button>)}</div></label>
          <fieldset><legend>Разделы</legend><div className="category-options">{categories.map((item) => { const Icon = iconMap[item.icon]; return <button type="button" key={item.id} className={selectedCategories.includes(item.id) ? 'active' : ''} onClick={() => toggleCategory(item.id)}><Icon size={17} />{item.label}{selectedCategories.includes(item.id) && <Check size={14} />}</button> })}</div></fieldset>
          <label className="field"><span>Размер, цвет и другие детали</span><textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Например: размер M, молочный цвет" rows={2} /></label>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Отмена</button><button className="primary-button" type="submit"><Heart size={18} />Добавить желание</button></div>
        </form>
      )}
    </Modal>
  )
}

function WishDetail({ wish, role, comments, onClose, onPatch, onComment, onToast }: {
  wish: Wish; role: Role; comments: AppData['comments']; onClose: () => void; onPatch: (patch: Partial<Wish>) => void; onComment: (text: string) => void; onToast: (text: string) => void
}) {
  const [comment, setComment] = useState('')
  const completed = Boolean(wish.completedAt)
  function submitComment(event: FormEvent) { event.preventDefault(); onComment(comment); setComment('') }
  return (
    <Modal onClose={onClose} className="detail-modal">
      <div className="detail-image">
        {wish.image ? <img src={wish.image} alt={wish.title} /> : <div className="detail-placeholder"><Gift size={46} /></div>}
        <button className="detail-back" onClick={onClose}><ChevronLeft /></button>
        <button className="detail-share" onClick={() => { navigator.clipboard?.writeText(wish.link || location.href); onToast('Ссылка скопирована') }}><Share2 /></button>
        {completed && <div className="completed-stamp"><CheckCircle2 />Исполнено</div>}
      </div>
      <div className="detail-content">
        <div className="detail-labels">{wish.categories.map((id) => <span key={id}>{categories.find((item) => item.id === id)?.label}</span>)}</div>
        <div className="detail-title"><div><h2>{wish.title}</h2><div className="stars">{[1,2,3,4,5].map((n) => <Star key={n} size={14} fill={n <= wish.stars ? 'currentColor' : 'none'} />)}</div></div>{role === 'husband' && !completed && <button className={`big-like ${wish.likedByHusband ? 'liked' : ''}`} onClick={() => onPatch({ likedByHusband: !wish.likedByHusband })}><Heart fill={wish.likedByHusband ? 'currentColor' : 'none'} /></button>}</div>
        <div className="detail-price">{formatPrice(wish.price)}</div>
        {wish.targetDate && <div className="wish-deadline"><CalendarDays size={18} /><div><strong>Хочется исполнить</strong><span>{formatTargetDate(wish.targetDate)}</span></div></div>}
        {wish.description && <section><h3>Об этом желании</h3><p>{wish.description}</p></section>}
        {wish.details && <div className="detail-note"><Sparkles size={17} /><div><strong>Важные детали</strong><p>{wish.details}</p></div></div>}
        {wish.link && <a className="shop-link" href={wish.link} target="_blank" rel="noreferrer"><Link2 size={18} /><span><strong>Открыть исходную ссылку</strong><small>{safeHost(wish.link)}</small></span><ExternalLink size={17} /></a>}
        {role === 'husband' && !completed && <button className={`reserve-button ${wish.reservedByHusband ? 'selected' : ''}`} onClick={() => { onPatch({ reservedByHusband: !wish.reservedByHusband }); onToast(wish.reservedByHusband ? 'Выбор отменён' : 'Сохранено только для вас') }}>{wish.reservedByHusband ? <><CheckCircle2 />Вы выбрали это желание</> : <><Gift />Хочу исполнить</>}<small>{wish.reservedByHusband ? 'Жена не видит эту отметку' : 'Отметка будет видна только вам'}</small></button>}
        {role === 'wife' && !completed && <button className="complete-button" onClick={() => { onPatch({ completedAt: new Date().toISOString() }); onToast('Мечта исполнена 🤍') }}><CheckCircle2 size={20} />Отметить исполненным</button>}
        {role === 'wife' && completed && <button className="secondary-button wide" onClick={() => onPatch({ completedAt: undefined })}>Вернуть в актуальные</button>}
        <section className="comments-section"><div className="section-title"><h3>Комментарии</h3><span>{comments.length}</span></div>
          {comments.map((item) => <div className="comment" key={item.id}><span className="comment-avatar">{item.author === 'wife' ? 'А' : 'С'}</span><div><strong>{item.author === 'wife' ? 'Алла' : 'Стас'}<small>{formatShortDate(item.createdAt)}</small></strong><p>{item.text}</p></div></div>)}
          <form className="comment-form" onSubmit={submitComment}><span className="comment-avatar">{role === 'wife' ? 'А' : 'С'}</span><div><input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Оставить тёплый комментарий…" /><button type="submit" disabled={!comment.trim()}><Send size={17} /></button></div></form>
        </section>
      </div>
    </Modal>
  )
}

function Modal({ children, onClose, className = '' }: { children: ReactNode; onClose: () => void; className?: string }) {
  useEffect(() => { const listener = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); window.addEventListener('keydown', listener); document.body.classList.add('modal-open'); return () => { window.removeEventListener('keydown', listener); document.body.classList.remove('modal-open') } }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className={`modal-sheet ${className}`}>{children}</div></div>
}

function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><div>{icon}</div><h2>{title}</h2><p>{text}</p>{action}</div>
}

function safeHost(value: string) { try { return new URL(value).hostname.replace(/^www\./, '') } catch { return value } }
function formatTargetDate(value: string) { const [year, month, day] = value.split('-').map(Number); return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day)) }
function isValidUrl(value: string) { try { return Boolean(new URL(value).protocol.match(/^https?:$/)) } catch { return false } }
function plural(value: number, forms: [string,string,string]) { const n = Math.abs(value) % 100; const n1 = n % 10; if (n > 10 && n < 20) return forms[2]; if (n1 > 1 && n1 < 5) return forms[1]; if (n1 === 1) return forms[0]; return forms[2] }

export default App
