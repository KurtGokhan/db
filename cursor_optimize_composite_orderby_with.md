# Optimize composite orderBy with tiebreaker
_Exported on 06/11/2025 at 9:47:24 GMT from Cursor (2.1.0-pre.10.patch.0)_

---

**User**

Currently we only optimse orderby and use an index if the orderBy is a single column/prop, but we need to change this to also optimise composite orderby.

I would also like to change it so that it alwyas appeds the key of the colleciton when doing an orderby and so uses that as a stabpe tiebreak. This is going to be important for pushing down to the sync layer for loading data incrimentally.

Please thororly investigate this and see what needs to be done.

Consider how joins will integrate with the pk as a tye break, and if this tie break needs to only happen at the input/source level and not in the compiled graph (likly).

---

**Cursor**

I'll scan the query compiler to see how ORDER BY optimization and index usage currently work, and where joins interact with ordering. Then I'll outline a plan for composite ordering and PK tiebreak integration.

I found the current ORDER BY optimization only handles a single ref field with limit, and getOrderedKeys also only optimizes that case. BTreeIndex can compare arrays, but our index creation path can't yet build a composite expression. Joins produce composite stream keys, which affects tie-break decisions. I'll propose a plan and ask 2 key clarifying questions before implementing.

---

**User**

We currently auto index previdates, but i dont think we should do that on composites for orderby by defult as it could add a lot of overhead.

Looking at what other databases do we should autoindex the frist column for the orderby, use that to load the data and then do the sort 

This isnt too disimilar to what we have at the momennt, we load the limit, then all matching values for the max value. But this causes two predicate push downs. I dont like that.



I think we shold consider changinng `currentStateAsChanges` to that it:

- uses the index on the frist column of the orderby to load the limit

- then checks what the max value is

- also fetches all other rows (cairflly not to duplicate them) with that max value

- sorts by the full composite order by

- sends the limit sorted by the full composiute to the subsciber



THis is similar to what we have, but rather than doing this inside the query engine, we do it in the currentStateAsChanges



Does this work?



Does this ensure that the full composite orderby is sent only once for the initial load, and then each loadSubset call rather than twice?

---

**Cursor**

I'll review `currentStateAsChanges` and related live query loading to evaluate the proposed change and its impact on duplicate pushdowns and sort stability.

---

**User**

THe orderby could be a composite of feilds that touch multiple sources after a join.

Such as:

[collectionA.col1, collectionA.col2, collectionB.col3]

In this case the order by is pushed down to the first colleciton (collecitonA), and so we should truncate the composite columns before the first column that is not on that colleciton, and append the collectuon key:

[collectionA.col1, collectionA.col2, collectionA.key]

collectionB is not loaded in order as it is comming from the join.

Please look at how we do orderby+join to understand this



on your second question, if we now have a stable tie break i suppose we need whereever we track the "max" value sent to track that as the composite incliudeing the key, and so it would then be non inclusing of the lower band as we have the key as the tie break. Does that make sense?

---

**Cursor**

I'll update the plan to incorporate your clarifications: truncate the ORDER BY to the first alias's prefix, append that collection's key, and track the exclusive lower bound using the composite (including the key) to ensure single pushdown per window.

