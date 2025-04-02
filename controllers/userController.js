const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const connectToDatabase = require('../config/connect.js');
const jwt = require('jsonwebtoken'); 
const nodemailer = require("nodemailer");
const speakeasy = require("speakeasy");
const oracledb = require('oracledb');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: '../access.env' });

const app = express();
const saltRounds = 10;

app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'my-react-app', 'src')));

app.get('/', async (req, res) => {
    let Testconnection;
    try {
        Testconnection = await connectToDatabase(); 
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


const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });


  const loginUser = async (req, res) => {
    const { email, password } = req.body;
    let loginConnection;

    try {
        loginConnection = await connectToDatabase();
        if (!loginConnection) {
            throw new Error("Database connection failed");
        }
        
        if (!email || !password) {
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

            const isPasswordMatch = await bcrypt.compare(password, hashedPassword);
            if (isPasswordMatch) {
                console.log("Password matches!");
                const tokengenerate = jwt.sign({ email }, process.env.JWT_SECRET_KEY, { expiresIn: '1h' });
                const otp = speakeasy.totp({ secret: process.env.JWT_SECRET, encoding: "base32" }); // Generate OTP
                try {
                    await transporter.sendMail({
                        from: process.env.SMTP_USERNAME,
                        to: email,
                        subject: "OTP for Login",
                        text: `Your OTP for login is ${otp}`,
                    });

                    console.log("Email sent successfully!");
                } catch (error) {
                    console.error("Error sending email:", error);
                    return res.status(500).json({ success: false, message: 'Failed to send OTP' });
                }
                console.log("Token generated:", tokengenerate);
                return res.status(201).json({ success: true, message: 'Login successful' });
            } else {
                console.log("Password does not match.");
                return res.status(401).json({ success: false, message: 'Invalid email or password' });
            }
        } else {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }
    } catch (error) {
        console.error('Error during login:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
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

            const checkUserQuery = `SELECT COUNT(*) AS count FROM E_Commerce_Users WHERE email = :email`;
            const checkUserResult = await RegConnection.execute(checkUserQuery, { email });

            if (checkUserResult.rows[0][0] > 0) {
              return res.status(400).json({ message: "Email already registered" });
            }

            const insertToRegform = await RegConnection.execute(
                'INSERT INTO E_Commerce_Users(LAST_NAME, EMAIL, PASSWORD) VALUES (:name, :email, :hash)',
                { name, email, hash }, { autoCommit: true }
            );

            console.log('User Registered Successfully');
            res.status(200).json({ message: 'User Registered Successfully' });

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