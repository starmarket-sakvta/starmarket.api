const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); // To handle CORS requests

const app = express();
app.use(express.json());
app.use(cors()); // Add CORS support

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
  const { steamId, itemId, price, name, imageUrl } = req.body;

  if (!steamId || !itemId || !price || !name || !imageUrl) {
    return res.status(400).json({ message: 'Invalid request data' });
  }

  // Replace with actual inventory check logic
  const isInInventory = true; // Placeholder
  if (!isInInventory) {
    return res.status(400).json({ message: 'Item no longer in inventory' });
  }

  try {
    const newItem = new MarketItem({
      steamId,
      itemId,
      name,
      imageUrl,
      price,
    });

    await newItem.save();
    res.status(200).json({ message: 'Item published successfully!' });
  } catch (error) {
    console.error('Error publishing item:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Connect to MongoDB
mongoose
  .connect('mongodb+srv://zonegamer528:emq1AD1Uesqk6r2w@star.kihsh.mongodb.net/star?retryWrites=true&w=majority', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    app.listen(3000, () => console.log('Server running on port 3000'));
  })
  .catch((err) => {
    console.error('Error connecting to MongoDB:', err);
    process.exit(1);
  });
