const { MongoClient, ServerApiVersion } = require("mongodb");
const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();

const port = process.env.PORT || 3000;

// middlewares
app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
    res.send("Server started!");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pqih8g8.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

async function run() {
    try {
        await client.connect();

        const db = client.db("assetverse_db");
        const usersColl = db.collection("users");
        const empAffColl = db.collection("employeeAffiliation");
        const assetsColl = db.collection("assets");
        const reqColl = db.collection("requests");
        const assignedAssetColl = db.collection("assignedAssets");
        const packColl = db.collection("packages");
        const payColl = db.collection("payments");

        app.get("/users/:uid", async (req, res) => {
            const { uid } = req.params;

            try {
                const user = await usersColl.findOne({ uid });
                if (!user)
                    return res.status(404).send({ error: "User not found" });
                res.status(200).send(user);
            } catch (error) {
                console.error(error);
                res.status(500).send({ error: "Server error" });
            }
        });

        app.post("/register", async (req, res) => {
            try {
                const user = {
                    ...req.body,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                console.log(user);

                const result = await usersColl.insertOne(user);
                res.status(201).send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Registration failed" });
            }
        });

        app.post("/addasset", async (req, res) => {
            const asset = req.body;
            const result = await assetsColl.insertOne(asset);
            res.send(result);
        });

        app.post("/payment", async (req, res) => {
            const payment = req.body;
            const result = await payColl.insertOne(payment);
            res.send(result);
        });
        // await client.db("admin").command({ ping: 1 });
        // console.log(
        //     "Pinged your deployment. You successfully connected to MongoDB!"
        // );
    } finally {
        //await client.close();
    }
}
run().catch(console.dir);

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
