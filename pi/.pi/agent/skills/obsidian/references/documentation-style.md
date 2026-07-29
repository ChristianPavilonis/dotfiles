# Documentation Style Guide

Use this guide when creating or substantially revising evergreen documentation in a maintained project's `docs/` folder.

## Aim

Write for a capable human who wants to understand something and get back to work. The documentation should feel calm, practical, and considered: the qualities people associate with the Laravel documentation and Taylor Otwell's public writing. Do not imitate a person’s exact voice. Prefer clarity, warmth, and good judgment over personality.

A good document answers, in order:

1. **What is this and why would I care?**
2. **What do I need before I start?**
3. **What should I do?**
4. **How do I know it worked?**
5. **What should I understand next?**

## Core principles

### Start with the reader’s outcome

Open with a short, plain-language explanation of the document’s purpose and the result the reader can expect. Lead with the useful fact, not history, process, or a generic definition.

> Good: “This guide shows how to rotate the API credential without interrupting scheduled imports.”
>
> Weak: “API credentials are an important part of modern software systems.”

### Be direct, warm, and specific

Use active voice and ordinary language. Address the reader as “you” when describing an action. Name the exact command, screen, file, setting, or behavior instead of describing it vaguely.

- Prefer “Run `pnpm test` from the repository root.”
- Avoid “Tests can be executed as appropriate.”

Be confident when the rule is known. When a trade-off or uncertainty is real, state it plainly and explain the consequence.

### Explain the why at the point it matters

Give the instruction first, then the reason a reader needs to make the right decision. Do not front-load a long conceptual lecture before the first useful action.

```markdown
Create the key in the production workspace.

The staging key cannot access production data, even if both workspaces use the same project name.
```

### Use progressive disclosure

Keep the main path short. Put alternatives, edge cases, migration notes, and deep internals in clearly named later sections. A reader following the common path should not need to parse every exception first.

## Structure

### Choose a clear title

Use a title that names the reader’s goal or the subject precisely.

- `Rotate the Import API Credential`
- `Auction Orchestration Testing Guide`
- `OpenRTB Consent Fields Reference`

Avoid vague titles such as `Notes`, `Overview`, `Things to Know`, or `How It Works` unless the surrounding subject makes them specific.

### Recommended shape

Use only the sections the document needs:

```markdown
---
created: YYYY-MM-DD HH:mm
status: active
---

# Clear, outcome-oriented title

One or two sentences explaining what the reader will accomplish or understand.

## Before You Begin

Prerequisites, permissions, or assumptions.

## The Main Task

The normal path, in ordered steps.

## Verify the Result

A concrete success signal, expected output, or check.

## Troubleshooting

Known failure modes and the next useful action.

## Reference

Optional: durable details, options, or behavior that readers may need to look up.

## Related

- [[Meaningful related note]]
```

For reference material, lead with a concise description and organize by concepts, options, or examples rather than forcing a tutorial flow. For a short operating note, omit empty sections instead of preserving a template.

### Write scannable sections

- Use descriptive `##` headings that tell readers what they will learn or do.
- Keep paragraphs focused on one idea; most should be two to four sentences.
- Use ordered lists for sequences and bullets for options, properties, or facts.
- Put important constraints immediately before or after the step they affect.
- Use tables only when readers need to compare stable attributes across several items.

## Instructions and examples

### Make steps executable

Each step should begin with a concrete action and include enough context to perform it. Do not split a simple action into many tiny steps, but do not hide meaningful transitions either.

When an operation can cause data loss, downtime, permission changes, or an irreversible result, explain the risk before the action and state the safe recovery path when known.

### Use examples that earn their space

Examples should be realistic, minimal, and complete enough to copy or adapt. Introduce them with one sentence explaining what they demonstrate, and follow them with the outcome or the one detail that matters.

- Use fenced code blocks with a language when known.
- Keep placeholders obvious: `<workspace-id>`, `$API_TOKEN`, or `your-project`.
- Do not include fabricated output, credentials, IDs, or configuration that does not affect the lesson.
- Prefer one strong example to several near-duplicates.

### Separate commands from explanation

Put commands and configuration in code blocks. Explain them in prose before or after the block; do not bury operationally important text in a code comment.

## Tone and wording

### Prefer

- Short, complete sentences.
- Concrete verbs: create, run, open, replace, verify, remove.
- Present tense for behavior: “The worker retries the request three times.”
- Imperative tense for actions: “Restart the service.”
- Honest qualification: “Usually,” “only when,” or “currently” when it changes the meaning.

### Avoid

- Empty introductions, motivational filler, and generic summaries.
- Marketing language such as “powerful,” “seamless,” “robust,” or “leverage” unless it conveys a measurable technical fact.
- AI-shaped transitions such as “In this section, we will…”, “It is important to note…”, or “Here’s the thing.”
- Excessive rhetorical questions, fake quotations, or choppy one-line paragraphs.
- Repeating the same conclusion in an introduction, body, and “Key Takeaways” section.
- Defensive caveats for unlikely cases. Document exceptions when they affect a reader’s decision or recovery path.

## Obsidian and vault conventions

Follow the Obsidian Markdown and project-note references for syntax, location, frontmatter, and the final `## Related` section.

- Write durable project documentation only in `Projects/<Project>/docs/`.
- Use `created` and `status: active` frontmatter for a new project document.
- Use wikilinks for genuinely related vault knowledge; do not turn ordinary terms into links just because a note might exist.
- Link to a specific heading when that is the useful destination.
- Use callouts sparingly for warnings, prerequisites, and decision-critical notes. A callout should add emphasis, not replace clear prose.
- Preserve the project note’s final `## Related` section and add only meaningful links.

## Editing checklist

Before finishing, check that the document:

- states its purpose and reader outcome near the top;
- gives the normal path before the exceptional paths;
- uses exact names, commands, files, and expected results;
- explains non-obvious decisions where they occur;
- contains only examples and sections that help the reader act or understand;
- has a clear next step, verification method, or related note when appropriate; and
- reads naturally aloud without filler, repetition, or unexplained jargon.
