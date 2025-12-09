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

    const usersCollection = db.collection("users");
    const booksCollection = db.collection("books");
    const ordersCollection = db.collection("orders");
    const invoicesCollection = db.collection("invoices");

    console.log("MongoDB connected");

    // ===== Test Route =====
    app.get("/", (req, res) => res.send("Library API running"));

    // ===== Users Routes =====
    app.get("/users", async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    app.get("/users/:id", async (req, res) => {
      const id = req.params.id;
      try {
        let user = null;
        if (ObjectId.isValid(id)) {
          user = await usersCollection.findOne({ _id: new ObjectId(id) });
        }
        if (!user) {
          user = await usersCollection.findOne({ _id: id });
        }
        if (!user) return res.status(404).send({ message: "User not found" });
        res.send(user);
      } catch (err) {
        res
          .status(400)
          .send({ message: "Invalid user ID", error: err.message });
      }
    });

    app.post("/users", async (req, res) => {
      const newUser = req.body;
      const existing = await usersCollection.findOne({ email: newUser.email });
      if (existing)
        return res.status(400).send({ message: "User already exists" });
      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    // ===== Books Routes =====
    app.get("/books", async (req, res) => {
      const books = await booksCollection.find().toArray();
      res.send(books);
    });

    app.get("/books/:id", async (req, res) => {
      const id = req.params.id;
      try {
        let book = null;
        if (ObjectId.isValid(id)) {
          book = await booksCollection.findOne({ _id: new ObjectId(id) });
        }
        if (!book) {
          book = await booksCollection.findOne({ _id: id });
        }
        if (!book) return res.status(404).send({ message: "Book not found" });
        res.send(book);
      } catch (err) {
        res
          .status(400)
          .send({ message: "Invalid book ID", error: err.message });
      }
    });

    app.post("/books", async (req, res) => {
      const book = req.body;
      const result = await booksCollection.insertOne(book);
      res.send(result);
    });

    // ===== Orders Routes =====
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
        res
          .status(400)
          .send({ message: "Invalid order ID", error: err.message });
      }
    });

    app.get("/orders/:email", async (req, res) => {
      const email = req.params.email;
      try {
        const orders = await ordersCollection
          .find({ $or: [{ email }, { userEmail: email }] })
          .toArray();
        res.send(orders);
      } catch (err) {
        res
          .status(500)
          .send({ message: "Failed to fetch orders", error: err.message });
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
        res
          .status(400)
          .send({ message: "Failed to delete order", error: err.message });
      }
    });

    // Cancel order
    app.patch("/orders/cancel/:id", async (req, res) => {
      const id = req.params.id;
      const { status = "cancelled" } = req.body;
      try {
        const _id = ObjectId.isValid(id) ? new ObjectId(id) : id;
        const result = await ordersCollection.updateOne(
          { _id },
          { $set: { status } }
        );
        res.send(result);
      } catch (err) {
        res
          .status(400)
          .send({ message: "Failed to cancel order", error: err.message });
      }
    });

    // Pay order + generate paymentId + create invoice
    app.patch("/orders/pay/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const _id = ObjectId.isValid(id) ? new ObjectId(id) : id;

        const paymentId = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        await ordersCollection.updateOne(
          { _id },
          { $set: { status: "success", paymentStatus: "paid", paymentId } }
        );

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

    // Invoices
    app.get("/invoices/:email", async (req, res) => {
      const email = req.params.email;
      try {
        const invoices = await invoicesCollection
          .find({ $or: [{ email }, { userEmail: email }] })
          .toArray();
        res.send(invoices);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch invoices" });
      }
    });

    // Dashboard role
    app.get("/dashboard/:role", async (req, res) => {
      const role = req.params.role;
      const users = await usersCollection.find({ role }).toArray();
      res.send({ message: `Dashboard data for ${role}`, data: users });
    });
  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

app.listen(port, () => console.log(`Server running on port ${port}`));
