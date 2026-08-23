import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import SignaturePad, { type SignaturePadHandle } from '@/components/SignaturePad'
import { previewSignDramaAgreement, signDramaAgreement } from '@/api'
import type { DramaPendingAgreement } from '@/types'
import './index.css'

interface Props {
  open: boolean
  /** 待签署的认购；为空时不渲染 */
  target: DramaPendingAgreement | null
  onClose: () => void
  /** 签署成功回调。父级负责关闭弹窗或切到下一份待签合同 */
  onSigned: () => void | Promise<void>
}

/**
 * 《本金返还及收益分配电子协议》签署弹窗。
 *
 * 在认购付款成功之后弹出：协议里的投资起算日（T 日）、实际投资额、投资占比
 * 都要等链上到账才能定稿，所以签署必然发生在付款后。
 */
export default function ContractSignModal({ open, target, onClose, onSigned }: Props) {
  const { t } = useTranslation()
  const padRef = useRef<SignaturePadHandle>(null)

  const [contentHtml, setContentHtml] = useState('')
  const [contractNo, setContractNo] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [signerName, setSignerName] = useState('')
  const [signerIdNo, setSignerIdNo] = useState('')
  const [signerPhone, setSignerPhone] = useState('')
  const [sigEmpty, setSigEmpty] = useState(true)
  // 阅读读秒：弹窗打开后 10s 内不允许签署；不强制读完合同、实名信息选填
  const [countdown, setCountdown] = useState(10)
  const docRef = useRef<HTMLDivElement>(null)

  const subscriptionId = target?.subscriptionId ?? ''

  const loadPreview = useCallback(async (draft: {
    signerName?: string; signerIdNo?: string; signerPhone?: string
  }) => {
    if (!subscriptionId) return
    setLoading(true)
    try {
      const res = await previewSignDramaAgreement(subscriptionId, draft)
      setContentHtml(res.data?.contentHtml ?? '')
      setContractNo(res.data?.contractNo ?? '')
    } catch {
      setContentHtml('')
    } finally {
      setLoading(false)
    }
  }, [subscriptionId])

  useEffect(() => {
    if (!open || !subscriptionId) return
    setSignerName('')
    setSignerIdNo('')
    setSignerPhone('')
    padRef.current?.clear()
    loadPreview({})

    setCountdown(10)
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(timer); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [open, subscriptionId, loadPreview])

  // 实名信息填完后刷新一次正文，让用户看到自己的信息已填进合同（选填）
  const refreshWithIdentity = () => {
    if (!signerName.trim()) return
    loadPreview({
      signerName: signerName.trim(),
      signerIdNo: signerIdNo.trim().toUpperCase(),
      signerPhone: signerPhone.trim(),
    })
  }

  const handleSubmit = async () => {
    if (submitting || !subscriptionId) return
    const name = signerName.trim()
    const idNo = signerIdNo.trim().toUpperCase()
    const phone = signerPhone.trim()

    const signatureImage = padRef.current?.toDataURL()
    if (!signatureImage) return message.warning(t('dramaIpo.errSignature'))

    setSubmitting(true)
    try {
      await signDramaAgreement({
        subscriptionId, signerName: name, signerIdNo: idNo, signerPhone: phone, signatureImage,
      })
      message.success(t('dramaIpo.signSuccess'))
      // 由父级决定是关闭还是接上下一份待签合同（一人可能买了多部剧），
      // 这里不再自行 onClose，否则会和父级的「切到下一份」互相打架
      await onSigned()
    } catch (err: unknown) {
      const serverMsg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? ''
      message.error(`${t('dramaIpo.signFail')}${serverMsg ? `: ${serverMsg.slice(0, 60)}` : ''}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (!open || !target) return null

  return (
    <div className="csm-mask">
      <div className="csm-modal">
        <div className="csm-head">
          <div>
            <div className="csm-title">{t('dramaIpo.contractTitle')}</div>
            <div className="csm-sub">
              {contractNo || t('dramaIpo.contractLoading')}　·　{target.serialNo} {target.projectName}
              　·　{target.shares} {t('dramaIpo.shareUnit')} / {Number(target.amountUsdt).toFixed(2)} USDT
            </div>
          </div>
          <button type="button" className="csm-close" onClick={onClose} aria-label="close">×</button>
        </div>

        <div className="csm-body">
          <div className="csm-doc contract-doc" ref={docRef}>
            {loading
              ? <div className="csm-loading">{t('dramaIpo.loading')}</div>
              : contentHtml
                ? <div dangerouslySetInnerHTML={{ __html: contentHtml }} />
                : <div className="csm-loading">{t('dramaIpo.agreementLoadFail')}</div>}
          </div>

          <div className="csm-form">
            <div className="csm-form-title">{t('dramaIpo.partyAInfo')}</div>

            <label className="csm-field">
              <span className="csm-label">{t('dramaIpo.signerName')}</span>
              <input
                className="csm-input"
                value={signerName}
                maxLength={64}
                placeholder={t('dramaIpo.signerNamePh')}
                onChange={(e) => setSignerName(e.target.value)}
                onBlur={refreshWithIdentity}
              />
            </label>

            <label className="csm-field">
              <span className="csm-label">{t('dramaIpo.signerIdNo')}</span>
              <input
                className="csm-input"
                value={signerIdNo}
                maxLength={18}
                placeholder={t('dramaIpo.signerIdNoPh')}
                onChange={(e) => setSignerIdNo(e.target.value)}
                onBlur={refreshWithIdentity}
              />
            </label>

            <label className="csm-field">
              <span className="csm-label">{t('dramaIpo.signerPhone')}</span>
              <input
                className="csm-input"
                value={signerPhone}
                maxLength={20}
                placeholder={t('dramaIpo.signerPhonePh')}
                onChange={(e) => setSignerPhone(e.target.value)}
                onBlur={refreshWithIdentity}
              />
            </label>

            <div className="csm-field">
              <span className="csm-label">{t('dramaIpo.handSignature')}</span>
              <SignaturePad ref={padRef} height={170} onChange={setSigEmpty} />
            </div>

          </div>
        </div>

        <div className="csm-foot">
          <button type="button" className="csm-later" onClick={onClose} disabled={submitting}>
            {t('dramaIpo.signLater')}
          </button>
          <button
            type="button"
            className="csm-submit"
            onClick={handleSubmit}
            disabled={submitting || sigEmpty || countdown > 0}
          >
            {submitting
              ? t('dramaIpo.signing')
              : countdown > 0
                ? `${t('dramaIpo.confirmSign')} (${countdown}s)`
                : t('dramaIpo.confirmSign')}
          </button>
        </div>
      </div>
    </div>
  )
}
