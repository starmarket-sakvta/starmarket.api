const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config(); // 🔹 энэ мөрийг хамгийн эхэнд нэм
const app = express();
app.use(bodyParser.json());
const { RelyingParty } = require("openid");
app.use(cors());
const cookieParser = require("cookie-parser");
app.use(cookieParser()); // Хэрэглэгчийн cookie авахад хэрэгтэй
const SteamSession = require("./models/SteamSession");

// Steam OpenID тохиргоо
const relyingParty = new RelyingParty(
  "https://starmarket-api.onrender.com/auth/steam/callback", // 🔁 Callback URL
  null,
  true,
  false,
  []
);

// 🚪 Login эхлүүлэх
app.get("/auth/steam/login", (req, res) => {
  relyingParty.authenticate(
    "https://steamcommunity.com/openid",
    false,
    (err, authUrl) => {
      if (err || !authUrl) return res.status(500).send("Steam login error");
      res.redirect(authUrl);
    }
  );
});

// 🔙 Steam-аас буцаж ирэхэд Steam ID-г буцаана
app.get("/auth/steam/callback", async (req, res) => {
  relyingParty.verifyAssertion(req, async (err, result) => {
    if (err || !result.authenticated) {
      return res.status(500).send("Verification failed");
    }

    const steamId = result.claimedIdentifier.split("/").pop();
    console.log(`✅ Steam login successful: ${steamId}`);

    // 🍪 Cookie-г эндээс унших боломжгүй тул Flutter талд хийнэ
    res.send(steamId); // WebView дээр Steam ID-г авна
  });
});

// 🍪 Cookie-г хадгалах API
app.post("/auth/steam/session", async (req, res) => {
  const { steamId, sessionid, steamLoginSecure } = req.body;
  if (!steamId || !sessionid || !steamLoginSecure) {
    return res.status(400).send("Missing cookies");
  }

  await SteamSession.updateOne(
    { steamId },
    {
      sessionid,
      steamLoginSecure,
      updatedAt: new Date(),
    },
    { upsert: true }
  );

  console.log(`✅ Steam session saved for ${steamId}`);
  res.send("✅ Session saved");
});

// MongoDB connection

const uri = process.env.MONGO_URI; // 🔐 URI-г .env-ээс авна

mongoose
  .connect(uri)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Failed to connect to MongoDB:", err));

// Item Schema
const itemSchema = new mongoose.Schema({
  steamId: { type: String, required: true },
  assetId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  imageUrl: { type: String, required: true },
  price: { type: Number, required: true },
  published: { type: Boolean, default: true },
});

const Item = mongoose.model("Item", itemSchema);

const transactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["deposit", "withdrawal", "purchase", "sale"],
    required: true,
  },
  amount: { type: Number, required: true },
  status: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "completed",
  },
  timestamp: { type: Date, default: Date.now },
});

const balanceSchema = new mongoose.Schema({
  steamId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 },
  transactions: [transactionSchema], // New field to track transactions
});

const Balance = mongoose.model("Balance", balanceSchema);

// Publish an item: Only publish if it doesn't already exist.
app.post("/publish_item", async (req, res) => {
  try {
    const { steamId, assetId, name, imageUrl, price } = req.body;
    if (
      !steamId ||
      !assetId ||
      !name ||
      !imageUrl ||
      isNaN(price) ||
      price <= 0
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or missing fields." });
    }
    const existingItem = await Item.findOne({ assetId });
    if (existingItem) {
      return res
        .status(400)
        .json({ success: false, message: "Item is already published." });
    }
    const newItem = new Item({
      steamId,
      assetId,
      name,
      imageUrl,
      price,
      published: true,
    });
    await newItem.save();
    res
      .status(200)
      .json({ success: true, message: "Item published successfully." });
  } catch (err) {
    console.error("Publish error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to publish item." });
  }
});

