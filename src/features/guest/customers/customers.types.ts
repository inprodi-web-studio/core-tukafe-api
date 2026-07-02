export interface GuestCustomersService {
  findOrCreateByPhone(
    input: FindOrCreateCustomerByPhoneInput,
  ): Promise<FindOrCreateCustomerByPhoneResponse>;
  identifyWithQr(input: IdentifyCustomerWithQrInput): Promise<IdentifyCustomerWithQrResponse>;
}

export interface FindOrCreateCustomerByPhoneInput {
  phone: string;
}

export interface FindOrCreateCustomerByPhoneResponse {
  created: boolean;
  customer: GuestCustomerResponse;
}

export interface IdentifyCustomerWithQrInput {
  payload: string;
}

export interface IdentifyCustomerWithQrResponse {
  customer: GuestCustomerResponse;
}

export interface GuestCustomerResponse {
  id: string;
  userId: string | null;
  phone: string;
  name: string | null;
  middleName: string | null;
  lastName: string | null;
  email: string | null;
}
