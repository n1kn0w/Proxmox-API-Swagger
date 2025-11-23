const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Load the apidata.js file
const apiDataPath = path.join(__dirname, 'apidata.js');
const apiDataContent = fs.readFileSync(apiDataPath, 'utf8');

// Extract the array from the JS file - replace const with var to make it accessible
const modifiedContent = apiDataContent.replace(/^const\s+apiSchema\s*=/, 'apiSchema =');
const context = { apiSchema: null };
vm.createContext(context);
vm.runInContext(modifiedContent, context);
const apiSchema = context.apiSchema;

// OpenAPI 3.0 base structure
const openApiSpec = {
    openapi: '3.0.0',
    info: {
        title: 'Proxmox VE API',
        description: 'Proxmox Virtual Environment API',
        version: '1.0.0'
    },
    servers: [
        {
            url: 'https://{host}:8006/api2/json',
            variables: {
                host: {
                    default: 'localhost',
                    description: 'Proxmox server hostname'
                }
            }
        }
    ],
    paths: {},
    components: {
        securitySchemes: {
            ApiToken: {
                type: 'apiKey',
                in: 'header',
                name: 'Authorization',
                description: 'PVEAPIToken=USER@REALM!TOKENID=UUID'
            },
            Cookie: {
                type: 'apiKey',
                in: 'cookie',
                name: 'PVEAuthCookie'
            }
        }
    },
    security: [
        { ApiToken: [] },
        { Cookie: [] }
    ]
};

// Convert PVE type to OpenAPI type
function convertType(pveType) {
    const typeMap = {
        'string': 'string',
        'boolean': 'boolean',
        'integer': 'integer',
        'number': 'number',
        'array': 'array',
        'object': 'object',
        'null': 'string'
    };
    return typeMap[pveType] || 'string';
}

// Convert parameters to OpenAPI format
function convertParameters(params, pathParams) {
    const openApiParams = [];

    if (!params || !params.properties) return openApiParams;

    for (const [name, prop] of Object.entries(params.properties)) {
        const isPathParam = pathParams.includes(name);

        const param = {
            name: name,
            in: isPathParam ? 'path' : 'query',
            description: prop.description || '',
            required: isPathParam || prop.optional !== 1,
            schema: {
                type: convertType(prop.type)
            }
        };

        if (prop.default !== undefined) {
            param.schema.default = prop.default;
        }
        if (prop.enum) {
            param.schema.enum = prop.enum;
        }
        if (prop.minimum !== undefined) {
            param.schema.minimum = prop.minimum;
        }
        if (prop.maximum !== undefined) {
            param.schema.maximum = prop.maximum;
        }
        if (prop.pattern) {
            param.schema.pattern = prop.pattern;
        }
        if (prop.format) {
            param.schema.format = prop.format;
        }

        openApiParams.push(param);
    }

    return openApiParams;
}

// Convert request body for POST/PUT
function convertRequestBody(params, pathParams) {
    if (!params || !params.properties) return null;

    const bodyProps = {};
    const required = [];

    for (const [name, prop] of Object.entries(params.properties)) {
        if (pathParams.includes(name)) continue;

        bodyProps[name] = {
            type: convertType(prop.type),
            description: prop.description || ''
        };

        if (prop.default !== undefined) {
            bodyProps[name].default = prop.default;
        }
        if (prop.enum) {
            bodyProps[name].enum = prop.enum;
        }
        if (prop.minimum !== undefined) {
            bodyProps[name].minimum = prop.minimum;
        }
        if (prop.maximum !== undefined) {
            bodyProps[name].maximum = prop.maximum;
        }

        if (prop.optional !== 1) {
            required.push(name);
        }
    }

    if (Object.keys(bodyProps).length === 0) return null;

    return {
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    properties: bodyProps,
                    required: required.length > 0 ? required : undefined
                }
            }
        }
    };
}