// Change price of an item
app.put("/change_price/:assetId", async (req, res) => {
  try {
    const { assetId } = req.params;
    const { price } = req.body;
    const updatedItem = await Item.findOneAndUpdate(
      { assetId },
      { price },
      { new: true }
    );
    if (!updatedItem) return res.status(404).json({ error: "Item not found." });
    res.status(200).json(updatedItem);
  } catch (err) {
    console.error("Change price error:", err);
    res.status(500).json({ error: "Failed to change price." });
  }
});

// Remove an item
app.delete("/remove_item/:assetId", async (req, res) => {
  try {
    const { assetId } = req.params;
    const deletedItem = await Item.findOneAndDelete({ assetId });
    if (!deletedItem) {
      return res.status(404).json({ error: "Item not found." });
    }
    res.status(200).json({ message: "Item removed successfully." });
  } catch (err) {
    console.error("Error removing item:", err);
    res.status(500).json({ error: "Failed to remove item." });
  }
});
const orderSchema = new mongoose.Schema({
  itemId: { type: String, required: true },
  buyerId: { type: String, required: true },
  sellerId: { type: String, required: true },
  price: { type: Number, required: true },
  status: {
    type: String,
    enum: ["pending", "completed", "canceled"],
    default: "pending",
  },
  timestamp: { type: Date, default: Date.now },
});

const Order = mongoose.model("Order", orderSchema);
app.post("/buy", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { buyerId, sellerId, itemId, price } = req.body;

    const buyer = await Balance.findOne({ steamId: buyerId }).session(session);
    const seller = await Balance.findOne({ steamId: sellerId }).session(
      session
    );
    const item = await Item.findOne({ assetId: itemId }).session(session);

    if (!buyer || !seller) throw new Error("User not found");
    if (!item) throw new Error("Item not found");
    if (buyer.balance < price) throw new Error("Insufficient balance");

    // 🔸 Худалдан авагчийн баланс хасах
    buyer.balance -= price;
    buyer.transactions.push({
      type: "purchase",
      amount: price,
      status: "completed",
    });

    // 🔸 Худалдагчийн баланс нэмэх
    seller.balance += price;
    seller.transactions.push({
      type: "sale",
      amount: price,
      status: "completed",
    });

    // 🔸 Item-ийг market-ээс устгах
    await Item.findOneAndUpdate(
      { assetId: itemId },
      { published: false },
      { session }
    );

    // 🔸 Захиалгыг `orders` collection-д хадгалах
    const newOrder = new Order({
      itemId: itemId,
      buyerId: buyerId,
      sellerId: sellerId,
      price: price,
      status: "pending", // Захиалга эхэлсэн төлөв
      timestamp: new Date(),
    });

    await newOrder.save({ session });

    await buyer.save({ session });
    await seller.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: "Purchase successful",
      buyerBalance: buyer.balance,
      sellerBalance: seller.balance,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ error: error.message });
  }
});
app.get("/orders/:steamId", async (req, res) => {
  try {
    const { steamId } = req.params;
    const orders = await Order.find({
      $or: [{ buyerId: steamId }, { sellerId: steamId }],
    });
    res.status(200).json(orders);
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).json({ error: "Failed to fetch orders." });
  }
});

// Get selling (i.e. published) items for a specific user.
app.get("/selling_items/:steamId", async (req, res) => {
  try {
    const { steamId } = req.params;
    // Return only published items
    const items = await Item.find({ steamId, published: true });
    res.status(200).json(items);
  } catch (err) {
    console.error("Error fetching selling items:", err);
    res.status(500).json({ error: "Failed to fetch selling items." });
  }
});

// Get all market items
app.get("/market_items", async (req, res) => {
  try {
    const items = await Item.find({ published: true });
    res.status(200).json(items);
  } catch (err) {
    console.error("Error fetching market items:", err);
    res.status(500).json({ error: "Failed to fetch items." });
  }
});

