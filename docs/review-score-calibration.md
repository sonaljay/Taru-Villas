# Overall-aware review category scores

Google and Tripadvisor review categories use direct subratings first. Where a
category has no direct subrating, the dashboard calibrates the stored
`hospitality-v1` text assessment against the review's overall 1–5 star rating.
The same calculated score feeds review cards, category averages and trends.

- Unsupported excerpts, low-confidence assessments and unmentioned categories
  remain excluded.
- Text assessments below 8 remain unchanged: overall satisfaction must not erase
  mixed or critical category feedback.
- For a five-star review, positive assessments become 9.0. Strong assessments
  (9 or higher), or evidence containing strong praise such as “delicious”,
  “exceptional” or “outstanding”, become 9.5. This wording refinement only applies
  after the AI has classified the category positively.
- For other valid ratings, positive assessments use an equal blend of the text
  score and normalized overall score, rounded to one decimal and bounded to
  6.0–9.5 so a positive category cannot become negative solely because of the
  overall experience. Normalization uses the existing 1–5 to 0–10 scale.
- Missing or invalid overall ratings leave the text assessment unchanged.

This is deterministic calibration of stored AI evidence, not a new model call.
The original review, evidence and assessment remain stored unchanged. Apply
calibration once when assembling feedback, before aggregation. Future imports
must continue to store the original text-only `hospitality-v1` assessment, not
an already-calibrated score. A future rubric that stores contextual scores must
be versioned and must not receive this adjustment a second time.

Example: Susan's five-star review gives facilities 9.0 for “The pool area was
lovely.” and food 9.5 for “delicious meals”. Direct five-star subratings stay 10.0.
