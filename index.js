const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
    const researchCollection = client
      .db("campus-books-collection")
      .collection("research");
    const admissionCollection = client
      .db("campus-books-collection")
      .collection("admission");

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

    // Get all colleges
    app.get("/colleges", async (req, res) => {
      const page = req.query.page;
      const limit = req.query.limit;
      const skip = (page - 1) * limit;
      const colleges = await collegeCollection
        .find({})
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();
      const collegesWithAverageRating = colleges.map((college) => {
        const totalRating = college.reviews.reduce(
          (sum, review) => sum + review.rating,
          0
        );
        const averageRating = totalRating / college.reviews.length;
        return { ...college, averageRating };
      });
      res.json(collegesWithAverageRating);
    });

    // Get total number of colleges
    app.get("/colleges/total", async (req, res) => {
      const total = await collegeCollection.countDocuments({});
      res.json(total);
    });

    // Get College by ID
    app.get("/college/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const college = await collegeCollection.findOne(query);
      res.json(college);
    });

    // Get College by name (search)
    app.get("/colleges/search/:name", async (req, res) => {
      const name = req.params.name;
      const query = { college_name: { $regex: name, $options: "i" } };
      const colleges = await collegeCollection.find(query).toArray();
      res.json(colleges);
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

    // Add admission to database
    app.post("/admission", verifyJWT, async (req, res) => {
      const email = req.decoded.email;
      const admission = req.body;
      if (email !== admission.studentEmail) {
        return res
          .status(401)
          .send({ error: true, message: "unauthorized access" });
      }
      const result = await admissionCollection.insertOne(admission);
      res.send(result);
    });

    // Get admission by email
    app.get("/admission/:email", verifyJWT, async (req, res) => {
      const email = req.decoded.email;
      const studentEmail = req.params.email;
      if (email !== studentEmail) {
        return res
          .status(401)
          .send({ error: true, message: "unauthorized access" });
      }
      const query = { studentEmail };
      const admissionData = await admissionCollection.find(query).toArray();
      res.json(admissionData);
    });

    // Get Graduates
    app.get("/graduates", async (req, res) => {
      const graduates = await graduateCollection.find({}).toArray();
      res.json(graduates);
    });

    // Get Research
    app.get("/research", async (req, res) => {
      const research = await researchCollection.find({}).toArray();
      res.json(research);
    });

    // Get all reviews of all colleges
    app.get("/reviews", async (req, res) => {
      const colleges = await collegeCollection.find({}).toArray();
      const reviewsWithCollegeName = colleges.reduce((allReviews, college) => {
        const collegeReviews = college.reviews.map((review) => {
          return {
            college_name: college.college_name,
            reviewer_name: review.reviewer_name,
            rating: review.rating,
            review_text: review.review_text,
          };
        });
        return [...allReviews, ...collegeReviews];
      }, []);
      res.json(reviewsWithCollegeName);
    });

    // Add review to a college
    app.patch("/review/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const review = req.body;
        const query = { _id: new ObjectId(id) };

        // Update the "college" collection
        const college = await collegeCollection.findOne(query);
        const reviews = [...college.reviews, review];
        const collegeUpdate = { $set: { reviews } };
        const result = await collegeCollection.updateOne(query, collegeUpdate);

        // Update the "admission" collection
        const admissionQuery = {
          $and: [{ studentEmail: review.reviewer_email }, { collegeId: id }],
        };
        const admissionUpdate = { $set: { reviewed: true } };
        const result2 = await admissionCollection.updateOne(
          admissionQuery,
          admissionUpdate
        );

        res.send({ result, result2 });
      } catch (error) {
        console.error("Error in update:", error);
      }
    });

    // Get User by email
    app.get("/user/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(401)
          .send({ error: true, message: "unauthorized access" });
      }
      const query = { email };
      const user = await userCollection.findOne(query);
      res.json(user);
    });

    // Update User by email
    app.patch("/user/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(401)
          .send({ error: true, message: "unauthorized access" });
      }
      const query = { email };
      const user = req.body;
      // update name , email, phone, address. if phone and address has no filed then it will add new field
      const userUpdate = {
        $set: {
          name: user.name,
          phone: user.phone,
          address: user.address,
        },
      };
      const result = await userCollection.updateOne(query, userUpdate);
      res.send(result);
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
