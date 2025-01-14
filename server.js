const express = require('express');
const app = express();
const bodyParser = require('body-parser');

app.use(bodyParser.json());

// In-memory database for demonstration
let marketItems = [];

// Publish item endpoint
app.post('/api/publish', (req, res) => {
  const { steamId, itemId, classId, price } = req.body;

  // Check if item is already published
  if (marketItems.some(item => item.itemId === itemId)) {
    return res.status(400).json({ message: 'Item is already published.' });
  }

  // Add item to the market
  marketItems.push({ steamId, itemId, classId, price });

  res.status(200).json({ message: 'Item published successfully.' });
});

// Get market items
app.get('/api/market', (req, res) => {
  res.status(200).json(marketItems);
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
