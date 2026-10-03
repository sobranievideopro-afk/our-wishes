import { useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, List, Plus, Trash2, X } from 'lucide-react'
import { uid } from './lib'
import type { CalendarEvent, Role } from './types'

const emojiOptions = ['🎂', '💍', '👧', '❤️', '✈️', '🎁', '🥂', '🏡', '🌷', '🎄']
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

export function CalendarView({ events, role, onAdd, onDelete }: {
  events: CalendarEvent[]
  role: Role
  onAdd: (event: CalendarEvent) => void
  onDelete: (id: string) => void
}) {
  const today = new Date()
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [showAdd, setShowAdd] = useState(false)
  const [selectedDate, setSelectedDate] = useState(dateKey(today))

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
          const outside = date.getMonth() !== month.getMonth()
          const isToday = key === dateKey(today)
          return <button key={key} className={`${outside ? 'outside' : ''} ${isToday ? 'today' : ''}`} onClick={() => openFor(key)}><span>{date.getDate()}</span><div className="day-emojis">{dayEvents.slice(0, 3).flatMap((item) => item.emojis.slice(0, 1)).map((emoji, index) => <i key={`${emoji}-${index}`}>{emoji}</i>)}</div>{dayEvents.length > 0 && <small>{dayEvents.length}</small>}</button>
        })}</div>
      </div> : <EventList events={sorted} role={role} onDelete={onDelete} />}

      {view === 'calendar' && <div className="calendar-upcoming"><div className="section-title"><h3>Ближайшие события</h3><span>{upcoming.length}</span></div><EventList events={upcoming} role={role} onDelete={onDelete} compact /></div>}
      {showAdd && <EventForm role={role} initialDate={selectedDate} onClose={() => setShowAdd(false)} onAdd={(event) => { onAdd(event); setShowAdd(false) }} />}
    </div>
  )
}

function EventList({ events, role, onDelete, compact = false }: { events: CalendarEvent[]; role: Role; onDelete: (id: string) => void; compact?: boolean }) {
  if (!events.length) return <div className="calendar-empty"><CalendarDays /><strong>Пока нет событий</strong><span>Добавьте первую важную дату для вас двоих.</span></div>
  return <div className={`event-list ${compact ? 'compact' : ''}`}>{events.map((event) => <article key={event.id}><div className="event-date"><strong>{localDate(event.date).getDate()}</strong><span>{new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(localDate(event.date))}</span></div><div className="event-copy"><div className="event-emojis">{event.emojis.join(' ')}</div><h3>{event.title}</h3><p>{prettyDate(event.date)}{event.time ? ` · ${event.time}` : ''}</p>{event.note && <small>{event.note}</small>}</div>{event.author === role && <button aria-label="Удалить событие" onClick={() => onDelete(event.id)}><Trash2 size={16} /></button>}</article>)}</div>
}

function EventForm({ role, initialDate, onClose, onAdd }: { role: Role; initialDate: string; onClose: () => void; onAdd: (event: CalendarEvent) => void }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(initialDate)
  const [time, setTime] = useState('')
  const [note, setNote] = useState('')
  const [emojis, setEmojis] = useState<string[]>([])
  function toggleEmoji(emoji: string) {
    setEmojis((current) => current.includes(emoji) ? current.filter((item) => item !== emoji) : current.length < 3 ? [...current, emoji] : current)
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim() || !date) return
    onAdd({ id: uid('event'), title: title.trim(), date, time: time || undefined, note: note.trim() || undefined, emojis, author: role, createdAt: new Date().toISOString() })
  }
  return <div className="event-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="event-form" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">Новая общая дата</p><h2>Добавить событие</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><div className="event-form-body"><label className="field"><span>Название *</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, день рождения" /></label><div className="form-two"><label className="field"><span>Дата *</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="field"><span>Время</span><div className="input-with-icon"><Clock size={17} /><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></div></label></div><fieldset><legend>Эмодзи — можно выбрать до трёх</legend><div className="emoji-options">{emojiOptions.map((emoji) => <button type="button" key={emoji} className={emojis.includes(emoji) ? 'active' : ''} onClick={() => toggleEmoji(emoji)}>{emoji}</button>)}</div></fieldset><label className="field"><span>Заметка</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Адрес, идея подарка или детали" /></label><button className="primary-button wide" disabled={!title.trim() || !date}><Plus size={17} />Добавить в календарь</button></div></form></div>
}
