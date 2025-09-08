# Developer Guide for Sync-in

## Prerequisites

Before anything, please refer to the [Contribution Guide for Sync-in](CONTRIBUTING.md).

You will need the following on your system:

- **Git**
- **Node.js with npm**
- **Database server** (mariadb)
- **Docker** (optional but highly recommended)

## Project Structure

The project uses npm workspaces to manage a monorepo with two main workspaces: `backend` and `frontend`.
This structure enables shared tooling, coordinated builds, and simplified dependency management.

| Workspace |   Path    | Technology       | Purpose                                 |
|:----------|:---------:|:-----------------|:----------------------------------------|
| Root      |     /     | npm workspaces   | Monorepo orchestration, shared scripts  |
| Backend   | /backend  | NestJS + Fastify | API server, business logic, data access |
| Frontend  | /frontend | Angular          | User interface, client-side logic       |

## Setup Instructions

### Clone the repo

```
git clone git@github.com:Sync-in/server.git
cd server
```

### Run the database server

Quick and simple example with docker:
```
sudo docker run -it -e MARIADB_DATABASE=database -e MARIADB_ROOT_PASSWORD=MySQLRootPassword mariadb:11
```

### Create and edit your environment file
```
cp environment/environment.dist.yaml environment/environment.yaml 
```

> [!CAUTION]
> The `mysql.url` in the `environment.yaml` should match the mariadb credentials and
> the `applications.files.dataPath` path should be writable.

### Install dependencies and build the backend 

```
npm ci
npm -w backend run build
```

> [!TIP]
> Building the backend once is useful to generate the script used in the next step (in the `dist` directory).


### Init the database and create the admin user

```
npx drizzle-kit migrate --config=backend/src/infrastructure/database/configuration.ts
node dist/server/infrastructure/database/scripts/create-user.js --role admin --login admin --password admin
```

### Build the frontend (dev mode)
```
npm -w frontend run build:dev
```

### Start the backend (dev mode)

```
npm -w backend run start:dev
```
**Default endpoint is `http://localhost:8080`, you should be able to login with `admin`:`admin`**

**Happy coding!**

## Useful Scripts

### In the root workspace

- `npm run test` run unit tests
- `npm run lint` code linting
- `npm run docker:build` build the Docker image

## Development Guidelines

- Always write/review tests for new features and bug fixes
- Follow code style rules (`eslint.config.mjs`, `.prettierrc`)
- Prefer clear naming and documentation within your code
- Document significant architectural changes and updates

## Troubleshooting

- **Backend:** Check API logs for errors. Use your browser to test endpoints.
- **Frontend:** Use Angular DevTools for debugging. Check browser console for runtime errors.
- Make sure both the server and the database are running.

## Useful Links

- [NestJS Documentation](https://docs.nestjs.com)
- [Angular Documentation](https://angular.dev)
- [Node.js Documentation](https://nodejs.org/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
