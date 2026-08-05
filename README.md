# 9Router - FREE AI Router & Token Saver

9Router is a local AI routing gateway with provider fallback and token-saving features.

## Quick Start

### Install

#### Docker

```bash
cp .env.example .env
docker compose up -d
```

Dashboard: `http://localhost:20128/dashboard`

API endpoint: `http://localhost:20128/v1`

#### From Source

```bash
cp .env.example .env
npm install
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev
```

Before starting, set at least `JWT_SECRET` and `INITIAL_PASSWORD` in `.env`.

### Update

This fork follows `decolua/9router` through the `upstream` remote.

```bash
git fetch upstream
git checkout master
git merge upstream/master
git push origin master
```

To build and publish this fork's Docker image after updating the source:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The GitHub Actions workflow builds and publishes:

```text
mhiqrambhrng/9router-mibp-version
```

On the server, update the running container with:

```bash
docker compose pull 9router
docker compose up -d
```

## Forks (9Router)

- [9Router upstream](https://github.com/decolua/9router)
- [9Router MIBP Version](https://github.com/mhiqrambg/9router-mibp-version)

## License

MIT License. See [LICENSE](LICENSE) for details.
