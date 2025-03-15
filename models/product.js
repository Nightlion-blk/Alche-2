const oracledb = require('oracledb');
const connect = require('../config/connect.js');
require('dotenv').config({ path: '../access.env' });

class product{
    static async connectToOracle() {
        try {
          const connection = await connect();
          return connection;
        } catch (err) {
          console.error("Error connecting to Oracle:", err);
        }
      }
    
    }
