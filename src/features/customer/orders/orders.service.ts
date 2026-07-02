import { env } from "@core/config/env.config";
import { customersDB, orderPaymentAttemptsDB } from "@core/db/schemas";
import { forbidden, generateNanoId, internalError, notFound, validation } from "@core/utils";
import {
  createOrder,
  loadOrder,
  loadPaymentAttempt,
  previewOrder,
  recordOrderPaymentAttemptResult,
} from "@features/shared/orders/orders.service";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import type {
  OrderPaymentAttemptResponse,
  ConfirmStripePaymentAttemptServiceParams,
  CreateStripePaymentSheetServiceParams,
  CustomerOrdersService,
  HandleStripePaymentIntentServiceParams,
  StripePaymentSheetResponse,
} from "./orders.types";

const STRIPE_EPHEMERAL_KEY_API_VERSION = "2024-06-20";

type StripeCharge = Stripe.Charge;

function getStripeConfig() {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PUBLISHABLE_KEY) {
    throw validation("stripe.notConfigured", "Stripe is not configured for customer payments");
  }

  return {
    secretKey: env.STRIPE_SECRET_KEY,
    publishableKey: env.STRIPE_PUBLISHABLE_KEY,
  };
}

function getStripeClient() {
  const { secretKey } = getStripeConfig();
  return new Stripe(secretKey);
}

function normalizeCurrency(currency: string | null | undefined): string {
  const normalizedCurrency = (currency ?? "MXN").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw validation("stripe.currencyInvalid", "Payment currency must be ISO-4217");
  }
  return normalizedCurrency;
}

function stripeMerchantCountryCode(): string {
  return env.STRIPE_MERCHANT_COUNTRY_CODE.trim().toUpperCase();
}

