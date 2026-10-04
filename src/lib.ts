import { createClient } from '@supabase/supabase-js'
import type { AppData, Wish } from './types'
import { seedData } from './data'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null
export const isDemoMode = !supabase

const STORAGE_KEY = 'our-wishes-demo-v2'

export function loadDemoData(): AppData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return structuredClone(seedData)
    const parsed = JSON.parse(stored) as AppData
    return { ...parsed, events: (parsed.events || []).map((event) => ({ ...event, color: event.color || 'family' })), members: parsed.members || { wife: { displayName: 'Алла' }, husband: { displayName: 'Стас' } } }
  } catch {
    return structuredClone(seedData)
  }
}

export function saveDemoData(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function formatPrice(price?: number) {
  return price == null ? 'Цена не указана' : `${new Intl.NumberFormat('ru-RU').format(price)} ₽`
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(value))
}

export function uid(_prefix?: string) {
  return crypto.randomUUID()
}

export async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function importFromLink(url: string): Promise<Partial<Wish>> {
  if (supabase) {
    const { data, error } = await supabase.functions.invoke('import-link', { body: { url } })
    if (error) throw error
    return data
  }

  const parsed = new URL(url)
  const host = parsed.hostname.replace(/^www\./, '')
  const slug = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
  const title = slug.length > 4 ? slug.charAt(0).toUpperCase() + slug.slice(1) : `Желание с ${host}`
  await new Promise((resolve) => setTimeout(resolve, 700))
  return { title, link: url, description: `Добавлено по ссылке с сайта ${host}` }
}
