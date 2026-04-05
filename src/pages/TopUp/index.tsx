import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Select, message, Spin, Tag } from 'antd'
import { CopyOutlined, ExclamationCircleOutlined, LoadingOutlined, SwapOutlined } from '@ant-design/icons'
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

type DepositStrategy = 'CONTRACT_CALL' | 'DIRECT_TRANSFER'

/**
 * Detect whether the current browser environment is inside a wallet DApp browser
 * that does NOT support complex contract calls (only supports standard SPL transfers).
 *
 * Returns 'DIRECT_TRANSFER' for OKX, Binance Web3, etc.
 * Returns 'CONTRACT_CALL' for Phantom, Solflare, and desktop browsers.
 */
function detectDepositStrategy(): DepositStrategy {
  if (typeof window === 'undefined') return 'CONTRACT_CALL'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  const ua = navigator.userAgent

  if (w.okxwallet?.solana || /OKApp/i.test(ua)) return 'DIRECT_TRANSFER'
  if (w.BinanceChain) return 'DIRECT_TRANSFER'

  return 'CONTRACT_CALL'
}

function getDetectedWalletName(): string | null {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  const ua = navigator.userAgent
  if (w.okxwallet?.solana || /OKApp/i.test(ua)) return 'OKX Wallet'
  if (w.BinanceChain) return 'Binance Web3'
  if (w.phantom?.solana) return 'Phantom'
  if (w.solflare) return 'Solflare'
  if (w.bitkeep?.solana) return 'Bitget Wallet'
  if (w.trustwallet?.solana) return 'Trust Wallet'
  if (w.coinbaseSolana) return 'Coinbase Wallet'
  if (w.coin98?.sol) return 'Coin98'
  if (w.tokenpocket?.solana) return 'TokenPocket'
  return null
}

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

/**
 * Build a standard SPL Token `transferChecked` instruction.
 * This is the fallback for wallets that cannot handle custom program instructions.
 */
