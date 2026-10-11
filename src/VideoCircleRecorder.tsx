import { useEffect, useRef, useState } from 'react'
import { Check, LoaderCircle, RotateCcw, Square, Video, X } from 'lucide-react'

const MAX_SECONDS = 20

function supportedMimeType() {
  const candidates = ['video/mp4;codecs=h264,aac', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
  return candidates.find((type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) || ''
}

export function VideoCircleRecorder({ onClose, onSend }: { onClose: () => void; onSend: (url: string) => void }) {
  const liveRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const timerRef = useRef<number | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [phase, setPhase] = useState<'loading' | 'ready' | 'recording' | 'preview' | 'error'>('loading')
  const [seconds, setSeconds] = useState(0)
  const [previewUrl, setPreviewUrl] = useState('')
  const [error, setError] = useState('')

  async function openCamera() {
    try {
      setPhase('loading'); setError(''); setSeconds(0)
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Запись видео не поддерживается на этом устройстве')
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }, audio: true })
      streamRef.current = stream
      if (liveRef.current) { liveRef.current.srcObject = stream; await liveRef.current.play() }
      setPhase('ready')
    } catch (reason) {
      setError(reason instanceof Error && reason.name === 'NotAllowedError' ? 'Разрешите доступ к камере и микрофону в настройках браузера' : reason instanceof Error ? reason.message : 'Не удалось открыть камеру')
      setPhase('error')
    }
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (timerRef.current != null) window.clearInterval(timerRef.current)
    timerRef.current = null
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  function startRecording() {
    const stream = streamRef.current
    if (!stream) return
    chunksRef.current = []
    const mimeType = supportedMimeType()
    let recorder: MediaRecorder
    try { recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 1_500_000, audioBitsPerSecond: 96_000 }) }
    catch { recorder = new MediaRecorder(stream) }
    recorderRef.current = recorder
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'video/webm' })
      const url = URL.createObjectURL(blob)
      setPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return url })
      stopTracks()
      setPhase('preview')
    }
    recorder.start(250)
    setSeconds(0); setPhase('recording')
    const started = Date.now()
    timerRef.current = window.setInterval(() => {
      const elapsed = Math.min(MAX_SECONDS, Math.floor((Date.now() - started) / 1000))
      setSeconds(elapsed)
      if (elapsed >= MAX_SECONDS) stopRecording()
    }, 250)
  }

  function retry() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl('')
    void openCamera()
  }

  useEffect(() => { void openCamera(); return () => { stopTracks(); if (previewUrl) URL.revokeObjectURL(previewUrl) } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="video-recorder-backdrop"><section className="video-recorder-sheet"><button className="video-recorder-close" onClick={() => { stopTracks(); onClose() }} aria-label="Закрыть"><X /></button><div className={`video-circle-preview ${phase}`}>
    {phase === 'preview' ? <video src={previewUrl} playsInline controls autoPlay loop /> : <video ref={liveRef} playsInline muted autoPlay />}
    {phase === 'loading' && <span><LoaderCircle className="spin" />Открываем камеру…</span>}
    {phase === 'error' && <span><Video />{error}</span>}
    {phase === 'recording' && <i className="recording-dot" />}
  </div><div className="video-recorder-copy"><strong>{phase === 'preview' ? 'Видеокружок готов' : phase === 'recording' ? `Запись 0:${String(seconds).padStart(2, '0')} / 0:${MAX_SECONDS}` : 'Видеокружок'}</strong><span>{phase === 'recording' ? 'Можно остановить раньше' : phase === 'preview' ? 'Посмотрите и отправьте или перезапишите' : 'До 20 секунд с камерой и звуком'}</span></div><div className="video-recorder-actions">
    {phase === 'ready' && <button className="record-circle" onClick={startRecording} aria-label="Начать запись"><Video fill="currentColor" /></button>}
    {phase === 'recording' && <button className="record-circle stop" onClick={stopRecording} aria-label="Остановить запись"><Square fill="currentColor" /></button>}
    {phase === 'preview' && <><button className="secondary-button" onClick={retry}><RotateCcw size={17} />Перезаписать</button><button className="primary-button" onClick={() => onSend(previewUrl)}><Check size={17} />Отправить</button></>}
    {phase === 'error' && <button className="secondary-button" onClick={() => void openCamera()}><RotateCcw size={17} />Попробовать снова</button>}
  </div></section></div>
}