// 🔹 Secure Deposit Money (Manual for Now)
app.post("/deposit", async (req, res) => {
  try {
    const { steamId, amount } = req.body;
    if (!steamId || amount <= 0)
      return res.status(400).json({ error: "Invalid deposit amount" });

    const userBalance = await Balance.findOneAndUpdate(
      { steamId },
      {
        $inc: { balance: amount },
        $push: {
          transactions: { type: "deposit", amount, status: "completed" },
        },
      },
      { new: true, upsert: true }
    );

    res
      .status(200)
      .json({ message: "Deposit successful", balance: userBalance.balance });
  } catch (err) {
    res.status(500).json({ error: "Deposit failed" });
  }
});

// 🔹 Secure Withdrawal Request (Manual for Now)
app.post("/withdraw", async (req, res) => {
  try {
    const { steamId, amount } = req.body;
    if (!steamId || amount <= 0)
      return res.status(400).json({ error: "Invalid withdrawal amount" });

    const userBalance = await Balance.findOne({ steamId });
    if (!userBalance || userBalance.balance < amount)
      return res.status(400).json({ error: "Insufficient balance" });

    // Deduct balance but mark transaction as "pending" for manual approval
    userBalance.balance -= amount;
    userBalance.transactions.push({
      type: "withdrawal",
      amount,
      status: "pending",
    });

    await userBalance.save();
    res
      .status(200)
      .json({ message: "Withdrawal requested", balance: userBalance.balance });
  } catch (err) {
    res.status(500).json({ error: "Withdrawal failed" });
  }
});

app.get("/balance/:steamId", async (req, res) => {
  try {
    const userBalance = await Balance.findOne({ steamId: req.params.steamId });
    if (!userBalance) return res.status(404).json({ error: "User not found" });

    res.json({
      balance: userBalance.balance,
      transactions: userBalance.transactions,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve balance." });
  }
});
// 🔒 User Schema (newly added)
const userSchema = new mongoose.Schema(
  {
    steamId: { type: String, required: true, unique: true },
    tradeUrl: { type: String, default: "" },
    apiKey: { type: String, default: "" },
    email: { type: String, default: "" },
    bankAccount: { type: String, default: "" },
  },
  { timestamps: true }
); // ⬅️ add this

const User = mongoose.model("User", userSchema);

// 🔹 Get user data
app.get("/user/:steamId", async (req, res) => {
  try {
    const user = await User.findOne({ steamId: req.params.steamId });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ error: "Server error fetching user data" });
  }
});

// 🔹 Update user data
app.put("/user/update", async (req, res) => {
  try {
    const { steamId, tradeUrl, apiKey, email, bankAccount } = req.body;
    if (!steamId) return res.status(400).json({ error: "Steam ID required." });

    // 🔍 зөвхөн ирсэн утгуудыг update-д оруулах
    const updateFields = {};
    if (tradeUrl !== undefined) updateFields.tradeUrl = tradeUrl;
    if (apiKey !== undefined) updateFields.apiKey = apiKey;
    if (email !== undefined) updateFields.email = email;
    if (bankAccount !== undefined) updateFields.bankAccount = bankAccount;

    const updatedUser = await User.findOneAndUpdate({ steamId }, updateFields, {
      new: true,
      upsert: true,
    });

    res
      .status(200)
      .json({ message: "Updated successfully", user: updatedUser });
  } catch (err) {
    console.error("❌ Failed to update user:", err);
    res.status(500).json({ error: "Failed to update user data." });
  }
});

// Your existing endpoints (item, balance, deposit, withdraw, buy, etc.)

let cache = {};

app.get("/inventory/:steamId", async (req, res) => {
  try {
    const { steamId } = req.params;
    const url = `https://steamcommunity.com/inventory/${steamId}/730/2?l=english&count=5000&t=${Date.now()}`;

    // Хэрэглэгчийн inventory cache-д байгаа эсэхийг шалгана
    if (cache[steamId] && Date.now() - cache[steamId].timestamp < 60000) {
      return res.json(cache[steamId].data);
    }

    const response = await axios.get(url);
    cache[steamId] = { data: response.data, timestamp: Date.now() };
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch inventory" });
  }
});

