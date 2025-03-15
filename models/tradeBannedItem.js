const mongoose = require("mongoose");

const tradeBannedItemSchema = new mongoose.Schema({
    steamId: { type: String, required: true },
    assetId: { type: String, required: true, unique: true },
    market_hash_name: { type: String, required: true },
    tradable: { type: Number, default: 0 },  // 0 = Trade-Banned
    trade_restricted: { type: Boolean, default: true },
    unban_timestamp: { type: Number, required: true }, // Timestamp when the item is tradable
    icon_url: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model("TradeBannedItem", tradeBannedItemSchema);
