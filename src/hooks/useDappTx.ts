import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js'
import type { DappIxParams } from '@/types'

export function hasToken(): boolean {
  return !!localStorage.getItem('peak_token')
}

/** 发送后端构造好的指令 / 部分签名交易，并等待链上确认 */
export function useDappTx() {
  const { t } = useTranslation()
  const { connection } = useConnection()
  const { publicKey, sendTransaction, connected } = useWallet()

  const sendDappIx = useCallback(
    async (p: DappIxParams): Promise<string> => {
      if (!publicKey || !sendTransaction || !connected) {
        throw new Error(t('account.walletRequired'))
      }
      let tx: Transaction
      if (p.transactionBase64) {
        // operator 已部分签名的完整交易：直接反序列化补签发送，
        // 不可改动内容（含加 ComputeBudget 指令），否则 operator 签名失效
        tx = Transaction.from(Buffer.from(p.transactionBase64, 'base64'))
      } else {
        const ix = new TransactionInstruction({
          programId: new PublicKey(p.programId!),
          keys: (p.keys || []).map((k) => ({
            pubkey: new PublicKey(k.pubkey),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: Buffer.from(p.data!, 'base64'),
        })
        tx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
          ix,
        )
      }
      const sig = await sendTransaction(tx, connection, { skipPreflight: true })

      const startMs = Date.now()
      const TIMEOUT_MS = 60_000
      let confirmed = false
      while (Date.now() - startMs < TIMEOUT_MS) {
        const resp = await connection.getSignatureStatuses([sig])
        const status = resp?.value?.[0]
        if (status?.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`)
        if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
          confirmed = true
          break
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
      if (!confirmed) throw new Error('Transaction confirmation timeout')
      return sig
    },
    [publicKey, sendTransaction, connected, connection, t],
  )

  return { sendDappIx, connected }
}