app.put("/order/confirm/:id", async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: "waiting_confirmation" },
      { new: true }
    );

    if (!order) return res.status(404).json({ error: "Order not found" });

    // 🚀 Trade Offer автоматаар үүсгэх
    try {
      const offerResponse = await axios.post(
        "https://starmarket-api.onrender.com/create_offer",
        {
          sellerId: order.sellerId,
          buyerId: order.buyerId,
          assetId: order.itemId,
        }
      );

      console.log("✅ Offer created:", offerResponse.data.tradeOfferId);
    } catch (offerError) {
      console.error(
        "⚠️ Failed to create offer:",
        offerError.response?.data || offerError.message
      );
    }

    res.status(200).json({ message: "Order confirmed", order });
  } catch (err) {
    console.error("Confirm error:", err);
    res.status(500).json({ error: "Failed to confirm order" });
  }
});

app.put("/order/complete/:id", async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: "completed" },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.status(200).json({ message: "Order completed", order });
  } catch (err) {
    console.error("Complete error:", err);
    res.status(500).json({ error: "Failed to complete order" });
  }
});
const fetch = require("node-fetch");

app.post("/trade/create", async (req, res) => {
  const { sellerSteamId, buyerTradeUrl, item } = req.body;

  if (!sellerSteamId || !buyerTradeUrl || !item || !item.assetid) {
    return res.status(400).send("❌ Invalid trade request");
  }

  const session = await SteamSession.findOne({ steamId: sellerSteamId });
  if (!session) {
    return res.status(404).send("❌ Steam session not found for seller");
  }

  const partnerMatch = buyerTradeUrl.match(/partner=(\d+)/);
  const tokenMatch = buyerTradeUrl.match(/token=([\w-]+)/);

  if (!partnerMatch || !tokenMatch) {
    return res.status(400).send("❌ Invalid trade URL");
  }

  const partner = partnerMatch[1];
  const token = tokenMatch[1];

  const tradeOfferPayload = {
    newversion: true,
    version: 2,
    me: {
      assets: [
        {
          appid: item.appid,
          contextid: item.contextid,
          assetid: item.assetid,
        },
      ],
      currency: [],
      ready: false,
    },
    them: {
      assets: [],
      currency: [],
      ready: false,
    },
  };

  try {
    const response = await fetch(
      "https://steamcommunity.com/tradeoffer/new/send",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: "https://steamcommunity.com/tradeoffer/new/",
          Origin: "https://steamcommunity.com",
          Cookie: `sessionid=${
            session.sessionid
          }; steamLoginSecure=${decodeURIComponent(session.steamLoginSecure)};`,
        },

        body: new URLSearchParams({
          sessionid: session.sessionid,
          serverid: "1",
          partner: partner,
          tradeoffermessage: "Trade from StarMarket",
          json_tradeoffer: JSON.stringify(tradeOfferPayload),
          trade_offer_create_params: JSON.stringify({
            trade_offer_access_token: token,
          }),
        }),
      }
    );

    const text = await response.text();

    console.error("⚠️ Steam trade error details:");
    console.error("Headers:", response.headers.raw());
    console.log("🚀 Sending trade with data:");
    console.log("sessionid:", session.sessionid);
    console.log("partner:", partner);
    console.log("token:", token);
    console.log("assetid:", item.assetid);
    console.log(
      "full trade payload:",
      JSON.stringify(tradeOfferPayload, null, 2)
    );

    if (response.status === 200 && text.includes("tradeofferid")) {
      return res.status(200).send("✅ Trade offer created");
    } else {
      return res.status(500).send("❌ Trade offer creation failed");
    }
  } catch (err) {
    console.error("❌ Exception caught in fetch:", err);
    return res.status(500).send("❌ Internal server error");
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
