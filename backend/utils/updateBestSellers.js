const mongoose = require('mongoose');
const Product = require('../models/product');

/**
 * Updates best seller rankings based on weekly/monthly sales
 */
async function updateBestSellerRankings() {
  try {
    console.log('Updating best seller rankings...');
    
    // Get all active products with their sales data
    const products = await Product.find({ 
      Status: 'Available',
      'salesData.lastMonthSold': { $gt: 0 }
    }).sort({ 'salesData.lastMonthSold': -1 });
    
    // Reset all best seller flags first
    await Product.updateMany(
      {}, 
      { 'salesData.isBestSeller': false }
    );
    
    // Mark top 10% of products (or at least top 3) as best sellers
    const bestSellerCount = Math.max(3, Math.ceil(products.length * 0.1));
    
    for (let i = 0; i < Math.min(bestSellerCount, products.length); i++) {
      const product = products[i];
      
      product.salesData.bestSellerRank = i + 1;
      product.salesData.isBestSeller = true;
      
      // If this is the first time becoming a best seller, set the date
      if (!product.salesData.bestSellerSince) {
        product.salesData.bestSellerSince = new Date();
      }
      
      await product.save();
    }
    
    console.log(`Updated ${bestSellerCount} best sellers`);
    
  } catch (error) {
    console.error('Error updating best seller rankings:', error);
  }
}

module.exports = { updateBestSellerRankings };