function buildCustomerDisplayName(customer: {
  name: string | null;
  middleName: string | null;
  lastName: string | null;
  phone: string | null;
}) {
  const fullName = [customer.name, customer.middleName, customer.lastName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return fullName || customer.phone || undefined;
}

function buildOrderPayload(input: CreateStripePaymentSheetServiceParams): Record<string, unknown> {
  return {
    organizationId: input.organizationId,
    customerId: input.customerId,
    couponCode: input.couponCode ?? null,
    cashbackRedeemCents: input.cashbackRedeemCents ?? null,
    comment: input.comment ?? null,
    tip: input.tip ?? null,
    items: input.items,
  };
}

function isStripeMissingResourceError(error: unknown): boolean {
  return (
    error instanceof Stripe.errors.StripeInvalidRequestError &&
    (error.code === "resource_missing" || error.statusCode === 404)
  );
}

async function createStripeCustomerForTukafeCustomer({
  stripe,
  customer,
}: {
  stripe: Stripe;
  customer: typeof customersDB.$inferSelect;
}): Promise<string> {
  const stripeCustomer = await stripe.customers.create({
    email: customer.email ?? undefined,
    name: buildCustomerDisplayName(customer),
    phone: customer.phone ?? undefined,
    metadata: {
      tukafeCustomerId: customer.id,
      tukafeUserId: customer.userId ?? "",
    },
  });

  return stripeCustomer.id;
}

async function getOrCreateStripeCustomer({
  fastify,
  stripe,
  customerId,
}: {
  fastify: FastifyInstance;
  stripe: Stripe;
  customerId: string;
}): Promise<string> {
  const customer = await fastify.db.query.customersDB.findFirst({
    where(table, { eq: eqOperator }) {
      return eqOperator(table.id, customerId);
    },
  });

  if (!customer) {
    throw notFound("customer.notFound", "Customer was not found");
  }

  if (customer.stripeCustomerId) {
    try {
      const stripeCustomer = await stripe.customers.retrieve(customer.stripeCustomerId);
      if (!stripeCustomer.deleted) {
        return stripeCustomer.id;
      }
    } catch (error) {
      if (!isStripeMissingResourceError(error)) {
        throw error;
      }
    }
  }

  const stripeCustomerId = await createStripeCustomerForTukafeCustomer({
    stripe,
    customer,
  });

  await fastify.db
    .update(customersDB)
    .set({
      stripeCustomerId,
      updatedAt: sql`now()`,
    })
    .where(eq(customersDB.id, customer.id));

  return stripeCustomerId;
}

function resolveStripeCharge(paymentIntent: Stripe.PaymentIntent): StripeCharge | null {
  const latestCharge = paymentIntent.latest_charge;
  if (!latestCharge || typeof latestCharge === "string") {
    return null;
  }

  return latestCharge;
}

function stripeFailureMessage(paymentIntent: Stripe.PaymentIntent): {
  failureCode: string | null;
  failureMessage: string | null;
} {
  const error = paymentIntent.last_payment_error;
  return {
    failureCode: error?.code ?? paymentIntent.status,
    failureMessage: error?.message ?? null,
  };
}

async function recordStripePaymentIntent({
  fastify,
  paymentIntent,
  createOrderFromSnapshot,
}: {
  fastify: FastifyInstance;
  paymentIntent: Stripe.PaymentIntent;
  createOrderFromSnapshot: boolean;
}) {
  const metadataPaymentAttemptId =
    typeof paymentIntent.metadata.paymentAttemptId === "string"
      ? paymentIntent.metadata.paymentAttemptId
      : "";

  let existingAttempt: OrderPaymentAttemptResponse | null;
  if (metadataPaymentAttemptId.trim().length > 0) {
    existingAttempt = await loadPaymentAttempt(fastify, metadataPaymentAttemptId).catch(() => null);
  } else {
    const attemptByTransactionId = await fastify.db.query.orderPaymentAttemptsDB.findFirst({
      where(table, { eq: eqOperator }) {
        return eqOperator(table.transactionId, paymentIntent.id);
      },
    });
    existingAttempt = attemptByTransactionId
      ? await loadPaymentAttempt(fastify, attemptByTransactionId.id).catch(() => null)
      : null;
  }

  if (!existingAttempt) {
    return null;
  }

  const paymentAttemptId = existingAttempt.id;
  if (existingAttempt.provider !== "stripe") {
    throw validation(
      "stripe.paymentAttempt.providerMismatch",
      "Payment attempt is not a Stripe payment",
    );
  }

  const nextResultStatus =
    paymentIntent.status === "succeeded"
      ? "paid"
      : paymentIntent.status === "canceled"
        ? "cancelled"
        : "failed";

  if (existingAttempt.status === "completed") {
    return existingAttempt;
  }

  if (
    (existingAttempt.status === "paid_unlinked" && nextResultStatus === "paid") ||
    (existingAttempt.status === "failed" && nextResultStatus === "failed") ||
    (existingAttempt.status === "cancelled" && nextResultStatus === "cancelled")
  ) {
    return existingAttempt;
  }

  if (paymentIntent.status === "processing" || paymentIntent.status === "requires_action") {
    return loadPaymentAttempt(fastify, paymentAttemptId);
  }

  const charge = resolveStripeCharge(paymentIntent);
  const card =
    charge?.payment_method_details?.type === "card" ? charge.payment_method_details.card : null;

  const paidAmountCents =
    paymentIntent.amount_received > 0 ? paymentIntent.amount_received : paymentIntent.amount;

  const nextAttempt =
    paymentIntent.status === "succeeded"
      ? await recordOrderPaymentAttemptResult(fastify, {
          paymentAttemptId,
          status: "paid",
          transactionId: paymentIntent.id,
          referenceNumber: charge?.id ?? paymentIntent.id,
          cardBrand: card?.brand ?? null,
          entryMode: "stripe",
          authorizationCode: null,
          obfuscatedPan: card?.last4 ? `**** ${card.last4}` : null,
          amountCents: paidAmountCents,
          rawResponse: paymentIntent as unknown as Record<string, unknown>,
        })
      : await recordOrderPaymentAttemptResult(fastify, {
          paymentAttemptId,
          status: paymentIntent.status === "canceled" ? "cancelled" : "failed",
          transactionId: paymentIntent.id,
          amountCents: paymentIntent.amount,
          rawResponse: paymentIntent as unknown as Record<string, unknown>,
          ...stripeFailureMessage(paymentIntent),
        });

  if (
    createOrderFromSnapshot &&
    nextAttempt.status === "paid_unlinked" &&
    nextAttempt.customerId &&
    nextAttempt.orderPayload
  ) {
    await createOrder(
      fastify,
      {
        ...(nextAttempt.orderPayload as Record<string, unknown>),
        customerId: nextAttempt.customerId,
        paymentAttemptId,
      } as Parameters<typeof createOrder>[1],
      {
        allowCashbackRedemption: true,
        exposeCashbackBalance: true,
        requirePaymentForPositiveAmountDue: true,
      },
    );
  }

  return loadPaymentAttempt(fastify, paymentAttemptId);
}

export function customerOrdersService(fastify: FastifyInstance): CustomerOrdersService {
  return {
    async preview(input) {
      return previewOrder(fastify, input, {
        allowCashbackRedemption: true,
        exposeCashbackBalance: true,
      });
    },
    async create(input) {
      return createOrder(fastify, input, {
        allowCashbackRedemption: true,
        exposeCashbackBalance: true,
        requirePaymentForPositiveAmountDue: true,
      });
    },
    async get(input) {
      const order = await loadOrder(fastify, input.orderId, true);
      if (!order || order.customerId !== input.customerId) {
        return null;
      }

      return order;
    },
    async createStripePaymentSheet(
      input: CreateStripePaymentSheetServiceParams,
    ): Promise<StripePaymentSheetResponse> {
      const { publishableKey } = getStripeConfig();
      const stripe = getStripeClient();
      const normalizedCurrency = normalizeCurrency(input.currency);

      if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
        throw validation("stripe.amountInvalid", "Payment amount must be positive");
      }

      const preview = await previewOrder(fastify, input, {
        allowCashbackRedemption: true,
        exposeCashbackBalance: true,
      });
      if (preview.amountDueCents !== input.amountCents) {
        throw validation("stripe.amountMismatch", "Payment amount does not match order total", {
          expectedAmountCents: preview.amountDueCents,
          receivedAmountCents: input.amountCents,
        });
      }

      const stripeCustomerId = await getOrCreateStripeCustomer({
        fastify,
        stripe,
        customerId: input.customerId,
      });

      const paymentAttemptId = generateNanoId();
      const reference = `stripe-${paymentAttemptId}`;
      const orderPayload = buildOrderPayload(input);

      const [paymentAttempt] = await fastify.db
        .insert(orderPaymentAttemptsDB)
        .values({
          id: paymentAttemptId,
          organizationId: input.organizationId,
          customerId: input.customerId,
          provider: "stripe",
          reference,
          amountCents: input.amountCents,
          currency: normalizedCurrency,
          status: "pending",
          orderPayload,
        })
        .returning();

      if (!paymentAttempt) {
        throw internalError(
          "stripe.paymentAttempt.createFailed",
          "Failed to create payment attempt",
        );
      }

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: input.amountCents,
          currency: normalizedCurrency.toLowerCase(),
          customer: stripeCustomerId,
          payment_method_types: ["card"],
          setup_future_usage: "off_session",
          metadata: {
            paymentAttemptId,
            organizationId: input.organizationId,
            customerId: input.customerId,
          },
        });

        if (!paymentIntent.client_secret) {
          throw internalError(
            "stripe.paymentIntent.clientSecretMissing",
            "Stripe did not return a client secret",
          );
        }

        const ephemeralKey = await stripe.ephemeralKeys.create(
          {
            customer: stripeCustomerId,
          },
          {
            apiVersion: STRIPE_EPHEMERAL_KEY_API_VERSION as Stripe.LatestApiVersion,
          },
        );

        if (!ephemeralKey.secret) {
          throw internalError(
            "stripe.ephemeralKey.secretMissing",
            "Stripe did not return an ephemeral key secret",
          );
        }

        await fastify.db
          .update(orderPaymentAttemptsDB)
          .set({
            transactionId: paymentIntent.id,
            rawResponse: paymentIntent as unknown as Record<string, unknown>,
            updatedAt: sql`now()`,
          })
          .where(eq(orderPaymentAttemptsDB.id, paymentAttemptId));

        return {
          paymentAttemptId,
          publishableKey,
          paymentIntentClientSecret: paymentIntent.client_secret,
          stripeCustomerId,
          customerEphemeralKeySecret: ephemeralKey.secret,
          amountCents: input.amountCents,
          currency: normalizedCurrency,
          wallets: {
            applePay: env.STRIPE_APPLE_MERCHANT_ID
              ? {
                  merchantIdentifier: env.STRIPE_APPLE_MERCHANT_ID,
                  merchantCountryCode: stripeMerchantCountryCode(),
                }
              : null,
            googlePay: env.STRIPE_GOOGLE_PAY_ENABLED
              ? {
                  merchantCountryCode: stripeMerchantCountryCode(),
                  currencyCode: normalizedCurrency,
                  testEnv: env.STRIPE_GOOGLE_PAY_TEST_ENV,
                }
              : null,
          },
        };
      } catch (error) {
        await fastify.db
          .update(orderPaymentAttemptsDB)
          .set({
            status: "failed",
            failureCode: "stripe.paymentSheet.createFailed",
            failureMessage:
              error instanceof Error ? error.message : "Failed to create Stripe payment sheet",
            updatedAt: sql`now()`,
          })
          .where(eq(orderPaymentAttemptsDB.id, paymentAttemptId));

        throw error;
      }
    },
    async confirmStripePaymentAttempt(input: ConfirmStripePaymentAttemptServiceParams) {
      const paymentAttempt = await loadPaymentAttempt(fastify, input.paymentAttemptId);
      if (paymentAttempt.provider !== "stripe") {
        throw validation(
          "stripe.paymentAttempt.providerMismatch",
          "Payment attempt is not a Stripe payment",
        );
      }

      if (paymentAttempt.customerId !== input.customerId) {
        throw forbidden(
          "stripe.paymentAttempt.customerMismatch",
          "Payment attempt does not belong to this customer",
        );
      }

      if (paymentAttempt.status === "completed" || paymentAttempt.status === "paid_unlinked") {
        return paymentAttempt;
      }

      if (!paymentAttempt.transactionId) {
        throw validation("stripe.paymentIntent.missing", "Stripe payment intent is missing");
      }

      const stripe = getStripeClient();
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentAttempt.transactionId, {
        expand: ["latest_charge"],
      });
      const updatedAttempt = await recordStripePaymentIntent({
        fastify,
        paymentIntent,
        createOrderFromSnapshot: false,
      });

      if (!updatedAttempt) {
        throw notFound("stripe.paymentAttempt.notFound", "Payment attempt was not found");
      }

      return updatedAttempt;
    },
    async handleStripePaymentIntent(input: HandleStripePaymentIntentServiceParams) {
      const stripe = getStripeClient();
      const paymentIntent = await stripe.paymentIntents.retrieve(input.paymentIntentId, {
        expand: ["latest_charge"],
      });

      return recordStripePaymentIntent({
        fastify,
        paymentIntent,
        createOrderFromSnapshot: true,
      });
    },
  };
}
