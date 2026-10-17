# Goal
- Add weight tracking section where
a user can input their weight. This
should be something they can track
over time. Add a chart showing the
history of that

## How
- First we need a new route, so users can
have access to some personal data, the 1st
one is the weight
- In this new route let's add a section for
tracking the user weight.
  - Add a title for the section and a form
wrapping an input with current weight
  - On form submit we want to capture the
user weight and the datetime
  - Let's use TansTack Charts to implement
a beautiful chart with the weight x time
tracking

## Technical requirements
  - Implement the Database layer relations
and props for user as necessary
  - Install and use TansTack Charts for
chart
  - Implement e2e tests for this new page
and the weight tracking
  - Follow @CLAUDE.md file for code
structure guidance

## Definition of Done
  - A user can add as many weight inputs as they want
  - The weight adition is time tracked
  - User can see a chart about their weight over the time
  - e2e tests are implemented properly

### Notes
  - User weight should follow 'lbs' as measurement unit
  - Timescale in the chart would ideally shrink/grow
based in the interval the user sets it. It may be daily,
weekly, monthly, etc. And may have no standard, we need
to keep a good visual consistency to the user. It's also
important to understand that this may track user weight
over a long time (months to years)