function buildDirectTransferInstruction(
  source: PublicKey,
  mint: PublicKey,
  destination: PublicKey,
  authority: PublicKey,
  tokenProgramId: PublicKey,
  amount: bigint,
  decimals: number,
): TransactionInstruction {
  const data = Buffer.alloc(10)
  data.writeUInt8(12, 0) // transferChecked instruction discriminator
  data.writeBigUInt64LE(amount, 1)
  data.writeUInt8(decimals, 9)

  return new TransactionInstruction({
    programId: tokenProgramId,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
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

function isUnrecognizedTxError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const patterns = [
    'unknown',
    'unrecognized',
    'unsupported',
    'not supported',
    'User rejected',
    'Transaction simulation failed',
    'failed to simulate',
    'WalletSignTransactionError',
  ]
  return patterns.some((p) => msg.toLowerCase().includes(p.toLowerCase()))
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

  const autoStrategy = useMemo(() => detectDepositStrategy(), [])
  const detectedWallet = useMemo(() => getDetectedWalletName(), [])
  const [strategy, setStrategy] = useState<DepositStrategy>(autoStrategy)


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
    const text = deposit?.programId ?? ''
    if (!text) return
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
      message.success(t('topup.copySuccess'))
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      message.success(t('topup.copySuccess'))
    }
  }


  const pollForDeposit = useCallback(async () => {
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
          setTimeout(() => navigate('/nodes'), 1000)
          break
        }
      } catch (_) {
        // ignore polling errors
      }
    }
    if (!synced) {
      message.info(t('topup.syncDelayed'))
    }
    setSyncing(false)
    setSyncAttempt(0)
  }, [balance, refreshUsdtBalance, t, navigate])

  const buildContractCallTx = useCallback(async (
    depositConfig: DepositAddress,
    wallet: PublicKey,
    rawAmount: bigint,
  ) => {
    const programId = new PublicKey(depositConfig.programId)
    const mint = new PublicKey(depositConfig.mintAddress)
    const tokenProgramId = new PublicKey(depositConfig.tokenProgramId)
    const collectionTokenAccount = new PublicKey(depositConfig.collectionTokenAccount)
    const vaultAuthority = new PublicKey(depositConfig.vaultAuthority)
    const collectionOwner = new PublicKey(depositConfig.collectionOwner)

    const [vaultState] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), vaultAuthority.toBuffer()],
      programId,
    )

    const userTokenAccount = getATA(wallet, mint, tokenProgramId)
    const tx = new Transaction()

    const userAtaInfo = await connection.getAccountInfo(userTokenAccount)
    if (!userAtaInfo) {
      tx.add(buildCreateAtaInstruction(wallet, userTokenAccount, wallet, mint, tokenProgramId))
    }

    const collectionAtaInfo = await connection.getAccountInfo(collectionTokenAccount)
    if (!collectionAtaInfo) {
      tx.add(buildCreateAtaInstruction(wallet, collectionTokenAccount, collectionOwner, mint, tokenProgramId))
    }

    tx.add(buildDepositInstruction(
      programId, vaultState, userTokenAccount, collectionTokenAccount,
      mint, wallet, tokenProgramId, rawAmount,
    ))
    return tx
  }, [connection])

  const buildDirectTransferTx = useCallback(async (
    depositConfig: DepositAddress,
    wallet: PublicKey,
    rawAmount: bigint,
  ) => {
    const programId = new PublicKey(depositConfig.programId)
    const mint = new PublicKey(depositConfig.mintAddress)
    const tokenProgramId = new PublicKey(depositConfig.tokenProgramId)

    // 直接转账目标：合约地址的 USDT ATA（后端 ATA 扫描已监听此地址）
    const contractAta = getATA(programId, mint, tokenProgramId)

    const userTokenAccount = getATA(wallet, mint, tokenProgramId)
    const tx = new Transaction()

    const userAtaInfo = await connection.getAccountInfo(userTokenAccount)
    if (!userAtaInfo) {
      tx.add(buildCreateAtaInstruction(wallet, userTokenAccount, wallet, mint, tokenProgramId))
    }

    const contractAtaInfo = await connection.getAccountInfo(contractAta)
    if (!contractAtaInfo) {
      tx.add(buildCreateAtaInstruction(wallet, contractAta, programId, mint, tokenProgramId))
    }

    tx.add(buildDirectTransferInstruction(
      userTokenAccount, mint, contractAta,
      wallet, tokenProgramId, rawAmount, DEPOSIT_DECIMALS,
    ))
    return tx
  }, [connection])

  const handleDeposit = useCallback(async () => {
    if (!deposit || !publicKey || !sendTransaction) return
    const numAmount = Number(amount)
    if (!numAmount || numAmount <= 0) {
      message.warning(t('topup.amountRequired'))
      return
    }

    if (!deposit.programId || !deposit.mintAddress || !deposit.tokenProgramId || !deposit.collectionTokenAccount || !deposit.vaultAuthority || !deposit.collectionOwner) {
      message.error(t('topup.configIncomplete'))
      console.error('Deposit config:', deposit)
      return
    }

    setSubmitting(true)
    try {
      const rawAmount = BigInt(Math.round(numAmount * 10 ** DEPOSIT_DECIMALS))
      let sig: string

      if (strategy === 'DIRECT_TRANSFER') {
        const tx = await buildDirectTransferTx(deposit, publicKey, rawAmount)
        sig = await sendTransaction(tx, connection)
      } else {
        try {
          const tx = await buildContractCallTx(deposit, publicKey, rawAmount)
          sig = await sendTransaction(tx, connection)
        } catch (contractErr: unknown) {
          if (isUnrecognizedTxError(contractErr)) {
            console.warn('Contract call rejected, falling back to direct transfer:', contractErr)
            message.info(t('topup.fallbackToDirectTransfer'))
            setStrategy('DIRECT_TRANSFER')
            const tx = await buildDirectTransferTx(deposit, publicKey, rawAmount)
            sig = await sendTransaction(tx, connection)
          } else {
            throw contractErr
          }
        }
      }

      await waitForSignatureConfirmed(connection, sig)
      message.success(`${t('topup.submitSuccess')} tx: ${sig.slice(0, 12)}...`)
      await pollForDeposit()
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      message.error(errMsg)
    } finally {
      setSyncing(false)
      setSyncAttempt(0)
      setSubmitting(false)
    }
  }, [deposit, publicKey, sendTransaction, amount, connection, t, strategy, buildContractCallTx, buildDirectTransferTx, pollForDeposit])

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

        {/* Deposit strategy indicator */}
        <div className="strategy-bar">
          <div className="strategy-info">
            <Tag color={strategy === 'DIRECT_TRANSFER' ? 'orange' : 'green'}>
              {strategy === 'DIRECT_TRANSFER' ? t('topup.strategyDirect') : t('topup.strategyContract')}
            </Tag>
            {detectedWallet && (
              <span className="detected-wallet">{t('topup.detectedWallet', { wallet: detectedWallet })}</span>
            )}
          </div>
          <Button
            type="link"
            size="small"
            icon={<SwapOutlined />}
            onClick={() => setStrategy(strategy === 'CONTRACT_CALL' ? 'DIRECT_TRANSFER' : 'CONTRACT_CALL')}
          >
            {t('topup.switchStrategy')}
          </Button>
        </div>
        {strategy === 'DIRECT_TRANSFER' && (
          <div className="tip-box strategy-tip">
            ⓘ {t('topup.directStrategyTip')}
          </div>
        )}

        <div className="form-section">
          <h3 className="section-label">{t('topup.depositAddr')}</h3>
          <div className="section-content">
            <div className="chain-display">
              <span className="chain-dot solana" />
              <span className="chain-name">{deposit?.chain ?? CHAIN_NAME}</span>
            </div>

            {strategy === 'DIRECT_TRANSFER' ? (
              <>
                <div className="address-block">
                  <span className="address-label">{t('topup.directTransferAddrLabel')}</span>
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
              </>
            ) : (
              <>
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
              </>
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
