const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Output paths for the generated report and its temporary DOCX staging folder.
const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, 'docs');
const stagingDir = path.join(outputDir, '.textliby-report-build');
const zipPath = path.join(outputDir, 'TextLiby_Architecture_Report.zip');
const docxPath = path.join(outputDir, 'TextLiby_Architecture_Report.docx');

// Helper functions keep the WordprocessingML generation readable and deterministic.
function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function makeParagraph(text, options = {}) {
  const before = options.before ?? 0;
  const after = options.after ?? 140;
  const size = options.size ?? 22;
  const bold = options.bold ? '<w:b/>' : '';
  const italic = options.italic ? '<w:i/>' : '';
  const monospace = options.code
    ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>'
    : '';

  return [
    '<w:p>',
    '<w:pPr>',
    `<w:spacing w:before="${before}" w:after="${after}"/>`,
    options.keepNext ? '<w:keepNext/>' : '',
    '</w:pPr>',
    '<w:r>',
    '<w:rPr>',
    bold,
    italic,
    monospace,
    `<w:sz w:val="${size}"/>`,
    `<w:szCs w:val="${size}"/>`,
    '</w:rPr>',
    `<w:t xml:space="preserve">${escapeXml(text)}</w:t>`,
    '</w:r>',
    '</w:p>',
  ].join('');
}

