const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const connectToDatabase = require('../config/connect.js');
const jwt = require('jsonwebtoken'); 
const oracledb = require('oracledb');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: '../access.env' });

const app = express();
const saltRounds = 10;

app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'my-react-app', 'src')));


const createToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET)
}

app.get('/', async (req, res) => {
    let Testconnection;
    try {
        Testconnection = await connectToDatabase(); // Use correct function
        res.send('Database connection successful');
    } catch (error) {
        console.error('Error connecting to database:', error);
        res.status(500).send('Failed to connect to database');
    } finally {
        if (Testconnection) {
            try {
                await Testconnection.close();
            } catch (err) {
                console.error('Error closing connection:', err);
            }
        }
    }
});



const loginUser = async (req, res) => {
    const { email, password } = req.body;
    let loginConnection;

    try {
        loginConnection = await connectToDatabase();
        if (!loginConnection) {
            throw new Error("Database connection failed");
        }
        if (!req.body.email || !req.body.password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }
        // Fetch user email only
        const result = await loginConnection.execute(
            'SELECT * FROM E_COMMERCE_USERS WHERE EMAIL = :email',
            { email },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        console.log("Query Result:", result.rows);

        if (result.rows.length > 0) {
            const user = result.rows[0];
            const hashedPassword = user.PASSWORD;

            if (!hashedPassword) {
                console.error("Error: Retrieved user has no password stored.");
                return res.status(500).json({ success: false, message: "Internal Server Error" });
            }

            bcrypt.compare(password, hashedPassword)
                .then(result => {
                    if (result) {
                        console.log("Password matches!");
                        const tokengenerate = jwt.sign({ email }, process.env.JWT_SECRET_KEY, { expiresIn: '1h' });
                        console.log("Token generated:", tokengenerate);
                        res.status(201).json({ success: true, message: 'Login successful' });
                    } else {
                        console.log("Password does not match.");
                        res.status(401).json({ success: false, message: 'Invalid email or password' });
                    }
                })
                .catch(err => {
                    console.error(err);
                    res.status(500).json({ success: false, message: 'Internal Server Error' });
                });
        } else {
            res.status(401).json({ success: false, message: 'Invalid email or password' });
        }
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    } finally {
        if (loginConnection) {
            try {
                await loginConnection.close();
            } catch (err) {
                console.error('Error closing connection:', err);
            }
        }
    }
};

const registerUser = async (req, res) => {
    const { name, email, password } = req.body;
    let RegConnection;
    bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
            console.log("Hashing didn't work");
            return res.status(500).send('Failed to hash password');
        }
        try {
            RegConnection = await connectToDatabase();
            const insertToRegform = await RegConnection.execute(
                'INSERT INTO E_Commerce_Users(LAST_NAME, EMAIL, PASSWORD) VALUES (:name, :email, :hash)',
                { name, email, hash }, { autoCommit: true }
            );
            console.log('User Registered Successfully');
            res.send('User Registered Successfully');
        } catch (err) {
            console.error('Error connecting to the database', err);
            res.status(500).send('Failed to register user');
        } finally {
            if (RegConnection) {
                try {
                    await RegConnection.close();
                } catch (err) {
                    console.error('Error closing the connection', err);
                }
            }
        }
    });
};

module.exports = { loginUser, registerUser };