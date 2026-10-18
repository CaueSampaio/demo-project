# Goal
- The current setup doesn't support
body-weight movements very well
(e.g. pullups / pushups) update the
"movements page" so a user can flag
a movement as "body-weight" when
they create it. When a "body-weight"
movement is added to the current
workout the weight field should
default to the most recent
user-inputted weight

## How
- Users can set their weight over the time
already, so we need to pick the last input
(time based) from user data in the database
- Since we don't want to lock the weight, just
set the body weight as default, no database
schema updates are needed
- In the movement set creation we just need
to load and use it as default in the weight input
  - Let's choose a lazy loading approach, so we only
need to load user weight on demant to avoid unecessary
data stream

## Technical requirements
- Implement e2e tests for this new body
weight configuration, you don't need to
implement any other coverage.
  - Make sure input still editable after
clicking in the checkbox
  - Make sure we're lazy loading the user weight
- Follow @CLAUDE.md file for code
structure guidance

## Definition of Done
- The user can create a body weighted movement set
- The default weight of the movement when checking the box
become the last user inputed weight
- e2e tests are implemented properly