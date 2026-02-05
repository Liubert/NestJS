# Homework 05 — Safe Order Creation and SQL Optimization

## Overview
This homework focuses on two main areas:
- safe and consistent order creation under concurrency
- basic SQL performance optimization using real PostgreSQL tools

The implementation is intentionally simple and pragmatic, prioritizing correctness and clarity over over-engineering.

---

## Part 1 — Safe Order Creation

### Transaction handling
Order creation is implemented as a single database transaction using TypeORM `QueryRunner`.

The transaction includes:
- creating the order
- creating order items
- updating product stock
- persisting the idempotency key

If any step fails, the transaction is rolled back, ensuring there are no partial writes.

---

### Idempotency (double-submit protection)
To protect against duplicate requests (timeouts, retries), order creation is idempotent.

- The client sends an `Idempotency-Key` header.
- The key is stored in the database on the `orders` table.
- A unique constraint is applied on `(user_id, idempotency_key)`.

Behavior:
- a new key creates a new order
- an existing key returns the previously created order


---

### Oversell protection (concurrency)

Two approaches were considered:

#### 1. Pessimistic locking (chosen)
This approach was selected mainly because it was the first option listed in the task and is simpler to reason about.

- Product rows are locked inside the transaction using row-level locks.
- Stock is checked while the lock is held.
- Stock is decremented only after successful validation.

**Pros**
- Simple and predictable behavior
- Easy to implement and verify
- Strong consistency guarantees

**Cons**
- Locks reduce concurrency
- Not suitable for very popular products or high-traffic systems

This approach is acceptable here because the system is assumed to be relatively small and does not operate at massive scale.

#### 2. Optimistic concurrency (considered)
This alternative approach was also reviewed.

- Product rows are not locked.
- Stock updates are done using version or timestamp checks.
- If an update fails, the transaction is retried or rejected.

**Pros**
- Better scalability
- No blocking on hot products

**Cons**
- More complex implementation
- More edge cases to handle (retries, conflicts)

This approach would be preferable for larger systems with high concurrency.

---

### Error handling
- insufficient stock → `409 Conflict`
- duplicate idempotency key → existing order returned
- unexpected error → transaction rollback + `500 Internal Server Error`

---

## Part 2 — SQL Optimization

### Why this query
The products list query was selected for optimization because:
- the number of products is expected to grow faster than orders
- this query is executed frequently
- it includes filtering, sorting, and pagination

---

### Query under optimization

    SELECT id, name, price, created_at
    FROM products
    WHERE is_active = true
      AND name ILIKE '%Product%'
    ORDER BY created_at DESC, id DESC
    LIMIT 20;

Dataset size: approximately 10,000 product rows (seed / mock data).

---

### BEFORE optimization (EXPLAIN ANALYZE)
- Scan type: Sequential Scan
- Additional step: Sort (top-N heapsort)
- Rows scanned: ~10,000
- Execution time: ~171 ms

PostgreSQL scanned the entire table and then sorted the results to satisfy the `ORDER BY` clause.

---

### Optimization applied
A composite index was added to support filtering and ordering:

    CREATE INDEX idx_products_active_created_at_id_desc
    ON products (is_active, created_at DESC, id DESC);

---

### AFTER optimization (EXPLAIN ANALYZE)
- Scan type: Index Scan using the new index
- Rows scanned: only required rows
- Execution time: ~0.9 ms

PostgreSQL was able to read rows in the correct order directly from the index and stop after reaching `LIMIT 20`.

---

### Result and conclusion
- Execution time improved from ~171 ms to ~0.9 ms (~190x faster).
- The query no longer requires a full table scan or explicit sorting.
- The planner chose the index scan because the index matches both the filter and the ordering.

The `ILIKE '%Product%'` condition remains a filter, since leading wildcard patterns cannot use a B-Tree index, but the main performance bottleneck was removed.
