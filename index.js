// index.js
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
    const usersCollection = db.collection("User"); // main User collection
    const booksCollection = db.collection("books");
    const ordersCollection = db.collection("orders");
    const invoicesCollection = db.collection("invoices");
    const deliveryCollection = db.collection("deliveryRequests");

    console.log("MongoDB connected");

    // ===== Test Route =====
    app.get("/", (req, res) => res.send("Library API running"));

    // =====================================================
    //                   REGISTER
    // =====================================================
    app.post("/register", async (req, res) => {
      const { name, email, password } = req.body;
      const existingUser = await usersCollection.findOne({ email });
      if (existingUser) return res.status(400).send({ message: "User already exists" });

      const result = await usersCollection.insertOne({
        name,
        email,
        password, // ideally hashed
        role: "user",
        createdAt: new Date()
      });

      res.send({
        message: "User registered successfully",
        user: {
          name,
          email,
          role: "user"
        }
      });
    });

    // =====================================================
    //                   LOGIN
    // =====================================================
    app.post("/login", async (req, res) => {
      const { email, password } = req.body;
      const user = await usersCollection.findOne({ email });

      if (!user) return res.status(400).send({ message: "User not found" });
      if (user.password !== password) return res.status(400).send({ message: "Incorrect password" });

      res.send({
        message: "Login successful",
        user: {
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    });

    // =====================================================
    //                   GET USER INFO
    // =====================================================
    app.get("/users/info/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      if (!user) return res.status(404).send({ message: "User not found" });

      res.send({
        name: user.name,
        email: user.email,
        role: user.role
      });
    });

    // =====================================================
    //                   BOOKS ROUTES
    // =====================================================
    app.get("/books", async (req, res) => {
      const books = await booksCollection.find().toArray();
      res.send(books);
    });

    app.get("/books/:id", async (req, res) => {
      const id = req.params.id;
      try {
        let book = null;
        if (ObjectId.isValid(id)) book = await booksCollection.findOne({ _id: new ObjectId(id) });
        if (!book) book = await booksCollection.findOne({ _id: id });
        if (!book) return res.status(404).send({ message: "Book not found" });
        res.send(book);
      } catch (err) {
        res.status(400).send({ message: "Invalid book ID", error: err.message });
      }
    });

    app.post("/books", async (req, res) => {
      const book = req.body;
      const result = await booksCollection.insertOne(book);
      res.send(result);
    });

    // =====================================================
    //                   ORDERS ROUTES
    // =====================================================
    app.get("/orders", async (req, res) => {
      const orders = await ordersCollection.find().toArray();
      res.send(orders);
    });

    app.get("/orders/id/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const order = await ordersCollection.findOne({ _id: new ObjectId(id) });
        if (!order) return res.status(404).send({ message: "Order not found" });
        res.send(order);
      } catch (err) {
        res.status(400).send({ message: "Invalid order ID", error: err.message });
      }
    });

    app.get("/orders/:email", async (req, res) => {
      const email = req.params.email;
      try {
        const orders = await ordersCollection.find({ $or: [{ email }, { userEmail: email }] }).toArray();
        res.send(orders);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch orders", error: err.message });
      }
    });

    app.post("/orders", async (req, res) => {
      const order = req.body;
      const result = await ordersCollection.insertOne(order);
      res.send(result);
    });

    app.delete("/orders/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const _id = ObjectId.isValid(id) ? new ObjectId(id) : id;
        const result = await ordersCollection.deleteOne({ _id });
        res.send(result);
      } catch (err) {
        res.status(400).send({ message: "Failed to delete order", error: err.message });
      }
    });

    // Cancel order
    app.patch("/orders/cancel/:id", async (req, res) => {
      const id = req.params.id;
      const { status = "cancelled" } = req.body;
      try {
        const _id = ObjectId.isValid(id) ? new ObjectId(id) : id;
        const result = await ordersCollection.updateOne({ _id }, { $set: { status } });
        res.send(result);
      } catch (err) {
        res.status(400).send({ message: "Failed to cancel order", error: err.message });
      }
    });

    // Pay order + invoice
    app.patch("/orders/pay/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const _id = ObjectId.isValid(id) ? new ObjectId(id) : id;
        const paymentId = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        await ordersCollection.updateOne({ _id }, { $set: { status: "success", paymentStatus: "paid", paymentId } });
        const paidOrder = await ordersCollection.findOne({ _id });

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
      } catch (err) {
        res.status(400).send({ message: "Failed to pay order", error: err.message });
      }
    });

    // =====================================================
    //                   INVOICES ROUTES
    // =====================================================
    app.get("/invoices/:email", async (req, res) => {
      const email = req.params.email;
      try {
        const invoices = await invoicesCollection.find({ $or: [{ email }, { userEmail: email }] }).toArray();
        res.send(invoices);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch invoices" });
      }
    });

    // =====================================================
    //                   DASHBOARD
    // =====================================================
    app.get("/dashboard/:role", async (req, res) => {
      const role = req.params.role;
      const users = await usersCollection.find({ role }).toArray();
      res.send({ message: `Dashboard data for ${role}`, data: users });
    });

    // =====================================================
    //                   DELIVERY REQUESTS
    // =====================================================
    app.get("/delivery-requests", async (req, res) => {
      const result = await deliveryCollection.find().toArray();
      res.send(result);
    });

    app.patch("/delivery-requests/approve/:id", async (req, res) => {
      const id = req.params.id;
      const result = await deliveryCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: "approved" } });
      res.send(result);
    });

    app.patch("/delivery-requests/reject/:id", async (req, res) => {
      const id = req.params.id;
      const result = await deliveryCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: "rejected" } });
      res.send(result);
    });

  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

app.listen(port, () => console.log(`Server running on port ${port}`));
