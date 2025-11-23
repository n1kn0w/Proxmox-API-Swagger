# Proxmox API to Swagger Converter

Convert Proxmox VE API documentation (`apidata.js`) to OpenAPI 3.0 (Swagger) format for use with Postman, Swagger UI, and other API tools.

## Features

- Converts all Proxmox VE API endpoints to OpenAPI 3.0 specification
- Preserves descriptions, parameters, and response schemas
- Generates proper request bodies for POST/PUT operations
- Includes authentication schemes (API Token & Cookie)
- Ready to import into Postman or Swagger UI

## Requirements

- Node.js (v12 or higher)

## Usage

1. Place your `apidata.js` file in the project directory
2. Run the conversion script:

```bash
node convert-to-swagger.js
```

3. Import the generated `proxmox-api-swagger.json` into your preferred tool:
   - **Postman**: Import > File > Select `proxmox-api-swagger.json`
   - **Swagger UI**: https://editor.swagger.io > File > Import

## Output

The script generates a complete OpenAPI 3.0 specification with:
- 428 API paths
- 646 endpoints (GET, POST, PUT, DELETE)
- Full parameter descriptions and types
- Response schemas
- Authentication configuration

## Getting apidata.js

The `apidata.js` file can be obtained from the Proxmox VE web interface or the official Proxmox API documentation.
https://raw.githubusercontent.com/proxmox/pve-docs/refs/heads/master/api-viewer/apidata.js