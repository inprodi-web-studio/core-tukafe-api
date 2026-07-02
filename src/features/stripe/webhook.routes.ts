import { env } from "@core/config/env.config";
import { badRequest, validation } from "@core/utils";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import Stripe from "stripe";

function stripeSignatureHeader(request: FastifyRequest): string {
  const signature = request.headers["stripe-signature"];
  if (Array.isArray(signature)) {
    return signature[0] ?? "";
  }
  return signature ?? "";
}

async function handleStripeWebhook(request: FastifyRequest<{ Body: Buffer }>, reply: FastifyReply) {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    throw validation("stripe.notConfigured", "Stripe webhook is not configured");
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const signature = stripeSignatureHeader(request);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(request.body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    throw badRequest(
      "stripe.webhook.invalidSignature",
      error instanceof Error ? error.message : "Invalid Stripe webhook signature",
    );
  }

  if (
    event.type === "payment_intent.succeeded" ||
    event.type === "payment_intent.payment_failed" ||
    event.type === "payment_intent.canceled"
  ) {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    await request.server.customer.orders.handleStripePaymentIntent({
      paymentIntentId: paymentIntent.id,
    });
  }

  return reply.status(200).send({ received: true });
}

export async function stripeWebhookRoutes(server: FastifyInstance) {
  server.removeContentTypeParser("application/json");
  server.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  server.post("/webhook", handleStripeWebhook);
}
