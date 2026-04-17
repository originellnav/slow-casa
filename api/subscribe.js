module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    const response = await fetch('https://api.beehiiv.com/v2/publications/pub_98ef614b-1c4e-46df-b312-dce94dc248c9/subscriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer LKJ0VSDPQjT76dMEtpgvbPD4TL1My0XJxLPWBt2G9nU4lfdv9qoYkP1WuRzWoXTq'
      },
      body: JSON.stringify({
        email,
        reactivate_existing: true,
        send_welcome_email: true
      })
    });

    const data = await response.json();
    console.log('Beehiiv status:', response.status, 'body:', JSON.stringify(data));

    if (response.ok) {
      return res.status(200).json({ success: true });
    } else {
      return res.status(400).json({ error: data.message || 'Subscription failed', detail: data });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
}
