import { sign } from 'jsonwebtoken';
import { normalizeCpf } from './cpf';

export interface CustomerRecord {
  id: string;
  name: string;
  active: boolean;
}

export type FindCustomerByDocument = (document: string) => Promise<CustomerRecord | null>;

export interface AuthenticationResult {
  statusCode: number;
  body: Record<string, unknown>;
}

export const TOKEN_TTL_SECONDS = 3600;

const failure = (statusCode: number, message: string): AuthenticationResult => ({
  statusCode,
  body: { message },
});

export const authenticateCustomer = async (
  rawCpf: unknown,
  findCustomer: FindCustomerByDocument,
  jwtSecret: string,
): Promise<AuthenticationResult> => {
  const cpf = normalizeCpf(rawCpf);
  if (!cpf) return failure(400, 'CPF inválido');

  const customer = await findCustomer(cpf);
  if (!customer) return failure(401, 'Cliente não encontrado');
  if (!customer.active) return failure(403, 'Cliente inativo');

  const accessToken = sign({ sub: customer.id, role: 'CUSTOMER', name: customer.name }, jwtSecret, {
    expiresIn: TOKEN_TTL_SECONDS,
  });
  return { statusCode: 200, body: { accessToken, tokenType: 'Bearer', expiresIn: TOKEN_TTL_SECONDS } };
};
