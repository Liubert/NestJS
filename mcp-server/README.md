# localization-mcp-server

MCP server for the localization backend. It exposes controlled tools for reading translations, managing projects, comparing environments, and applying sandbox changes through a backend API.

## Installation

```bash
npm install -g localization-mcp-server
```

## Configuration

Set these environment variables before starting the server:

- `MCP_TOKEN`: API token used for backend authentication.
- `BACKEND_URL`: Base URL of the localization backend API.
- `NODE_ENV`: Optional. In non-production mode the server also loads `.env` from the package directory.

You can copy the included `.env.example` as a starting point.

## Usage

Start the MCP server over stdio:

```bash
localization-mcp-server
```

Run the interactive setup helper:

```bash
localization-mcp-server setup
```

## Published Files

The package publishes only the built `dist` output, `flows`, `.env.example`, and this README.
