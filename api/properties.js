module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const response = await fetch('https://api.notion.com/v1/databases/d2c50809-3534-4fc5-a7cd-8f1e67b5b25a/query', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({ page_size: 100 })
    });

    const data = await response.json();

    if (!data.results) {
      return res.status(500).json({ error: 'Notion error', details: data });
    }

    const properties = data.results.map(page => {
      const p = page.properties;
      return {
        id:       page.id,
        name:     p['اسم العقار | Property Name']?.title?.[0]?.plain_text || '',
        type:     p['النوع | Type']?.select?.name || '',
        status:   p['الحالة | Status']?.select?.name || '',
        deal:     p['نوع العملية | Deal Type']?.select?.name || '',
        price:    p['السعر (ريال) | Price (SAR)']?.number || 0,
        area:     p['المساحة (م²) | Area (m²)']?.number || 0,
        rooms:    p['عدد الغرف | Bedrooms']?.number || 0,
        baths:    p['دورات المياه | Bathrooms']?.number || 0,
        floor:    p['الطابق | Floor']?.number || 0,
        district: p['الحي | District']?.select?.name || '',
        parking:  p['موقف سيارات | Parking']?.checkbox || false,
        elevator: p['مصعد | Elevator']?.checkbox || false,
        ac:       p['مكيف | A/C']?.checkbox || false,
        phone:    p['هاتف التواصل | Contact Phone']?.phone_number || '',
        photo:    p['رابط الصور | Photos URL']?.url || '',
        notes:    p['ملاحظات | Notes']?.rich_text?.[0]?.plain_text || ''
      };
    });

    res.status(200).json({ properties });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
