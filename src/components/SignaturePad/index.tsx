import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './index.css'

export interface SignaturePadHandle {
  /** 导出透明背景 PNG 的 data URL；未签名返回 null */
  toDataURL: () => string | null
  clear: () => void
  isEmpty: () => boolean
}

interface Props {
  height?: number
  penColor?: string
  onChange?: (empty: boolean) => void
}

interface Point {
  x: number
  y: number
}

/**
 * 手写电子签名板。
 *
 * 不引三方库：signature_pad 的 React 封装 peer 还停在 16/17，与本项目的 React 19
 * 冲突，而这里需要的能力就是「按 devicePixelRatio 放大画布 + 二次贝塞尔平滑 +
 * 导出透明 PNG」，自己写反而更好控深色主题。
 *
 * 用 Pointer Events 统一鼠标 / 触屏 / 手写笔；setPointerCapture 保证手指滑出
 * 画布再回来不会断线；touch-action: none 由 CSS 关掉浏览器的滚动手势抢占。
 */
const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { height = 180, penColor = '#f5a623', onChange },
  ref,
) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const emptyRef = useRef(true)
  const lastRef = useRef<Point | null>(null)
  const midRef = useRef<Point | null>(null)
  const [empty, setEmpty] = useState(true)

  const markDirty = useCallback(() => {
    if (emptyRef.current) {
      emptyRef.current = false
      setEmpty(false)
      onChange?.(false)
    }
  }, [onChange])

  /** 按 CSS 尺寸 × dpr 重设位图，避免高分屏下笔迹发虚 */
  const resize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0) return
    // 重设 width/height 会清空画布，所以先存旧内容再画回去
    const prev = emptyRef.current ? null : canvas.toDataURL('image/png')
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.4
    ctx.strokeStyle = penColor
    if (prev) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
      img.src = prev
    }
  }, [penColor])

  useEffect(() => {
    resize()
    const observer = new ResizeObserver(resize)
    if (canvasRef.current) observer.observe(canvasRef.current)
    return () => observer.disconnect()
  }, [resize])

  const pointOf = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    const p = pointOf(e)
    lastRef.current = p
    midRef.current = p
    // 单击也要留下一个点，否则盖章式的落笔看不见
    const ctx = e.currentTarget.getContext('2d')
    if (ctx) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2)
      ctx.fillStyle = penColor
      ctx.fill()
    }
    markDirty()
  }

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    e.preventDefault()
    const ctx = e.currentTarget.getContext('2d')
    const last = lastRef.current
    const mid = midRef.current
    if (!ctx || !last || !mid) return
    const p = pointOf(e)
    // 以相邻两点的中点作为二次贝塞尔终点，把折线磨成顺滑曲线
    const nextMid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 }
    ctx.beginPath()
    ctx.moveTo(mid.x, mid.y)
    ctx.quadraticCurveTo(last.x, last.y, nextMid.x, nextMid.y)
    ctx.stroke()
    lastRef.current = p
    midRef.current = nextMid
  }

  const handleUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    drawingRef.current = false
    lastRef.current = null
    midRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const clear = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    emptyRef.current = true
    setEmpty(true)
    onChange?.(true)
  }, [onChange])

  useImperativeHandle(ref, () => ({
    toDataURL: () => (emptyRef.current ? null : canvasRef.current?.toDataURL('image/png') ?? null),
    clear,
    isEmpty: () => emptyRef.current,
  }), [clear])

  return (
    <div className="sig-pad">
      <div className="sig-canvas-wrap" style={{ height }}>
        <canvas
          ref={canvasRef}
          className="sig-canvas"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          onPointerLeave={handleUp}
        />
        {empty && <span className="sig-placeholder">{t('dramaIpo.signHere')}</span>}
        <span className="sig-baseline" />
      </div>
      <div className="sig-actions">
        <span className="sig-tip">{t('dramaIpo.signTip')}</span>
        <button type="button" className="sig-clear" onClick={clear} disabled={empty}>
          {t('dramaIpo.signClear')}
        </button>
      </div>
    </div>
  )
})

export default SignaturePad
