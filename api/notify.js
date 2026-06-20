const NOTION_TOKEN = process.env.NOTION_TOKEN;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'hussain.almatrood1@gmail.com';
const WHATSAPP_PHONE = process.env.WHATSAPP_PHONE || '';
const WHATSAPP_APIKEY = process.env.CALLMEBOT_APIKEY || '';
const CONTRACTS_DB = 'aa151995-a1ee-413b-9269-b1d790093975';

module.exports = async function handler(req, res) {
  // Allow manual trigger via GET or automatic via cron
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Fetch all contracts from Notion
    const notionRes = await fetch(`https://api.notion.com/v1/databases/${CONTRACTS_DB}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({ page_size: 100 })
    });

    const data = await notionRes.json();
    if (!data.results) return res.status(500).json({ error: 'Notion error', details: data });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const alerts = [];

    for (const page of data.results) {
      const p = page.properties;
      const contractNo   = p['رقم العقد | Contract No']?.title?.[0]?.plain_text || '–';
      const tenant       = p['اسم المستأجر/المشتري | Tenant/Buyer']?.rich_text?.[0]?.plain_text || '–';
      const property     = p['اسم العقار | Property Name']?.rich_text?.[0]?.plain_text || '–';
      const status       = p['حالة العقد | Status']?.select?.name || '';
      const endDateStr   = p['date:تاريخ النهاية | End Date:start']?.date?.start
                        || p['تاريخ النهاية | End Date']?.date?.start || null;
      const nextPayStr   = p['date:الدفعة القادمة | Next Payment Date:start']?.date?.start
                        || p['الدفعة القادمة | Next Payment Date']?.date?.start || null;
      const remaining    = p['مبلغ متبقي | Remaining (SAR)']?.number || 0;
      const payAmount    = p['قيمة الدفعة | Payment Amount (SAR)']?.number || 0;

      // Skip cancelled contracts
      if (status.includes('ملغي')) continue;

      // Check contract expiry (30, 14, 7 days warning)
      if (endDateStr) {
        const endDate = new Date(endDateStr);
        endDate.setHours(0, 0, 0, 0);
        const daysLeft = Math.round((endDate - today) / (1000 * 60 * 60 * 24));

        if ([30, 14, 7, 1].includes(daysLeft)) {
          alerts.push({
            type: 'expiry',
            urgency: daysLeft <= 7 ? 'high' : 'medium',
            contractNo,
            tenant,
            property,
            daysLeft,
            endDate: endDateStr,
            message: `⚠️ عقد ${contractNo} — ${property}\nالمستأجر: ${tenant}\nينتهي خلال ${daysLeft} يوم (${endDateStr})`
          });
        }

        // Already expired
        if (daysLeft < 0 && daysLeft >= -3) {
          alerts.push({
            type: 'expired',
            urgency: 'high',
            contractNo,
            tenant,
            property,
            daysLeft,
            endDate: endDateStr,
            message: `🔴 عقد ${contractNo} منتهي — ${property}\nالمستأجر: ${tenant}\nانتهى منذ ${Math.abs(daysLeft)} يوم`
          });
        }
      }

      // Check payment due (3 days warning)
      if (nextPayStr && remaining > 0) {
        const payDate = new Date(nextPayStr);
        payDate.setHours(0, 0, 0, 0);
        const daysToPayment = Math.round((payDate - today) / (1000 * 60 * 60 * 24));

        if ([3, 1, 0].includes(daysToPayment)) {
          alerts.push({
            type: 'payment',
            urgency: daysToPayment === 0 ? 'high' : 'medium',
            contractNo,
            tenant,
            property,
            daysToPayment,
            payDate: nextPayStr,
            payAmount,
            message: `💰 دفعة مستحقة — عقد ${contractNo}\nالعقار: ${property}\nالمستأجر: ${tenant}\nالمبلغ: ${payAmount.toLocaleString()} ريال\nتاريخ الاستحقاق: ${nextPayStr}`
          });
        }
      }
    }

    if (alerts.length === 0) {
      return res.status(200).json({ success: true, message: 'لا توجد تنبيهات اليوم', alerts: [] });
    }

    // 2. Send Email via Resend
    const emailHTML = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
  .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .header { background: linear-gradient(135deg, #1A1A2E, #0F3460); color: #C9A84C; padding: 28px 24px; text-align: center; }
  .header h1 { margin: 0; font-size: 22px; }
  .header p { margin: 6px 0 0; color: #aaa; font-size: 13px; }
  .body { padding: 24px; }
  .alert { border-radius: 8px; padding: 16px; margin-bottom: 14px; border-right: 4px solid; }
  .alert.high { background: #FFF5F5; border-color: #E05C5C; }
  .alert.medium { background: #FFFBEB; border-color: #D29922; }
  .alert h3 { margin: 0 0 8px; font-size: 15px; }
  .alert.high h3 { color: #C0392B; }
  .alert.medium h3 { color: #9A6700; }
  .alert p { margin: 4px 0; font-size: 13px; color: #555; white-space: pre-line; }
  .footer { background: #f9f9f9; padding: 16px 24px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; }
  .btn { display: inline-block; margin-top: 16px; padding: 10px 24px; background: #C9A84C; color: #1A1A2E; border-radius: 8px; text-decoration: none; font-weight: bold; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1>🏢 مكتبي العقاري — الدمام</h1>
    <p>تنبيهات يومية | Daily Alerts — ${new Date().toLocaleDateString('ar-SA')}</p>
  </div>
  <div class="body">
    <p style="color:#333;margin-bottom:20px">لديك <strong>${alerts.length}</strong> تنبيه يحتاج انتباهك اليوم:</p>
    ${alerts.map(a => `
    <div class="alert ${a.urgency}">
      <h3>${a.type === 'expiry' ? '⚠️ عقد يقترب من الانتهاء' : a.type === 'expired' ? '🔴 عقد منتهي' : '💰 دفعة مستحقة'}</h3>
      <p>${a.message}</p>
    </div>`).join('')}
    <div style="text-align:center">
      <a href="https://real-estate-phi-one-56.vercel.app" class="btn">فتح لوحة التحكم</a>
    </div>
  </div>
  <div class="footer">مكتبي العقاري | الدمام، المنطقة الشرقية</div>
</div>
</body>
</html>`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Real Estate Office <onboarding@resend.dev>',
        to: [NOTIFY_EMAIL],
        subject: `🏢 ${alerts.length} تنبيه عقاري — ${new Date().toLocaleDateString('ar-SA')}`,
        html: emailHTML
      })
    });

    const emailData = await emailRes.json();

    // 3. Send WhatsApp via CallMeBot (if configured)
    let whatsappResult = null;
    if (WHATSAPP_PHONE && WHATSAPP_APIKEY) {
      const msg = `🏢 مكتبي العقاري\n${alerts.length} تنبيه اليوم:\n\n${alerts.map(a => a.message).join('\n\n')}`;
      const encodedMsg = encodeURIComponent(msg);
      const waRes = await fetch(
        `https://api.callmebot.com/whatsapp.php?phone=${WHATSAPP_PHONE}&text=${encodedMsg}&apikey=${WHATSAPP_APIKEY}`
      );
      whatsappResult = await waRes.text();
    }

    res.status(200).json({
      success: true,
      alerts_count: alerts.length,
      alerts,
      email: emailData.id ? 'sent' : emailData,
      whatsapp: whatsappResult || 'not configured yet'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
