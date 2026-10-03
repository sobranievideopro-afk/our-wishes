import type { AppData, CategoryId } from './types'

export const categories: { id: CategoryId; label: string; icon: string }[] = [
  { id: 'everyday', label: 'На каждый день', icon: 'Gift' },
  { id: 'anniversary', label: 'Годовщина', icon: 'HeartHandshake' },
  { id: 'new-year', label: 'Новый год', icon: 'TreePine' },
  { id: 'march-8', label: '8 Марта', icon: 'Flower2' },
  { id: 'places', label: 'Куда сходить', icon: 'MapPin' },
  { id: 'travel', label: 'Путешествия', icon: 'Plane' },
  { id: 'car', label: 'Машина', icon: 'Car' },
  { id: 'house', label: 'Дом', icon: 'House' },
  { id: 'apartment', label: 'Квартира', icon: 'Building2' },
  { id: 'jewelry', label: 'Украшения', icon: 'Gem' },
]

export const seedData: AppData = {
  members: { wife: { displayName: 'Алла' }, husband: { displayName: 'Стас' } },
  wishes: [
    {
      id: 'w1', title: 'Золотые серьги с жемчугом',
      description: 'Небольшие, аккуратные, чтобы носить каждый день.',
      price: 24900, stars: 5, categories: ['jewelry', 'anniversary'],
      image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=900&q=85',
      createdAt: '2026-09-29T10:20:00.000Z', likedByHusband: true,
    },
    {
      id: 'w2', title: 'Выходные в уютном домике',
      description: 'Лес, камин и два дня без телефонов. Где-нибудь недалеко от города.',
      price: 45000, stars: 5, categories: ['travel', 'anniversary'],
      image: 'https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&w=900&q=85',
      createdAt: '2026-09-27T18:00:00.000Z',
    },
    {
      id: 'w3', title: 'Керамическая ваза ручной работы',
      description: 'Молочная, немного неровная, для веток и сухоцветов.',
      price: 7800, stars: 4, categories: ['house', 'everyday'],
      image: 'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=900&q=85',
      createdAt: '2026-09-24T12:00:00.000Z',
    },
    {
      id: 'w4', title: 'Балет в Большом театре',
      description: 'Хочу нарядиться и пойти вместе на «Щелкунчика».',
      price: 30000, stars: 5, categories: ['places', 'new-year'],
      image: 'https://images.unsplash.com/photo-1516307365426-bea591f05011?auto=format&fit=crop&w=900&q=85',
      createdAt: '2026-09-20T13:00:00.000Z', reservedByHusband: true,
    },
    {
      id: 'w5', title: 'Шёлковая маска для сна',
      description: 'Нежно-розовая или молочная, без тугой резинки.',
      price: 3200, stars: 3, categories: ['everyday'],
      image: 'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=900&q=85',
      createdAt: '2026-09-18T08:40:00.000Z',
    },
    {
      id: 'w6', title: 'Путешествие по Италии',
      description: 'Рим, Флоренция и несколько дней у моря. Весной или ранней осенью.',
      stars: 5, categories: ['travel'],
      image: 'https://images.unsplash.com/photo-1529260830199-42c24126f198?auto=format&fit=crop&w=900&q=85',
      createdAt: '2026-09-14T20:00:00.000Z',
    },
    {
      id: 'w7', title: 'Кресло для чтения',
      description: 'Светлое, мягкое, с высокой спинкой — в угол у окна.',
      price: 68000, stars: 4, categories: ['apartment', 'house'],
      image: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=900&q=85',
      createdAt: '2026-09-10T16:20:00.000Z',
    },
    {
      id: 'w8', title: 'Фотоальбом нашего года',
      description: 'Собрать лучшие фотографии, распечатать и подписать от руки.',
      price: 5900, stars: 4, categories: ['anniversary', 'everyday'],
      image: 'https://images.unsplash.com/photo-1542038784456-1ea8e935640e?auto=format&fit=crop&w=900&q=85',
      createdAt: '2026-08-30T14:00:00.000Z', completedAt: '2026-09-01T14:00:00.000Z',
      completionNote: 'Самый тёплый подарок 🤍',
    },
  ],
  comments: [
    { id: 'c1', wishId: 'w1', author: 'husband', text: 'Очень тебе подходит 🤍', createdAt: '2026-09-30T11:00:00.000Z' },
  ],
  messages: [
    { id: 'm1', author: 'wife', text: 'Я добавила пару новых идей ✨', createdAt: '2026-10-02T17:12:00.000Z', read: true },
    { id: 'm2', author: 'husband', text: 'Уже посмотрел. Кажется, одна мне особенно нравится', createdAt: '2026-10-02T17:15:00.000Z', read: true },
    { id: 'm3', author: 'wife', text: 'Интрига? 😊', createdAt: '2026-10-02T17:16:00.000Z', read: false },
  ],
  events: [
    { id: 'e1', title: 'Годовщина свадьбы', date: '2026-10-18', time: '19:00', emojis: ['💍', '🥂'], author: 'wife', createdAt: '2026-09-20T10:00:00.000Z' },
    { id: 'e2', title: 'День рождения дочки', date: '2026-11-06', emojis: ['👧', '🎂', '🎁'], author: 'husband', createdAt: '2026-09-22T10:00:00.000Z' },
  ],
}
