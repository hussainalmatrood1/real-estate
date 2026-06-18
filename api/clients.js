module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, mobile, email, requestType, propertyType, district, budget, source, notes, propertyName } = req.body;

  if (!name || !mobile) return res.status(400).json({ error: 'Name and mobile required' });

  const today = new Date().toISOString().split('T')[0];

  const properties = {
    'اسم العميل | Client Name': { title: [{ text: { content: name } }] },
    'رقم الجوال | Mobile':      { phone_number: mobile },
    'حالة العميل | Client Status': { select: { name: 'جديد | New' } },
    'الأولوية | Priority':         { select: { name: 'متوسطة | Medium' } },
    'مصدر العميل | Lead Source':   { select: { name: source || 'موقع | Website' } },
    'أول تواصل | First Contact':   { date: { start: today } },
    'آخر تواصل | Last Contact':    { date: { start: today } },
  };

  if (email)        properties['البريد الإلكتروني | Email'] = { email };
  if (requestType)  properties['نوع الطلب | Request Type']  = { select: { name: requestType } };
  if (propertyType) properties['نوع العقار المطلوب | Property Type Needed'] = { select: { name: propertyType } };
  if (district)     properties['الحي المفضل | Preferred District'] = { rich_text: [{ text: { content: district } }] };
  if (budget)       properties['الميزانية (ريال) | Budget (SAR)'] = { number: parseFloat(budget) };

  const notesText = propertyName
    ? `مهتم بعقار: ${propertyName}${notes ? ' — ' + notes : ''}`
    : (notes || '');
  if (notesText) properties['ملاحظات | Notes'] = { rich_text: [{ text: { content: notesText } }] };

  try {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        parent: { database_id: 'b45f8759-b583-48c7-9372-cc72b88767d6' },
        properties
      })
    });

    const data = await response.json();
    if (data.id) {
      res.status(200).json({ success: true, id: data.id });
    } else {
      throw new Error(JSON.stringify(data));
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
