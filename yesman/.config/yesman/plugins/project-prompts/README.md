# Project Prompts

A Yesman UI plugin for sending quick one-shot prompts to the Pi harness with a
project-specific working directory.

Routes:

- `/plugins/project-prompts` — project index
- `/plugins/project-prompts/<project>` — one-shot prompt form for a project

This prototype uses the globally registered `pi` harness and is intended for
short prompts that complete within the current UI action timeout.
