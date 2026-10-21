# KAR International Infotech website

## Project context

- This repository contains KAR International Infotech's 3D parallax scrolling website.
- GitHub: https://github.com/Karthik66666/New-rep-for-KAR-website-2026
- The current application is buildless HTML, CSS and JavaScript with a native WebGL sculpture. It is not a React application.
- The initial homepage has hero, introduction, services, approach, about and project-enquiry sections. The initial palette is warm white, charcoal and lime; follow the user's subsequent design changes.
- Read `README.md` and the relevant source files before making changes. Use the current repository as the source of truth for implementation details.

## Files and local development

- `dist/index.html`: page content, navigation, services and enquiry dialog.
- `dist/styles.css`: layouts, responsiveness, CSS 3D and motion styles.
- `dist/app.js`: WebGL sculpture, scroll/pointer interactions, navigation and enquiry brief generation.
- `dist/favicon.svg`: temporary monogram favicon.
- `server.mjs`: Node development server bound to localhost.
- Run `npm run dev` and visit `http://127.0.0.1:4173`. Node.js 20 or later is required. There are currently no package dependencies to install.
- Run `npm run check` after JavaScript changes. Run `node --check server.mjs` when editing the server.

## Implementation guidance

- Apply the user's requested changes to the existing site. Keep framework migrations and unrelated redesigns outside a focused change unless they are needed for the request.
- Preserve responsive layouts, semantic HTML, keyboard operation, readable text, reduced-motion support and the manual motion pause control.
- Keep WebGL failure graceful, and avoid continuous animation while the hero is offscreen or the page is hidden.
- Check affected layouts on desktop and mobile when browser tools are available. Report any verification that could not be completed.
- The enquiry form currently creates a local brief with copy/download options. It does not send enquiries. Do not claim remote submission unless a real endpoint has been implemented and verified.

## Company content

- KAR International Infotech provides web development, custom software, mobile applications and digital marketing.
- Founded in 2023; operations are remote. List locations in this order when needed: Kovilpatti, Coimbatore, Chennai.
- Use approved company logos and contact details supplied by the user. Do not invent a phone number, email address, testimonial, client result or statistic.
- The user's contact preference is a single company phone number ending in 0406. The complete number must be confirmed before adding it.
- Keep confidential client details out of website copy and public source files unless the user supplies them for that purpose.

## Git and hosting

- Check `git status` and preserve other work before editing or committing.
- Inspect the current remote branch before pushing. Do not force-push or discard changes to resolve a conflict.
- `.openai/hosting.json` retains the existing Sites project identity. Preserve it when maintaining Sites hosting; GitHub uploads and website deployment are distinct operations.
- Never commit credentials, access tokens or private environment files.
- Report what changed, what was checked and whether any requested push or deployment actually succeeded.

## Communication

The project owner is Karthikeyan (Karthik). Accept plain-language instructions and screenshots as design guidance. Use concise explanations and clarify only when a material design or functionality decision cannot reasonably be inferred.
