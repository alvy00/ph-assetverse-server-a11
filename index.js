const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();

const port = process.env.PORT || 4000;

// middlewares
app.use(express.json());
app.use(cors());

const admin = require("firebase-admin");

const serviceAccount = require("./fb-adminsdk.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

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

        // ----------- MIDDLEWARES -----------
        const verifyFirebaseToken = async (req, res, next) => {
            const authHeader = req.headers.authorization;

            if (!authHeader) {
                return res.status(401).send({ message: "unauthorized" });
            }

            try {
                const idToken = authHeader.split(" ")[1];
                const decoded = await admin.auth().verifyIdToken(idToken);
                req.user = decoded;
                next();
            } catch (error) {
                console.error(error);
                res.status(401).send({ message: "unauthorized" });
            }
        };

        // -------------- USER --------------
        app.get("/refetch", verifyFirebaseToken, async (req, res) => {
            const user = await usersColl.findOne({
                email: req.user.email,
            });
            res.send(user);
        });

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

        // --------------- HR ---------------------
        app.post("/addasset", verifyFirebaseToken, async (req, res) => {
            const asset = req.body;

            try {
                const result = await assetsColl.insertOne({
                    ...asset,
                    dateAdded: new Date(),
                });
                res.status(201).send(result);
            } catch (err) {
                console.error(err);
                res.send({ message: "Registration failed" });
            }
        });

        app.get("/assets", verifyFirebaseToken, async (req, res) => {
            try {
                const assets = await assetsColl.find().toArray();
                res.status(200).send(assets);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to fetch assets" });
            }
        });

        app.get("/assets/:companyName", async (req, res) => {
            const { companyName } = req.params;
            const query = {
                companyName: { $regex: new RegExp(`^${companyName}$`, "i") },
            };
            try {
                const assets = await assetsColl.find(query).toArray();
                res.status(200).send(assets);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to fetch assets" });
            }
        });

        app.patch("/assets/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const { productName, productType, productImage } = req.body;

                const query = { _id: new ObjectId(id) };
                const updateData = {
                    $set: {
                        productName,
                        productType,
                        productImage,
                    },
                };

                const result = await assetsColl.updateOne(query, updateData);

                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: "Asset not found" });
                }

                res.status(200).send({ message: "Asset updated successfully" });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Internal server error" });
            }
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
