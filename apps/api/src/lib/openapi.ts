import type { FastifyInstance } from 'fastify';
import { openApiSpec } from './openapi-spec.js';

export { openApiSpec } from './openapi-spec.js';

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;

  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on')
    return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off')
    return false;

  return defaultValue;
}

function isOpenApiDocsEnabled(): boolean {
  const isProduction = process.env['NODE_ENV'] === 'production';
  return parseBooleanEnv(process.env['OPENAPI_DOCS_ENABLED'], !isProduction);
}

/**
 * Register OpenAPI routes on Fastify instance
 */
export async function registerOpenApi(fastify: FastifyInstance): Promise<void> {
  if (!isOpenApiDocsEnabled()) {
    fastify.log.info('OpenAPI docs/routes disabled (OPENAPI_DOCS_ENABLED=false)');
    return;
  }

  // Serve OpenAPI spec as JSON
  fastify.get('/openapi.json', async (request, reply) => {
    return reply.send(openApiSpec);
  });

  // Serve OpenAPI spec as YAML
  fastify.get('/openapi.yaml', async (request, reply) => {
    const yaml = jsonToYaml(openApiSpec);
    return reply.type('text/yaml').send(yaml);
  });

  // Simple Swagger UI HTML page
  fastify.get('/docs', async (request, reply) => {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Cost Watchdog API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/v1/openapi.json',
      dom_id: '#swagger-ui',
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.SwaggerUIStandalonePreset
      ],
      layout: 'BaseLayout'
    });
  </script>
</body>
</html>
    `.trim();

    return reply.type('text/html').send(html);
  });
}

/**
 * Simple JSON to YAML converter (basic implementation)
 */
function jsonToYaml(obj: unknown, indent = 0): string {
  const spaces = '  '.repeat(indent);

  if (obj === null) return 'null';
  if (obj === undefined) return '';
  if (typeof obj === 'string') {
    if (obj.includes('\n') || obj.includes(':') || obj.includes('#')) {
      return `|\n${obj
        .split('\n')
        .map((line) => spaces + '  ' + line)
        .join('\n')}`;
    }
    return obj.includes(' ') || obj.includes(',') ? `"${obj}"` : obj;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj
      .map((item) => {
        const val = jsonToYaml(item, indent + 1);
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          return `\n${spaces}- ${val.trim().split('\n').join(`\n${spaces}  `)}`;
        }
        return `\n${spaces}- ${val}`;
      })
      .join('');
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';
    return entries
      .map(([key, value]) => {
        const val = jsonToYaml(value, indent + 1);
        if (
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value) &&
          Object.keys(value).length > 0
        ) {
          return `${indent > 0 ? '\n' : ''}${spaces}${key}:${val}`;
        }
        if (Array.isArray(value) && value.length > 0) {
          return `${indent > 0 ? '\n' : ''}${spaces}${key}:${val}`;
        }
        return `${indent > 0 ? '\n' : ''}${spaces}${key}: ${val}`;
      })
      .join('');
  }
  return '';
}

export default { openApiSpec, registerOpenApi };
