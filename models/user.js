const connect = require('../config/connect.js');
require('dotenv').config({ path: '../access.env' });

class user{ 
    static async connectToOracle() {
        try {
          const connection = await connect();
          return connection;
        } catch (err) {
          console.error("Error connecting to Oracle:", err);
        }
      }

      static async getUser(email, password) {
        let connection;
        try {
          connection = await this.connectToOracle();
          if (!connection) {
            throw new Error("Database connection failed");
          }
          if (!email || !password) {
            return { success: false, message: 'Email and password are required' };
          }
          const result = await connection.execute(
            'SELECT * FROM E_COMMERCE_USERS WHERE EMAIL = :email',
            { email },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          if (result.rows.length === 0) {
            return { success: false, message: 'Email not found' };
          }
          const user = result.rows[0];
          const validPassword = await bcrypt.compare(password, user.PASSWORD);
          if (!validPassword) {
            return { success: false, message: 'Invalid password' };
          }
          return { success: true, user };
        } catch (err) {
          console.error('Error fetching user:', err);
          return { success: false, message: 'Failed to fetch user' };
        } finally {
          if (connection) {
            try {
              await connection.close();
            } catch (err) {
              console.error('Error closing connection:', err);
        }
      }
     }
    }
};