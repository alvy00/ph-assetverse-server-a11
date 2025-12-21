const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();

const stripe = require("stripe")(process.env.PAYMENT_GATEWAY);
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

        // ------------ MISC -----------------
        const generateSessionId = () => {
            return (
                "PAY-" +
                Math.random().toString(36).substring(2, 8).toUpperCase()
            );
        };

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

        const verifyHR = async (req, res, next) => {
            try {
                const decoded_email = req.user.email;
                const hr = await usersColl.findOne({ email: decoded_email });

                if (!hr || hr.role !== "hr") {
                    return res
                        .status(403)
                        .send({ message: "Forbidden access!" });
                }

                next();
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Server error" });
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

        app.get("/assets", verifyFirebaseToken, async (req, res) => {
            try {
                const assets = await assetsColl.find().toArray();
                res.status(200).send(assets);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to fetch assets" });
            }
        });

        // technically gets all the reqs as MyAssets
        app.get("/myassets", verifyFirebaseToken, async (req, res) => {
            const { email, page = 0, limit = 10 } = req.query;

            try {
                const reqAssets = await reqColl
                    .find({ requesterEmail: email, requestStatus: "approved" })
                    .toArray();

                const reqAssetIds = reqAssets.map((a) => a.assetId);

                const assignedAssets = await assignedAssetColl
                    .find({
                        employeeEmail: email,
                        assetId: { $nin: reqAssetIds },
                    })
                    .toArray();

                const combinedAssets = [...reqAssets, ...assignedAssets];

                const start = Number(page) * Number(limit);
                const paginatedAssets = combinedAssets.slice(
                    start,
                    start + Number(limit)
                );
                // res.status(200).send({
                //     reqAssets,
                //     assignedAssets,
                // });
                res.status(200).send({
                    assets: paginatedAssets,
                    assetCount: combinedAssets.length,
                });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to fetch assets" });
            }
        });

        app.get("/affdata", async (req, res) => {
            try {
                const { email } = req.query;

                if (!email) {
                    return res
                        .status(400)
                        .send({ message: "Email is required" });
                }

                const data = await empAffColl
                    .find({ employeeEmail: email })
                    .toArray();

                const uniqueComs = [
                    ...new Set(
                        data
                            .filter((data) => data.companyName)
                            .map((data) => data.companyName)
                    ),
                ];

                //affData of the companies the user is affiliated with
                const comsAffData = await empAffColl
                    .find({ companyName: { $in: uniqueComs } })
                    .toArray();

                // find the users by first extracting emails from comsAffData
                const emails = [
                    ...new Set(
                        comsAffData
                            .map((com) => com.employeeEmail)
                            .filter(
                                (empEmail) => empEmail && empEmail !== email
                            )
                    ),
                ];
                const usersAffData = await usersColl
                    .find({ email: { $in: emails } })
                    .toArray();

                res.status(200).send({
                    data,
                    uniqueComs,
                    comsAffData,
                    usersAffData,
                });
            } catch (error) {
                console.error(error);
                res.status(500).send({
                    message: "Failed to fetch affiliation data",
                });
            }
        });

        app.post("/reqasset", verifyFirebaseToken, async (req, res) => {
            try {
                const {
                    assetId,
                    assetName,
                    assetType,
                    assetImage,
                    requesterName,
                    requesterEmail,
                    hrEmail,
                    companyName,
                } = req.body;

                const alreadyRequested = await reqColl.findOne({
                    assetId,
                    requesterEmail,
                    requestStatus: "pending",
                });

                if (alreadyRequested) {
                    return res
                        .status(409)
                        .send({ message: "You already requested this asset" });
                }

                const assetReq = {
                    assetId,
                    assetName,
                    assetType,
                    assetImage,
                    requesterName,
                    requesterEmail,
                    hrEmail,
                    companyName,
                    requestDate: new Date(),
                    approvalDate: null,
                    requestStatus: "pending",
                    note: "",
                    processedBy: "",
                };

                await reqColl.insertOne(assetReq);

                res.status(201).send({
                    message: "Asset requested successfully",
                });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Server error" });
            }
        });

        // --------------- HR ---------------------

        // add asset
        app.post(
            "/addasset",
            verifyFirebaseToken,
            verifyHR,
            async (req, res) => {
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
            }
        );

        //fetch assets by comName
        app.get(
            "/assets/:companyName",
            verifyFirebaseToken,
            verifyHR,
            async (req, res) => {
                const { companyName } = req.params;
                const { page, limit } = req.query;

                const query = {
                    companyName: {
                        $regex: new RegExp(`^${companyName}$`, "i"),
                    },
                };
                try {
                    const assets = await assetsColl
                        .find(query)
                        .skip(10 * Number(page))
                        .limit(Number(limit))
                        .toArray();
                    const assetsCount = await assetsColl.countDocuments(query);
                    res.status(200).send({ assets, assetsCount });
                } catch (error) {
                    console.error(error);
                    res.status(500).send({ message: "Failed to fetch assets" });
                }
            }
        );

        // asset update (Edit
        app.patch(
            "/assets/:id",
            verifyFirebaseToken,
            verifyHR,
            async (req, res) => {
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

                    const result = await assetsColl.updateOne(
                        query,
                        updateData
                    );

                    if (result.matchedCount === 0) {
                        return res
                            .status(404)
                            .send({ message: "Asset not found" });
                    }

                    res.status(200).send({
                        message: "Asset updated successfully",
                    });
                } catch (error) {
                    console.error(error);
                    res.status(500).send({ message: "Internal server error" });
                }
            }
        );

        // delete asset (Delete)
        app.delete(
            "/assets/delete/:id",
            verifyFirebaseToken,
            verifyHR,
            async (req, res) => {
                const { id } = req.params;

                if (!id) {
                    return res
                        .status(400)
                        .send({ message: "Asset ID is required" });
                }

                try {
                    const query = { _id: new ObjectId(id) };
                    const result = await assetsColl.deleteOne(query);

                    if (result.deletedCount === 0) {
                        return res
                            .status(404)
                            .send({ message: "Asset not found" });
                    }

                    res.status(200).send({
                        message: "Asset deleted successfully",
                        result,
                    });
                } catch (error) {
                    console.error(error);
                    res.status(500).send({ message: "Internal server error" });
                }
            }
        );

        app.get("/requests", verifyFirebaseToken, async (req, res) => {
            const { email } = req.user;
            const { companyName, page, limit } = req.query;

            try {
                const query = {
                    hrEmail: email,
                    companyName,
                };

                const requests = await reqColl
                    .find(query)
                    .skip(Number(limit) * Number(page))
                    .limit(Number(limit))
                    .toArray();

                const reqCount = await reqColl.countDocuments(query);

                res.status(200).send({ requests, reqCount });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Server error" });
            }
        });

        // approve/reject request
        app.patch(
            "/request/updatestatus",
            verifyFirebaseToken,
            verifyHR,
            async (req, res) => {
                const { reqId, requesterEmail, requestStatus } = req.body;
                const { hrEmail } = req.query;

                try {
                    const query = { _id: new ObjectId(reqId) };
                    const requestDoc = await reqColl.findOne(query);

                    if (!requestDoc) {
                        return res
                            .status(404)
                            .send({ message: "Request not found!" });
                    }

                    if (requestStatus === "approved") {
                        await reqColl.updateOne(query, {
                            $set: {
                                approvalDate: new Date(),
                                requestStatus: requestStatus,
                                processedBy: hrEmail,
                            },
                        });

                        const em = await usersColl.findOne({
                            email: requesterEmail,
                        });
                        const hr = await usersColl.findOne({ email: hrEmail });

                        const empAffObj = {
                            employeeEmail: em.email,
                            employeeName: em.name,
                            hrEmail: hrEmail,
                            companyName: hr.companyName,
                            companyLogo: hr.companyLogo,
                            affiliationDate: new Date(),
                            status: "active",
                        };

                        await empAffColl.insertOne(empAffObj);
                        res.status(200).send({ message: "Request approved!" });
                    } else {
                        await reqColl.updateOne(query, {
                            $set: {
                                requestStatus: requestStatus,
                                processedBy: hrEmail,
                            },
                        });
                        res.status(200).send({ message: "Request rejected!" });
                    }
                } catch (error) {
                    console.error(error);
                    res.status(500).send({ message: "Server error" });
                }
            }
        );

        // get all employees also AGGREGATE used for first time
        app.get("/emlist", verifyFirebaseToken, verifyHR, async (req, res) => {
            try {
                const { email, companyName, page, limit } = req.query;

                const employees = await reqColl
                    .aggregate([
                        { $match: { companyName, requestStatus: "approved" } },

                        {
                            $group: {
                                _id: "$requesterEmail",
                                joinDate: { $min: "$approvalDate" },
                            },
                        },

                        {
                            $lookup: {
                                from: "users",
                                localField: "_id",
                                foreignField: "email",
                                as: "employee",
                            },
                        },
                        {
                            $lookup: {
                                from: "assignedAssets",
                                localField: "_id",
                                foreignField: "employeeEmail",
                                as: "assignedAssets",
                            },
                        },
                        {
                            $unwind: {
                                path: "$employee",
                                preserveNullAndEmptyArrays: true,
                            },
                        },
                        {
                            $project: {
                                _id: 0,
                                joinDate: 1,
                                assetsCount: { $size: "$assignedAssets" },
                                name: "$employee.name",
                                email: "$employee.email",
                                role: "$employee.role",
                                profileImg: "$employee.profileImg",
                            },
                        },
                    ])
                    .skip(Number(limit) * Number(page))
                    .limit(Number(limit))
                    .toArray();

                const emCount = await reqColl.countDocuments({
                    companyName,
                    requestStatus: "approved",
                });

                res.status(200).send({ employees, emCount });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to fetch employees" });
            }
        });

        // delete employee
        app.delete(
            "/emdelete",
            verifyFirebaseToken,
            verifyHR,
            async (req, res) => {
                try {
                    const { email, employeeEmail, companyName } = req.query;

                    const assignedAssets = await assignedAssetColl
                        .find({ employeeEmail, companyName })
                        .toArray();
                    if (assignedAssets.length > 0) {
                        const bulk = assignedAssets.map((asset) => ({
                            updateOne: {
                                filter: { _id: new ObjectId(asset.assetId) },
                                update: { $inc: { availableQuantity: 1 } },
                            },
                        }));

                        await assetsColl.bulkWrite(bulk);
                    }

                    await assignedAssetColl.deleteMany({
                        employeeEmail,
                        companyName,
                    });

                    const affResult = await empAffColl.deleteOne({
                        employeeEmail,
                        companyName,
                    });

                    await usersColl.updateOne(
                        { email },
                        { $inc: { currentEmployees: -1 } }
                    );

                    if (affResult.deletedCount === 0) {
                        return res
                            .status(404)
                            .send({ message: "Employee not found in company" });
                    }

                    await reqColl.updateOne(
                        { requesterEmail: employeeEmail, companyName },
                        { $set: { requestStatus: "pending" } }
                    );

                    res.status(200).send({
                        message: "Employee removed from company successfully",
                    });
                } catch (error) {
                    console.error(error);
                    res.status(500).send({
                        message: "Failed to remove employee",
                    });
                }
            }
        );

        // assigning assets
        app.post("/assign", verifyFirebaseToken, verifyHR, async (req, res) => {
            try {
                const { assetId, employeeEmail, employeeName, companyName } =
                    req.body;
                const hrEmail = req.query.email;

                const asset = await assetsColl.findOne({
                    _id: new ObjectId(assetId),
                });

                if (!asset)
                    return res.status(404).send({ message: "Asset not found" });

                if (asset.availableQuantity <= 0)
                    return res
                        .status(400)
                        .send({ message: "No more assets available" });

                const assetExists = await assignedAssetColl.findOne({
                    assetId,
                    employeeEmail,
                });
                if (assetExists)
                    return res
                        .status(409)
                        .send({ message: "Asset already assigned" });

                const hrUpdate = await usersColl.updateOne(
                    {
                        email: hrEmail,
                        $expr: { $lt: ["$currentEmployees", "$packageLimit"] },
                    },
                    { $inc: { currentEmployees: 1 } }
                );

                if (hrUpdate.matchedCount === 0) {
                    return res.status(409).send({
                        message:
                            "Employee limit reached. Please upgrade your package",
                    });
                }

                const assigningAsset = {
                    assetId,
                    assetName: asset.productName,
                    assetImage: asset.productImage,
                    assetType: asset.productType,
                    employeeEmail,
                    employeeName,
                    hrEmail,
                    companyName,
                    assignmentDate: new Date(),
                    returnDate: null,
                    status: "assigned",
                };
                await assignedAssetColl.insertOne(assigningAsset);

                await assetsColl.updateOne(
                    { _id: new ObjectId(assetId) },
                    { $inc: { availableQuantity: -1 } }
                );

                res.status(201).send({
                    message: "Asset assigned successfully",
                });
            } catch (error) {
                console.log("Assign asset error:", error);
                res.status(500).send({ message: "Server error" });
            }
        });

        // getting assignable assets
        app.get(
            "/assignable",
            verifyFirebaseToken,
            verifyHR,
            async (req, res) => {
                try {
                    const { email, emailem } = req.query;

                    const hr = await usersColl.findOne(
                        { email },
                        { projection: { email: 1, companyName: 1, _id: 0 } }
                    );

                    const assignable = await assetsColl
                        .aggregate([
                            {
                                $match: {
                                    hrEmail: email,
                                    companyName: hr.companyName,
                                },
                            },
                            {
                                $lookup: {
                                    from: "assignedAssets",
                                    let: { assetId: "$_id", empEmail: emailem },
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $and: [
                                                        {
                                                            $eq: [
                                                                "$assetId",
                                                                {
                                                                    $toString:
                                                                        "$$assetId",
                                                                },
                                                            ],
                                                        },
                                                        {
                                                            $eq: [
                                                                "$employeeEmail",
                                                                "$$empEmail",
                                                            ],
                                                        },
                                                    ],
                                                },
                                            },
                                        },
                                    ],
                                    as: "empAssignment",
                                },
                            },
                            { $match: { empAssignment: { $eq: [] } } },
                            { $match: { availableQuantity: { $gt: 0 } } },
                        ])
                        .toArray();

                    res.status(200).json(assignable);
                } catch (err) {
                    console.error("Error fetching assignable assets:", err);
                    res.status(500).json({ error: "Internal server error" });
                }
            }
        );

        app.post(
            "/payment-checkout-session",
            verifyFirebaseToken,
            verifyHR,
            async (req, res) => {
                try {
                    const { name, price } = req.body;
                    const { email } = req.query;

                    if (!name || !price || !email) {
                        return res
                            .status(400)
                            .send({ message: "Missing required fields" });
                    }

                    const session = await stripe.checkout.sessions.create({
                        line_items: [
                            {
                                price_data: {
                                    currency: "USD",
                                    unit_amount: Number(price) * 100,
                                    product_data: {
                                        name: name.toUpperCase(),
                                    },
                                },
                                quantity: 1,
                            },
                        ],
                        customer_email: email,
                        mode: "payment",
                        metadata: {
                            name: name,
                            transactionId: generateSessionId(),
                        },
                        success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                        cancel_url: `${process.env.SITE_DOMAIN}/payment-cancelled`,
                    });

                    res.status(200).send({ url: session.url });
                } catch (error) {
                    console.error("Error creating checkout session:", error);
                    res.status(500).send({
                        message: "Failed to create checkout session",
                    });
                }
            }
        );

        app.patch(
            "/payment-success",
            verifyFirebaseToken,
            verifyHR,
            async (req, res) => {
                try {
                    const { email } = req.query;
                    const sessionId = req.query.session_id;

                    if (!email || !sessionId) {
                        return res
                            .status(400)
                            .send({ message: "Missing email or session_id" });
                    }

                    const session = await stripe.checkout.sessions.retrieve(
                        sessionId
                    );

                    if (session.payment_status !== "paid") {
                        return res
                            .status(400)
                            .send({ message: "Payment not completed" });
                    }

                    const pack = await packColl.findOne({
                        name: session.metadata.name,
                    });
                    if (!pack) {
                        return res
                            .status(404)
                            .send({ message: "Package not found" });
                    }

                    const exists = await payColl.findOne({
                        transactionId: session.metadata.transactionId,
                    });

                    if (exists) {
                        return res.send({
                            success: true,
                            message: "Already processed",
                            payment: exists,
                        });
                    }

                    const payment = {
                        hrEmail: email,
                        packageName: pack.name,
                        employeeLimit: pack.employeeLimit,
                        amount: pack.price,
                        transactionId: session.metadata.transactionId,
                        paymentDate: new Date(),
                        status: "completed",
                    };

                    await payColl.insertOne(payment);

                    await usersColl.updateOne(
                        { email },
                        {
                            $set: {
                                packageLimit: pack.employeeLimit,
                                subscription: pack.name,
                            },
                        }
                    );

                    res.send({ success: true, payment });
                } catch (error) {
                    console.error("Error processing payment success:", error);
                    res.status(500).send({
                        message: "Failed to process payment",
                    });
                }
            }
        );

        app.get(
            "/payments",
            verifyFirebaseToken,
            verifyHR,
            async (req, res) => {
                const { email } = req.query;

                if (!email) {
                    return res
                        .status(400)
                        .json({ success: false, message: "Email is required" });
                }

                try {
                    const payments = await payColl
                        .find({ hrEmail: email })
                        .toArray();

                    res.status(200).json({ success: true, payments });
                } catch (error) {
                    console.error("Error fetching payments:", error);
                    res.status(500).json({
                        success: false,
                        message: "Failed to fetch payments",
                        error: error.message,
                    });
                }
            }
        );

        // --------------- COMMON -----------------------
        app.patch("/profileupdate", verifyFirebaseToken, async (req, res) => {
            try {
                const { email, name, dob, companyName } = req.body;
                const updateData = {};

                if (dob) updateData.dob = dob;
                if (companyName) updateData.companyName = companyName;
                if (name) updateData.name = name;

                const result = await usersColl.updateOne(
                    { email },
                    { $set: updateData }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: "User not found" });
                }

                res.status(200).send({
                    message: "Profile updated successfully",
                });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to update profile" });
            }
        });

        app.get("/packages", async (req, res) => {
            try {
                const packages = await packColl.find().toArray();

                res.status(200).send(packages);
            } catch (error) {
                console.error("Error fetching packages:", error);

                res.status(500).send({
                    message: "Failed to fetch packages",
                });
            }
        });
    } finally {
    }
}
run().catch(console.dir);

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
