import type {
  CreateOrderParams,
  OrderPaymentAttemptResponse,
  OrderPreviewResponse,
  OrderResponse,
} from "@features/shared/orders/orders.types";

export interface CustomerOrdersService {
  preview(input: CreateCustomerOrderServiceParams): Promise<OrderPreviewResponse>;
  create(input: CreateCustomerOrderServiceParams): Promise<OrderResponse>;
  get(input: GetCustomerOrderServiceParams): Promise<OrderResponse | null>;
  createStripePaymentSheet(
    input: CreateStripePaymentSheetServiceParams,
  ): Promise<StripePaymentSheetResponse>;
  confirmStripePaymentAttempt(
    input: ConfirmStripePaymentAttemptServiceParams,
  ): Promise<OrderPaymentAttemptResponse>;
  handleStripePaymentIntent(
    input: HandleStripePaymentIntentServiceParams,
  ): Promise<OrderPaymentAttemptResponse | null>;
}

export type CreateCustomerOrderServiceParams = CreateOrderParams;

export interface GetCustomerOrderServiceParams {
  customerId: string;
  orderId: string;
}

export interface CreateStripePaymentSheetServiceParams extends CreateOrderParams {
  customerId: string;
  amountCents: number;
  currency?: string | null;
}

export interface ConfirmStripePaymentAttemptServiceParams {
  customerId: string;
  paymentAttemptId: string;
}

export interface HandleStripePaymentIntentServiceParams {
  paymentIntentId: string;
}

export interface StripePaymentSheetResponse {
  paymentAttemptId: string;
  publishableKey: string;
  paymentIntentClientSecret: string;
  stripeCustomerId: string;
  customerEphemeralKeySecret: string;
  amountCents: number;
  currency: string;
  wallets: StripePaymentSheetWallets;
}

export interface StripePaymentSheetWallets {
  applePay: {
    merchantIdentifier: string;
    merchantCountryCode: string;
  } | null;
  googlePay: {
    merchantCountryCode: string;
    currencyCode: string;
    testEnv: boolean;
  } | null;
}

export type {
  CreateOrderItemModifierParams,
  CreateOrderItemParams,
  OrderCustomerResponse,
  OrderItemModifierResponse,
  OrderItemResponse,
  OrderItemTaxResponse,
  OrderPaymentAttemptResponse,
} from "@features/shared/orders/orders.types";
