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
    // Users
    // ---------------------------
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

    app.post("/register", async (req, res) => {
      const { name, email, password } = req.body;
      const existingUser = await usersCollection.findOne({ email });
      if (existingUser)
        return res.status(400).send({ message: "User already exists" });

      await usersCollection.insertOne({
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

    app.get("/users", async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    app.get("/api/getRole", async (req, res) => {
      const email = req.query.email;
      const user = await usersCollection.findOne({ email });
      if (!user) return res.status(404).send({ message: "User not found" });
      res.send({ role: user.role });
    });

    app.put("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const { role } = req.body;
      const result = await usersCollection.updateOne(
        { email },
        { $set: { role } }
      );
      res.send(result);
    });

    app.get("/users/info/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      if (!user) return res.status(404).send({ message: "User not found" });
      res.send({ name: user.name, email: user.email, role: user.role });
    });

    app.delete("/users/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.deleteOne({ email });
      res.send(result);
    });

    // ---------------------------
    // Books
    // ---------------------------
    app.get("/books", async (req, res) => {
      const books = await booksCollection.find().toArray();
      res.send(books);
    });

    app.get("/books/:id", async (req, res) => {
      const id = req.params.id;
      let book = ObjectId.isValid(id)
        ? await booksCollection.findOne({ _id: new ObjectId(id) })
        : await booksCollection.findOne({ _id: id });

      if (!book) return res.status(404).send({ message: "Book not found" });
      res.send(book);
    });

    app.post("/books", async (req, res) => {
      const result = await booksCollection.insertOne(req.body);
      res.send(result);
    });

    // ---------------------------
    // Orders
    // ---------------------------
    app.get("/orders", async (req, res) => {
      const orders = await ordersCollection.find().toArray();
      res.send(orders);
    });

    app.get("/orders/id/:id", async (req, res) => {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid order ID" });
      }

      const order = await ordersCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!order) {
        return res.status(404).send({ message: "Order not found" });
      }

      res.send(order);
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

      const orderResult = await ordersCollection.insertOne(order);

      // Create delivery request
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
      const paymentId = `PAY-${Date.now()}`;
      await ordersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "success", paymentStatus: "paid", paymentId } }
      );

      const paidOrder = await ordersCollection.findOne({
        _id: new ObjectId(id),
      });

      await invoicesCollection.insertOne({
        orderId: paidOrder._id,
        email: paidOrder.email,
        bookTitle: paidOrder.bookTitle,
        price: paidOrder.price,
        paymentId,
        paidAt: new Date(),
      });

      res.send({ message: "Payment successful", paymentId });
    });

    app.delete("/orders/id/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const result = await ordersCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Failed to delete order" });
      }
    });

    // ---------------------------
    // Delivery Requests
    // ---------------------------
    app.get("/delivery-requests", async (req, res) => {
      try {
        const result = await deliveryCollection.find().toArray();
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch delivery requests" });
      }
    });

    app.patch("/delivery-requests/:status/:id", async (req, res) => {
      const { id, status } = req.params;

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).send({ message: "Invalid status" });
      }

      try {
        const result = await deliveryCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update delivery request" });
      }
    });

    app.delete("/delivery-requests/:id", async (req, res) => {
      try {
        const result = await deliveryCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to delete delivery request" });
      }
    });

    // ---------------------------
    // Returns
    // ---------------------------
    app.get("/returns", async (req, res) => {
      try {
        // show all deliveries (pending, returned, received)
        const returns = await deliveryCollection.find().toArray();
        res.send(returns);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch returns" });
      }
    });

    app.put("/returns/:id", async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid ID" });

      try {
        const result = await deliveryCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update return status" });
      }
    });

    // ---------------------------
    // Reports Route
    // ---------------------------
    app.get("/reports", async (req, res) => {
      try {
        // Total books
        const booksCount = await booksCollection.countDocuments();

        // Issued books (orders that are successful or pending delivery)
        const issuedCount = await ordersCollection.countDocuments({
          status: { $in: ["success", "pending"] },
        });

        // Returned books (delivery requests marked as returned or received)
        const returnedCount = await deliveryCollection.countDocuments({
          status: { $in: ["returned", "received"] },
        });

        res.send({
          books: booksCount,
          issued: issuedCount,
          returned: returnedCount,
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch reports" });
      }
    });

    // ---------------------------
    // Update Book Status
    // ---------------------------
    app.put("/books/status/:id", async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid book ID" });

      try {
        const result = await booksCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update book status" });
      }
    });

    // ---------------------------
    // Delete Book
    // ---------------------------
    app.delete("/books/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid book ID" });

      try {
        const result = await booksCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to delete book" });
      }
    });

    // ---------------------------
    // Update Order Status (Next Step)
    // ---------------------------
    app.patch("/orders/status/:id", async (req, res) => {
      const { id } = req.params;
      const { status } = req.body; // front-end থেকে আসবে nextStatus

      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid order ID" });

      try {
        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update order status" });
      }
    });

    // Delete order

    app.delete("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const result = await ordersCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // ---------------------------
    // Cancel Order
    // ---------------------------
    app.patch("/orders/cancel/:id", async (req, res) => {
      const { id } = req.params;

      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid order ID" });

      try {
        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "cancelled" } }
        );

        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to cancel order" });
      }
    });

    // ---------------------------
    // Site Settings
    // ---------------------------
    let siteSettings = {
      logo: "",
      bannerText: "",
      footerText: "",
    };

    // GET settings
    app.get("/settings", (req, res) => {
      res.send(siteSettings);
    });

    // PUT update settings
    app.put("/settings", (req, res) => {
      const { logo, bannerText, footerText } = req.body;

      let modifiedCount = 0;

      if (
        logo !== siteSettings.logo ||
        bannerText !== siteSettings.bannerText ||
        footerText !== siteSettings.footerText
      ) {
        siteSettings = { logo, bannerText, footerText };
        modifiedCount = 1;
      }

      res.send({ modifiedCount });
    });
  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

app.listen(port, () => console.log(`Server running on port ${port}`));
