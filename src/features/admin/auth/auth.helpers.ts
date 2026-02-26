import { badRequest, throwMappedError } from "@core/utils";

export function mapLoginError(e: unknown): never {
  throwMappedError(e, {
    map: {
      INVALID_EMAIL_OR_PASSWORD: () =>
        badRequest(
          "auth.invalidCredentials",
          "Invalid email or password",
        ),
      EMAIL_NOT_VERIFIED: () =>
        badRequest("auth.emailNotVerified", "Email not verified"),
    },
    codePaths: [["body", "code"]],
  });
}
