# Contributing to Sync-in

We appreciate your contributions and efforts in making this project better.  
Before you contribute, please read the following guidelines to ensure a smooth collaboration.

## Code of Conduct

All contributors must follow our [Code of Conduct](CODE_OF_CONDUCT.md) to ensure a friendly and inclusive environment.

## How to Contribute

### Reporting Issues & Suggesting Features

#### Bugs

- Check existing issues before opening a new one.
- Include detailed steps, logs, and screenshots when possible.

#### Feature Requests

- Describe the problem the feature solves.
- Provide use cases and, if possible, implementation suggestions.

### Submitting Pull Requests

- Open an issue before submitting any pull request for a new feature or bug fix to avoid duplicate work, ensure alignment with the project’s goals,
  and prevent wasted effort.
- All pull requests must target the main branch, following the GitHub Flow model with continuous deployment.
- Make sure your work fits with the existing architecture, code style, and documentation standards.
- All contributions must comply with the [CLA](CLA.md).
- Contributions are made under the [AGPL-3.0 license](LICENSE), the same license used by the project.

#### Submission Guidelines

- Keep pull requests small and focused; avoid addressing multiple unrelated issues in a single PR.
- Ensure all CI checks pass before submitting (linting, type checking, tests, and build).
- Reference the related issue number in the PR description when applicable.
- Include tests and update documentation as needed when introducing new features.
- The PR author is responsible for resolving merge conflicts.
- Use the [Conventional Commits specification](https://www.conventionalcommits.org/) for commit messages; pull requests are squashed on merge.

#### Branching

- **Main**: Production branch; all pull requests must target `main`.
- **Feature branches**: Create a dedicated branch per feature or fix and submit a PR to `main`.

## Development Setup

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
sudo docker run -it -e MARIADB_DATABASE=database -e MARIADB_ROOT_PASSWORD=MySQLRootPassword -p 3306:3306 mariadb:11
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

## i18n Translations

All translation files follow the same structure:

- **Key**: the original text in **English** (used as the reference in the code)
- **Value**: the translated text in the target language

### Translation Locations

Translations must be added or updated in the following directories.

#### Backend

Used for **notifications** and **emails**.

To declare a new language:

1. Edit `backend/src/common/i18n.ts` and add the language code to the `LANG_SUPPORTED` constant.
2. Create a new language file in `backend/src/applications/notifications/i18n/` named `language_region.ts` (lowercase, with an underscore separating
   the region).
3. Import the new file in `backend/src/applications/notifications/i18n/index.ts`, like the other languages, and add it to the `translations` variable.

#### Frontend

Used for the **web user interface**.

To declare a new language:

1. Edit `frontend/src/i18n/l10n.ts` and add the language code and language name to the `i18nLanguageText` variable.
2. Create a new language file in `frontend/src/i18n` named `language-region.json`, using the same language code declared previously.
3. Import the *ngx-bootstrap* locale in `frontend/src/i18n/lib/bs.i18n.ts`. Check if the locale exists in:  
   https://github.com/valor-software/ngx-bootstrap/tree/development/src/chronos/i18n
4. Import *day.js* locale in `frontend/src/i18n/lib/dayjs.i18n.ts`. Check if the locale exists in:  
   https://github.com/iamkun/dayjs/tree/dev/src/locale

> [!TIP]
> English is the default language used in the codebase.  
> Since translation keys are written in English, the English translation file may be missing or incomplete. This is expected.  
> Any other translation file can be used as a reference for the structure.

## Troubleshooting

- **Backend:** Check API logs for errors. Use your browser to test endpoints.
- **Frontend:** Use Angular DevTools for debugging. Check browser console for runtime errors.
- Make sure both the server and the database are running.

## Useful Links

- [NestJS Documentation](https://docs.nestjs.com)
- [Angular Documentation](https://angular.dev)
- [Node.js Documentation](https://nodejs.org/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

_Thanks again for helping make **Sync-in** better! 🚀_
