const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.sxesek9.mongodb.net/?retryWrites=true&w=majority`;
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
    const db = client.db("libraryDB");

    // Collections
    const usersCollection = db.collection("User");
    const booksCollection = db.collection("books");
    const ordersCollection = db.collection("orders");
    const invoicesCollection = db.collection("invoices");
    const deliveryCollection = db.collection("deliveryRequests");

    console.log("MongoDB connected");

    // ---------------------------
    // Test Route
    // ---------------------------
    app.get("/", (req, res) => res.send("Library API running"));

    // ---------------------------
    // Save user (Google Login or normal)
    // ---------------------------
    app.post("/users", async (req, res) => {
      const { name, email, role = "user", photoURL } = req.body;

      if (!email) return res.status(400).send({ message: "Email required" });

      const existingUser = await usersCollection.findOne({ email });
      if (existingUser) {
        return res.send({ message: "User already exists", user: existingUser });
      }

      const result = await usersCollection.insertOne({
        name,
        email,
        role,
        photoURL,
        createdAt: new Date(),
      });

      res.send({ message: "User saved", result });
    });

    // ---------------------------
    // Register
    // ---------------------------
    app.post("/register", async (req, res) => {
      const { name, email, password } = req.body;

      const existingUser = await usersCollection.findOne({ email });
      if (existingUser)
        return res.status(400).send({ message: "User already exists" });

      const result = await usersCollection.insertOne({
        name,
        email,
        password,
        role: "user",
        createdAt: new Date(),
      });

      res.send({
        message: "User registered successfully",
        user: { name, email, role: "user" },
      });
    });

    // ---------------------------
    // Login
    // ---------------------------
    app.post("/login", async (req, res) => {
      const { email, password } = req.body;
      const user = await usersCollection.findOne({ email });

      if (!user) return res.status(400).send({ message: "User not found" });
      if (user.password && user.password !== password)
        return res.status(400).send({ message: "Incorrect password" });

      res.send({
        message: "Login successful",
        user: { name: user.name, email: user.email, role: user.role },
      });
    });

    // ---------------------------
    // Get all users
    // ---------------------------
    app.get("/users", async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    // ---------------------------
    // Update user role
    // ---------------------------
    app.put("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const { role } = req.body;

      const result = await usersCollection.updateOne(
        { email },
        { $set: { role } }
      );

      res.send(result);
    });

    // ---------------------------
    // Get user info
    // ---------------------------
    app.get("/users/info/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });

      if (!user) return res.status(404).send({ message: "User not found" });

      res.send({
        name: user.name,
        email: user.email,
        role: user.role,
      });
    });
    // Delete user by email
    app.delete("/users/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.deleteOne({ email });
      res.send(result);
    });

    // ---------------------------
    // Books Routes
    // ---------------------------
    app.get("/books", async (req, res) => {
      const books = await booksCollection.find().toArray();
      res.send(books);
    });

    app.get("/books/:id", async (req, res) => {
      const id = req.params.id;
      try {
        let book = null;
        if (ObjectId.isValid(id))
          book = await booksCollection.findOne({ _id: new ObjectId(id) });
        if (!book) book = await booksCollection.findOne({ _id: id });
        if (!book) return res.status(404).send({ message: "Book not found" });
        res.send(book);
      } catch (err) {
        res.status(400).send({ message: "Invalid book ID" });
      }
    });

    app.post("/books", async (req, res) => {
      const book = req.body;
      const result = await booksCollection.insertOne(book);
      res.send(result);
    });

    // ---------------------------
    // Orders Routes
    // ---------------------------
    app.get("/orders", async (req, res) => {
      const orders = await ordersCollection.find().toArray();
      res.send(orders);
    });

    app.get("/orders/:email", async (req, res) => {
      const email = req.params.email;
      const orders = await ordersCollection
        .find({ $or: [{ email }, { userEmail: email }] })
        .toArray();
      res.send(orders);
    });

    app.post("/orders", async (req, res) => {
      const order = req.body;
      const result = await ordersCollection.insertOne(order);
      res.send(result);
    });

    app.put("/orders/:id/cancel", async (req, res) => {
      const id = req.params.id;
      const result = await ordersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "cancelled" } }
      );
      res.send(result);
    });

    app.patch("/orders/pay/:id", async (req, res) => {
      const id = req.params.id;
      const paymentId = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      await ordersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "success", paymentStatus: "paid", paymentId } }
      );
      const paidOrder = await ordersCollection.findOne({
        _id: new ObjectId(id),
      });
      await invoicesCollection.insertOne({
        orderId: paidOrder._id,
        userId: paidOrder.userId,
        userName: paidOrder.userName,
        email: paidOrder.email,
        bookTitle: paidOrder.bookTitle,
        price: paidOrder.price,
        paymentId,
        orderDate: paidOrder.orderDate || new Date(),
        paidAt: new Date(),
      });
      res.send({ message: "Payment successful", paymentId });
    });

    // ---------------------------
    // Dashboard Route
    // ---------------------------
    app.get("/dashboard/:role", async (req, res) => {
      const role = req.params.role;
      const users = await usersCollection.find({ role }).toArray();
      res.send({ message: `Dashboard data for ${role}`, data: users });
    });

    // ---------------------------
    // Delivery Requests
    // ---------------------------
    app.get("/delivery-requests", async (req, res) => {
      const result = await deliveryCollection.find().toArray();
      res.send(result);
    });

    app.patch("/delivery-requests/approve/:id", async (req, res) => {
      const id = req.params.id;
      const result = await deliveryCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "approved" } }
      );
      res.send(result);
    });

    app.patch("/delivery-requests/reject/:id", async (req, res) => {
      const id = req.params.id;
      const result = await deliveryCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "rejected" } }
      );
      res.send(result);
    });
  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

app.listen(port, () => console.log(`Server running on port ${port}`));
