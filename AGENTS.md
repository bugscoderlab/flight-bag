# AGENTS.md

Project instructions. These take precedence over skills and default behavior.

## Working style (user preference)

- **Never invoke the `brainstorming` skill automatically.** It is disabled
  totally. The user calls it explicitly when they want it. Do not load it, do
  not offer it, do not scaffold around it.
- **Do not ask clarifying questions.** No `question` tool calls, no
  "which option do you want?" prompts. Make the most reasonable assumption,
  state it briefly in the result, and proceed. If a choice is genuinely
  reversible, pick one and move on; the user will speak up.
- Act on the request directly. No interview, no plan-mode detour, no
  ceremony.
