import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { verify } from 'jsonwebtoken';
import { CustomerRecord } from '../src/authenticate-customer';
import { normalizeCpf } from '../src/cpf';
import { createHandler } from '../src/handler';

const VALID_CPF = '52998224725';
const SECRET = 'test-secret';
const customer: CustomerRecord = { id: 'customer-1', name: 'Maria Silva', active: true };

const invoke = async (
  body: string | undefined,
  found: CustomerRecord | null = customer,
  overrides: Partial<APIGatewayProxyEventV2> = {},
) => {
  const handler = createHandler(async (document) => (document === VALID_CPF ? found : null));
  const event = { headers: {}, body, isBase64Encoded: false, ...overrides } as APIGatewayProxyEventV2;
  const result = (await handler(event)) as APIGatewayProxyStructuredResultV2;
  return { statusCode: result.statusCode, headers: result.headers!, body: JSON.parse(result.body!) };
};

describe('normalizeCpf', () => {
  it('accepts valid CPFs with or without mask', () => {
    expect(normalizeCpf('529.982.247-25')).toBe(VALID_CPF);
    expect(normalizeCpf(VALID_CPF)).toBe(VALID_CPF);
  });

  it.each(['52998224724', '11111111111', '123', '', undefined])('rejects %s', (cpf) =>
    expect(normalizeCpf(cpf)).toBeNull(),
  );
});

describe('customer authentication handler', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('issues a customer token for an active customer', async () => {
    const response = await invoke(JSON.stringify({ cpf: '529.982.247-25' }));
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 3600 });
    expect(verify(response.body.accessToken, SECRET)).toMatchObject({
      sub: 'customer-1',
      role: 'CUSTOMER',
    });
  });

  it('decodes base64 bodies and propagates the correlation id', async () => {
    const body = Buffer.from(JSON.stringify({ cpf: VALID_CPF })).toString('base64');
    const response = await invoke(body, customer, {
      isBase64Encoded: true,
      headers: { 'x-correlation-id': 'abc-123' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-correlation-id']).toBe('abc-123');
  });

  it.each([
    ['an invalid CPF', JSON.stringify({ cpf: '11111111111' }), customer, 400],
    ['a malformed body', '{invalid', customer, 400],
    ['a missing body', undefined, customer, 400],
    ['an unknown customer', JSON.stringify({ cpf: VALID_CPF }), null, 401],
    ['an inactive customer', JSON.stringify({ cpf: VALID_CPF }), { ...customer, active: false }, 403],
  ])('rejects %s', async (_, body, found, statusCode) => {
    const response = await invoke(body, found);
    expect(response.statusCode).toBe(statusCode);
    expect(response.body.accessToken).toBeUndefined();
  });

  it('returns 500 when the database is unavailable', async () => {
    const handler = createHandler(async () => {
      throw new Error('connection refused');
    });
    const event = { headers: {}, body: JSON.stringify({ cpf: VALID_CPF }) } as APIGatewayProxyEventV2;
    const result = (await handler(event)) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(500);
  });
});
