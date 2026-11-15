import { createServer } from 'node:http';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { handler } from './handler';

const port = Number(process.env.PORT ?? 3000);

createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', async () => {
    const event = {
      headers: request.headers,
      body: Buffer.concat(chunks).toString(),
      isBase64Encoded: false,
    } as unknown as APIGatewayProxyEventV2;
    const result = (await handler(event)) as APIGatewayProxyStructuredResultV2;
    response.writeHead(result.statusCode ?? 200, result.headers as Record<string, string>);
    response.end(result.body);
  });
}).listen(port, () => console.log(`oficina-auth-lambda listening on ${port}`));
