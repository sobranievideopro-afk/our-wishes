import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Crosshair, MapPin, Navigation, ShieldCheck } from 'lucide-react'
import type { MemberProfile, Role } from './types'

function markerIcon(profile: MemberProfile, role: Role) {
  const root = document.createElement('div')
  root.className = `map-person-marker ${role}`
  const avatar = document.createElement('div')
  avatar.className = `map-avatar-marker ${role}`
  if (profile.avatar) {
    const image = document.createElement('img')
    image.src = profile.avatar
    image.alt = ''
    avatar.appendChild(image)
  } else {
    avatar.textContent = profile.displayName.trim().charAt(0).toLocaleUpperCase('ru') || '♡'
  }
  const pulse = document.createElement('i')
  avatar.appendChild(pulse)
  root.appendChild(avatar)
  if (profile.status) {
    const status = document.createElement('span')
    status.className = 'map-marker-status'
    status.textContent = profile.status
    root.appendChild(status)
  }
  return L.divIcon({ html: root, className: 'couple-map-marker', iconSize: [210, 64], iconAnchor: role === 'wife' ? [29, 32] : [181, 32] })
}

function distanceKm(first: MemberProfile, second: MemberProfile) {
  if (first.latitude == null || first.longitude == null || second.latitude == null || second.longitude == null) return null
  const radians = (value: number) => value * Math.PI / 180
  const earth = 6371
  const dLat = radians(second.latitude - first.latitude)
  const dLon = radians(second.longitude - first.longitude)
  const lat1 = radians(first.latitude)
  const lat2 = radians(second.latitude)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDistance(value: number | null) {
  if (value == null) return 'Появится, когда вы оба поделитесь геопозицией'
  if (value < 1) return `${Math.max(1, Math.round(value * 1000))} м друг от друга`
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} км друг от друга`
}

function freshness(value?: string) {
  if (!value) return 'Геопозиция пока не передана'
  return `Обновлено ${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))}`
}

export function LocationMapView({ role, members, updating, tracking, onUpdate, onStop }: {
  role: Role
  members: Record<Role, MemberProfile>
  updating: boolean
  tracking: boolean
  onUpdate: () => void
  onStop: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const partnerRole: Role = role === 'wife' ? 'husband' : 'wife'
  const current = members[role]
  const partner = members[partnerRole]
  const currentShared = current.latitude != null && current.longitude != null
  const partnerShared = partner.latitude != null && partner.longitude != null
  const distance = distanceKm(current, partner)

  useEffect(() => {
    if (!containerRef.current) return
    const points = ([['wife', members.wife], ['husband', members.husband]] as const)
      .filter(([, member]) => member.latitude != null && member.longitude != null)
    const center: L.LatLngExpression = points.length ? [points[0][1].latitude!, points[0][1].longitude!] : [55.751244, 37.618423]
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView(center, points.length ? 13 : 9)
    mapRef.current = map
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)
    const bounds: L.LatLngExpression[] = []
    points.forEach(([memberRole, member]) => {
      const point: L.LatLngExpression = [member.latitude!, member.longitude!]
      bounds.push(point)
      L.marker(point, { icon: markerIcon(member, memberRole) }).addTo(map).bindTooltip(member.displayName, { direction: 'top', offset: [0, -28] })
    })
    if (bounds.length === 2) {
      L.polyline(bounds, { color: '#cc6687', weight: 3, dashArray: '7 9', opacity: .72 }).addTo(map)
      map.fitBounds(L.latLngBounds(bounds), { padding: [70, 70], maxZoom: 15 })
    }
    window.setTimeout(() => { map.invalidateSize(); setMapReady(true) }, 80)
    return () => { map.remove(); mapRef.current = null; setMapReady(false) }
  }, [members.wife.latitude, members.wife.longitude, members.wife.avatar, members.wife.displayName, members.husband.latitude, members.husband.longitude, members.husband.avatar, members.husband.displayName])

  return <div className="page location-page">
    <section className="location-heading"><div><p className="eyebrow">Вы рядом, даже когда не рядом</p><h1>Наша карта</h1><p>{tracking ? 'Автообновление включено: координаты меняются без перезагрузки, пока приложение активно.' : 'Включите передачу — координаты будут автоматически обновляться и видны только вашей паре.'}</p></div><div className="distance-card"><Navigation size={20} /><strong>{distance == null ? '—' : formatDistance(distance).split(' ')[0]}</strong><span>{distance == null ? 'расстояние' : formatDistance(distance).split(' ').slice(1).join(' ')}</span></div></section>
    <div className={`couple-map ${mapReady ? 'ready' : ''}`} ref={containerRef} />
    <div className="map-status-grid">
      {([role, partnerRole] as Role[]).map((memberRole) => {
        const member = members[memberRole]
        const shared = member.latitude != null && member.longitude != null
        return <article key={memberRole}><div className={`map-profile-avatar ${memberRole}`}>{member.avatar ? <img src={member.avatar} alt="" /> : member.displayName.charAt(0)}</div><div><strong>{member.displayName}</strong><b className={member.status ? '' : 'empty'}>{member.status || 'Без статуса'}</b><span>{freshness(member.locationUpdatedAt)}</span></div><i className={shared ? 'online' : ''}><MapPin size={14} /></i></article>
      })}
    </div>
    <div className="location-controls">
      <button className="primary-button" onClick={onUpdate} disabled={updating}><Crosshair size={18} />{updating ? 'Определяем…' : tracking ? 'Обновить сейчас' : 'Включить автообновление'}</button>
      {tracking && <span className="location-live"><i />Обновляется автоматически</span>}
      {currentShared && <button className="secondary-button" onClick={onStop}>Перестать делиться</button>}
    </div>
    {tracking && <p className="location-ios-note">На iPhone обновление приостанавливается, когда приложение полностью закрыто, и возобновляется сразу после открытия.</p>}
    {!partnerShared && <div className="location-hint"><ShieldCheck size={19} /><p><strong>{partner.displayName} ещё не поделился(ась) геопозицией</strong><span>Как только это произойдёт, на карте появится второй аватар и расстояние между вами.</span></p></div>}
  </div>
}
