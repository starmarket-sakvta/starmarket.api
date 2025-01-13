const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// MongoDB connection string
const uri = "mongodb+srv://zonegamer528:emq1AD1Uesqk6r2w@star.kihsh.mongodb.net/?retryWrites=true&w=majority&appName=star";

mongoose
  .connect(uri)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('Failed to connect to MongoDB:', err));

// Define Item schema
const itemSchema = new mongoose.Schema({
  steamId: { type: String, required: true },
  itemId: { type: String, required: true },
  name: { type: String, required: true },
  imageUrl: { type: String, required: true },
  price: { type: Number, required: true },
  details: { type: Object, required: true },
});

const Item = mongoose.model('Item', itemSchema);

// Publish an item
app.post('/publish_item', async (req, res) => {
  try {
    const { steamId, itemId, name, imageUrl, price, details } = req.body;

    // Validate request
    if (!steamId || !itemId || !name || !imageUrl || !price || !details) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const newItem = new Item({
      steamId,
      itemId,
      name,
      imageUrl,
      price,
      details,
    });

    await newItem.save();
    res.status(200).json({ message: 'Item published successfully.' });
  } catch (err) {
    console.error('Error publishing item:', err);
    res.status(500).json({ error: 'Failed to publish item.' });
  }
});

// Get all market items
app.get('/market_items', async (req, res) => {
  try {
    const items = await Item.find();
    res.status(200).json(items);
  } catch (err) {
    console.error('Error fetching market items:', err);
    res.status(500).json({ error: 'Failed to fetch items.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
