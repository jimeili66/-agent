# UIC sGPA Console Program Design

## Goal

Create a standalone C++ console program that reads grade and unit pairs for exactly six courses, validates the input, and prints either the semester GPA or a warning message using the exact sample wording.

## Constraints

- Use C++.
- Do not use arrays.
- Read exactly six courses.
- Valid grades are `A`, `B`, `C`, `D`, and `F`.
- Valid units are `1` or `3`.
- Any invalid grade or unit must print `Warning! Invalid grade or unit.`
- Valid output must print `The GPA for this semester is: ` followed by the GPA rounded to two decimal places.
- Prompt text must match the sample: `Please input grade and units for each course (6 courses):`

## Approach

Use six independent `char` variables for grades and six independent `int` variables for units. This keeps the solution fully compliant with the "Do not use array" requirement and makes the data for each course explicit.

Use a small helper function that maps a grade letter to grade points. Compute total quality points as `grade points * units` for each course, sum them, then divide by total units using floating-point arithmetic.

Before computing GPA, validate all six grades and all six units. If any one item is invalid, print only the warning message.

## Error Handling

Validation is strict:

- Grade not in `A/B/C/D/F` is invalid.
- Unit not equal to `1` or `3` is invalid.

No partial GPA should be printed for invalid input.

## Testing

Check these cases:

1. Sample valid input should output `2.43`.
2. Invalid grade should output the warning.
3. Invalid unit should output the warning.