// Convert response schema
function convertResponse(returns) {
    if (!returns) {
        return {
            '200': {
                description: 'Successful response'
            }
        };
    }

    const response = {
        '200': {
            description: 'Successful response',
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            data: {}
                        }
                    }
                }
            }
        }
    };

    if (returns.type === 'null') {
        response['200'].content['application/json'].schema.properties.data = { type: 'object', nullable: true };
    } else if (returns.type === 'array') {
        response['200'].content['application/json'].schema.properties.data = {
            type: 'array',
            items: returns.items ? { type: convertType(returns.items.type) } : { type: 'object' }
        };
    } else if (returns.type === 'object' && returns.properties) {
        const props = {};
        for (const [name, prop] of Object.entries(returns.properties)) {
            props[name] = {
                type: convertType(prop.type),
                description: prop.description || ''
            };
        }
        response['200'].content['application/json'].schema.properties.data = {
            type: 'object',
            properties: props
        };
    } else {
        response['200'].content['application/json'].schema.properties.data = {
            type: convertType(returns.type || 'object')
        };
    }

    return response;
}

// Extract path parameters from path string
function extractPathParams(pathStr) {
    const matches = pathStr.match(/\{([^}]+)\}/g) || [];
    return matches.map(m => m.slice(1, -1));
}

// Process a single endpoint
function processEndpoint(node, currentPath) {
    if (!node.info) return;

    const apiPath = currentPath || '/';
    const pathParams = extractPathParams(apiPath);

    if (!openApiSpec.paths[apiPath]) {
        openApiSpec.paths[apiPath] = {};
    }

    const methods = ['GET', 'POST', 'PUT', 'DELETE'];

    for (const method of methods) {
        if (!node.info[method]) continue;

        const methodInfo = node.info[method];
        const lowerMethod = method.toLowerCase();

        const operation = {
            summary: methodInfo.name || '',
            description: methodInfo.description || '',
            operationId: `${lowerMethod}_${apiPath.replace(/[^a-zA-Z0-9]/g, '_')}`,
            tags: [apiPath.split('/')[1] || 'root']
        };

        // Handle parameters
        if (method === 'GET' || method === 'DELETE') {
            operation.parameters = convertParameters(methodInfo.parameters, pathParams);
        } else {
            // For POST/PUT, path params go in parameters, rest in body
            const pathOnlyParams = convertParameters(methodInfo.parameters, pathParams)
                .filter(p => p.in === 'path');
            if (pathOnlyParams.length > 0) {
                operation.parameters = pathOnlyParams;
            }
            const requestBody = convertRequestBody(methodInfo.parameters, pathParams);
            if (requestBody) {
                operation.requestBody = requestBody;
            }
        }

        // Add responses
        operation.responses = convertResponse(methodInfo.returns);

        // Add permissions info if available
        if (methodInfo.permissions && methodInfo.permissions.description) {
            operation.description += `\n\nPermissions: ${methodInfo.permissions.description}`;
        }

        openApiSpec.paths[apiPath][lowerMethod] = operation;
    }
}

// Recursively traverse the API schema
function traverseSchema(nodes, parentPath = '') {
    for (const node of nodes) {
        let currentPath = parentPath;

        if (node.path) {
            currentPath = parentPath + '/' + node.path;
        } else if (node.text) {
            currentPath = parentPath + '/' + node.text;
        }

        // Clean up path
        currentPath = currentPath.replace(/\/+/g, '/');
        if (currentPath === '') currentPath = '/';

        // Convert {param} style path parameters
        currentPath = currentPath.replace(/\{([^}]+)\}/g, '{$1}');

        processEndpoint(node, currentPath);

        if (node.children && node.children.length > 0) {
            traverseSchema(node.children, currentPath);
        }
    }
}

// Main execution
console.log('Converting Proxmox API data to OpenAPI 3.0 format...');

traverseSchema(apiSchema);

// Sort paths for better readability
const sortedPaths = {};
Object.keys(openApiSpec.paths).sort().forEach(key => {
    sortedPaths[key] = openApiSpec.paths[key];
});
openApiSpec.paths = sortedPaths;

// Count endpoints
let endpointCount = 0;
for (const path of Object.values(openApiSpec.paths)) {
    endpointCount += Object.keys(path).length;
}

// Write the output
const outputPath = path.join(__dirname, 'proxmox-api-swagger.json');
fs.writeFileSync(outputPath, JSON.stringify(openApiSpec, null, 2));

console.log(`Conversion complete!`);
console.log(`Total paths: ${Object.keys(openApiSpec.paths).length}`);
console.log(`Total endpoints: ${endpointCount}`);
console.log(`Output saved to: ${outputPath}`);
console.log('\nYou can import this file into:');
console.log('- Swagger UI/Editor (https://editor.swagger.io)');
console.log('- Postman (Import > File > proxmox-api-swagger.json)');
