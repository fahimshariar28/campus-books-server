const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  // bearer token
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

// MongoDB Connection

const uri = `mongodb+srv://${process.env.DB_ID}:${process.env.DB_PASSWORD}@cluster0.uzgcvif.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const collegeCollection = client
      .db("campus-books-collection")
      .collection("colleges");
    const graduateCollection = client
      .db("campus-books-collection")
      .collection("graduate");
    const userCollection = client
      .db("campus-books-collection")
      .collection("users");

    // Jwt Token
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });

      res.send({ token });
    });

    // Add User to Database
    app.post("/adduser", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        res.send({ error: true, message: "User already exists" });
      } else {
        const result = await userCollection.insertOne(user);
        res.send(result);
      }
    });

    // Get popular colleges according to the average rating

    app.get("/popularcolleges", async (req, res) => {
      const colleges = await collegeCollection.find({}).toArray();

      // Calculate the average rating for each college
      const collegesWithAverageRating = colleges.slice(0, 3).map((college) => {
        const totalRating = college.reviews.reduce(
          (sum, review) => sum + review.rating,
          0
        );
        const averageRating = totalRating / college.reviews.length;
        return { ...college, averageRating };
      });
      collegesWithAverageRating.sort(
        (a, b) => b.averageRating - a.averageRating
      );

      res.json(collegesWithAverageRating);
    });

    // Get Graduates
    app.get("/graduates", async (req, res) => {
      const graduates = await graduateCollection.find({}).toArray();
      res.json(graduates);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Campus Books Server is running");
});

app.listen(port, () => {
  console.log(`Campus Books Server is running on port: ${port}`);
});
