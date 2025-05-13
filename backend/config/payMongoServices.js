const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Ensure FRONTEND_URL has the proper protocol
let FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
if (!FRONTEND_URL.startsWith('http')) {
  FRONTEND_URL = `http://${FRONTEND_URL}`;
}
console.log('Using FRONTEND_URL:', FRONTEND_URL);

exports.createCheckout = async (checkoutData) => {
  try {
    // Format phone numbers to ensure minimum 10 digits after country code
    const formatPhoneForAPI = (phone) => {
      if (!phone) return '+639123456789'; // Default fallback
      
      // Clean non-digits
      let cleaned = phone.replace(/\D/g, '');
      
      // Ensure minimum length (10 digits after country code)
      if (cleaned.startsWith('63') && cleaned.length < 12) {
        console.warn(`Phone number too short: ${phone}, padding with zeros`);
        cleaned = cleaned.padEnd(12, '0');
      } else if (cleaned.length < 10) {
        console.warn(`Phone number too short: ${phone}, using default`);
        cleaned = '639123456789';
      }
      
      // Format with country code
      if (!cleaned.startsWith('63')) {
        cleaned = '63' + cleaned.replace(/^0+/, '');
      }
      
      return '+' + cleaned;
    };
    
    // Ensure address lines are not too short
    const formatAddress = (address) => {
      if (!address || address.length < 5) {
        return address + ' Street, Address Line 1';
      }
      return address;
    };
    
    // Update phone numbers and addresses
    const updatedCheckoutData = {
      ...checkoutData,
      billing: {
        ...checkoutData.billing,
        phone: formatPhoneForAPI(checkoutData.billing.phone),
        address: {
          ...checkoutData.billing.address,
          line1: formatAddress(checkoutData.billing.address.line1)
        }
      },
      shipping: {
        ...checkoutData.shipping,
        phone: formatPhoneForAPI(checkoutData.shipping.phone),
        address: {
          ...checkoutData.shipping.address,
          line1: formatAddress(checkoutData.shipping.address.line1)
        }
      }
    };
    
    // Log the sanitized data
    console.log('Sanitized checkout data:', JSON.stringify(updatedCheckoutData, null, 2));
    
    // Extract image URLs properly
    const updatedLineItems = updatedCheckoutData.lineItems.map(item => {
      // Ensure images is either properly populated or omitted entirely
      const images = item.images && item.images.length > 0 
        ? item.images 
        : ["https://res.cloudinary.com/dtgmwaiya/image/upload/v1744803715/fyfvik9wboxjf9o0e2zq.png"]; // Default image
      
      return {
        ...item,
        images  // This ensures images is never an empty array
      };
    });
    
    const payload = {
      data: {
        attributes: {
          line_items: updatedLineItems,
          payment_method_types: updatedCheckoutData.paymentMethodTypes,
          reference_number: updatedCheckoutData.referenceNumber,
          billing: updatedCheckoutData.billing,
          shipping: updatedCheckoutData.shipping,
         success_url: `${FRONTEND_URL}/payment/success?checkout_id={id}&cart_id=${updatedCheckoutData.referenceNumber}`,
          cancel_url: `${FRONTEND_URL}/payment/cancel?checkout_id={id}`
        }
      }
    };
    
    // Log final payload being sent
    const response = await axios.post(
      'https://api.paymongo.com/v1/checkout_sessions',
      payload,
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY).toString('base64')}`
        }
      }
    );

    // Log the full response structure for debugging
    console.log('PayMongo API raw response:', JSON.stringify(response.data, null, 2));

    // Return the properly structured object
    return {
      data: {
        id: response.data.data.id,
        attributes: response.data.data.attributes
      }
    };
  } catch (error) {
    console.error('PayMongo API error:', error.message);
    
    if (error.response && error.response.data) {
      console.error('PayMongo error details:', JSON.stringify(error.response.data, null, 2));
      throw new Error(`PayMongo error: ${JSON.stringify(error.response.data.errors)}`);
    }
    
    throw error;
  }
};

exports.retrieveCheckout = async (checkoutId) => {
  try {
    if (!checkoutId) {
      throw new Error('Checkout ID is required');
    }
    
    console.log('Retrieving checkout session:', checkoutId);
    
    // Fixed: Don't use {id} as a literal string in the URL
    const response = await axios.get(
      `https://api.paymongo.com/v1/checkout_sessions/${checkoutId}`,
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY).toString('base64')}`
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error retrieving checkout session:', error.response?.data || error.message);
    throw error;
  }
};