const express = require("express");
const axios = require("axios");
const TradeBannedItem = require("./models/tradeBannedItem"); // Import model

const router = express.Router();

// Fetch inventory from Steam and store trade-banned items
router.get("/fetch_inventory/:steamId", async (req, res) => {
    try {
        const steamId = req.params.steamId;
        const steamInventoryUrl = `https://steamcommunity.com/inventory/${steamId}/730/2`;

        // Fetch inventory from Steam API
        const response = await axios.get(steamInventoryUrl);
        const data = response.data;

        if (!data.assets || !data.descriptions) {
            return res.status(400).json({ message: "No inventory data found" });
        }

        const assets = data.assets;
        const descriptions = data.descriptions;

        let tradeBannedItems = [];

        // Loop through inventory items
        for (const item of descriptions) {
            // Find asset ID
            const matchingAsset = assets.find(
                (asset) => asset.classid === item.classid && asset.instanceid === item.instanceid
            );

            if (!matchingAsset) continue;

            // Check if item is trade-banned
            if (item.tradable === 0) {
                const unbanTimestamp = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7-day cooldown

                // Check if item is already stored
                const existingItem = await TradeBannedItem.findOne({ assetId: matchingAsset.assetid });

                if (!existingItem) {
                    // Save trade-banned item in database
                    const newItem = new TradeBannedItem({
                        steamId,
                        assetId: matchingAsset.assetid,
                        market_hash_name: item.market_hash_name,
                        tradable: item.tradable,
                        trade_restricted: true,
                        unban_timestamp: unbanTimestamp,
                        icon_url: item.icon_url
                    });

                    await newItem.save();
                    tradeBannedItems.push(newItem);
                }
            }
        }

        // Fetch stored trade-banned items from DB
        const storedTradeBannedItems = await TradeBannedItem.find({ steamId });

        // Return merged inventory (Steam + trade-banned items)
        res.json({
            steamInventory: descriptions,
            storedTradeBannedItems
        });

    } catch (error) {
        console.error("Error fetching inventory:", error);
        res.status(500).json({ message: "Error fetching inventory", error });
    }
});

module.exports = router;
