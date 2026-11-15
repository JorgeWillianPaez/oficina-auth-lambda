import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { authenticateCustomer, FindCustomerByDocument } from './authenticate-customer';
import { findCustomerInPostgres } from './postgres-customer-finder';

const CORRELATION_HEADER = 'x-correlation-id';

const parseBody = (event: APIGatewayProxyEventV2): { cpf?: unknown } => {
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body ?? '', 'base64').toString()
      : (event.body ?? '{}');
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const log = (level: 'info' | 'error', fields: Record<string, unknown>) =>
  console.log(JSON.stringify({ level, service: 'oficina-auth-lambda', ...fields }));

export const createHandler =
  (findCustomer: FindCustomerByDocument) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    const correlationId = event.headers?.[CORRELATION_HEADER] ?? randomUUID();
    const headers = { 'content-type': 'application/json', [CORRELATION_HEADER]: correlationId };
    try {
      const result = await authenticateCustomer(
        parseBody(event).cpf,
        findCustomer,
        process.env.JWT_SECRET ?? '',
      );
      log('info', { correlationId, msg: 'Customer authentication', statusCode: result.statusCode });
      return { statusCode: result.statusCode, headers, body: JSON.stringify(result.body) };
    } catch (error) {
      log('error', { correlationId, msg: 'Customer authentication failed', error: String(error) });
      return { statusCode: 500, headers, body: JSON.stringify({ message: 'Erro interno' }) };
    }
  };

export const handler = createHandler(findCustomerInPostgres);
