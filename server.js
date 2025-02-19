require("dotenv").config();
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const path = require("path");
const cors = require("cors");

const port = 8080;

app.use(express.json());
app.use(bodyParser.json());

app.use(
  cors({
    origin: ["http://localhost:5173", "https://ansight.up.railway.app"],
  })
);

const [free, pro] = [
  "price_1QdR63GcPdIwwSElPVX1WcYu",
  "price_1QdR6MGcPdIwwSEl0VjqQRRQ",
];

const stripe = require("stripe")(process.env.STIPE_SECRET_KEY);

const createNewStripeSession = async (plan, customerId, email) => {
  try {
    let stripeCustomerId = customerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: email,
        metadata: {
          userId: customerId, // Store your app's user ID in Stripe metadata
        },
      });
      stripeCustomerId = customer.id;
    }
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: plan,
          quantity: 1,
        },
      ],
      success_url: `${process.env.BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/cancel`,
      metadata: {
        userId: customerId, // Store reference to your user
      },
    });
    return session;
  } catch (e) {
    return e;
  }
};

app.post("/api/v1/create-subscription-checkout-session", async (req, res) => {
  const { plan, email } = req.body;
  let planId = null;
  if (plan == 0) planId = free;
  else if (plan == 10) planId = pro;

  if (!email) return null;

  try {
    // Search for existing customer in Stripe by email
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 1,
    });

    let stripeCustomerId = null;
    if (existingCustomers.data.length > 0) {
      // Customer exists in Stripe
      stripeCustomerId = existingCustomers.data[0].id;
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: "active",
      limit: 1,
    });

    const hasActiveSubscription = subscriptions?.data?.length > 0;
    if (hasActiveSubscription) {
      const session = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${process.env.BASE_URL}/plans`, // Where to return after managing subscription
      });
      return res.json({ session, stripeCustomerId });
    } else {
      const session = await createNewStripeSession(
        planId,
        stripeCustomerId,
        email
      );
      return res.json({ session, stripeCustomerId });
    }
  } catch (error) {
    res.send(error);
  }
});

app.post("/api/v1/payment-success", async (req, res) => {
  const { sessionId, userId } = req.body;
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status === "paid") {
    const subscriptionId = session.subscription;
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      return res.json({ message: "Payment successful", subscription });
    } catch (error) {
      console.error("Error retrieving subscription:", error);
    }
  } else {
    return res.json({ message: "Payment failed" });
  }
});

app.get("/customers/:customerId", async (req, res) => {
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: req.params.customerId,
    return_url: `${process.env.BASE_URL}/`,
  });

  return res.json({ portalSession });
});

app.use(
  express.static(path.join(__dirname, "../Frontend/chat-application/dist"))
);

app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../Frontend/chat-application/dist/index.html")
  );
});

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Chat App</title>
      </head>
      <body>
        <div id="root">Loading...</div>
   <script src="/dist/assets/bundle.js"></script>
      </body>
    </html>
  `);
});
app.get("/cancel", (req, res) => {
  res.redirect("/chat/new");
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
