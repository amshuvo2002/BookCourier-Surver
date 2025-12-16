const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// =======================
// MIDDLEWARE
// =======================
app.use(cors());
app.use(express.json());

// =======================
// MONGODB CONNECTION
// =======================
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

    // =======================
    // COLLECTIONS
    // =======================
    const usersCollection = db.collection("User");
    const booksCollection = db.collection("books");
    const ordersCollection = db.collection("orders");
    const invoicesCollection = db.collection("invoices");
    const deliveryCollection = db.collection("deliveryRequests");
    const wishlistCollection = db.collection("wishlist");
    const reviewsCollection = db.collection("reviews");

    console.log("MongoDB connected");

    // =======================
    // TEST ROUTE
    // =======================
    app.get("/", (req, res) => {
      res.send("Library API running");
    });

    // =======================
    // USERS
    // =======================

    app.post("/users", async (req, res) => {
      const { name, email, role = "user", photoURL } = req.body;
      if (!email) return res.status(400).send({ message: "Email required" });

      const existingUser = await usersCollection.findOne({ email });
      if (existingUser)
        return res.send({ message: "User already exists", user: existingUser });

      const result = await usersCollection.insertOne({
        name,
        email,
        role,
        photoURL,
        createdAt: new Date(),
      });

      res.send({ message: "User saved", result });
    });

    app.get("/api/getRole", async (req, res) => {
      const email = req.query.email;
      const user = await usersCollection.findOne({ email });
      if (!user) return res.status(404).send({ message: "User not found" });
      res.send({ role: user.role });
    });

    // =======================
    // BOOKS
    // =======================

    app.get("/books", async (req, res) => {
      const books = await booksCollection.find().toArray();
      res.send(books);
    });

    app.get("/books/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid book ID" });

      const book = await booksCollection.findOne({ _id: new ObjectId(id) });
      if (!book) return res.status(404).send({ message: "Book not found" });
      res.send(book);
    });

    app.post("/books", async (req, res) => {
      const book = { ...req.body, status: "published", createdAt: new Date() };
      const result = await booksCollection.insertOne(book);
      res.send(result);
    });

    app.patch("/books/status/:id", async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;
      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid book ID" });

      const result = await booksCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );
      res.send(result);
    });

    // =======================
    // ORDERS
    // =======================

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

    app.get("/orders-with-delivery", async (req, res) => {
      const orders = await ordersCollection.find().toArray();
      const ordersWithDelivery = await Promise.all(
        orders.map(async (order) => {
          const delivery = await deliveryCollection.findOne({
            orderId: order._id,
          });
          return { ...order, deliveryStatus: delivery?.status || "pending" };
        })
      );
      res.send(ordersWithDelivery);
    });

    // Cancel order (PATCH)
    app.patch("/orders/cancel/:id", async (req, res) => {
      const { id } = req.params;

      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid order ID" });

      try {
        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "cancelled" } }
        );

        if (result.modifiedCount === 0)
          return res
            .status(404)
            .send({ message: "Order not found or already cancelled" });

        res.send({ success: true, message: "Order cancelled successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.post("/orders", async (req, res) => {
      const order = req.body;
      const orderResult = await ordersCollection.insertOne(order);

      await deliveryCollection.insertOne({
        orderId: orderResult.insertedId,
        user: order.email || order.userEmail,
        book: order.bookTitle,
        status: "pending",
        createdAt: new Date(),
      });

      res.send({
        message: "Order placed & delivery request created",
        orderId: orderResult.insertedId,
      });
    });

    // =======================
    // ✅ FIXED PATCH ROUTE
    // Update order status (Next Status / Cancel)
    app.patch("/orders/:id/status", async (req, res) => {
      const { id } = req.params;
      const { status } = req.body; // React থেকে status পাঠাবে

      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid order ID" });

      const result = await ordersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } } // "status" field update হবে
      );

      res.send(result);
    });

    app.delete("/orders/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid ID" });

      const result = await ordersCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // =======================
    // WISHLIST
    // =======================

    app.post("/wishlist", async (req, res) => {
      const { email, bookId, title, img } = req.body;
      if (!email || !bookId)
        return res.status(400).send({ message: "Missing data" });

      const already = await wishlistCollection.findOne({ email, bookId });
      if (already) return res.status(400).send({ message: "Already added" });

      const result = await wishlistCollection.insertOne({
        email,
        bookId,
        title,
        img,
        createdAt: new Date(),
      });
      res.send({ message: "Added to wishlist", result });
    });

    app.get("/wishlist", async (req, res) => {
      const email = req.query.email;
      const wishlist = await wishlistCollection.find({ email }).toArray();
      res.send(wishlist);
    });

    app.delete("/wishlist/:id", async (req, res) => {
      const id = req.params.id;
      const result = await wishlistCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // =======================
    // REVIEWS
    // =======================

    app.post("/reviews", async (req, res) => {
      const { bookId, email, rating, comment } = req.body;

      const hasOrdered = await ordersCollection.findOne({
        $or: [{ email }, { userEmail: email }],
        bookId,
        status: "success",
      });

      if (!hasOrdered)
        return res.status(403).send({ message: "Order this book first" });

      const alreadyReviewed = await reviewsCollection.findOne({
        bookId,
        email,
      });
      if (alreadyReviewed)
        return res.status(400).send({ message: "Already reviewed" });

      const result = await reviewsCollection.insertOne({
        bookId,
        email,
        rating,
        comment,
        createdAt: new Date(),
      });
      res.send(result);
    });

    app.get("/reviews/:bookId", async (req, res) => {
      const bookId = req.params.bookId;
      const result = await reviewsCollection.find({ bookId }).toArray();
      res.send(result);
    });
  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

app.listen(port, () => console.log(`Server running on port ${port}`));
