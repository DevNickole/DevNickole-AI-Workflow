---
name: dnw-skill-writing
description: Use when creating or improving an AI skill in this project with dnw, such as after dnw skill new or when the user wants to write, edit or tidy a SKILL.md in .dnw/skills.
---

# Writing a skill

A skill teaches an AI something it would otherwise get wrong or do differently each time. Write down what is specific
to this project; leave out what any capable AI already knows.

## Start by asking

If the user has not said, ask one question at a time:

1. What should the AI do differently with this skill?
2. When should it apply, and when should it not?
3. Is there a good example in the code, or a past mistake this should prevent?

Read the code it applies to, so the skill names real files, commands and conventions.

## Creating and changing skills

1. New skill: `dnw skill new <name> --description "..."`. Names are lowercase with hyphens, e.g. `api-style`.
2. Existing skill: `dnw skill edit <name>` shows the file to change.
3. Edit only under `.dnw/skills/`, never the copies in `.claude/skills/` or `.agents/skills/`.
4. Finish with `dnw skill sync`, which checks the skill and copies it to every AI tool.

## The description decides when it loads

The AI sees only the name and description until it chooses a skill, so the description must say when to use it.

- Weak: "API helper."
- Strong: "Use when adding or changing API endpoints: routing, request validation, error format and auth."

Start with "Use when", and include the words someone would actually say or the files they would touch.

## The body

- Keep `SKILL.md` short and focused on one job. Move long detail to `references/` and link to it, so it is read only
  when needed.
- Give steps in order, with exact commands and paths.
- Give the reason for a rule when it is not obvious. An AI follows a rule better when it knows what the rule protects.
- Show one short example instead of describing it at length.
- Replace every template hint, and delete sections you do not need.

## Check it

- Read it as someone new to the project: could they follow it without asking?
- Ask whether the description would trigger for the real task, and stay quiet for unrelated ones.
- Skills are committed, so never put passwords, keys or tokens in one.
