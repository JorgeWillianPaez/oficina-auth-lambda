import { Pool } from 'pg';
import { FindCustomerByDocument } from './authenticate-customer';

let pool: Pool | undefined;

const connection = (): Pool =>
  (pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  }));

export const findCustomerInPostgres: FindCustomerByDocument = async (document) => {
  const { rows } = await connection().query(
    'SELECT id, name, active FROM customers WHERE document = $1',
    [document],
  );
  return rows[0] ?? null;
};
