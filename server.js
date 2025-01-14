const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

// MongoDB model
const ItemSchema = new mongoose.Schema({
  steamId: String,
  itemId: String,
  name: String,
  imageUrl: String,
  price: Number,
  createdAt: { type: Date, default: Date.now },
});

const MarketItem = mongoose.model('MarketItem', ItemSchema);

// Publish item to market
app.post('/publish', async (req, res) => {
  const { steamId, itemId, price } = req.body;

  if (!steamId || !itemId || !price) {
    return res.status(400).json({ message: 'Invalid request data' });
  }

  // Check if the item is still in the inventory (simplified; implement your own verification logic)
  const isInInventory = true; // Replace with real check
  if (!isInInventory) {
    return res.status(400).json({ message: 'Item no longer in inventory' });
  }

  try {
    const newItem = new MarketItem({
      steamId,
      itemId,
      name: 'Item Name', // Replace with actual item name
      imageUrl: 'Item URL', // Replace with actual item image URL
      price,
    });

    await newItem.save();
    res.status(200).json({ message: 'Item published successfully!' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Connect to MongoDB
mongoose
  .connect('your-mongodb-connection-string', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    app.listen(3000, () => console.log('Server running on port 3000'));
  })
