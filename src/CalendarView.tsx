import { useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Gift, List, Pencil, Plus, Trash2, X } from 'lucide-react'
import { uid } from './lib'
import type { CalendarEvent, Role, Wish } from './types'

const emojiOptions = ['🎂', '💍', '👧', '👧🏻', '❤️', '✈️', '🎁', '🥂', '🏡', '🌷', '🎄']
const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function prettyDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }).format(localDate(value))
}

export function CalendarView({ events, wishes, role, onAdd, onUpdate, onDelete, onOpenWish }: {
  events: CalendarEvent[]
  wishes: Wish[]
  role: Role
  onAdd: (event: CalendarEvent) => void
  onUpdate: (event: CalendarEvent) => void
  onDelete: (id: string) => void
  onOpenWish: (id: string) => void
}) {
  const today = new Date()
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [showAdd, setShowAdd] = useState(false)
  const [selectedDate, setSelectedDate] = useState(dateKey(today))
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const mondayOffset = (first.getDay() + 6) % 7
    const start = new Date(first)
    start.setDate(first.getDate() - mondayOffset)
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return date
    })
  }, [month])
  const sorted = useMemo(() => [...events].sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`)), [events])
  const upcoming = sorted.filter((event) => event.date >= dateKey(today)).slice(0, 5)
  const datedWishes = role === 'husband' ? wishes.filter((wish) => wish.targetDate && !wish.completedAt) : []
  const title = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(month)

  function openFor(date?: string) {
    if (date) setSelectedDate(date)
    setShowAdd(true)
  }

  return (
    <div className="page calendar-page">
      <section className="calendar-hero"><div><p className="eyebrow">Ваши важные даты</p><h1>Общий календарь</h1><p>Планы, праздники и моменты, которые хочется ждать вместе.</p></div><button className="primary-button" onClick={() => openFor()}><Plus size={18} />Событие</button></section>
      <div className="calendar-toolbar">
        <div className="calendar-switch"><button className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}><CalendarDays size={16} />Календарь</button><button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><List size={16} />Список</button></div>
        {view === 'calendar' && <div className="month-nav"><button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></button><strong>{title}</strong><button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></button></div>}
      </div>

      {view === 'calendar' ? <div className="calendar-card">
        <div className="weekday-row">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid">{cells.map((date) => {
          const key = dateKey(date)
          const dayEvents = events.filter((item) => item.date === key)
          const dayWishes = datedWishes.filter((item) => item.targetDate === key)
          const outside = date.getMonth() !== month.getMonth()
          const isToday = key === dateKey(today)
          const emojis = dayEvents.flatMap((item) => item.emojis).slice(0, 3)
          const label = `${date.getDate()}${dayEvents.length ? `, событий: ${dayEvents.length}` : ''}${dayWishes.length ? `, желаний: ${dayWishes.length}` : ''}`
          return <button key={key} aria-label={label} className={`${outside ? 'outside' : ''} ${isToday ? 'today' : ''} ${dayEvents.length ? 'has-events' : ''} ${dayWishes.length ? 'has-wish' : ''}`} onClick={() => dayWishes.length ? onOpenWish(dayWishes[0].id) : openFor(key)}><span>{date.getDate()}</span><div className="day-emojis">{emojis.map((emoji, index) => <i key={`${emoji}-${index}`}>{emoji}</i>)}</div>{dayWishes.length > 0 && <span className="day-wish-mark"><Gift size={12} />{dayWishes.length > 1 && dayWishes.length}</span>}{dayEvents.length > 0 && <small>{dayEvents.length}</small>}</button>
        })}</div>
      </div> : <EventList events={sorted} role={role} onEdit={setEditingEvent} onDelete={onDelete} />}

      {view === 'calendar' && <div className="calendar-upcoming"><div className="section-title"><h3>Ближайшие события</h3><span>{upcoming.length}</span></div><EventList events={upcoming} role={role} onEdit={setEditingEvent} onDelete={onDelete} compact /></div>}
      {showAdd && <EventForm role={role} initialDate={selectedDate} onClose={() => setShowAdd(false)} onSave={(event) => { onAdd(event); setShowAdd(false) }} />}
      {editingEvent && <EventForm role={role} initialDate={editingEvent.date} event={editingEvent} onClose={() => setEditingEvent(null)} onSave={(event) => { onUpdate(event); setEditingEvent(null) }} />}
    </div>
  )
}

function EventList({ events, role, onEdit, onDelete, compact = false }: { events: CalendarEvent[]; role: Role; onEdit: (event: CalendarEvent) => void; onDelete: (id: string) => void; compact?: boolean }) {
  if (!events.length) return <div className="calendar-empty"><CalendarDays /><strong>Пока нет событий</strong><span>Добавьте первую важную дату для вас двоих.</span></div>
  return <div className={`event-list ${compact ? 'compact' : ''}`}>{events.map((event) => <article key={event.id}><div className="event-date"><strong>{localDate(event.date).getDate()}</strong><span>{new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(localDate(event.date))}</span></div><div className="event-copy"><div className="event-emojis">{event.emojis.join(' ')}</div><h3>{event.title}</h3><p>{prettyDate(event.date)}{event.time ? ` · ${event.time}` : ''}</p>{event.note && <small>{event.note}</small>}</div>{event.author === role && <div className="event-actions"><button aria-label="Редактировать событие" onClick={() => onEdit(event)}><Pencil size={15} /></button><button aria-label="Удалить событие" onClick={() => onDelete(event.id)}><Trash2 size={15} /></button></div>}</article>)}</div>
}

function EventForm({ role, initialDate, event, onClose, onSave }: { role: Role; initialDate: string; event?: CalendarEvent; onClose: () => void; onSave: (event: CalendarEvent) => void }) {
  const [title, setTitle] = useState(event?.title || '')
  const [date, setDate] = useState(event?.date || initialDate)
  const [time, setTime] = useState(event?.time || '')
  const [note, setNote] = useState(event?.note || '')
  const [emojis, setEmojis] = useState<string[]>(event?.emojis || [])
  const [customEmoji, setCustomEmoji] = useState('')
  function toggleEmoji(emoji: string) {
    setEmojis((current) => current.includes(emoji) ? current.filter((item) => item !== emoji) : current.length < 3 ? [...current, emoji] : current)
  }
  function addCustomEmoji() {
    const value = customEmoji.trim().slice(0, 12)
    if (!value || emojis.includes(value) || emojis.length >= 3) return
    setEmojis((current) => [...current, value])
    setCustomEmoji('')
  }
  function submit(formEvent: FormEvent) {
    formEvent.preventDefault()
    if (!title.trim() || !date) return
    onSave({ id: event?.id || uid('event'), title: title.trim(), date, time: time || undefined, note: note.trim() || undefined, emojis, author: event?.author || role, createdAt: event?.createdAt || new Date().toISOString() })
  }
  return <div className="event-backdrop" onMouseDown={(backdropEvent) => backdropEvent.target === backdropEvent.currentTarget && onClose()}><form className="event-form" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">{event ? 'Изменение общей даты' : 'Новая общая дата'}</p><h2>{event ? 'Редактировать событие' : 'Добавить событие'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><div className="event-form-body"><label className="field"><span>Название *</span><input autoFocus value={title} onChange={(inputEvent) => setTitle(inputEvent.target.value)} placeholder="Например, день рождения" /></label><div className="form-two"><label className="field"><span>Дата *</span><input type="date" value={date} onInput={(inputEvent) => setDate(inputEvent.currentTarget.value)} /></label><label className="field"><span>Время</span><div className="input-with-icon"><Clock size={17} /><input type="time" value={time} onInput={(inputEvent) => setTime(inputEvent.currentTarget.value)} /></div></label></div><fieldset><legend>Эмодзи — можно выбрать до трёх</legend><div className="emoji-options">{emojiOptions.map((emoji) => <button type="button" key={emoji} className={emojis.includes(emoji) ? 'active' : ''} onClick={() => toggleEmoji(emoji)}>{emoji}</button>)}</div><div className="custom-emoji"><input value={customEmoji} onChange={(inputEvent) => setCustomEmoji(inputEvent.target.value)} onKeyDown={(keyEvent) => { if (keyEvent.key === 'Enter') { keyEvent.preventDefault(); addCustomEmoji() } }} placeholder="Своё эмодзи" maxLength={12} /><button type="button" onClick={addCustomEmoji} disabled={!customEmoji.trim() || emojis.length >= 3}>Добавить</button></div></fieldset><label className="field"><span>Заметка</span><textarea rows={3} value={note} onChange={(inputEvent) => setNote(inputEvent.target.value)} placeholder="Адрес, идея подарка или детали" /></label><button className="primary-button wide" disabled={!title.trim() || !date}>{event ? <Pencil size={17} /> : <Plus size={17} />}{event ? 'Сохранить изменения' : 'Добавить в календарь'}</button></div></form></div>
}
