import twilio from "twilio";

import { env } from "@core/config/env.config";

const twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

async function sendSms(input: { to: string; body: string }) {
  await twilioClient.messages.create({
    to: input.to,
    from: env.TWILIO_FROM_PHONE_NUMBER,
    body: input.body,
  });
}

export async function sendCustomerVerificationCodeSms(input: {
  phoneNumber: string;
  code: string;
}) {
  await sendSms({
    to: input.phoneNumber,
    body: `Tu código de verificación Tukafe es: ${input.code}`,
  });
}

export async function sendPasswordResetCodeSms(input: { phoneNumber: string; code: string }) {
  await sendSms({
    to: input.phoneNumber,
    body: `Tu código para restablecer tu contraseña Tukafe es: ${input.code}`,
  });
}
