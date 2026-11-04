---
name: dnw-spec-writing
description: Use when drafting or improving a dnw spec in docs/specs (api or ui), before running dnw spec review. Covers using project context, testable acceptance criteria, and splitting work into tasks with one test each.
---

# Writing a dnw spec

A good spec lets someone implement the feature without asking what was meant. Fill in the sections the template
gives you; do not add or rename them, because `dnw spec review` checks them.

## Before writing

1. Run `dnw status` to see which specs already exist. If this feature extends one, say so instead of repeating it.
2. Read the project's architecture, product and design-system docs named in the AI instructions.
3. Read the code the feature touches. Reuse its names, patterns and data shapes.
4. Ask the user about anything the code and docs cannot answer. Do not guess at business rules.

## Picking the spec type

- `api`: endpoints, data models, error cases.
- `ui`: screens, components, states, user flows.
- A feature with both gets two specs that share an id. Write the `api` spec first:
  `dnw spec new "<title>" --type ui --id <id>` adds the other half.

## Acceptance criteria

Write each one so it can become a test. Use: WHEN <condition> THE SYSTEM SHALL <behavior>.

- Weak: "Login should be secure."
- Strong: "WHEN a password is wrong 5 times in 15 minutes THE SYSTEM SHALL lock the account for 15 minutes."

Cover failure paths as well as the happy path: invalid input, missing permissions, and external services being down.

## API specs

- Give every endpoint its method, path, auth, request body and response body.
- List each error: condition, status code, error body.
- Name every field with its type and constraints in Data Models.

## UI specs

- Reuse components from the design system first. Name any new component and why it is needed.
- Describe loading, empty, error and success states for every screen.
- Reference the endpoints of the paired API spec in User Flows.

## Tasks

- Use the format `- [ ] T1: <what this task delivers> (test: <path/to/test/file>)`.
- Each task delivers one behavior and has exactly one test file, which may not exist yet.
- Order tasks so each builds on the last. Every acceptance criterion must be covered by a task.
- A task that needs more than a few hours of work should be split.

## Finishing

1. Check every section is filled in and every task names a test path.
2. Run `dnw spec review <ref>`.
3. Tell the user the spec is ready for approval. A human runs `dnw spec activate <ref>`; never run it yourself.
