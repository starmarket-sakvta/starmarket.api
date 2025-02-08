const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// MongoDB connection
const uri = "mongodb+srv://user2:Davaa123@star.kihsh.mongodb.net/?retryWrites=true&w=majority&appName=star";

mongoose
  .connect(uri)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('Failed to connect to MongoDB:', err));

// Item Schema
const itemSchema = new mongoose.Schema({
  steamId: { type: String, required: true },
  itemId: { type: String, required: true, unique: true }, // Unique item identifier
  name: { type: String, required: true },
  imageUrl: { type: String, required: true },
  item: { type: Object, required: true },
  price: { type: Number, required: true },
});

const Item = mongoose.model('Item', itemSchema);

app.post('/publish_item', async (req, res) => {
  try {
    console.log("Received Data:", req.body); // Debugging log

    const { steamId, itemId, name, imageUrl, item, price } = req.body;

    if (!steamId || !itemId || !name || !imageUrl || !item || !price || isNaN(price) || price <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid or missing fields.' });
    }

    const existingItem = await Item.findOne({ itemId });
    if (existingItem) {
      return res.status(400).json({ success: false, message: 'Item is already published.' });
    }

    const newItem = new Item({ steamId, itemId, name, imageUrl, item, price });
    await newItem.save();

    res.status(200).json({ success: true, message: 'Item published successfully.' });
  } catch (err) {
    console.error('Error publishing item:', err);
    res.status(500).json({ success: false, message: 'Failed to publish item.' });
  }
});

// Change price of an item
app.put('/change_price/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { price } = req.body;

    const updatedItem = await Item.findOneAndUpdate(
      { itemId },
      { price },
      { new: true }
    );

    if (!updatedItem) {
      return res.status(404).json({ error: 'Item not found.' });
    }

    res.status(200).json(updatedItem);
  } catch (err) {
    console.error('Error changing price:', err);
    res.status(500).json({ error: 'Failed to change price.' });
  }
});

// Remove an item
app.delete('/remove_item/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;

    const deletedItem = await Item.findOneAndDelete({ itemId });

    if (!deletedItem) {
      return res.status(404).json({ error: 'Item not found.' });
    }

    res.status(200).json({ message: 'Item removed successfully.' });
  } catch (err) {
    console.error('Error removing item:', err);
    res.status(500).json({ error: 'Failed to remove item.' });
  }
});

// Get selling items of a user
app.get('/selling_items/:steamId', async (req, res) => {
  try {
    const { steamId } = req.params;

    const items = await Item.find({ steamId });
    res.status(200).json(items);
  } catch (err) {
    console.error('Error fetching selling items:', err);
    res.status(500).json({ error: 'Failed to fetch selling items.' });
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
// Get user balance
router.get("/balance/:steamId", async (req, res) => {
    try {
        const user = await User.findOne({ steamId: req.params.steamId });
        if (!user) return res.status(404).json({ message: "User not found" });
        res.json({ balance: user.balance });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

// Add balance (Deposit)
router.post("/balance/deposit", async (req, res) => {
    try {
        const { steamId, amount } = req.body;
        if (amount <= 0) return res.status(400).json({ message: "Invalid amount" });

        const user = await User.findOneAndUpdate(
            { steamId },
            { $inc: { balance: amount } },
            { new: true, upsert: true }
        );
        res.json({ message: "Deposit successful", balance: user.balance });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

// Deduct balance (Purchase or Withdrawal)
router.post("/balance/deduct", async (req, res) => {
    try {
        const { steamId, amount } = req.body;
        if (amount <= 0) return res.status(400).json({ message: "Invalid amount" });

        const user = await User.findOne({ steamId });
        if (!user || user.balance < amount) {
            return res.status(400).json({ message: "Insufficient balance" });
        }

        user.balance -= amount;
        await user.save();

        res.json({ message: "Transaction successful", balance: user.balance });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});
// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
