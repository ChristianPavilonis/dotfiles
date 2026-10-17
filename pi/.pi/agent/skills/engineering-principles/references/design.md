# Design

Use these rules when shaping state, APIs, validation, or code ownership.

## Model the domain

Start with the data, states, transitions, and invariants. Choose a structure that represents them directly.

Reach for a state machine, typed model, discriminated union, registry, lookup table, reducer, queue, or index when it removes repeated branches or impossible combinations. Keep plain local code when a new abstraction would only add another place to look.

Warning signs include:

- booleans that must stay synchronized;
- optional fields whose valid combinations need a comment;
- the same branch condition repeated in several files;
- lifecycle rules spread across callbacks;
- a new feature that adds another case to several existing conditionals.

This part is complete when the chosen shape makes the important valid states obvious and either prevents or isolates invalid states.

## Keep boundaries strict

Validate and normalize data where it enters the system, such as configuration, CLI arguments, HTTP requests, external APIs, storage records, and framework callbacks. Convert outside data into a named internal type, then trust that type inside the system.

Keep policy in domain code and mechanics in adapters. Do not expose a transport, storage, or framework representation when callers need a domain concept.

This part is complete when each validation rule has one owning boundary and internal code no longer repeats it.

## Minimize reader load

Count both the layers a reader must follow and the mutable state the reader must remember.

- Collapse one-caller wrappers and pass-through layers that hide no decision.
- Keep mutable state in the narrowest scope that owns it.
- Derive values instead of synchronizing duplicate state.
- Put an invariant at its owning boundary rather than repeating it in consumers.
- Add a layer only when it hides enough complexity to make callers simpler.

This part is complete when a reader can find where important state comes from, what can change it, and which boundary owns its rules without tracing unrelated layers.