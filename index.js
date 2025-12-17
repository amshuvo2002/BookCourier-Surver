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
      try {
        const { name, email, role = "user", photoURL } = req.body;
        if (!email) return res.status(400).send({ message: "Email required" });

        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.send({
            message: "User already exists",
            user: existingUser,
          });
        }

        const result = await usersCollection.insertOne({
          name,
          email,
          role,
          photoURL,
          createdAt: new Date(),
        });

        res.send({ message: "User saved", result });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.send(users);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/api/getRole", async (req, res) => {
      try {
        const email = req.query.email;
        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).send({ message: "User not found" });
        res.send({ role: user.role });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.put("/users/role/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const { role } = req.body;
        const result = await usersCollection.updateOne(
          { email },
          { $set: { role } }
        );
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.delete("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const result = await usersCollection.deleteOne({ email });
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    // =======================
    // BOOKS
    // =======================
    app.get("/books", async (req, res) => {
      try {
        const books = await booksCollection.find().toArray();
        res.send(books);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/books/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id))
          return res.status(400).send({ message: "Invalid book ID" });

        const book = await booksCollection.findOne({ _id: new ObjectId(id) });
        if (!book) return res.status(404).send({ message: "Book not found" });
        res.send(book);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.post("/books", async (req, res) => {
      try {
        const status = req.body.status || "published";
        const book = { ...req.body, status, createdAt: new Date() };
        const result = await booksCollection.insertOne(book);
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.patch("/books/status/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;
        if (!ObjectId.isValid(id))
          return res.status(400).send({ message: "Invalid book ID" });

        const result = await booksCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.delete("/books/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res.status(400).send({ message: "Invalid book ID" });

        const result = await booksCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send({ success: true, deletedCount: result.deletedCount });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    // =======================
    // ORDERS
    // =======================
    app.get("/orders", async (req, res) => {
      try {
        const orders = await ordersCollection.find().toArray();
        res.send(orders);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/orders/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const orders = await ordersCollection
          .find({ $or: [{ email }, { userEmail: email }] })
          .toArray();
        res.send(orders);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/orders-with-delivery", async (req, res) => {
      try {
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
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.post("/orders", async (req, res) => {
      try {
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
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.patch("/orders/:id/payment", async (req, res) => {
      try {
        const id = req.params.id;
        const { paymentStatus } = req.body;

        if (!["paid", "pending", "failed"].includes(paymentStatus)) {
          return res.status(400).send({ message: "Invalid payment status" });
        }

        const update = { $set: { paymentStatus } };
        if (paymentStatus === "paid") update.$set.orderStatus = "pending";

        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          update
        );
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    // এই দুইটা রুটই ঠিক করা হয়েছে (এখানেই তোমার সমস্যা ছিল)
    // ১. মেইন স্ট্যাটাস চেঞ্জ রুট
    app.patch("/orders/:id/status", async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        if (!ObjectId.isValid(id))
          return res.status(400).send({ message: "Invalid order ID" });

        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { orderStatus: status } } // এখানে orderStatus করা হয়েছে
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Order not found" });
        }

        res.send({ success: true, modified: result.modifiedCount });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    // ২. ক্যান্সেল রুটও ঠিক করা হয়েছে
    app.patch("/orders/cancel/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res.status(400).send({ message: "Invalid order ID" });

        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { orderStatus: "cancelled" } } // এখানেও orderStatus
        );

        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .send({ message: "Order not found or already cancelled" });
        }

        res.send({ success: true, message: "Order cancelled successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.delete("/orders/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res.status(400).send({ message: "Invalid ID" });

        const result = await ordersCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    // পেমেন্টের জন্য অর্ডারের পুরো ডিটেইলস নেওয়ার রুট
    app.get("/orders/payment/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res.status(400).send({ message: "Invalid order ID" });

        const order = await ordersCollection.findOne({ _id: new ObjectId(id) });

        if (!order) return res.status(404).send({ message: "Order not found" });

        // বইয়ের ডিটেইলস যদি দরকার হয় তাহলে যোগ করতে পারো
        let bookTitle = order.bookTitle;
        let price = order.price;

        if (order.bookId && (!bookTitle || !price)) {
          const book = await booksCollection.findOne({
            _id: new ObjectId(order.bookId),
          });
          if (book) {
            bookTitle = bookTitle || book.title;
            price = price || book.price;
          }
        }

        res.send({
          ...order,
          bookTitle,
          price,
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    // =======================
    // বাকি সব রুট আগের মতোই আছে – কিছু বদলাই নাই
    // =======================
    // (delivery, wishlist, reviews – সব ঠিক আছে)

    app.get("/delivery-requests", async (req, res) => {
      try {
        const requests = await deliveryCollection.find().toArray();
        res.send(requests);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.patch("/delivery-requests/:status/:id", async (req, res) => {
      try {
        const { status, id } = req.params;
        if (!ObjectId.isValid(id))
          return res.status(400).send({ message: "Invalid ID" });
        if (!["approved", "rejected"].includes(status))
          return res.status(400).send({ message: "Invalid status" });

        const result = await deliveryCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.delete("/delivery-requests/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res.status(400).send({ message: "Invalid ID" });

        const result = await deliveryCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({ message: "Server error while deleting delivery request" });
      }
    });

    app.post("/wishlist", async (req, res) => {
      try {
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
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/wishlist", async (req, res) => {
      try {
        const email = req.query.email;
        const wishlist = await wishlistCollection.find({ email }).toArray();
        res.send(wishlist);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.delete("/wishlist/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id))
          return res.status(400).send({ message: "Invalid ID" });

        const result = await wishlistCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.post("/reviews", async (req, res) => {
      try {
        const { bookId, email, rating, comment } = req.body;

        const hasOrdered = await ordersCollection.findOne({
          $or: [{ email }, { userEmail: email }],
          bookId,
          orderStatus: "delivered", // এখানেও orderStatus করা হয়েছে
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
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/reviews/:bookId", async (req, res) => {
      try {
        const bookId = req.params.bookId;
        const result = await reviewsCollection.find({ bookId }).toArray();
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}

run().catch(console.dir);

app.listen(port, () => console.log(`Server running on port ${port}`));
