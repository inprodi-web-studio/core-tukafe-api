import type { RequestHeaders } from "@core/types";

export interface CustomerAuthService {
  signupWithPhone(input: SignupInput): Promise<SignupResponse>;
  loginWithEmailOrPhone(
    input: LoginWithEmailOrPhoneInput,
    requestHeaders?: RequestHeaders,
  ): Promise<LoginWithEmailOrPhoneResponse>;
  resendOTP(input: ResendOTPInput): Promise<void>;
  verifyPhone(input: VerifyPhoneInput): Promise<VerifyPhoneResponse>;
  requestPasswordReset(input: RequestPasswordResetInput): Promise<void>;
  validatePasswordResetCode(input: ValidatePasswordResetCodeInput): Promise<void>;
  resetPassword(input: ResetPasswordInput): Promise<void>;
  changePassword(input: ChangePasswordInput, requestHeaders?: RequestHeaders): Promise<void>;
  createQrLoginToken(input: CreateQrLoginTokenInput): Promise<CreateQrLoginTokenResponse>;
}

export interface SignupResponse {
  userId: string;
  email: string;
  phone: string;
}

export interface SignupInput {
  name: string;
  middleName: string;
  lastName?: string;
  email: string;
  phone: string;
  password: string;
}

export type LoginWithEmailOrPhoneInput =
  | {
      email: string;
      phone?: never;
      password: string;
    }
  | {
      email?: never;
      phone: string;
      password: string;
    };

export interface LoginWithEmailOrPhoneResponse {
  token: string;
  userId: string;
  email: string | null;
  phone: string;
}

export interface ResendOTPInput {
  phone: string;
}

export interface VerifyPhoneInput {
  phone: string;
  code: string;
}

export interface VerifyPhoneResponse {
  token: string;
  userId: string;
  email: string;
  phone: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface RequestPasswordResetInput {
  phone: string;
}

export interface ValidatePasswordResetCodeInput {
  phone: string;
  code: string;
}

export interface ResetPasswordInput {
  phone: string;
  code: string;
  newPassword: string;
}

export interface CreateQrLoginTokenInput {
  customerId: string;
}

export interface CreateQrLoginTokenResponse {
  payload: string;
  expiresAt: string;
}