function makePageBreak() {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

function title(text) {
  return makeParagraph(text, { size: 36, bold: true, after: 220 });
}

function heading1(text) {
  return makeParagraph(text, { size: 30, bold: true, before: 200, after: 120, keepNext: true });
}

function heading2(text) {
  return makeParagraph(text, { size: 26, bold: true, before: 160, after: 90, keepNext: true });
}

function paragraph(text) {
  return makeParagraph(text, { size: 22, after: 120 });
}

function bullet(text) {
  return makeParagraph(`- ${text}`, { size: 22, after: 80 });
}

// The report body explains the role of each project file and the communication paths between them.
const sections = [
  title('TextLiby Architecture Report'),
  paragraph('Generated on April 7, 2026. This report explains the responsibility of each project file, the runtime data flow between the frontend, backend, and database, and the reason some files were documented here instead of receiving inline comments.'),
  paragraph('Scope note: inline comments were added to project files that safely support comments, including JavaScript, HTML, CSS, SQL, environment files, and .gitignore. JSON files such as package.json, package-lock.json, and railway.json cannot safely hold comments without changing their format, so they are documented in this report instead. Vendor and generated directories such as node_modules and .git were treated as external infrastructure rather than application source.'),
  heading1('System Overview'),
  paragraph('TextLiby is a server-rendered web application with a static frontend and an Express plus PostgreSQL backend. The browser loads login, signup, or library pages from the Express server. Once authenticated, the browser uses fetch-based API calls to manage books, search Google Books through a server proxy, and keep the UI synchronized with database-backed state.'),
  bullet('The browser stores only lightweight UI preferences and legacy-import prompts in localStorage.'),
  bullet('Authentication state lives in a signed cookie that points to a server-side session row in PostgreSQL.'),
  bullet('All durable library data lives in PostgreSQL tables created by the migration script.'),
  bullet('The Google Books API key stays on the server, and the browser searches through a protected proxy route.'),
  heading1('Runtime Communication Map'),
  heading2('Startup Flow'),
  paragraph('Deployment and local startup both begin with configuration loading. package.json defines the entrypoints, railway.json tells Railway to run the migration script before startup, server/config.js resolves environment variables, and server/db.js builds the shared PostgreSQL connection pool. server/index.js verifies the database connection before accepting HTTP traffic. This means configuration failure or database unavailability is surfaced immediately instead of after the first user request.'),
  heading2('Authentication Flow'),
  paragraph('The login and signup pages are rendered from views/login.html and views/signup.html, styled by public/auth.css, and made interactive by public/auth.js. That client script posts JSON credentials to /api/auth/login or /api/auth/signup. server/routes/auth.js validates the payload with helpers from server/utils/validation.js, hashes or compares passwords with bcrypt, and creates session records through server/utils/sessions.js. The sessions utility writes to the sessions table through server/db.js, then server/routes/auth.js returns a cookie configured from server/config.js.'),
  paragraph('On every protected page request, server/middleware/requireAuth.js reads the session cookie, looks up the active user through server/utils/sessions.js, and either attaches req.user or rejects the request. HTML page requests are redirected to /login, while API requests receive a 401 JSON response. This split keeps browser navigation user-friendly while preserving correct API semantics.'),
  heading2('Library CRUD Flow'),
  paragraph('public/script.js drives the authenticated library dashboard. It fetches /api/auth/me to identify the current user, then fetches /api/books to load the full library. Create, update, delete, and import actions are sent back to server/routes/books.js. That route validates book payloads through server/utils/validation.js, executes SQL through server/db.js, and returns normalized JSON records shaped specifically for the frontend. The client merges those results into in-memory state and re-renders the dashboard.'),
  heading2('Google Books Flow'),
  paragraph('When a user searches from the add-book drawer, public/script.js calls /api/google-books/search with the query string. server/routes/googleBooks.js verifies authentication, rate-limits the request, and then calls the external Google Books endpoint using the API key from server/config.js. The server transforms Google volume data into a smaller frontend-friendly object. The browser can then turn a selected search result into a local /api/books create request, so external search data becomes a normal database-backed book record.'),
  heading2('Import, Export, and Migration Flow'),
  paragraph('Export is entirely client-side: public/script.js serializes the current in-memory library into a JSON download. Import runs in two steps: the browser reads a selected file, normalizes different possible schemas, then posts the books to /api/books/import. The server sanitizes every record, writes valid books in a transaction, and reports how many were imported or skipped. A separate migration banner detects legacy books stored in localStorage under an older key and offers to import them into the authenticated account.'),
  makePageBreak(),
  heading1('File-by-File Breakdown'),
  heading2('.env'),
  paragraph('The live .env file contains this developer environment\'s runtime values. It defines the local port, node environment, app base URL, database connection string, session settings, and Google Books API key. server/config.js is the direct consumer of these values. The report intentionally describes responsibilities rather than repeating secret-bearing values.'),
  heading2('.env.example'),
  paragraph('.env.example is the onboarding-safe version of the runtime configuration. It mirrors the variables the application expects, provides placeholder values, and gives new developers or deployment systems a template for required settings. It communicates directly with README.md and server/config.js by describing the variables those files expect to exist.'),
  heading2('.gitignore'),
  paragraph('.gitignore prevents local-only or generated artifacts from being committed. In this project it is meant to exclude dependencies, environment files, logs, build output, and machine-specific artifacts. Its communication role is indirect but important: it protects the repository from accidentally storing secrets from .env or large generated folders such as node_modules.'),
  heading2('package.json'),
  paragraph('package.json is the project manifest and the operational contract for local development and deployment. It names server/index.js as the application entrypoint, defines scripts for development, startup, migrations, and syntax checks, and records every runtime dependency that the server code imports. It communicates with the rest of the codebase by telling npm which libraries are available and by serving as the root command map used by developers and hosting platforms.'),
  heading2('package-lock.json'),
  paragraph('package-lock.json is the generated dependency lockfile. It pins the exact resolved package tree that npm installed so teammates and deployment environments receive the same dependency versions. It was not edited for inline comments because lockfiles are generated artifacts and manual annotation would be fragile. Its communication role is build determinism rather than direct application logic.'),
  heading2('README.md'),
  paragraph('README.md is the human-facing setup and deployment guide. It explains how to configure environment variables, run migrations, start the server, and understand Railway deployment expectations. It communicates with package.json, railway.json, and server/run-migrations.js by documenting the commands and deployment flow those files implement.'),
  heading2('railway.json'),
  paragraph('railway.json defines how Railway deploys the app. Its preDeployCommand runs server/run-migrations.js, its startCommand launches server/index.js, and its healthcheckPath relies on the /health route registered in server/index.js. This file is the bridge between platform orchestration and the application runtime.'),
  heading2('migrations/001_init.sql'),
  paragraph('This migration creates the three core tables: users, sessions, and books. users stores account identities and hashed-password metadata. sessions stores opaque session IDs tied to users with expiration and revocation timestamps. books stores the actual library records and reading metadata for each user. The migration also adds constraints that mirror validation rules in server/utils/validation.js, such as allowed categories, statuses, ratings, and year ranges.'),
  paragraph('The indexes at the bottom support the most common lookup patterns used by the server. requireAuth and session lookups benefit from session indexes, while /api/books queries benefit from the user_id and added_at book indexes. This file therefore communicates directly with server/utils/sessions.js, server/routes/books.js, and server/middleware/requireAuth.js by defining the schema those modules assume.'),
  heading2('server/config.js'),
  paragraph('server/config.js is the central configuration resolver. It loads .env values through dotenv, validates required values such as SESSION_SECRET, parses integer settings, reconstructs a PostgreSQL URL when the environment provides split variables, and derives shared runtime constants such as cookie options and absolute asset directories.'),
  paragraph('Almost every server-side module depends on this file. server/db.js consumes databaseUrl and isProduction, session utilities consume cookie settings and TTL values, routes consume the session cookie name and Google Books API key, and server/index.js uses directory paths and the port value. This makes server/config.js the configuration spine of the backend.'),
  heading2('server/db.js'),
  paragraph('server/db.js owns the shared PostgreSQL connection pool. It centralizes SSL behavior, connection timeouts, and idle timeout settings, then exports both the raw pool and a lightweight query helper. This keeps individual routes and utilities from repeatedly creating their own database connections.'),
  paragraph('It communicates outward in two ways: synchronous query execution for normal route work, and startup verification for server/index.js. server/run-migrations.js uses the pool directly because it needs explicit client transactions; most other modules use the exported query helper.'),
  heading2('server/run-migrations.js'),
  paragraph('server/run-migrations.js is a standalone process-oriented script that applies SQL schema migrations. It scans the migrations directory, ensures a schema_migrations ledger table exists, checks which filenames have already been applied, and runs each pending SQL file inside its own transaction. If a migration fails, it rolls back the transaction, reports the failure, and ends the process with a non-zero exit code.'),
  paragraph('This file communicates with railway.json and package.json operationally, with server/config.js for the migrations directory path, and with server/db.js for its database connection. It is what keeps the live database schema aligned with what the route and utility code expects.'),
  heading2('server/index.js'),
  paragraph('server/index.js is the application entrypoint and HTTP composition root. It creates the Express app, applies security and parsing middleware, conditionally trusts the proxy in production, registers the health route and the login/signup/index page routes, mounts the API routers, serves the static public directory, and installs the final error handler.'),
  paragraph('It also owns process lifecycle behavior. Before listening, it calls verifyDatabaseConnection from server/db.js. During shutdown or fatal process events, it closes the HTTP server and ends the database pool. Functionally, this file is the point where configuration, data access, authentication, static assets, and routing become a single running web service.'),
  heading2('server/middleware/requireAuth.js'),
  paragraph('requireAuth.js is the main route guard. It reads the session cookie using the configured cookie name, resolves the corresponding active session through server/utils/sessions.js, clears stale cookies when the session is invalid, and either redirects to /login for browser page requests or returns a 401 JSON error for API calls.'),
  paragraph('This middleware is the enforcement layer that links browser cookies to actual authenticated behavior. server/index.js uses it for the main dashboard page, while server/routes/books.js and server/routes/googleBooks.js apply it to every endpoint in their routers.'),
  heading2('server/utils/sessions.js'),
  paragraph('sessions.js encapsulates all session persistence rules. It generates cryptographically random session IDs, inserts new session rows with a configured expiration time, joins sessions back to users for auth checks, and revokes sessions on logout. It also exposes the canonical cookie options used when the server sets the browser cookie.'),
  paragraph('This file is the most important bridge between authentication routes, middleware, and the database schema. server/routes/auth.js creates and revokes sessions with it, while requireAuth.js reads sessions from it. The sessions table defined in migrations/001_init.sql is its backing store.'),
  heading2('server/utils/validation.js'),
  paragraph('validation.js centralizes low-level input normalization and constraint checking. It normalizes email addresses, validates password length, trims and length-limits text fields, parses years and ratings, and sanitizes both single-book and batch-import payloads. The goal is to keep all route handlers thin and to ensure the same rules apply across create, update, and import operations.'),
  paragraph('It communicates closely with the database schema: the allowed category, status, rating, and year rules mirror the SQL constraints from migrations/001_init.sql. server/routes/auth.js depends on the email and password helpers, while server/routes/books.js depends on the book sanitizers.'),
  heading2('server/routes/auth.js'),
  paragraph('auth.js defines the authentication API surface. /signup validates the payload, hashes the password, inserts the user, creates a session, and returns a cookie plus a minimal user payload. /login loads the user by email, compares the stored hash, creates a new session, and sets the same cookie. /logout revokes the current session and clears the cookie. /me returns the currently authenticated user if the session is valid.'),
  paragraph('This file coordinates many backend layers at once: validation.js for credential rules, db.js for user queries, sessions.js for session persistence and cookie settings, config.js for the cookie name, and express-rate-limit for brute-force protection. public/auth.js and public/script.js are its primary browser-side consumers.'),
  heading2('server/routes/books.js'),
  paragraph('books.js contains the authenticated CRUD API for a user\'s library. GET / returns all books for the current user. POST / inserts a validated record. PATCH /:id builds a dynamic update clause from only the provided fields. DELETE /:id removes a single book owned by the current user. POST /import sanitizes a batch of books and inserts them inside a transaction.'),
  paragraph('This route file is the main backend counterpart to public/script.js. The client depends on its camelCase response shape, ownership filtering, and import behavior. It, in turn, depends on requireAuth for user context, validation.js for payload rules, db.js for queries, and migrations/001_init.sql for the books table structure and constraints.'),
  heading2('server/routes/googleBooks.js'),
  paragraph('googleBooks.js is a small authenticated proxy around the external Google Books API. It rate-limits searches, verifies that a query string exists and that a server-side API key is configured, calls Google Books, and maps the large upstream payload into a much smaller object containing only the fields the frontend needs.'),
  paragraph('Its main communication partner is public/script.js, which uses it during the add-book workflow. By proxying through the server, the application keeps the API key out of the browser and can standardize response shapes before they reach the UI.'),
  heading2('views/login.html'),
  paragraph('views/login.html is the HTML shell for the sign-in page. It defines the marketing copy, the login form structure, the placeholder OAuth buttons, and the data-auth-error container used by client-side feedback. It communicates with public/auth.css for presentation and public/auth.js for behavior.'),
  heading2('views/signup.html'),
  paragraph('views/signup.html is the account-creation counterpart to the login template. It uses the same frontend assets but changes the copy, field expectations, and form data-mode so public/auth.js knows to post to the signup endpoint. It communicates with the same backend auth routes through that shared script.'),
  heading2('public/auth.css'),
  paragraph('public/auth.css contains the entire visual system for the login and signup experience. It defines the split layout, typography, button states, error presentation, and responsive collapse from two columns to one column. This file communicates structurally with the class names present in views/login.html and views/signup.html.'),
  heading2('public/auth.js'),
  paragraph('public/auth.js is the client controller for the login and signup pages. It reads the form\'s data-mode to decide whether the request should target /api/auth/login or /api/auth/signup, serializes the email and password into JSON, manages the submit button\'s loading state, displays API or network errors, and redirects to / after successful authentication.'),
  paragraph('It also owns the current placeholder behavior for OAuth buttons by showing an explanatory message instead of attempting an incomplete provider flow. Its communication path is direct: auth page HTML -> public/auth.js -> server/routes/auth.js -> redirect back to the protected main app.'),
  heading2('public/index.html'),
  paragraph('public/index.html is the structural skeleton for the authenticated library dashboard. It contains the sidebar, search bar, statistics row, filter controls, add-book drawer, detail modal, settings modal, confirm modal, migration banner, toast region, and every element ID that public/script.js expects to query and manipulate.'),
  paragraph('It communicates in two directions. Upward, server/index.js serves it only after requireAuth has allowed the request. Downward, public/script.js treats its IDs and class names as the UI contract that makes rendering, modal control, and interaction wiring possible.'),
  heading2('public/style.css'),
  paragraph('public/style.css defines the dashboard\'s full visual system: sidebar layout, topbar, card grid, list view, badges, drawer, modals, buttons, toast, and responsive behavior. It is intentionally class-driven so public/script.js can switch view modes, active states, and modal visibility simply by toggling classes rather than mutating inline styles everywhere.'),
  heading2('public/script.js'),
  paragraph('public/script.js is the largest and most stateful file in the project. It initializes the authenticated dashboard, caches DOM references, stores the current user and book collection in memory, binds every major UI event, fetches account and library data, renders counts and book cards, manages search and filter logic, drives the add-book drawer, saves detail edits, handles deletes, exports library JSON, imports books from files, migrates legacy localStorage data, manages confirmation modals, and shows toast notifications.'),
  paragraph('This file is also the client-side integration hub. It talks to /api/auth/me for bootstrap identity, /api/books for CRUD and import, /api/google-books/search for catalog lookup, localStorage for remembered preferences and migration hints, and public/index.html plus public/style.css for all DOM and visual behavior. If server/routes/books.js is the backend heart of the library feature, public/script.js is the frontend heart.'),
  makePageBreak(),
  heading1('Cross-File Communication Details'),
  heading2('Configuration Spine'),
  paragraph('The configuration spine begins with .env and .env.example, is materialized by server/config.js, and then fans out into nearly every backend module. Because cookie settings, database URLs, runtime directories, and API keys are all derived there, a configuration change in one environment immediately affects routes, session behavior, and deployment. package.json and railway.json are the operational wrappers around that same spine.'),
  heading2('Backend Request Path'),
  paragraph('A protected request reaches server/index.js first, then flows through global middleware such as helmet, body parsing, and cookie parsing. From there it is routed to auth.js, books.js, or googleBooks.js. Protected routers call requireAuth.js, which in turn calls sessions.js, which in turn queries the sessions and users tables via db.js. Once a route finishes its work, the response is serialized to JSON and returned to the browser, where public/script.js or public/auth.js updates the UI.'),
  heading2('Validation and Data Integrity'),
  paragraph('The project protects data integrity at three layers. On the client side, public/auth.js and public/script.js perform lightweight UX-focused checks so users get fast feedback. On the server side, validation.js applies canonical normalization and validation rules before writing data. At the database layer, migrations/001_init.sql enforces constraints that mirror those rules. This layered approach means the UI is helpful, the API is authoritative, and the database is the final safeguard.'),
  heading2('Session and Security Model'),
  paragraph('The browser never stores durable authentication data other than the session cookie. server/routes/auth.js sets the cookie using secure options from server/config.js, server/middleware/requireAuth.js resolves that cookie back to a user through sessions.js, and public/script.js treats a 401 response as a signal to redirect the browser back to /login. Rate limiting in auth.js and googleBooks.js, plus server-side HTML escaping in public/script.js, form the main defensive controls visible in this codebase.'),
  heading2('Frontend Composition Model'),
  paragraph('The frontend is intentionally simple: HTML provides a stable DOM contract, CSS provides class-based presentation states, and public/script.js provides a state machine plus fetch layer. The script never needs a frontend framework because index.html already includes all required placeholders and style.css already defines the stateful classes the script toggles. This keeps the stack lightweight while still supporting a rich interactive dashboard.'),
  heading2('Operational and Deployment Model'),
  paragraph('Local development uses package.json scripts and .env values. Deployment uses railway.json to run migrations before starting the server. The health route in server/index.js gives the hosting platform a cheap readiness signal, while graceful shutdown handling protects the database pool and HTTP listener during restarts or failures. In other words, package.json, railway.json, server/run-migrations.js, server/index.js, and server/db.js form the application\'s operational control plane.'),
  heading1('Practical Summary'),
  paragraph('TextLiby is organized around a clear contract: HTML and CSS define structure and appearance, browser scripts define client behavior, Express route modules define API behavior, utilities encapsulate cross-cutting rules, and PostgreSQL stores durable state. The major communication edges are deliberate and readable: config.js feeds the backend, db.js feeds persistence, sessions.js feeds auth, validation.js feeds safe writes, routes feed the browser, and public/script.js feeds the user interface.'),
  paragraph('That separation is why the new inline comments were added at section boundaries rather than line by line. Each file already has a focused responsibility; the comments now make those boundaries and cross-file dependencies easier to see during maintenance, onboarding, or future feature work.'),
];

// Minimal DOCX package parts required for a modern Word document.
const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const packageRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>TextLiby Architecture Report</dc:title>
  <dc:subject>Repository Documentation</dc:subject>
  <dc:creator>Codex</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-04-07T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-04-07T00:00:00Z</dcterms:modified>
</cp:coreProperties>`;

const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Codex</Application>
</Properties>`;

const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
</w:styles>`;

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="w14 wp14">
  <w:body>
    ${sections.join('')}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

// Create the package structure, zip it, then rename the archive to .docx.
fs.mkdirSync(path.join(stagingDir, '_rels'), { recursive: true });
fs.mkdirSync(path.join(stagingDir, 'docProps'), { recursive: true });
fs.mkdirSync(path.join(stagingDir, 'word', '_rels'), { recursive: true });
fs.mkdirSync(path.join(stagingDir, 'word'), { recursive: true });

fs.writeFileSync(path.join(stagingDir, '[Content_Types].xml'), contentTypesXml, 'utf8');
fs.writeFileSync(path.join(stagingDir, '_rels', '.rels'), packageRelsXml, 'utf8');
fs.writeFileSync(path.join(stagingDir, 'docProps', 'core.xml'), coreXml, 'utf8');
fs.writeFileSync(path.join(stagingDir, 'docProps', 'app.xml'), appXml, 'utf8');
fs.writeFileSync(path.join(stagingDir, 'word', '_rels', 'document.xml.rels'), documentRelsXml, 'utf8');
fs.writeFileSync(path.join(stagingDir, 'word', 'document.xml'), documentXml, 'utf8');
fs.writeFileSync(path.join(stagingDir, 'word', 'styles.xml'), stylesXml, 'utf8');

fs.mkdirSync(outputDir, { recursive: true });
if (fs.existsSync(zipPath)) {
  fs.rmSync(zipPath, { force: true });
}
if (fs.existsSync(docxPath)) {
  fs.rmSync(docxPath, { force: true });
}

execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipPath}' -Force`,
  ],
  { stdio: 'inherit' }
);

fs.renameSync(zipPath, docxPath);
fs.rmSync(stagingDir, { recursive: true, force: true });

console.log(`Generated ${docxPath}`);
