# Superseded: do not use as evaluation data

This Polygon Amoy capture (2026-09-17, commit faf3bb0, 1773 executions, all
granted) was taken with an implementation whose public calldata values
depended on the policy: requester pseudonyms were 128-bit random values for
policies without a profile predicate and Poseidon(holder secret) otherwise,
the parameter commitment pp was unblinded, and policy IDs were assigned in
layer order. It was the evaluation dataset until 2026-10-15 and is kept for
comparison only. The evaluation dataset is `experiments/data/polygonAmoy/`
(captured 2026-10-15 at f9039e1).
