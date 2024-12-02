const express = require('express');
const mongoose = require("mongoose");
const moment = require('moment');
const path = require('path');
const { updateLeaderboard } = require('./fetcher');

moment().format();
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// Log environment info
console.log('Current directory:', __dirname);
console.log('Views directory:', path.join(__dirname, 'views'));

const mongoURI = process.env.MONGODB_URI ;

// Connect to MongoDB
const connectDB = async () => {
    let retries = 5;
    while (retries > 0) {
        try {
            await mongoose.connect(mongoURI, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 5000
            });
            console.log("Connected to MongoDB!");
            return;
        } catch (error) {
            retries--;
            if (retries === 0) {
                console.error("Failed to connect to MongoDB after 5 attempts:", error);
                process.exit(1);
            }
            console.log(`Failed to connect. Retrying... (${retries} attempts remaining)`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
};

// Define User model
const User = mongoose.model("User", new mongoose.Schema({
    username: String,
    solved: Object,
    streak: Number,
    questionSolved: Number
}), "CSES");

// Routes
app.get("/", async (req, res) => {
    try {
        const users = await User.find();
        const usersData = users.map(userData => {
            const timeline = Array(7).fill(false);
            const noOfDaysInWeek = 7;
            
            for (let index = 0; index < noOfDaysInWeek; index++) {
                const reqDate = moment().subtract(index, 'days').format('DD/MM/YYYY');
                const prevDate = moment().subtract(index + 1, 'days').format('DD/MM/YYYY');
                
                timeline[noOfDaysInWeek - index - 1] = parseInt(userData.solved[reqDate] || 0) > parseInt(userData.solved[prevDate] || 0);
            }
            
            return {
                name: userData.username,
                timeline: timeline,
                streak: userData.streak || 0,
                questionSolved: userData.questionSolved || 0
            };
        });
        
        // Sort users by questionSolved in descending order
        usersData.sort((a, b) => b.questionSolved - a.questionSolved);
        
        res.render("index", { data: usersData });
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Error fetching data", details: error.message });
    }
});

// Manual update endpoint (protected)
app.post("/update", async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        await updateLeaderboard();
        res.json({ status: "success" });
    } catch (error) {
        console.error("Error in manual update:", error);
        res.status(500).json({ error: "Update failed" });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start server
const startServer = async () => {
    await connectDB();
    
    // Initial update on server start
    try {
        await updateLeaderboard();
        console.log('Initial update completed');
    } catch (error) {
        console.error('Initial update failed:', error);
    }
    
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
};

startServer();

// Schedule regular updates
setInterval(updateLeaderboard, 3600000);
