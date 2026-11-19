# AI Setup Prompts

Copy a prompt below into an AI coding assistant with terminal and file access. Replace placeholders in angle brackets before use. Private repositories require access permission.

## 1. Download from GitHub and Run Locally

```text
Help me download and run Starlink D2C Observatory locally.

Repository: https://github.com/xlllleuw/starlink-d2c-observatory.git
Destination: <absolute path where I want to save the project>

Please carry out these steps:
1. Check the operating system and whether Node.js and Git are available. Read any applicable AGENTS.md instructions.
2. Inspect a nonempty destination before proceeding and preserve existing files. Clone the specified repository, or download and extract its ZIP if Git is unavailable.
3. Read README.md and verify that public/, server/, scripts/local-server.mjs, public/vendor/, and the startup data are present.
4. Use the bundled lightweight server: node scripts/local-server.mjs. It uses Node.js built-in modules and bundled browser assets, so npm install is unnecessary. This task does not require Sites or Cloudflare deployment.
5. Check that Node.js meets the engines requirement in package.json. If a prerequisite is missing, identify it and provide official installation instructions. Preserve existing system proxy and firewall settings.
6. Use 127.0.0.1:4173 by default. If the port is occupied, set PORT to another available port and leave existing processes running. Keep the server accessible only on the local machine.
7. Verify that /api/health returns ok:true and that /dashboard.html, /js/app.js, and /vendor/cesium/Cesium.js load. Successful HTTP responses alone do not verify every UI feature.
8. If browser controls are available, check that the sky plot is initially empty, applying coordinates displays live satellite dots, research search works, selecting a country displays its TAC grid, and selecting that country again hides all TAC cells. Use normal interactive map requests only.
9. If an ephemeris request fails, check the cache and upstream connectivity. Preserve the bundled snapshot and report its orbital epochs. Distinguish a refresh failure from a complete startup failure.
10. Report the project directory, actual startup command, browser URL, completed checks, unverified features, and how to stop the server. Keep the local server running for me. If your environment cannot keep it running, provide the exact command I should run manually.

This task is limited to downloading and running the project locally. Publishing code, purchasing a domain, hosted deployment, and uploading private files are outside its scope.
```

## 2. Run an Already Downloaded ZIP

```text
I have downloaded and extracted Starlink D2C Observatory.
Project directory: <absolute path to the extracted project root>

Read README.md and confirm that this is the root containing public/, server/, and scripts/.
Check the Node.js version and the bundled public/vendor/ assets, then run:
node scripts/local-server.mjs

Open http://127.0.0.1:4173/dashboard.html by default; the local /dashboard path is not supported.
This startup method does not require installing npm dependencies, configuring a database, or obtaining an API key or hosting account.
If the port is occupied, use another port and leave existing services running.
Check /api/health and the page assets. If browser controls are available, verify coordinate input, the sky plot, and country TAC selection and deselection.
Report the working URL, actual startup command, how to stop the server, and any unresolved issues.
Keep this task limited to local setup, preserving the application logic.
```

## 3. Troubleshoot Local Startup

```text
Help me troubleshoot Starlink D2C Observatory running locally.
Project directory: <absolute project path>
Error or symptoms: <paste the error after removing passwords, tokens, proxy credentials, and other sensitive information>

Read README.md, then investigate in this order:
Node.js version -> project directory and asset completeness -> port availability -> /api/health -> static assets -> browser WebGL -> map tile requests -> server-side ephemeris requests.

Use node scripts/local-server.mjs as the local entry point.
Distinguish between a server that has not started, failed online map tiles, and an ephemeris refresh failure with a usable snapshot.
Preserve the original data, system security settings, and global proxy configuration.
Make only changes relevant to the problem. Explain which files changed, how the fix was verified, and how to revert it.
```

## Notes for Maintainers

- Keep the repository HTTPS URL current in prompts shared with users.
- Local setup does not require ChatGPT Sites repository credentials.
- Mark features that were not checked in a browser as unverified. Startup logs alone do not demonstrate that all functionality works.
