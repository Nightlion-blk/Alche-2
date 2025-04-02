const oracledb = require('oracledb');
require('dotenv').config({ path: '../access.env' });

async function connectToDatabase() {
    let connection;    
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING,
            privilege: oracledb.SYSDBA
        }); 
        console.log('Connected to the Database');
        return connection; // Return the connection for use in other parts of the application
    } catch (err) {
        console.error('Failed connection', err);
        throw err; // Rethrow the error to be handled by the caller
    }
};

module.exports = connectToDatabase;