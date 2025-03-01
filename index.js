const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express')
const app = express()
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const cors = require('cors')
require("dotenv").config();
const otpStore = {};
const port = 3000

// middleware
app.use(cors())
app.use(express.json())


console.log("Email:", process.env.USER);
console.log("Password:", process.env.PASS ? "Loaded" : "Not Loaded");



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nt7pu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        await client.connect();

        const allTasks = client.db("to-do").collection("tasks");
        const usersCollection = client.db("to-do").collection("users");
        const otpCollection = client.db("to-do").collection("otps");


        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.USER, 
                pass: process.env.PASS  
            }
        });



        app.post('/login', async (req, res) => {
                const { email, password } = req.body;
                const user = await usersCollection.findOne({ email });
                const isPasswordValid = await bcrypt.compare(password, user.password);
                const otp = Math.floor(100000 + Math.random() * 900000);
                const otpExpires = new Date(Date.now() + 2 * 60 * 1000);
                await otpCollection.insertOne({ email, otp, expiresAt: otpExpires });
                const mailOptions = {
                    from: process.env.USER, 
                    to: email, 
                    subject: "Your OTP Code",
                    text: `Your OTP is ${otp}. It will expire in 2 minutes.`,
                };
                await transporter.sendMail(mailOptions);
                console.log(`OTP Sent to ${email}`);
                res.json({ message: "OTP sent successfully" });
        });


        app.post('/register', async (req, res) => {
            const { name, email, password } = req.body;
                const existingUser = await usersCollection.findOne({ email });
                const hashedPassword = await bcrypt.hash(password, 10);
                const secret = speakeasy.generateSecret({ name: `To-Do App (${email})` });
                const newUser = { name, email, password: hashedPassword, secret: secret.base32 };
                await usersCollection.insertOne(newUser);
                QRCode.toDataURL(secret.otpauth_url, (err, qrCode) => {
                    if (err) return res.status(500).json({ error: "QR Code generation failed" });
                    res.json({ message: "User registered", qrCode });
                });
        });
       
        app.post('/verify-otp', async (req, res) => {
            const { email, code } = req.body;
            const otpEntry = await otpCollection.findOne({ email });
            if (new Date() > new Date(otpEntry.expiresAt)) {
                await otpCollection.deleteOne({ email });
                return res.status(400).json({ error: "OTP expired, please request a new one" });
            }
            await otpCollection.deleteOne({ email });
            res.json({ message: "OTP verified, please enter your Google Authenticator code" });
        });


        app.post("/tasks", async (req, res) => {
            const data = req.body;
            const result = await allTasks.insertOne(data)
            res.send(result)
        });

        app.get("/tasks", async (req, res) => {
            const result = await allTasks.find().toArray()
            res.send(result)
        });

        app.delete("/tasks/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await allTasks.deleteOne(query)
            res.send(result)
        });

        // Update a task
        app.patch("/tasks/:id/status", async (req, res) => {
                const id = req.params.id;
                const query = { _id: new ObjectId(id) };
                const task = await allTasks.findOne(query);
                const newStatus = task.status === "Pending" ? "Completed" : "Pending";
                const updateResult = await allTasks.updateOne(query, { $set: { status: newStatus } });
                res.json({ message: "Task status updated", newStatus });
        });

        // ✅ FIXED: Update Task Details
        app.patch("/tasks/:id", async (req, res) => {
                const id = req.params.id;
                const updatedTask = req.body;
                const query = { _id: new ObjectId(id) };
                const update = { $set: updatedTask };
                const result = await allTasks.updateOne(query, update);
                res.json({ message: "Task updated successfully", updatedTask });
        });


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})