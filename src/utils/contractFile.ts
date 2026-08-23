import { fetchDramaContractDocument } from '@/api'

/**
 * 合同的下载与打印。
 *
 * 服务端已经把合同渲染成一份白底纸质样式的单文件 HTML，签名图内联成 base64，
 * 所以这两个动作都只是拿到那段字符串后换个消费方式：
 *   下载 → 存成 .html 文件，离线双击即可打开
 *   打印 → 塞进隐藏 iframe 调 print()，用户在打印对话框里选「存为 PDF」
 *
 * 不引 jsPDF / html2canvas：那套是把页面截成位图再塞进 PDF，文字不可选、
 * 中文字形容易糊，对一份需要举证的法律文书来说不合适。浏览器原生打印
 * 输出的是矢量文本 PDF，质量最好且零依赖。
 */

function fileNameOf(contractNo: string | null, projectName: string) {
  const safe = `${contractNo || 'contract'}_${projectName}`.replace(/[\\/:*?"<>|]/g, '_')
  return `${safe}.html`
}

export async function downloadContract(
  subscriptionId: string,
  contractNo: string | null,
  projectName: string,
) {
  const res = await fetchDramaContractDocument(subscriptionId)
  const blob = new Blob([res.data], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileNameOf(contractNo, projectName)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 立刻 revoke 会让部分浏览器来不及取用 blob，延后释放
  setTimeout(() => URL.revokeObjectURL(url), 4000)
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
