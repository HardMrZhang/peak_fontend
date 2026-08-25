import { fetchDramaContractDocument, fetchDramaContractPdf } from '@/api'

/**
 * 合同的下载与打印。
 *
 * 下载 → 服务端用 headless Chrome 把合同渲染成矢量文本 PDF（文字可选、
 *        中文清晰），直接存成 .pdf；渲染服务不可用时降级为单文件 HTML。
 * 打印 → 拿单文件 HTML 塞进隐藏 iframe 调 print()。
 *
 * 不引 jsPDF / html2canvas：那套是把页面截成位图再塞进 PDF，文字不可选、
 * 中文字形容易糊，对一份需要举证的法律文书来说不合适。
 */

function fileNameOf(contractNo: string | null, projectName: string, ext: string) {
  const safe = `${contractNo || 'contract'}_${projectName}`.replace(/[\\/:*?"<>|]/g, '_')
  return `${safe}.${ext}`
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 立刻 revoke 会让部分浏览器来不及取用 blob，延后释放
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

const isMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)

export async function downloadContract(
  subscriptionId: string,
  contractNo: string | null,
  projectName: string,
) {
  // 手机端（尤其钱包内置浏览器）里 blob + a.download 经常静默失败，
  // 改为直开带鉴权参数的 PDF 链接：inline 模式页内预览，可再分享/保存
  if (isMobile()) {
    const base = import.meta.env.VITE_API_BASE_URL ?? '/api'
    const token = localStorage.getItem('peak_token') ?? ''
    const url = `${base}/drama-ipo/agreement/${subscriptionId}/download.pdf`
      + `?inline=1&access_token=${encodeURIComponent(token)}`
    const win = window.open(url, '_blank')
    // 弹窗被拦截时退化为当前页跳转（返回键可回来）
    if (!win) window.location.href = url
    return
  }

  try {
    const res = await fetchDramaContractPdf(subscriptionId)
    saveBlob(res.data, fileNameOf(contractNo, projectName, 'pdf'))
  } catch {
    // PDF 渲染服务不可用时退回 HTML，保证合同始终拿得到
    const res = await fetchDramaContractDocument(subscriptionId)
    saveBlob(
      new Blob([res.data], { type: 'text/html;charset=utf-8' }),
      fileNameOf(contractNo, projectName, 'html'),
    )
  }
}

export async function printContract(subscriptionId: string) {
  const res = await fetchDramaContractDocument(subscriptionId)
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const cleanup = () => {
    if (iframe.parentNode) document.body.removeChild(iframe)
  }

  const doc = iframe.contentDocument
  if (!doc) { cleanup(); return }
  doc.open()
  doc.write(res.data)
  doc.close()

  // 等内联的 base64 签名图解码完再打印，否则签名栏会是空的
  const run = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } finally {
      setTimeout(cleanup, 60000)
    }
  }
  if (iframe.contentWindow?.document.readyState === 'complete') {
    setTimeout(run, 120)
  } else {
    iframe.onload = () => setTimeout(run, 120)
  }
}
