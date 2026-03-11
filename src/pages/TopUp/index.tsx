import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Select, message, Spin } from 'antd'
import { CopyOutlined, ExclamationCircleOutlined, LoadingOutlined } from '@ant-design/icons'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, TransactionInstruction, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js'
import { QRCodeSVG } from 'qrcode.react'
import { getDepositAddress, getBalances } from '@/api'
import type { DepositAddress, AssetBalance } from '@/types'
import { useAuthStore } from '@/store/useAuthStore'
import { CHAIN_NAME } from '@/constants'
import './index.css'

const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
const DEPOSIT_DECIMALS = 6

function getATA(owner: PublicKey, mint: PublicKey, tokenProgramId: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )
  return ata
}

async function waitForSignatureConfirmed(connection: ReturnType<typeof useConnection>['connection'], signature: string, timeoutMs = 60000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const resp = await connection.getSignatureStatuses([signature])
    const status = resp?.value?.[0]
    if (status) {
      if (status.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`)
      if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') return
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error(`Transaction not confirmed within ${timeoutMs / 1000}s: ${signature}`)
}

function buildDepositInstruction(
  programId: PublicKey,
  vaultState: PublicKey,
  userTokenAccount: PublicKey,
  collectionTokenAccount: PublicKey,
  mint: PublicKey,
  user: PublicKey,
  tokenProgramId: PublicKey,
  amount: bigint,
): TransactionInstruction {
  const disc = Buffer.from([242, 35, 198, 137, 82, 225, 242, 182])
  const amountBuf = Buffer.alloc(8)
  amountBuf.writeBigUInt64LE(amount)
  const data = Buffer.concat([disc, amountBuf])

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: vaultState, isSigner: false, isWritable: false },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: collectionTokenAccount, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    ],
    data,
  })
}

function buildCreateAtaInstruction(
  payer: PublicKey,
  associatedTokenAccount: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  tokenProgramId: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedTokenAccount, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  })
}

const quickAmounts = [500, 1000, 5000]

export default function TopUp() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { connection } = useConnection()
  const { connected, publicKey, sendTransaction } = useWallet()
  const token = useAuthStore((s) => s.token)
  const loginLoading = useAuthStore((s) => s.loginLoading)
  const loginFailed = useAuthStore((s) => s.loginFailed)
  const setLoginFailed = useAuthStore((s) => s.setLoginFailed)
  const [amount, setAmount] = useState('500')
  const [deposit, setDeposit] = useState<DepositAddress | null>(null)
  const [balance, setBalance] = useState<string>('0.00')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncAttempt, setSyncAttempt] = useState(0)
  const maxSyncAttempts = 30

  const refreshUsdtBalance = useCallback(async () => {
    const r = await getBalances()
    const usdt = r.data.find((b: AssetBalance) => b.asset === 'USDT')
    const next = usdt ? Number(usdt.availableAmount).toFixed(2) : '0.00'
    setBalance(next)
    return Number(next)
  }, [])

  useEffect(() => {
    if (!connected || !token) {
      setLoading(false)
      return
    }
    setLoading(true)
    Promise.all([
      getDepositAddress('USDT').then((r) => setDeposit(r.data)).catch(() => {}),
      refreshUsdtBalance().catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [connected, token, refreshUsdtBalance])

  const handleCopy = () => {
    navigator.clipboard.writeText(deposit?.programId ?? '')
    message.success(t('topup.copySuccess'))
  }

  const handleDeposit = useCallback(async () => {
    if (!deposit || !publicKey || !sendTransaction) return
    const numAmount = Number(amount)
    if (!numAmount || numAmount <= 0) {
      message.warning(t('topup.amountRequired'))
      return
    }

    if (!deposit.programId || !deposit.mintAddress || !deposit.tokenProgramId || !deposit.collectionTokenAccount || !deposit.vaultAuthority || !deposit.collectionOwner) {
      message.error('Deposit config incomplete. Please refresh and try again.')
      console.error('Deposit config:', deposit)
      return
    }

    setSubmitting(true)
    try {
      const programId = new PublicKey(deposit.programId)
      const mint = new PublicKey(deposit.mintAddress)
      const tokenProgramId = new PublicKey(deposit.tokenProgramId)
      const collectionTokenAccount = new PublicKey(deposit.collectionTokenAccount)
      const vaultAuthority = new PublicKey(deposit.vaultAuthority)
      const collectionOwner = new PublicKey(deposit.collectionOwner)

      const [vaultState] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), vaultAuthority.toBuffer()],
        programId,
      )

      const userTokenAccount = getATA(publicKey, mint, tokenProgramId)
      const rawAmount = BigInt(Math.round(numAmount * 10 ** DEPOSIT_DECIMALS))

      const tx = new Transaction()

      const userAtaInfo = await connection.getAccountInfo(userTokenAccount)
      if (!userAtaInfo) {
        tx.add(buildCreateAtaInstruction(publicKey, userTokenAccount, publicKey, mint, tokenProgramId))
      }

      const collectionAtaInfo = await connection.getAccountInfo(collectionTokenAccount)
      if (!collectionAtaInfo) {
        tx.add(buildCreateAtaInstruction(publicKey, collectionTokenAccount, collectionOwner, mint, tokenProgramId))
      }

      tx.add(buildDepositInstruction(
        programId,
        vaultState,
        userTokenAccount,
        collectionTokenAccount,
        mint,
        publicKey,
        tokenProgramId,
        rawAmount,
      ))
      const sig = await sendTransaction(tx, connection)
      await waitForSignatureConfirmed(connection, sig)
      message.success(`${t('topup.submitSuccess')} tx: ${sig.slice(0, 12)}...`)

      // 交易上链后主动轮询一段时间，到账即刻更新页面余额
      const before = Number(balance)
      let synced = false
      setSyncing(true)
      setSyncAttempt(0)
      for (let i = 0; i < maxSyncAttempts; i += 1) {
        setSyncAttempt(i + 1)
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 1000))
        try {
          // eslint-disable-next-line no-await-in-loop
          const latest = await refreshUsdtBalance()
          if (latest > before) {
            window.dispatchEvent(new Event('balance:refresh'))
            synced = true
            message.success(t('topup.syncDetected'))
            break
          }
        } catch (_) {
          // ignore polling errors
        }
      }
      if (!synced) {
        message.info(t('topup.syncDelayed'))
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      message.error(errMsg)
    } finally {
      setSyncing(false)
      setSyncAttempt(0)
      setSubmitting(false)
    }
  }, [deposit, publicKey, sendTransaction, amount, connection, t, balance, refreshUsdtBalance])

  if (!connected) {
    return (
      <div className="topup-page">
        <div className="topup-inner">
          <div className="empty-guard">
            <ExclamationCircleOutlined className="empty-guard-icon" />
            <h3>{t('account.walletRequired')}</h3>
            <p>{t('account.walletRequiredDesc')}</p>
            <Button className="empty-guard-btn" onClick={() => navigate('/account')}>{t('account.understood')}</Button>
          </div>
        </div>
      </div>
    )
  }

  if (loginLoading) {
    return (
      <div className="topup-page">
        <div className="topup-inner">
          <div className="empty-guard">
            <LoadingOutlined className="empty-guard-icon" style={{ color: '#f5a623' }} />
            <h3>{t('account.loginLoading')}</h3>
            <p>{t('account.loginLoadingDesc')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (loginFailed || !token) {
    return (
      <div className="topup-page">
        <div className="topup-inner">
          <div className="empty-guard">
            <ExclamationCircleOutlined className="empty-guard-icon" />
            <h3>{t('account.loginFailed')}</h3>
            <p>{t('account.loginFailedDesc')}</p>
            <Button className="empty-guard-btn" onClick={() => setLoginFailed(false)}>{t('account.retryLogin')}</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="topup-page">
      <div className="topup-inner">
        <Spin spinning={loading}>
        <div className="breadcrumb">{t('topup.breadcrumb')} <strong>{t('topup.title')}</strong></div>

        <div className="form-section">
          <h3 className="section-label">{t('topup.depositAddr')}</h3>
          <div className="section-content">
            <div className="chain-display">
              <span className="chain-dot solana" />
              <span className="chain-name">{deposit?.chain ?? CHAIN_NAME}</span>
            </div>

            <div className="address-block">
              <span className="address-label">{t('topup.addressLabel')}</span>
              <div className="address-row">
                <span className="address-text">{deposit?.programId || '...'}</span>
                <CopyOutlined className="copy-icon" onClick={handleCopy} />
              </div>
            </div>
            {deposit?.programId && (
              <div className="qr-section">
                <div className="qr-wrapper">
                  <QRCodeSVG
                    value={deposit.programId}
                    size={168}
                    bgColor="#ffffff"
                    fgColor="#111111"
                    level="M"
                    includeMargin
                  />
                </div>
                <span className="qr-hint">{t('topup.qrHint')}</span>
              </div>
            )}
            <div className="tip-box">
              ⓘ {t('topup.depositTip')}
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3 className="section-label">{t('topup.selectToken')}</h3>
          <div className="section-content">
            <Select
              defaultValue="USDT"
              className="token-select"
              options={[
                { value: 'USDT', label: '● USDT' },
              ]}
            />
          </div>
        </div>

        <div className="form-section">
          <h3 className="section-label">{t('topup.amountTitle')}</h3>
          <div className="section-content">
            <div className="balance-hint">
              ⚠ {t('topup.walletBalance')} <span className="orange">{balance} USDT</span>
            </div>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="amount-input"
              size="large"
            />
            <div className="quick-amounts">
              {quickAmounts.map((v) => (
                <span
                  key={v}
                  className={`quick-amount ${amount === String(v) ? 'active' : ''}`}
                  onClick={() => setAmount(String(v))}
                >
                  {v} USDT
                </span>
              ))}
            </div>
            <div className="tip-box">
              ⓘ {t('topup.amountTip')}
            </div>
          </div>
        </div>

        <Button className="submit-btn" block loading={submitting || syncing} onClick={handleDeposit}>
          {syncing ? t('topup.syncing') : t('topup.submitBtn')}
        </Button>
        {syncing && (
          <div className="tip-box" style={{ marginTop: 12 }}>
            ⓘ {t('topup.syncProgress', { current: syncAttempt, max: maxSyncAttempts })}
          </div>
        )}
        </Spin>
      </div>
    </div>
  )
}
