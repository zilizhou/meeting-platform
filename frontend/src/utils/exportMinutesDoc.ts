/** 将会议数据导出为可被 Word 打开的 .doc（HTML Word 格式） */

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function nl2br(s: string): string {
  return esc(s).replace(/\n/g, '<br/>')
}

function formatTime(v?: string | Date | null) {
  if (!v) return '—'
  return new Date(v).toLocaleString('zh-CN')
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    APPROVED: '通过',
    REJECTED: '未通过',
    DEFERRED: '暂缓',
    ON_AGENDA: '已入议程',
    DISCUSSED: '已讨论',
    RESOLVED: '已决议',
  }
  return map[s] || s || '—'
}

export function exportMeetingMinutesDoc(meeting: any) {
  if (!meeting) return

  const isParty = meeting.meetingType === 'PARTY_COMMITTEE'
  const meetingLabel = isParty ? '党组织会议' : '党政联席会议'
  const college = meeting.college?.name || ''
  const title = `${college}${meetingLabel}纪要`
  const period = meeting.periodNo ? `（${esc(meeting.periodNo)}）` : ''

  const topicHtml = (meeting.topics || [])
    .map((t: any, idx: number) => {
      const res = t.resolution
      const resLine = res
        ? `<p><b>会议决议：</b>${esc(
            `${statusLabel(res.resultType)}${res.content ? `。${res.content}` : ''}${
              res.isPublic ? '（按规定公开）' : ''
            }`,
          )}</p>`
        : ''

      return `
        <h3>${idx + 1}. ${esc(t.title)}</h3>
        <p><b>议题概况：</b>${t.content ? nl2br(t.content) : '（无正文）'}</p>
        <p><b>议题状态：</b>${esc(statusLabel(t.status))}
          ${t.isMajor ? ' · 重大事项' : ''}
          ${t.proposer?.realName ? ` · 提出人 ${esc(t.proposer.realName)}` : ''}
        </p>
        ${resLine}
      `
    })
    .join('<br/>')

  const minutesBody = meeting.minutes?.content || ''

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
<title>${esc(title)}</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
  @page { size: A4; margin: 2.5cm 2.8cm 2.5cm 2.8cm; }
  body {
    font-family: "STZhongsong", "华文中宋", "SimSun", "宋体", serif;
    font-size: 16px;
    line-height: 1.75;
    color: #000;
  }
  h1 {
    text-align: center;
    font-size: 22px;
    font-weight: bold;
    margin: 0 0 8px;
  }
  .period {
    text-align: center;
    font-size: 16px;
    margin-bottom: 24px;
  }
  h2 {
    font-size: 18px;
    margin: 22px 0 10px;
    border-bottom: 1px solid #333;
    padding-bottom: 4px;
  }
  h3 {
    font-size: 16px;
    margin: 16px 0 8px;
  }
  p { margin: 6px 0; }
  .indent { text-indent: 0; margin-left: 1.5em; }
  .meta p { margin: 4px 0; }
  .sign { margin-top: 28px; }
  .footer {
    margin-top: 36px;
    font-size: 12px;
    color: #444;
  }
</style>
</head>
<body>
  <h1>${esc(title)}</h1>
  <div class="period">${period || '&nbsp;'}</div>

  <h2>一、会议概况</h2>
  <div class="meta">
    <p><b>会议名称：</b>${esc(meeting.title)}</p>
    <p><b>会议类型：</b>${esc(meetingLabel)}</p>
    <p><b>会议时间：</b>${esc(formatTime(meeting.scheduledAt))}</p>
    ${meeting.isMajor ? '<p><b>事项性质：</b>重大事项</p>' : ''}
  </div>

  <h2>二、议题与决议</h2>
  ${topicHtml || '<p>本次会议无入会议题。</p>'}

  <h2>三、会议纪要正文</h2>
  <p>${minutesBody ? nl2br(minutesBody) : '（纪要正文尚未起草）'}</p>

  <div class="footer">
    <p>导出时间：${esc(formatTime(new Date()))}</p>
    <p>本文件由曲师大双会管理系统根据议题与会后决议生成，请以系统保存的纪要正文为准。</p>
  </div>
</body>
</html>`

  const blob = new Blob(['\ufeff', html], {
    type: 'application/msword;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeName = `${college || ''}${meetingLabel}纪要${meeting.periodNo ? `-${meeting.periodNo}` : ''}`.replace(
    /[\\/:*?"<>|]/g,
    '_',
  )
  a.href = url
  a.download = `${safeName || '会议纪要'}.doc`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
